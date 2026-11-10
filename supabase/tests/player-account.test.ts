import assert from 'node:assert/strict'

Deno.test(
  'player account deletion uses the authenticated identity and revokes its Apple token',
  async () => {
    const backend = 'https://account-test.supabase.co'
    const player = '2506940a-9777-4b9d-a0b1-c8f9966ad88b'
    const otherPlayer = '67db19e9-c46e-4f1f-8ebd-4c92b33eb335'
    const appleToken = 'fixture-apple-refresh-token'
    const config = {
      SUPABASE_URL: backend,
      SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
      PLAYER_APPLE_CLIENT_ID: 'fixture-apple-client',
      PLAYER_APPLE_CLIENT_SECRET: 'fixture-apple-secret',
      PLAYER_APPLE_TOKEN_KEY: btoa('a'.repeat(32)),
    }
    const originalEnv = Object.keys(config).map((key) => [key, Deno.env.get(key)] as const)
    for (const [key, value] of Object.entries(config)) Deno.env.set(key, value)
    const serve = Deno.serve
    const fetch = globalThis.fetch
    let handle: ((request: Request) => Promise<Response>) | undefined
    let encryptedToken: string | undefined
    const operations: string[] = []
    try {
      Deno.serve = ((callback: typeof handle) => {
        handle = callback
      }) as typeof Deno.serve
      globalThis.fetch = async (input, init) => {
        const request = new Request(input, init)
        const url = new URL(request.url)
        if (url.pathname === '/auth/v1/user') {
          const token = request.headers.get('Authorization')
          if (!['Bearer player', 'Bearer admin', 'Bearer anonymous'].includes(token ?? ''))
            return Response.json({ message: 'Invalid token' }, { status: 401 })
          return Response.json({
            id: player,
            email_confirmed_at: '2026-11-09T00:00:00Z',
            is_anonymous: token === 'Bearer anonymous',
            app_metadata: { player_analytics_admin: token === 'Bearer admin' },
            identities: [{ provider: 'apple' }],
          })
        }
        if (url.pathname === '/rest/v1/player_apple_tokens' && request.method === 'POST') {
          const body = await request.json()
          assert.equal(body.user_id, player)
          encryptedToken = body.encrypted_token
          return new Response(null, { status: 201 })
        }
        if (url.pathname === '/rest/v1/player_apple_tokens') {
          assert.equal(url.searchParams.get('user_id'), `eq.${player}`)
          return Response.json(encryptedToken ? [{ encrypted_token: encryptedToken }] : [])
        }
        if (url.href === 'https://appleid.apple.com/auth/revoke') {
          const body = new URLSearchParams(await request.text())
          assert.equal(body.get('token'), appleToken)
          assert.equal(body.get('client_id'), config.PLAYER_APPLE_CLIENT_ID)
          operations.push('apple-revoked')
          return new Response(null, { status: 200 })
        }
        assert.equal(url.href, `${backend}/auth/v1/admin/users/${player}`)
        assert.equal(request.method, 'DELETE')
        operations.push('account-deleted')
        return Response.json({ id: player })
      }

      await import('../functions/player-account/index.ts')
      assert.ok(handle)
      const call = (token: string, body: Record<string, string>) =>
        handle!(
          new Request(`${backend}/functions/v1/player-account`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          })
        )

      assert.equal((await call('invalid', { action: 'delete-account' })).status, 401)
      assert.equal((await call('admin', { action: 'delete-account' })).status, 403)
      assert.equal((await call('anonymous', { action: 'delete-account' })).status, 403)
      assert.deepEqual(operations, [])

      const saved = await call('player', { action: 'save-apple-token', refreshToken: appleToken })
      assert.equal(saved.status, 200)
      assert.deepEqual(await saved.json(), { saved: true })
      assert.ok(encryptedToken)
      assert.notEqual(encryptedToken, appleToken)

      const deleted = await call('player', { action: 'delete-account', userId: otherPlayer })
      assert.equal(deleted.status, 200)
      assert.deepEqual(await deleted.json(), { appleNeedsManualRevocation: false })
      assert.deepEqual(operations, ['apple-revoked', 'account-deleted'])
    } finally {
      Deno.serve = serve
      globalThis.fetch = fetch
      for (const [key, value] of originalEnv) {
        if (value === undefined) Deno.env.delete(key)
        else Deno.env.set(key, value)
      }
    }
  }
)
