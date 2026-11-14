import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ current: 'android' }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => platform.current } }))

describe('Android store reconnect', () => {
  beforeEach(() => {
    vi.resetModules()
    platform.current = 'android'
  })
  afterEach(() => vi.useRealTimers())

  it('retries a disconnected ownership query once before allowing the next query', async () => {
    vi.useFakeTimers()
    const { withNativeBilling } = await import('./nativeBillingQueue')
    const calls: string[] = []
    const query = vi
      .fn()
      .mockImplementationOnce(async () => {
        calls.push('disconnected')
        throw Object.assign(new Error('inapp: SERVICE_DISCONNECTED (-1)'), {
          code: 'QUERY_PURCHASES_FAILED',
        })
      })
      .mockImplementationOnce(async () => {
        calls.push('reconnected')
        return { purchases: [] }
      })
    const first = withNativeBilling(query, { retryDisconnected: true })
    const second = withNativeBilling(async () => calls.push('catalog'))
    await vi.advanceTimersByTimeAsync(300)
    await Promise.all([first, second])
    expect(calls).toEqual(['disconnected', 'reconnected', 'catalog'])
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('never automatically repeats checkout and releases the queue after an error', async () => {
    const { withNativeBilling } = await import('./nativeBillingQueue')
    const checkout = vi.fn().mockRejectedValue(new Error('SERVICE_DISCONNECTED'))
    await expect(withNativeBilling(checkout)).rejects.toThrow('SERVICE_DISCONNECTED')
    expect(checkout).toHaveBeenCalledTimes(1)
    await expect(withNativeBilling(async () => 'next refresh')).resolves.toBe('next refresh')
  })

  it('does not retry a canceled or unavailable purchase query', async () => {
    const { withNativeBilling } = await import('./nativeBillingQueue')
    const query = vi.fn().mockRejectedValue(new Error('BILLING_UNAVAILABLE'))
    await expect(withNativeBilling(query, { retryDisconnected: true })).rejects.toThrow(
      'BILLING_UNAVAILABLE'
    )
    expect(query).toHaveBeenCalledTimes(1)
  })
})
