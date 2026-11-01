import type { SupabaseClient } from '@supabase/supabase-js'
import { getBackendConfig } from './config'

export type BackendPurpose = 'profile_backup' | 'analytics'
const clients = new Map<BackendPurpose, Promise<SupabaseClient>>()
const authentications = new Map<
  BackendPurpose,
  Promise<{ client: SupabaseClient; ownerId: string }>
>()
const authListeners = new Map<BackendPurpose, Set<(ownerId: string | null) => void>>()
const authOperations = new Map<BackendPurpose, Promise<unknown>>()

export function subscribeBackendAuth(
  purpose: BackendPurpose,
  listener: (ownerId: string | null) => void
): () => void {
  let listeners = authListeners.get(purpose)
  if (!listeners) {
    listeners = new Set()
    authListeners.set(purpose, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function getBackendClient(purpose: BackendPurpose): Promise<SupabaseClient> {
  const config = getBackendConfig()
  if (!config) throw new Error('Supabase is not configured.')
  let pending = clients.get(purpose)
  if (!pending) {
    pending = import('@supabase/supabase-js').then(({ createClient }) => {
      const client = createClient(config.url, config.key, {
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
      client.auth.onAuthStateChange((_event, session) => {
        // Keep this callback synchronous to avoid taking Auth's session lock twice.
        authListeners.get(purpose)?.forEach((listener) => listener(session?.user.id ?? null))
      })
      return client
    })
    clients.set(purpose, pending)
    void pending.catch(() => clients.delete(purpose))
  }
  return pending
}

/**
 * All automatic and explicit Auth mutations for one identity share this queue.
 * The app lock deliberately differs from Supabase's internal session/storage
 * lock, so SDK methods can safely acquire their own lock inside the operation.
 */
export function withBackendAuthLock<T>(
  purpose: BackendPurpose,
  operation: (client: SupabaseClient) => Promise<T>
): Promise<T> {
  const previous = authOperations.get(purpose) ?? Promise.resolve()
  const pending = previous
    .catch(() => undefined)
    .then(async () => {
      const client = await getBackendClient(purpose)
      const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
      if (typeof locks?.request === 'function')
        return locks.request(
          `bbmobilenew:app-auth-operation:${purpose}:v1`,
          { mode: 'exclusive' },
          () => operation(client)
        )
      // Web Locks are not available in every native webview. This queue still
      // prevents races between the background service and UI in this instance.
      return operation(client)
    })
  authOperations.set(purpose, pending)
  void pending
    .finally(() => {
      if (authOperations.get(purpose) === pending) authOperations.delete(purpose)
    })
    .catch(() => undefined)
  return pending
}

/** Analytics keeps its anonymous session; only the backup account can link an email. */
export async function authenticatedBackend(purpose: BackendPurpose) {
  let pending = authentications.get(purpose)
  if (!pending) {
    pending = withBackendAuthLock(purpose, async (client) => {
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
    })
    authentications.set(purpose, pending)
    void pending.finally(() => authentications.delete(purpose)).catch(() => undefined)
  }
  return pending
}
