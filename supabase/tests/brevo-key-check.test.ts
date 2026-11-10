import assert from 'node:assert/strict'

Deno.test('the Brevo key check authenticates the scheduler and only reads statistics', async () => {
  const config = {
    AUTH_EMAIL_BREVO_CHECK_TOKEN: 'fixture-scheduler-token',
    AUTH_EMAIL_BREVO_KEY: 'fixture-backup-key',
  }
  const previous = Object.keys(config).map((key) => [key, Deno.env.get(key)] as const)
  for (const [key, value] of Object.entries(config)) Deno.env.set(key, value)

  const serve = Deno.serve
  const fetch = globalThis.fetch
  let handle: ((request: Request) => Promise<Response>) | undefined
  let calls = 0
  let status = 200
  try {
    Deno.serve = ((callback: typeof handle) => {
      handle = callback
    }) as typeof Deno.serve
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      assert.equal(request.url, 'https://api.brevo.com/v3/smtp/statistics/aggregatedReport?days=1')
      assert.equal(request.method, 'GET')
      assert.equal(request.redirect, 'error')
      assert.equal(request.headers.get('api-key'), config.AUTH_EMAIL_BREVO_KEY)
      calls++
      return Response.json({ privateStats: true }, { status })
    }

    await import('../functions/brevo-key-check/index.ts')
    assert.ok(handle)
    const url = 'https://example.test/functions/v1/brevo-key-check'
    const call = (token: string) =>
      handle!(new Request(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }))

    assert.equal((await handle(new Request(url))).status, 405)
    assert.equal((await call('fixture-scheduler-fake!')).status, 401)
    assert.equal(calls, 0)
    assert.equal((await call(config.AUTH_EMAIL_BREVO_CHECK_TOKEN)).status, 204)
    assert.equal(calls, 1)

    status = 401
    const failed = await call(config.AUTH_EMAIL_BREVO_CHECK_TOKEN)
    assert.equal(failed.status, 502)
    assert.equal(await failed.text(), '')
    assert.equal(calls, 2)
  } finally {
    Deno.serve = serve
    globalThis.fetch = fetch
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
})
