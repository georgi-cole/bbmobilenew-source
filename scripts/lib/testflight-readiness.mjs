import { createHash, sign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const origin = 'https://api.appstoreconnect.apple.com'

export async function verifyEncryptionInputs(root, policy) {
  for (const [file, expected] of Object.entries(policy.reviewedFiles)) {
    const text = (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n')
    if (createHash('sha256').update(text).digest('hex') !== expected)
      throw new Error(`Encryption inputs changed: ${file}. Review the saved TestFlight policy.`)
  }
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
  for (const [name, expected] of Object.entries(policy.reviewedPackages)) {
    const actual = lock.packages[`node_modules/${name}`]
    if (actual?.version !== expected.version || actual?.integrity !== expected.integrity)
      throw new Error(`Encryption dependency changed: ${name}. Review the saved TestFlight policy.`)
  }
}

export function createAppleClient({
  issuerId,
  keyId,
  privateKeyBase64,
  fetchImpl = fetch,
  now = Date.now,
}) {
  if (!issuerId || !keyId || !privateKeyBase64)
    throw new Error('Missing App Store Connect API credentials.')
  const key = Buffer.from(privateKeyBase64, 'base64').toString('utf8')
  return async (method, endpoint, body) => {
    if (!endpoint.startsWith('/v1/')) throw new Error('Unexpected Apple API endpoint.')
    const issued = Math.floor(now() / 1000)
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const input = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuerId, iat: issued, exp: issued + 300, aud: 'appstoreconnect-v1' })}`
    const signature = sign('sha256', Buffer.from(input), {
      key,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')
    const response = await fetchImpl(new URL(endpoint, origin), {
      method,
      headers: {
        Authorization: `Bearer ${input}.${signature}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    })
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const codes = Array.isArray(errorBody.errors)
        ? errorBody.errors
            .map((entry) => entry.code)
            .filter((code) => /^[A-Z0-9_.-]{1,160}$/.test(code ?? ''))
            .join(', ')
        : ''
      const parameters = Array.isArray(errorBody.errors)
        ? errorBody.errors
            .map((entry) => entry.source?.parameter)
            .filter((value) => /^[A-Za-z][A-Za-z0-9_[\].-]{0,79}$/.test(value ?? ''))
            .join(', ')
        : ''
      throw new Error(
        `App Store Connect ${method} ${new URL(endpoint, origin).pathname} failed (HTTP ${response.status}${codes ? `; ${codes}` : ''}${parameters ? `; parameter=${parameters}` : ''}).`
      )
    }
    return response.status === 204 ? null : response.json()
  }
}

export async function completeTestFlight({
  api,
  policy,
  buildNumber,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 20 * 60 * 1000,
}) {
  if (!/^\d+(?:\.\d+){0,2}$/.test(buildNumber ?? ''))
    throw new Error('A precise iOS build number is required.')
  const baseline = (
    await api('GET', `/v1/builds/${policy.approvedBuildId}?include=app,appEncryptionDeclaration`)
  ).data
  const group = (await api('GET', `/v1/betaGroups/${policy.internalGroupId}?include=app`)).data
  if (
    baseline.relationships?.app?.data?.id !== policy.appId ||
    baseline.attributes.processingState !== 'VALID'
  )
    throw new Error('The approved compliance baseline does not belong to this app or is not valid.')
  if (group.attributes.isInternalGroup !== true)
    throw new Error('The configured tester group is not internal to this app.')
  const groupAppId = group.relationships?.app?.data?.id
  if (groupAppId && groupAppId !== policy.appId)
    throw new Error('The configured tester group is not internal to this app.')
  if (!groupAppId) {
    const { data } = await api('GET', `/v1/apps/${policy.appId}/relationships/betaGroups?limit=200`)
    if (!data.some((entry) => entry.type === 'betaGroups' && entry.id === policy.internalGroupId))
      throw new Error('The configured tester group is not internal to this app.')
  }
  const encryption = baseline.attributes.usesNonExemptEncryption
  const declaration = baseline.relationships?.appEncryptionDeclaration?.data
  if (typeof encryption !== 'boolean' || (encryption && !declaration))
    throw new Error('The approved baseline needs its encryption declaration completed manually.')
  const deadline = now() + timeoutMs
  const pause = async () => {
    if (now() >= deadline)
      throw new Error(
        `Build ${buildNumber} did not become available for internal testing before the deadline.`
      )
    await sleep(Math.min(15000, deadline - now()))
  }
  let build
  while (!build) {
    const query = new URLSearchParams({
      'filter[app]': policy.appId,
      'filter[version]': buildNumber,
      'filter[preReleaseVersion.platform]': 'IOS',
      include: 'app,appEncryptionDeclaration',
      limit: '2',
    })
    const matches = (await api('GET', `/v1/builds?${query}`)).data
    if (matches.length > 1)
      throw new Error('More than one build matched the exact uploaded build number.')
    const candidate = matches[0]
    if (candidate) {
      if (
        candidate.attributes.version !== buildNumber ||
        candidate.relationships?.app?.data?.id !== policy.appId
      )
        throw new Error('Apple returned a build outside the requested app and build number.')
      if (
        candidate.attributes.expired ||
        ['FAILED', 'INVALID'].includes(candidate.attributes.processingState)
      )
        throw new Error(`Build ${buildNumber} failed processing or has expired.`)
      if (candidate.attributes.processingState === 'VALID') build = candidate
    }
    if (!build) await pause()
  }
  const existing = build.attributes.usesNonExemptEncryption
  const existingDeclaration = build.relationships?.appEncryptionDeclaration?.data
  if (typeof existing === 'boolean' && existing !== encryption)
    throw new Error(
      'The uploaded build has a different encryption answer. Manual review is required.'
    )
  if (existingDeclaration && existingDeclaration.id !== declaration?.id)
    throw new Error(
      'The uploaded build has a different encryption declaration. Manual review is required.'
    )
  if (existing == null || (encryption && !existingDeclaration)) {
    await api('PATCH', `/v1/builds/${build.id}`, {
      data: {
        type: 'builds',
        id: build.id,
        attributes: { usesNonExemptEncryption: encryption },
        ...(declaration
          ? { relationships: { appEncryptionDeclaration: { data: declaration } } }
          : {}),
      },
    })
  }
  const groupsPath = `/v1/builds/${build.id}/relationships/betaGroups`
  // Read IDs from the already validated internal group. This documented GET
  // avoids both the write-only build relationship and unsupported filter combinations.
  const membershipPath = `/v1/betaGroups/${policy.internalGroupId}/relationships/builds`
  const isMember = async () => {
    let endpoint = `${membershipPath}?limit=200`
    const seen = new Set()
    while (endpoint) {
      if (seen.has(endpoint)) throw new Error('Apple returned a cyclic group-membership page.')
      if (now() >= deadline) throw new Error('Timed out reading internal group membership.')
      seen.add(endpoint)
      const page = await api('GET', endpoint)
      if (page.data.some((entry) => entry.type === 'builds' && entry.id === build.id)) return true
      if (!page.links?.next) return false
      const next = new URL(page.links.next, new URL(endpoint, origin))
      if (next.origin !== origin || next.pathname !== membershipPath)
        throw new Error('Apple returned an unexpected group-membership page.')
      endpoint = next.pathname + next.search
    }
    return false
  }
  if (!(await isMember()))
    await api('POST', groupsPath, { data: [{ type: 'betaGroups', id: policy.internalGroupId }] })
  while (true) {
    const detail = (await api('GET', `/v1/builds/${build.id}/buildBetaDetail`)).data
    if (detail.attributes.internalBuildState === 'IN_BETA_TESTING' && (await isMember()))
      return { buildId: build.id, buildNumber, internalBuildState: 'IN_BETA_TESTING' }
    if (['EXPIRED', 'INVALID', 'FAILED'].includes(detail.attributes.internalBuildState))
      throw new Error('The build cannot be distributed for internal testing.')
    await pause()
  }
}
