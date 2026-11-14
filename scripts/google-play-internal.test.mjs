import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  inspectPlayConnection,
  publishPlayInternal,
  PLAY_PACKAGE,
  PLAY_TRACK,
} from './publish-google-play-internal.mjs'

async function fixture(options = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'play-internal-test-'))
  const bundlePath = join(folder, 'signed.aab')
  const bytes = Buffer.from('signed bundle fixture')
  const digest = createHash('sha256').update(bytes).digest('hex')
  await writeFile(bundlePath, bytes)
  const calls = []
  let edits = 0
  let current = options.current ?? {
    track: 'internal',
    releases: [{ status: 'completed', versionCodes: ['12'] }],
  }
  let staged
  const json = (value, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(value), { status })
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url)
    const method = init.method ?? 'GET'
    calls.push({ url, method, init })
    assert.equal(init.headers.Authorization, 'Bearer test-secret-token')
    assert.equal(parsed.hostname, 'androidpublisher.googleapis.com')
    assert.ok(!parsed.pathname.includes('/production'))
    assert.ok(!parsed.pathname.includes('/testers'))
    if (options.denied) return json({ error: { message: 'denied test-secret-token' } }, 403)
    if (method === 'POST' && parsed.pathname.endsWith('/edits'))
      return json({ id: String(++edits) })
    if (method === 'GET' && parsed.pathname.endsWith('/tracks/internal'))
      return json(
        edits > 1 && options.verifyMissing ? { track: 'internal', releases: [] } : current
      )
    if (method === 'GET' && parsed.pathname.endsWith('/bundles'))
      return json({
        bundles: options.existing
          ? [{ versionCode: 20, sha256: options.wrongHash ? 'wrong' : digest }]
          : [],
      })
    if (method === 'POST' && parsed.pathname.startsWith('/upload/')) {
      assert.equal(parsed.searchParams.get('uploadType'), 'media')
      const chunks = []
      for await (const chunk of init.body) chunks.push(chunk)
      assert.deepEqual(Buffer.concat(chunks), bytes)
      return json({
        versionCode: options.wrongVersion ? 21 : 20,
        sha256: options.wrongHash ? 'wrong' : digest,
      })
    }
    if (method === 'PUT' && parsed.pathname.endsWith('/tracks/internal')) {
      staged = JSON.parse(init.body)
      assert.equal(staged.track, 'internal')
      assert.deepEqual(staged.releases[0].versionCodes, ['20'])
      assert.equal(staged.releases[0].status, 'completed')
      return json(staged)
    }
    if (method === 'POST' && parsed.pathname.endsWith(':commit')) {
      assert.equal(parsed.searchParams.get('changesInReviewBehavior'), 'ERROR_IF_IN_REVIEW')
      assert.equal(parsed.searchParams.has('changesNotSentForReview'), false)
      if (options.inReview)
        return json({ error: { message: 'An existing review must not be cancelled.' } }, 409)
      current = staged
      return json({ id: '1' })
    }
    if (method === 'DELETE') return json(null, 204)
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  return {
    calls,
    publish: (extra = {}) =>
      publishPlayInternal({
        token: 'test-secret-token',
        versionCode: '20',
        bundlePath,
        sourceSha: 'a'.repeat(40),
        fetchImpl,
        ...extra,
      }),
    cleanup: () => rm(folder, { recursive: true, force: true }),
  }
}

test('publishes the signed artifact only to internal, commits without cancelling a review and verifies a fresh edit', async () => {
  const f = await fixture()
  try {
    const result = await f.publish()
    assert.deepEqual(result, {
      packageName: 'com.georgicole.thebigeye',
      track: 'internal',
      versionCode: '20',
      alreadyReleased: false,
    })
    assert.equal(PLAY_PACKAGE, 'com.georgicole.thebigeye')
    assert.equal(PLAY_TRACK, 'internal')
    assert.equal(
      f.calls.filter(
        (c) => c.url.includes('/edits') && c.method === 'POST' && c.url.endsWith('/edits')
      ).length,
      2
    )
    assert.ok(f.calls.some((c) => c.method === 'GET' && c.url.endsWith('/edits/2/tracks/internal')))
    assert.ok(f.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/edits/2')))
  } finally {
    await f.cleanup()
  }
})

test('reuses a matching uploaded bundle and does not upload or republish an already completed exact version', async () => {
  const f = await fixture({
    existing: true,
    current: { track: 'internal', releases: [{ status: 'completed', versionCodes: ['20'] }] },
  })
  try {
    assert.equal((await f.publish()).alreadyReleased, true)
    assert.ok(
      !f.calls.some(
        (c) => c.url.includes('/upload/') || c.method === 'PUT' || c.url.includes(':commit')
      )
    )
  } finally {
    await f.cleanup()
  }
})

test('rejects a mismatched artifact version or hash before changing a track', async () => {
  for (const options of [
    { wrongHash: true },
    { wrongVersion: true },
    { existing: true, wrongHash: true },
  ]) {
    const f = await fixture(options)
    try {
      await assert.rejects(f.publish(), /version or SHA-256/)
      assert.ok(!f.calls.some((c) => c.method === 'PUT' || c.url.includes(':commit')))
      assert.ok(f.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/edits/1')))
    } finally {
      await f.cleanup()
    }
  }
})

test('refuses to replace a newer internal build', async () => {
  const f = await fixture({
    current: { track: 'internal', releases: [{ status: 'completed', versionCodes: ['21'] }] },
  })
  try {
    await assert.rejects(f.publish(), /refusing to downgrade/)
    assert.ok(!f.calls.some((c) => c.method === 'PUT' || c.url.includes('/upload/')))
  } finally {
    await f.cleanup()
  }
})

test('leaves a running review alone and does not retry with a review-cancelling mode', async () => {
  const f = await fixture({ inReview: true })
  try {
    await assert.rejects(f.publish(), /HTTP 409/)
    assert.equal(f.calls.filter((c) => c.url.includes(':commit')).length, 1)
    assert.ok(f.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/edits/1')))
  } finally {
    await f.cleanup()
  }
})

test('does not report an uploaded binary as a verified internal release', async () => {
  const f = await fixture({ verifyMissing: true })
  try {
    await assert.rejects(f.publish(), /could not be verified/)
  } finally {
    await f.cleanup()
  }
})

test('rejects missing tokens and invalid build identity before contacting Google', async () => {
  const f = await fixture()
  try {
    for (const value of [
      { token: '' },
      { versionCode: '0' },
      { versionCode: '2100000001' },
      { sourceSha: 'moving-main' },
    ])
      await assert.rejects(f.publish(value))
    assert.equal(f.calls.length, 0)
  } finally {
    await f.cleanup()
  }
})

test('redacts an access token even if a remote error repeats it', async () => {
  const f = await fixture({ denied: true })
  try {
    await assert.rejects(
      f.publish(),
      (error) =>
        error.message.includes('[redacted]') && !error.message.includes('test-secret-token')
    )
  } finally {
    await f.cleanup()
  }
})

test('connection detection exposes only a valid service-account email and never its key', () => {
  assert.deepEqual(inspectPlayConnection(''), { configured: false })
  const credentials = {
    type: 'service_account',
    client_email: 'play-upload@project-id.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----private-test-key',
  }
  assert.deepEqual(inspectPlayConnection(JSON.stringify(credentials)), {
    configured: true,
    serviceAccount: credentials.client_email,
  })
  for (const input of [
    'private-test-key',
    'null',
    JSON.stringify({ ...credentials, client_email: 'attacker\nconfigured=true' }),
    JSON.stringify({ ...credentials, private_key: {} }),
  ]) {
    assert.throws(
      () => inspectPlayConnection(input),
      (error) => !error.message.includes('private-test-key')
    )
  }
})
