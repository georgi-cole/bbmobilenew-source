import { Capacitor } from '@capacitor/core'

const DB_NAME = 'big-eye-persistence'
const DB_VERSION = 1
const KV_STORE = 'kv'
const SQLITE_TABLE = 'durable_kv'
const FLUSH_DELAY_MS = 25

const LEGACY_DURABLE_PREFIXES = [
  'bbmobilenew:savedSeason:',
  'bbmobilenew:savedRuns:',
  'bbmobilenew:savedRunSlot:',
  'bbmobilenew:seasonArchives',
] as const

export type DurablePersistenceBackendKind =
  | 'sqlite'
  | 'indexeddb'
  | 'localstorage-fallback'
  | 'uninitialized'

export type DurablePersistenceFailureReason = 'quota_exceeded' | 'storage_unavailable'

export interface DurablePersistenceDiagnostics {
  backend: DurablePersistenceBackendKind
  initialized: boolean
  pendingWrites: number
  cachedBytes: number
  migratedLegacyKeys: number
  lastFlushMs: number
  lastFailureReason: DurablePersistenceFailureReason | null
}

type DurableMutation = {
  key: string
  value: string | null
  before: string | null
}

export interface DurableStorageBackend {
  kind: Exclude<DurablePersistenceBackendKind, 'uninitialized'>
  loadAll(): Promise<Map<string, string>>
  apply(mutations: Array<Pick<DurableMutation, 'key' | 'value'>>): Promise<void>
}

type FailureListener = (reason: DurablePersistenceFailureReason, error: unknown) => void
type FlushListener = (durationMs: number, success: boolean) => void

let backend: DurableStorageBackend | null = null
let initialized = false
let initializing: Promise<void> | null = null
const cache = new Map<string, string>()
const pending = new Map<string, DurableMutation>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let activeFlush: Promise<boolean> | null = null
let failureListener: FailureListener | null = null
let flushListener: FlushListener | null = null
let migratedLegacyKeys = 0
let lastFlushMs = 0
let lastFailureReason: DurablePersistenceFailureReason | null = null

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function estimateStringBytes(value: string): number {
  return value.length * 2
}

function classifyFailure(error: unknown): DurablePersistenceFailureReason {
  if (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  ) {
    return 'quota_exceeded'
  }
  return 'storage_unavailable'
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked.'))
  })
}

class IndexedDbBackend implements DurableStorageBackend {
  readonly kind = 'indexeddb' as const
  private readonly dbPromise = openIndexedDb()

  async loadAll(): Promise<Map<string, string>> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(KV_STORE, 'readonly')
      const request = transaction.objectStore(KV_STORE).getAll()
      request.onsuccess = () => {
        const entries = new Map<string, string>()
        for (const row of request.result as Array<{ key?: unknown; value?: unknown }>) {
          if (typeof row.key === 'string' && typeof row.value === 'string') {
            entries.set(row.key, row.value)
          }
        }
        resolve(entries)
      }
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB durable records could not be read.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB durable read transaction aborted.'))
    })
  }

  async apply(mutations: Array<Pick<DurableMutation, 'key' | 'value'>>): Promise<void> {
    if (mutations.length === 0) return
    const db = await this.dbPromise
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(KV_STORE, 'readwrite')
      const store = transaction.objectStore(KV_STORE)
      for (const mutation of mutations) {
        if (mutation.value === null) store.delete(mutation.key)
        else store.put({ key: mutation.key, value: mutation.value })
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('IndexedDB durable write failed.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB durable write transaction aborted.'))
    })
  }
}

class LocalStorageFallbackBackend implements DurableStorageBackend {
  readonly kind = 'localstorage-fallback' as const

  async loadAll(): Promise<Map<string, string>> {
    const entries = new Map<string, string>()
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key) continue
        const value = localStorage.getItem(key)
        if (value !== null) entries.set(key, value)
      }
    } catch {
      // Keep an empty cache; writes will surface a storage failure later.
    }
    return entries
  }

  async apply(mutations: Array<Pick<DurableMutation, 'key' | 'value'>>): Promise<void> {
    for (const mutation of mutations) {
      if (mutation.value === null) localStorage.removeItem(mutation.key)
      else localStorage.setItem(mutation.key, mutation.value)
    }
  }
}

async function createSqliteBackend(): Promise<DurableStorageBackend> {
  const sqliteModule = await import('@capacitor-community/sqlite')
  const sqlite = new sqliteModule.SQLiteConnection(sqliteModule.CapacitorSQLite)
  await sqlite.checkConnectionsConsistency()

  const existing = await sqlite.isConnection(DB_NAME, false)
  const db = existing.result
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)

  const openState = await db.isDBOpen().catch(() => ({ result: false }))
  if (!openState.result) await db.open()

  await db.execute(
    `CREATE TABLE IF NOT EXISTS ${SQLITE_TABLE} (
      storage_key TEXT PRIMARY KEY NOT NULL,
      storage_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );`
  )

  return {
    kind: 'sqlite',
    async loadAll() {
      const result = await db.query(
        `SELECT storage_key AS key, storage_value AS value FROM ${SQLITE_TABLE};`
      )
      const entries = new Map<string, string>()
      for (const row of result.values ?? []) {
        if (typeof row.key === 'string' && typeof row.value === 'string') {
          entries.set(row.key, row.value)
        }
      }
      return entries
    },
    async apply(mutations) {
      if (mutations.length === 0) return
      await db.beginTransaction()
      try {
        for (const mutation of mutations) {
          if (mutation.value === null) {
            await db.run(
              `DELETE FROM ${SQLITE_TABLE} WHERE storage_key = ?;`,
              [mutation.key],
              false
            )
          } else {
            await db.run(
              `INSERT OR REPLACE INTO ${SQLITE_TABLE}
                (storage_key, storage_value, updated_at)
                VALUES (?, ?, ?);`,
              [mutation.key, mutation.value, Date.now()],
              false
            )
          }
        }
        await db.commitTransaction()
      } catch (error) {
        await db.rollbackTransaction().catch(() => undefined)
        throw error
      }
    },
  }
}

async function chooseBackend(): Promise<DurableStorageBackend> {
  if (Capacitor.isNativePlatform()) {
    try {
      return await createSqliteBackend()
    } catch (error) {
      console.warn('[persistence] Native SQLite unavailable; falling back to IndexedDB.', error)
    }
  }

  try {
    const candidate = new IndexedDbBackend()
    await candidate.loadAll()
    return candidate
  } catch (error) {
    console.warn('[persistence] IndexedDB unavailable; using localStorage fallback.', error)
    return new LocalStorageFallbackBackend()
  }
}

function isLegacyDurableKey(key: string): boolean {
  return LEGACY_DURABLE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

async function migrateLegacyLocalStorage(target: DurableStorageBackend): Promise<void> {
  if (target.kind === 'localstorage-fallback') return

  const legacy = new Map<string, string>()
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !isLegacyDurableKey(key)) continue
      const value = localStorage.getItem(key)
      if (value !== null) legacy.set(key, value)
    }
  } catch {
    return
  }

  if (legacy.size === 0) return

  const mutations: Array<Pick<DurableMutation, 'key' | 'value'>> = []
  for (const [key, value] of legacy) {
    if (!cache.has(key)) {
      cache.set(key, value)
      mutations.push({ key, value })
    }
  }

  if (mutations.length > 0) await target.apply(mutations)

  let removed = 0
  for (const key of legacy.keys()) {
    if (!cache.has(key)) continue
    try {
      localStorage.removeItem(key)
      removed += 1
    } catch {
      // A successfully migrated durable record is still safe if legacy cleanup is blocked.
    }
  }
  migratedLegacyKeys += removed
}

function scheduleFlush(): void {
  if (!initialized || backend?.kind === 'localstorage-fallback' || flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushDurablePersistence()
  }, FLUSH_DELAY_MS)
}

function recordMutation(key: string, value: string | null): void {
  const existing = pending.get(key)
  const before = existing?.before ?? cache.get(key) ?? null

  if (value === null) cache.delete(key)
  else cache.set(key, value)

  pending.set(key, { key, value, before })
  scheduleFlush()
}

export function setDurablePersistenceFailureListener(listener: FailureListener | null): void {
  failureListener = listener
}

export function setDurablePersistenceFlushListener(listener: FlushListener | null): void {
  flushListener = listener
}

export async function initializeDurablePersistence(
  backendOverride?: DurableStorageBackend
): Promise<void> {
  if (initialized) return
  if (initializing) return initializing

  initializing = (async () => {
    const selected = backendOverride ?? (await chooseBackend())
    const entries = await selected.loadAll()
    cache.clear()
    for (const [key, value] of entries) cache.set(key, value)
    backend = selected
    await migrateLegacyLocalStorage(selected)
    initialized = true
  })().catch(async (error) => {
    console.warn('[persistence] Durable storage initialization failed.', error)
    const fallback = new LocalStorageFallbackBackend()
    const entries = await fallback.loadAll()
    backend = fallback
    cache.clear()
    for (const [key, value] of entries) cache.set(key, value)
    initialized = true
  })

  await initializing
  initializing = null
}

export function getDurableItem(key: string): string | null {
  if (initialized) return cache.get(key) ?? null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setDurableItem(key: string, value: string): boolean {
  if (!initialized) {
    try {
      localStorage.setItem(key, value)
      return true
    } catch (error) {
      const reason = classifyFailure(error)
      lastFailureReason = reason
      failureListener?.(reason, error)
      return false
    }
  }

  if (backend?.kind === 'localstorage-fallback') {
    try {
      localStorage.setItem(key, value)
      cache.set(key, value)
      return true
    } catch (error) {
      const reason = classifyFailure(error)
      lastFailureReason = reason
      failureListener?.(reason, error)
      return false
    }
  }

  recordMutation(key, value)
  return true
}

export function removeDurableItem(key: string): boolean {
  if (!initialized) {
    try {
      localStorage.removeItem(key)
      return true
    } catch (error) {
      const reason = classifyFailure(error)
      lastFailureReason = reason
      failureListener?.(reason, error)
      return false
    }
  }

  if (backend?.kind === 'localstorage-fallback') {
    try {
      localStorage.removeItem(key)
      cache.delete(key)
      return true
    } catch (error) {
      const reason = classifyFailure(error)
      lastFailureReason = reason
      failureListener?.(reason, error)
      return false
    }
  }

  recordMutation(key, null)
  return true
}

export async function flushDurablePersistence(): Promise<boolean> {
  if (!initialized || !backend) return true
  if (backend.kind === 'localstorage-fallback') return true
  if (activeFlush) {
    const firstResult = await activeFlush
    if (!firstResult || pending.size === 0) return firstResult
  }

  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pending.size === 0) return true

  const batch = [...pending.values()]
  pending.clear()
  const startedAt = nowMs()

  activeFlush = (async () => {
    try {
      await backend!.apply(batch.map(({ key, value }) => ({ key, value })))
      lastFlushMs = Math.max(0, nowMs() - startedAt)
      lastFailureReason = null
      flushListener?.(lastFlushMs, true)
      if (pending.size > 0) scheduleFlush()
      return true
    } catch (error) {
      lastFlushMs = Math.max(0, nowMs() - startedAt)
      const reason = classifyFailure(error)
      lastFailureReason = reason

      for (const mutation of batch) {
        if (pending.has(mutation.key)) continue
        if (mutation.before === null) cache.delete(mutation.key)
        else cache.set(mutation.key, mutation.before)
      }

      flushListener?.(lastFlushMs, false)
      failureListener?.(reason, error)
      return false
    } finally {
      activeFlush = null
    }
  })()

  return activeFlush
}

export function inspectDurableStorageUsageBytes(): number {
  let total = 0
  for (const [key, value] of cache) {
    total += estimateStringBytes(key) + estimateStringBytes(value)
  }
  return total
}

export function getDurablePersistenceDiagnostics(): DurablePersistenceDiagnostics {
  return {
    backend: backend?.kind ?? 'uninitialized',
    initialized,
    pendingWrites: pending.size,
    cachedBytes: inspectDurableStorageUsageBytes(),
    migratedLegacyKeys,
    lastFlushMs,
    lastFailureReason,
  }
}
