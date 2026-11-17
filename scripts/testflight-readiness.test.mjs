import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import test from 'node:test'
import {
  completeTestFlight,
  createAppleClient,
  verifyEncryptionInputs,
} from './lib/testflight-readiness.mjs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const policy = { appId: 'app', approvedBuildId: 'approved', internalGroupId: 'internal' }
const relation = (id, type = 'apps') => ({ data: { type, id } })
const build = (attributes = {}) => ({
  id: 'current',
  attributes: {
    version: '123.1',
    processingState: 'VALID',
    usesNonExemptEncryption: null,
    ...attributes,
  },
  relationships: { app: relation('app') },
})

function fixture({
  baselineEncryption = false,
  declaration,
  groupInternal = true,
  target = build(),
  states = ['IN_BETA_TESTING'],
  installed = false,
} = {}) {
  const calls = []
  let grouped = installed
  const api = async (method, endpoint, body) => {
    calls.push({ method, endpoint, body })
    if (endpoint.startsWith('/v1/builds/approved?'))
      return {
        data: {
          ...build({ usesNonExemptEncryption: baselineEncryption }),
          relationships: {
            app: relation('app'),
            ...(declaration
              ? { appEncryptionDeclaration: relation(declaration, 'appEncryptionDeclarations') }
              : {}),
          },
        },
      }
    if (endpoint.startsWith('/v1/betaGroups/internal?'))
      return {
        data: {
          attributes: { isInternalGroup: groupInternal },
          relationships: { app: relation('app') },
        },
      }
    if (endpoint.startsWith('/v1/builds?')) return { data: target ? [target] : [] }
    if (method === 'PATCH') return { data: target }
    if (method === 'GET' && endpoint.includes('/relationships/betaGroups'))
      throw new Error('Apple does not support GET on this build relationship.')
    if (method === 'POST' && endpoint.endsWith('/relationships/betaGroups')) {
      grouped = true
      return null
    }
    if (method === 'GET' && endpoint.startsWith('/v1/betaGroups?')) {
      throw new Error('Apple rejected this beta-group filter combination.')
    }
    if (method === 'GET' && endpoint.startsWith('/v1/betaGroups/internal/relationships/builds?'))
      return { data: grouped ? [{ type: 'builds', id: 'current' }] : [] }
    if (endpoint.endsWith('/buildBetaDetail'))
      return {
        data: {
          attributes: { internalBuildState: states.length > 1 ? states.shift() : states[0] },
        },
      }
    throw new Error(`Unexpected fixture request: ${method} ${endpoint}`)
  }
  let time = 0
  return {
    calls,
    options: {
      api,
      policy,
      buildNumber: '123.1',
      now: () => time,
      sleep: async (ms) => {
        time += ms
      },
      timeoutMs: 30000,
    },
  }
}

test('current encryption inputs match the user-completed Apple baseline', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const reviewed = JSON.parse(
    await readFile(new URL('./testflight-readiness-policy.json', import.meta.url), 'utf8')
  )
  await verifyEncryptionInputs(root, reviewed)
  await assert.rejects(
    verifyEncryptionInputs(root, {
      ...reviewed,
      reviewedFiles: { 'capacitor.config.ts': 'changed' },
    }),
    /Encryption inputs changed/
  )
  await assert.rejects(
    verifyEncryptionInputs(root, {
      ...reviewed,
      reviewedPackages: { '@capacitor-community/sqlite': { version: 'changed' } },
    }),
    /Encryption dependency changed/
  )
})

test('copies the approved answer, adds the existing internal group, and verifies Testing', async () => {
  const { calls, options } = fixture({ states: ['READY_FOR_BETA_TESTING', 'IN_BETA_TESTING'] })
  const result = await completeTestFlight(options)
  assert.equal(result.internalBuildState, 'IN_BETA_TESTING')
  assert.deepEqual(calls.find((entry) => entry.method === 'PATCH').body, {
    data: { type: 'builds', id: 'current', attributes: { usesNonExemptEncryption: false } },
  })
  assert.deepEqual(calls.find((entry) => entry.method === 'POST').body, {
    data: [{ type: 'betaGroups', id: 'internal' }],
  })
  const lookup = new URL(
    calls.find((entry) => entry.endpoint.startsWith('/v1/builds?')).endpoint,
    'https://example.test'
  )
  assert.equal(lookup.searchParams.get('filter[version]'), '123.1')
  assert.equal(lookup.searchParams.get('filter[app]'), 'app')
  assert.equal(lookup.searchParams.get('filter[preReleaseVersion.platform]'), 'IOS')
  assert.ok(
    !calls.some(
      (entry) => entry.method === 'GET' && entry.endpoint.includes('/relationships/betaGroups')
    )
  )
})

test('already completed builds are verified without changing compliance or group membership', async () => {
  const { calls, options } = fixture({
    installed: true,
    target: build({ usesNonExemptEncryption: false }),
  })
  await completeTestFlight(options)
  assert.ok(calls.every((entry) => entry.method === 'GET'))
})

test('verifies the exact internal group from the app when the group omits its app ID', async () => {
  for (const groupId of ['internal', 'different']) {
    const { calls, options } = fixture()
    const original = options.api
    options.api = (method, endpoint, body) => {
      if (method === 'GET' && endpoint.startsWith('/v1/betaGroups/internal?'))
        return Promise.resolve({ data: { attributes: { isInternalGroup: true } } })
      if (method === 'GET' && endpoint.startsWith('/v1/apps/app/relationships/betaGroups?'))
        return Promise.resolve({ data: [{ type: 'betaGroups', id: groupId }] })
      return original(method, endpoint, body)
    }
    if (groupId === 'internal') {
      assert.equal((await completeTestFlight(options)).internalBuildState, 'IN_BETA_TESTING')
    } else {
      await assert.rejects(completeTestFlight(options), /not internal/)
      assert.ok(calls.every((entry) => entry.method === 'GET'))
    }
  }
})

test('finds existing membership beyond the first page without reassigning a group', async () => {
  const { calls, options } = fixture({
    target: build({ usesNonExemptEncryption: false }),
    installed: true,
  })
  const original = options.api
  const pages = []
  options.api = async (method, endpoint, body) => {
    if (endpoint.startsWith('/v1/betaGroups/internal/relationships/builds?')) {
      pages.push(endpoint)
      return endpoint.includes('cursor=next')
        ? { data: [{ type: 'builds', id: 'current' }] }
        : { data: [{ type: 'builds', id: 'old' }], links: { next: '?cursor=next' } }
    }
    return original(method, endpoint, body)
  }
  await completeTestFlight(options)
  assert.ok(pages.some((endpoint) => endpoint.endsWith('?cursor=next')))
  assert.ok(calls.every((entry) => entry.method === 'GET'))
})

test('rejects cross-origin and cyclic pagination before following another page', async () => {
  for (const next of ['https://example.test/v1/other', '?limit=200']) {
    const { options } = fixture()
    const original = options.api
    options.api = (method, endpoint, body) =>
      endpoint.startsWith('/v1/betaGroups/internal/relationships/builds?')
        ? Promise.resolve({ data: [], links: { next } })
        : original(method, endpoint, body)
    await assert.rejects(
      completeTestFlight(options),
      /unexpected group-membership page|cyclic group-membership page/
    )
  }
})

test('a non-exempt approved baseline carries its existing declaration, never inventing an exemption', async () => {
  const { calls, options } = fixture({ baselineEncryption: true, declaration: 'document' })
  await completeTestFlight(options)
  const data = calls.find((entry) => entry.method === 'PATCH').body.data
  assert.equal(data.attributes.usesNonExemptEncryption, true)
  assert.deepEqual(
    data.relationships.appEncryptionDeclaration,
    relation('document', 'appEncryptionDeclarations')
  )
  await assert.rejects(
    completeTestFlight(fixture({ baselineEncryption: true }).options),
    /completed manually/
  )
})

test('never overwrites a different completed answer or declaration', async () => {
  const mismatch = fixture({ target: build({ usesNonExemptEncryption: true }) })
  await assert.rejects(completeTestFlight(mismatch.options), /different encryption answer/)
  assert.ok(mismatch.calls.every((entry) => entry.method === 'GET'))
  const target = build()
  target.relationships.appEncryptionDeclaration = relation('different', 'appEncryptionDeclarations')
  await assert.rejects(
    completeTestFlight(fixture({ target }).options),
    /different encryption declaration/
  )
})

test('refuses external groups, mismatched apps or builds, and invalid processing results', async () => {
  await assert.rejects(
    completeTestFlight(fixture({ groupInternal: false }).options),
    /not internal/
  )
  const wrongApp = build()
  wrongApp.relationships.app = relation('other-app')
  await assert.rejects(
    completeTestFlight(fixture({ target: wrongApp }).options),
    /outside the requested app/
  )
  await assert.rejects(
    completeTestFlight(fixture({ target: build({ version: 'other' }) }).options),
    /outside the requested app/
  )
  for (const attributes of [
    { processingState: 'INVALID' },
    { processingState: 'FAILED' },
    { expired: true },
  ])
    await assert.rejects(
      completeTestFlight(fixture({ target: build(attributes) }).options),
      /failed processing or has expired/
    )
})

test('missing or processing builds and unresolved compliance time out without claiming readiness', async () => {
  for (const config of [
    { target: null },
    { target: build({ processingState: 'PROCESSING' }) },
    { states: ['MISSING_EXPORT_COMPLIANCE'] },
  ])
    await assert.rejects(completeTestFlight(fixture(config).options), /before the deadline/)
})

test('rejects an absent build number before making API requests', async () => {
  const { calls, options } = fixture()
  await assert.rejects(
    completeTestFlight({ ...options, buildNumber: undefined }),
    /precise iOS build number/
  )
  assert.equal(calls.length, 0)
})

test('Apple authentication uses a valid short-lived ES256 JWT, refreshes it, and prevents redirects', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const captured = []
  let time = 1000000
  const api = createAppleClient({
    issuerId: 'issuer',
    keyId: 'key',
    privateKeyBase64: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString(
      'base64'
    ),
    now: () => time,
    fetchImpl: async (url, options) => {
      captured.push({ url, options })
      return { ok: true, status: 204 }
    },
  })
  await api('POST', '/v1/builds/current/relationships/betaGroups', { data: [] })
  time += 600000
  await api('GET', '/v1/builds/current')
  for (const { url, options } of captured) {
    const [header, payload, signature] = options.headers.Authorization.slice(7).split('.')
    assert.ok(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url')
      )
    )
    const decoded = JSON.parse(Buffer.from(payload, 'base64url'))
    assert.equal(decoded.exp - decoded.iat, 300)
    assert.equal(decoded.aud, 'appstoreconnect-v1')
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com')
    assert.equal(options.redirect, 'error')
  }
  assert.notEqual(
    captured[0].options.headers.Authorization,
    captured[1].options.headers.Authorization
  )
  await assert.rejects(api('GET', 'https://example.test'), /Unexpected Apple API endpoint/)
})

test('API errors identify the endpoint and Apple error code without logging credentials or response details', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const api = createAppleClient({
    issuerId: 'issuer',
    keyId: 'key',
    privateKeyBase64: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString(
      'base64'
    ),
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        errors: [
          {
            code: 'FORBIDDEN_ERROR',
            source: { parameter: 'filter[unsupported]' },
            detail: 'private-response-detail',
          },
        ],
      }),
    }),
  })
  await assert.rejects(api('GET', '/v1/betaGroups?filter[builds]=current'), (error) => {
    assert.match(
      error.message,
      /GET \/v1\/betaGroups failed \(HTTP 403; FORBIDDEN_ERROR; parameter=filter\[unsupported\]\)/
    )
    assert.ok(!error.message.includes('private-response-detail'))
    assert.ok(!error.message.includes('PRIVATE KEY'))
    assert.ok(!error.message.includes('Bearer'))
    return true
  })
})
