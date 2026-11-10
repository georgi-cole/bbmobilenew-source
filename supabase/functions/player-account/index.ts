import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2.118.0/cors'

const headers = { ...corsHeaders, 'Cache-Control': 'no-store' }
const encoder = new TextEncoder()

function respond(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers })
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Missing account service configuration.')
  return value
}

function appleTokenKey() {
  const raw = Uint8Array.from(atob(requireEnv('PLAYER_APPLE_TOKEN_KEY')), (char) =>
    char.charCodeAt(0)
  )
  if (raw.length !== 32) throw new Error('Invalid account service configuration.')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encryptToken(token: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(userId) },
    await appleTokenKey(),
    encoder.encode(token)
  )
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(ciphertext)))
}

async function revokeAppleToken(encrypted: string, userId: string) {
  const bytes = Uint8Array.from(atob(encrypted), (char) => char.charCodeAt(0))
  const token = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(userId) },
    await appleTokenKey(),
    bytes.subarray(12)
  )
  const response = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: requireEnv('PLAYER_APPLE_CLIENT_ID'),
      client_secret: requireEnv('PLAYER_APPLE_CLIENT_SECRET'),
      token: new TextDecoder().decode(token),
      token_type_hint: 'refresh_token',
    }),
    signal: AbortSignal.timeout(6000),
  })
  return response.ok
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)
  const accessToken = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  if (!accessToken) return respond({ error: 'Sign-in required.' }, 401)
  const body = await request.json().catch(() => null)
  if (body?.action !== 'save-apple-token' && body?.action !== 'delete-account')
    return respond({ error: 'Invalid account request.' }, 400)

  try {
    const admin = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
    // Check the live user. Request data never chooses the account to modify.
    const { data, error } = await admin.auth.getUser(accessToken)
    const user = data.user
    if (error || !user) return respond({ error: 'Sign-in required.' }, 401)
    if (
      !user.email_confirmed_at ||
      user.is_anonymous ||
      user.app_metadata.player_analytics_admin === true
    )
      return respond({ error: 'This account is unavailable to the player account service.' }, 403)

    const apple = user.identities?.some((identity) => identity.provider === 'apple') ?? false
    const tokens = admin.from('player_apple_tokens')
    if (body.action === 'save-apple-token') {
      const token = body.refreshToken
      if (!apple || typeof token !== 'string' || token.length < 1 || token.length > 4096)
        return respond({ error: 'Invalid Apple credential.' }, 400)
      const { error: storageError } = await tokens.upsert({
        user_id: user.id,
        encrypted_token: await encryptToken(token, user.id),
      })
      if (storageError) throw storageError
      return respond({ saved: true })
    }

    let appleNeedsManualRevocation = false
    if (apple) {
      const { data: credential, error: lookupError } = await tokens
        .select('encrypted_token')
        .eq('user_id', user.id)
        .maybeSingle()
      const revoked =
        !lookupError &&
        credential &&
        (await revokeAppleToken(credential.encrypted_token, user.id).catch(() => false))
      appleNeedsManualRevocation = !revoked
    }
    const { error: deletionError } = await admin.auth.admin.deleteUser(user.id)
    if (deletionError) throw deletionError
    return respond({ appleNeedsManualRevocation })
  } catch {
    // Return no credential, provider response or database detail.
    return respond({ error: 'Account service temporarily unavailable.' }, 503)
  }
})
