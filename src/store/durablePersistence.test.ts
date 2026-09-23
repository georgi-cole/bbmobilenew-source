import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  flushDurablePersistence,
  getDurableItem,
  getDurablePersistenceDiagnostics,
  initializeDurablePersistence,
  removeDurableItem,
  setDurableItem,
  setDurablePersistenceFailureListener,
  type DurableStorageBackend,
} from './durablePersistence'

class FakeBackend implements DurableStorageBackend {
  readonly kind = 'indexeddb' as const
  readonly values = new Map<string, string>()
  failWrites = false

  async loadAll(): Promise<Map<string, string>> {
    return new Map(this.values)
  }

  async apply(mutations: Array<{ key: string; value: string | null }>): Promise<void> {
    if (this.failWrites) throw new DOMException('quota', 'QuotaExceededError')
    for (const mutation of mutations) {
      if (mutation.value === null) this.values.delete(mutation.key)
      else this.values.set(mutation.key, mutation.value)
    }
  }
}

describe('durablePersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy saves, batches durable writes, and rolls back a failed flush', async () => {
    const legacyKey = 'bbmobilenew:savedRunSlot:profile-1:classic'
    localStorage.setItem(legacyKey, '{"version":1}')
    localStorage.setItem('bbmobilenew:settings', '{"audio":true}')

    const backend = new FakeBackend()
    await initializeDurablePersistence(backend)

    expect(backend.values.get(legacyKey)).toBe('{"version":1}')
    expect(getDurableItem(legacyKey)).toBe('{"version":1}')
    expect(localStorage.getItem(legacyKey)).toBeNull()
    expect(localStorage.getItem('bbmobilenew:settings')).toBe('{"audio":true}')

    const secondKey = 'bbmobilenew:savedRuns:profile-1'
    expect(setDurableItem(secondKey, '{"version":2}')).toBe(true)
    expect(getDurableItem(secondKey)).toBe('{"version":2}')
    expect(await flushDurablePersistence()).toBe(true)
    expect(backend.values.get(secondKey)).toBe('{"version":2}')

    expect(removeDurableItem(secondKey)).toBe(true)
    expect(await flushDurablePersistence()).toBe(true)
    expect(backend.values.has(secondKey)).toBe(false)

    const failure = vi.fn()
    setDurablePersistenceFailureListener(failure)
    backend.failWrites = true
    const newKey = 'bbmobilenew:savedRunSlot:profile-1:voxPopuli'
    expect(setDurableItem(legacyKey, '{"version":2}')).toBe(true)
    expect(setDurableItem(newKey, '{"step":1}')).toBe(true)
    expect(setDurableItem(newKey, '{"step":2}')).toBe(true)
    expect(getDurableItem(legacyKey)).toBe('{"version":2}')
    expect(getDurableItem(newKey)).toBe('{"step":2}')
    expect(await flushDurablePersistence()).toBe(false)

    expect(getDurableItem(legacyKey)).toBe('{"version":1}')
    expect(backend.values.get(legacyKey)).toBe('{"version":1}')
    expect(getDurableItem(newKey)).toBeNull()
    expect(backend.values.has(newKey)).toBe(false)
    expect(failure).toHaveBeenCalledWith('quota_exceeded', expect.any(DOMException))

    const diagnostics = getDurablePersistenceDiagnostics()
    expect(diagnostics.backend).toBe('indexeddb')
    expect(diagnostics.migratedLegacyKeys).toBe(1)
    expect(diagnostics.lastFailureReason).toBe('quota_exceeded')
  })
})
