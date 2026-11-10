import assert from 'node:assert/strict'
import { Webhook } from 'npm:standardwebhooks@1.0.0'

Deno.test('Supabase auth email routing and quota fallback', async (test) => {
  const base = 'https://auth-fixture.supabase.co'
  const signingKey = btoa('s'.repeat(32))
  const webhook = new Webhook(signingKey)
  const to = 'player@example.test'
  const code = '042193'
  const config = {
    SUPABASE_URL: base,
    AUTH_EMAIL_HOOK_SECRET: `v1,whsec_${signingKey}`,
    AUTH_EMAIL_RESEND_KEY: 'fixture-resend',
    AUTH_EMAIL_BREVO_KEY: 'fixture-brevo',
  }
  const previous = Object.keys(config).map((key) => [key, Deno.env.get(key)] as const)
  for (const [key, value] of Object.entries(config)) Deno.env.set(key, value)

  const serve = Deno.serve
  const fetch = globalThis.fetch
  let handle: ((request: Request) => Promise<Response>) | undefined
  let resendError = ''
  let brevoFails = false
  const sent: {
    provider: string
    recipient: string
    text: string
    html: string
    key: string
  }[] = []

  try {
    Deno.serve = ((callback: typeof handle) => {
      handle = callback
    }) as typeof Deno.serve
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      const body = await request.json()
      if (request.url === 'https://api.resend.com/emails') {
        assert.equal(request.headers.get('authorization'), 'Bearer fixture-resend')
        assert.equal(body.from, 'The Big Eye <sign-in@auth.kolequant.xyz>')
        sent.push({
          provider: 'resend',
          recipient: body.to[0],
          text: body.text,
          html: body.html,
          key: request.headers.get('idempotency-key') ?? '',
        })
        return resendError
          ? Response.json({ name: resendError }, { status: 429 })
          : Response.json({})
      }
      assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email')
      assert.equal(request.headers.get('api-key'), 'fixture-brevo')
      assert.deepEqual(body.sender, {
        name: 'The Big Eye',
        email: 'sign-in@backup-auth.kolequant.xyz',
      })
      sent.push({
        provider: 'brevo',
        recipient: body.to[0].email,
        text: body.textContent,
        html: body.htmlContent,
        key: body.headers.idempotencyKey,
      })
      return brevoFails ? Response.json({ message: code }, { status: 400 }) : Response.json({})
    }

    await import('../functions/send-auth-email/index.ts')
    assert.ok(handle)
    function call(action: string, overrides: Record<string, string> = {}, tamper = false) {
      const payload = JSON.stringify({
        user: { email: to, new_email: 'new@example.test' },
        email_data: {
          email_action_type: action,
          token: code,
          token_hash: 'pkce_hash-for-new-email',
          redirect_to: 'https://game.example.test/',
          ...overrides,
        },
      })
      const timestamp = new Date()
      const id = 'fixture-event-id'
      return handle!(
        new Request(`${base}/functions/v1/send-auth-email`, {
          method: 'POST',
          headers: {
            'webhook-id': id,
            'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
            'webhook-signature': webhook.sign(id, timestamp, payload),
          },
          body: tamper ? payload.replace(code, '123456') : payload,
        })
      )
    }

    await test.step('rejects tampered events before any provider call', async () => {
      assert.equal((await call('signup', {}, true)).status, 401)
      assert.equal(sent.length, 0)
    })

    await test.step('delivers the six-digit signup code through Resend', async () => {
      assert.equal((await call('signup')).status, 200)
      assert.deepEqual(
        sent.map(({ provider }) => provider),
        ['resend']
      )
      assert.equal(sent[0].recipient, to)
      assert.match(sent[0].text, new RegExp(`\\b${code}\\b`))
      assert.match(sent[0].html, new RegExp(`>${code}<`))
      sent.length = 0
    })

    await test.step('sends the same returning-player code on either quota rejection', async () => {
      let previousKey: string | undefined
      for (const error of ['daily_quota_exceeded', 'monthly_quota_exceeded']) {
        resendError = error
        assert.equal((await call('magiclink')).status, 200)
        const [primary, backup] = sent.splice(0)
        assert.equal(primary.provider, 'resend')
        assert.equal(backup.provider, 'brevo')
        assert.equal(backup.recipient, primary.recipient)
        assert.equal(backup.text, primary.text)
        assert.equal(backup.html, primary.html)
        assert.match(backup.text, new RegExp(`\\b${code}\\b`))
        assert.match(backup.key, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/)
        if (previousKey) assert.equal(backup.key, previousKey)
        previousKey = backup.key
      }
    })

    await test.step('does not reroute non-quota errors or expose credentials', async () => {
      resendError = 'rate_limit_exceeded'
      assert.equal((await call('magiclink')).status, 503)
      assert.deepEqual(
        sent.splice(0).map(({ provider }) => provider),
        ['resend']
      )
      resendError = 'daily_quota_exceeded'
      brevoFails = true
      const response = await call('signup')
      assert.equal(response.status, 503)
      assert.doesNotMatch(await response.text(), new RegExp(code))
      sent.length = 0
      resendError = ''
      brevoFails = false
    })

    await test.step('keeps reset, invitation and secure email change links valid', async () => {
      for (const action of ['recovery', 'invite']) {
        assert.equal((await call(action)).status, 200)
        const link = new URL(sent.pop()!.text.split('\n\n')[1])
        assert.equal(link.origin + link.pathname, `${base}/auth/v1/verify`)
        assert.equal(link.searchParams.get('type'), action)
        assert.equal(link.searchParams.get('token'), 'pkce_hash-for-new-email')
        assert.equal(link.searchParams.get('redirect_to'), 'https://game.example.test/')
      }
      assert.equal(
        (await call('email_change', { token_hash_new: 'hash-for-current-email' })).status,
        200
      )
      assert.deepEqual(
        sent.map(({ recipient }) => recipient),
        [to, 'new@example.test']
      )
      assert.match(sent[0].text, /token=hash-for-current-email/)
      assert.match(sent[1].text, /token=pkce_hash-for-new-email/)
      assert.notEqual(sent[0].key, sent[1].key)
    })
  } finally {
    Deno.serve = serve
    globalThis.fetch = fetch
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
})
