import { createPrivateKey, sign } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

const {
  ASC_API_KEY_ID,
  ASC_API_ISSUER_ID,
  ASC_API_KEY_P8_BASE64,
  TESTFLIGHT_BUILD,
  TESTFLIGHT_REUSE_EXEMPTION_FROM,
  TESTFLIGHT_WAIT_MINUTES = '20',
} = process.env

function parseRelease(value) {
  const match = /^(\d+\.\d+\.\d+)\+(\d+(?:\.\d+)*)$/.exec(value)
  if (!match) throw new Error('Use the iOS version and build number in the form 1.0.1+18.')
  const [, version, buildNumber] = match
  return { version, buildNumber }
}

const release = parseRelease(TESTFLIGHT_BUILD)
const previous = TESTFLIGHT_REUSE_EXEMPTION_FROM
  ? parseRelease(TESTFLIGHT_REUSE_EXEMPTION_FROM)
  : null
if (!ASC_API_KEY_ID || !ASC_API_ISSUER_ID || !ASC_API_KEY_P8_BASE64) {
  throw new Error('App Store Connect credentials are required.')
}
const key = createPrivateKey(Buffer.from(ASC_API_KEY_P8_BASE64, 'base64'))
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

async function request(path, query, { method = 'GET', body } = {}) {
  const iat = Math.floor(Date.now() / 1000)
  const header = encode({ alg: 'ES256', kid: ASC_API_KEY_ID, typ: 'JWT' })
  const claims = encode({ iss: ASC_API_ISSUER_ID, aud: 'appstoreconnect-v1', iat, exp: iat + 300 })
  const payload = `${header}.${claims}`
  const signature = sign('sha256', Buffer.from(payload), {
    key,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url')
  const response = await fetch(
    `https://api.appstoreconnect.apple.com/v1/${path}?${new URLSearchParams(query)}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${payload}.${signature}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!response.ok) {
    throw new Error(`App Store Connect ${method} ${path} returned HTTP ${response.status}.`)
  }
  return response.json()
}

const {
  data: [app],
} = await request('apps', { 'filter[bundleId]': 'com.georgicole.thebigeye' })
if (!app) throw new Error('The Big Eye was not found in App Store Connect.')

async function findBuild({ version, buildNumber }) {
  const {
    data: [build],
    included = [],
  } = await request('builds', {
    'filter[app]': app.id,
    'filter[version]': buildNumber,
    'filter[preReleaseVersion.version]': version,
    'filter[preReleaseVersion.platform]': 'IOS',
    include: 'buildBetaDetail,betaGroups',
  })
  const beta = included.find(({ type }) => type === 'buildBetaDetails')?.attributes
  const groups = included.filter(({ type }) => type === 'betaGroups')
  return { build, beta, groups }
}

async function reuseExemption(build) {
  const { build: previousBuild, groups } = await findBuild(previous)
  if (
    previousBuild?.attributes.processingState !== 'VALID' ||
    previousBuild.attributes.usesNonExemptEncryption !== false
  ) {
    throw new Error('The previous build has no recorded exemption to reuse.')
  }
  await request(
    `builds/${encodeURIComponent(build.id)}`,
    {},
    {
      method: 'PATCH',
      body: {
        data: { type: 'builds', id: build.id, attributes: { usesNonExemptEncryption: false } },
      },
    }
  )
  console.log(
    `Reused the recorded exemption from ${previous.version} (${previous.buildNumber}), which has ${groups.length} tester group(s).`
  )
}

const deadline = Date.now() + Number(TESTFLIGHT_WAIT_MINUTES) * 60 * 1000
let lastStatus
let processedAt
let reusedExemption = false
while (Date.now() < deadline) {
  const { build, beta, groups } = await findBuild(release)
  const processing = build?.attributes.processingState ?? 'WAITING_FOR_APPLE'
  const states = [beta?.internalBuildState, beta?.externalBuildState]
  const status = [processing, ...states, `${groups.length} tester group(s)`]
    .filter(Boolean)
    .join(', ')
  if (status !== lastStatus) {
    console.log(`TestFlight ${release.version} (${release.buildNumber}): ${status}`)
    lastStatus = status
  }
  if (processing === 'FAILED' || processing === 'INVALID') {
    throw new Error(`Apple rejected the build during processing: ${processing}.`)
  }
  if (processing === 'VALID') {
    processedAt ??= Date.now()
    if (
      previous &&
      !reusedExemption &&
      states.includes('MISSING_EXPORT_COMPLIANCE') &&
      build.attributes.usesNonExemptEncryption == null
    ) {
      await reuseExemption(build)
      reusedExemption = true
    }
    if (states.includes('IN_BETA_TESTING') || Date.now() - processedAt >= 120000) break
  }
  await setTimeout(30000)
}
if (!processedAt) console.log('::warning::Apple is still processing the uploaded build.')
