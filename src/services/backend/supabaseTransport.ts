import type { SupabaseClient } from '@supabase/supabase-js'
import { optionalPlayerFetch } from '../../safety/optionalRequest'
import { canUseOptionalFeature } from '../../safety/playerSafety'
import { getBackendConfig } from './config'

type Purpose = 'analytics' | 'onlineServices'
const clients = new Map<Purpose, Promise<SupabaseClient>>()
const authenticating = new Map<Purpose, Promise<{ client: SupabaseClient; ownerId: string }>>()

async function getClient(purpose: Purpose): Promise<SupabaseClient> {
  const config = getBackendConfig()
  if (!config || !canUseOptionalFeature(purpose)) throw new Error('Cloud service is unavailable.')
  let pending = clients.get(purpose)
  if (!pending) {
    pending = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(config.url, config.key, {
        auth: {
          storageKey: `bbmobilenew:supabase:${purpose}:v1`,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async (input, init) => {
            const controller = new AbortController()
            const abort = () => controller.abort()
            const timeout = setTimeout(abort, 15000)
            if (init?.signal?.aborted) controller.abort()
            init?.signal?.addEventListener('abort', abort, { once: true })
            try {
              return await optionalPlayerFetch(purpose, input, {
                ...init,
                signal: controller.signal,
              })
            } finally {
              clearTimeout(timeout)
              init?.signal?.removeEventListener('abort', abort)
            }
          },
        },
      })
    )
    clients.set(purpose, pending)
    void pending.catch(() => clients.delete(purpose))
  }
  return pending
}

/** Separate identities keep analytics opt-in independent from personal profile backups. */
export async function authenticatedBackend(purpose: Purpose) {
  let pending = authenticating.get(purpose)
  if (!pending) {
    pending = (async () => {
      const client = await getClient(purpose)
      const existing = await client.auth.getSession()
      if (existing.error) throw existing.error
      let session = existing.data.session
      if (session && (session.expires_at ?? 0) * 1000 < Date.now() + 60000) {
        const refreshed = await client.auth.refreshSession()
        if (refreshed.error) throw refreshed.error
        session = refreshed.data.session
      }
      if (!session) {
        const signedIn = await client.auth.signInAnonymously()
        if (signedIn.error) throw signedIn.error
        session = signedIn.data.session
      }
      if (!session || !canUseOptionalFeature(purpose)) throw new Error('Cloud access is off.')
      return { client, ownerId: session.user.id }
    })()
    authenticating.set(purpose, pending)
    void pending.finally(() => authenticating.delete(purpose)).catch(() => undefined)
  }
  return pending
}
