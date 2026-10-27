import type { SupabaseClient } from '@supabase/supabase-js'
import { getBackendConfig } from './config'

export type BackendPurpose = 'profile_backup' | 'analytics'
const clients = new Map<BackendPurpose, Promise<SupabaseClient>>()
const authentications = new Map<
  BackendPurpose,
  Promise<{ client: SupabaseClient; ownerId: string }>
>()

async function getClient(purpose: BackendPurpose): Promise<SupabaseClient> {
  const config = getBackendConfig()
  if (!config) throw new Error('Supabase is not configured.')
  let pending = clients.get(purpose)
  if (!pending) {
    pending = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(config.url, config.key, {
        auth: {
          storageKey: `bbmobilenew:supabase:${purpose}:v1`,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async (input, init) => {
            const controller = new AbortController()
            const forwardAbort = () => controller.abort()
            const timeout = setTimeout(() => controller.abort(), 15_000)
            if (init?.signal?.aborted) controller.abort()
            init?.signal?.addEventListener('abort', forwardAbort, { once: true })
            try {
              return await fetch(input, { ...init, signal: controller.signal })
            } finally {
              clearTimeout(timeout)
              init?.signal?.removeEventListener('abort', forwardAbort)
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

/** Each purpose has a separate anonymous identity so backup and analytics are not joined. */
export async function authenticatedBackend(purpose: BackendPurpose) {
  let pending = authentications.get(purpose)
  if (!pending) {
    pending = (async () => {
      const client = await getClient(purpose)
      const current = await client.auth.getSession()
      if (current.error) throw current.error
      let session = current.data.session
      if (!session) {
        const signedIn = await client.auth.signInAnonymously()
        if (signedIn.error) throw signedIn.error
        session = signedIn.data.session
      }
      if (!session) throw new Error('Could not start a Supabase session.')
      return { client, ownerId: session.user.id }
    })()
    authentications.set(purpose, pending)
    void pending.finally(() => authentications.delete(purpose)).catch(() => undefined)
  }
  return pending
}
