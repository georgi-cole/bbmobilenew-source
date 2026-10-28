import { describe, expect, it, vi } from 'vitest'
import { isDynamicImportFailure, lazyWithChunkRecovery } from '../src/utils/lazyWithChunkRecovery'

describe('lazy route chunk recovery', () => {
  it('recognizes the browser error shown when a hashed route chunk is missing', () => {
    expect(
      isDynamicImportFailure(
        new TypeError('Failed to fetch dynamically imported module: /assets/Profile-old.js')
      )
    ).toBe(true)
  })

  it('does not treat ordinary route errors as stale-bundle failures', () => {
    expect(isDynamicImportFailure(new Error('Profile data could not be loaded'))).toBe(false)
  })

  it('preloads a lazy module only once when requested repeatedly', async () => {
    const loader = vi.fn(async () => ({ default: () => null }))
    const component = lazyWithChunkRecovery(loader)

    await Promise.all([component.preload(), component.preload()])

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('can retry preparation after a transient loader failure', async () => {
    const loader = vi
      .fn<() => Promise<{ default: () => null }>>()
      .mockRejectedValueOnce(new Error('Temporarily unavailable'))
      .mockResolvedValue({ default: () => null })
    const component = lazyWithChunkRecovery(loader)
    await expect(component.preload()).rejects.toThrow('Temporarily unavailable')
    await expect(component.preload()).resolves.toBeUndefined()
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
