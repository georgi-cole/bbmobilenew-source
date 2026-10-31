import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundManager } from '../../../src/services/sound/SoundManager'
import { NativeAudioAdapter } from '../../../src/platform/cordova/NativeAudioAdapter'
import type { SoundEntry } from '../../../src/services/sound/sounds'

const KEY = 'test:scoped-presentation'
const manager = SoundManager as unknown as {
  _unlocked: boolean
  _sfxPools: Map<string, HTMLAudioElement[]>
  _sfxTimers: WeakMap<HTMLAudioElement, number[]>
  _sfxPlaybackCleanup: WeakMap<HTMLAudioElement, () => void>
  _lastPlayedAt: Map<string, number>
  _failedKeys: Set<string>
  _failedKeyRetryTimers: Map<string, number>
  _extraRegistry: Map<string, SoundEntry>
  _categories: Map<string, { enabled: boolean; volume: number }>
  _playQueue: unknown[]
  _clearUnlockListeners: () => void
  _clearSfxQueue: () => void
}
let paused: WeakMap<HTMLMediaElement, boolean>
function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const element = () => manager._sfxPools.get(KEY)![0]

beforeEach(() => {
  vi.useFakeTimers()
  manager._unlocked = true
  manager._sfxPools = new Map()
  manager._sfxTimers = new WeakMap()
  manager._sfxPlaybackCleanup = new WeakMap()
  manager._lastPlayedAt = new Map()
  manager._failedKeys = new Set()
  manager._failedKeyRetryTimers = new Map()
  manager._extraRegistry = new Map()
  manager._categories = new Map()
  manager._clearSfxQueue()
  paused = new WeakMap()
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    return paused.get(this) ?? true
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    paused.set(this, false)
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    paused.set(this, true)
  })
  vi.spyOn(NativeAudioAdapter, 'isAvailable').mockReturnValue(false)
  SoundManager.registerDynamic({
    key: KEY,
    src: '/test-presentation.mp3',
    category: 'ui',
    preload: false,
    volume: 1,
  })
})
afterEach(() => {
  for (const key of manager._sfxPools.keys()) SoundManager.stop(key)
  manager._clearUnlockListeners()
  manager._clearSfxQueue()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('presentation sound instance lifetime', () => {
  it('removes a locked scene cue on cancellation without removing a newer marker', async () => {
    manager._unlocked = false
    const old = new AbortController()
    await SoundManager.play(KEY, { signal: old.signal })
    expect(manager._playQueue).toHaveLength(1)
    old.abort()
    expect(manager._playQueue).toHaveLength(0)
    const replaced = new AbortController()
    await SoundManager.play(KEY, { signal: replaced.signal })
    await SoundManager.play('ui:navigate')
    replaced.abort()
    expect(manager._playQueue).toEqual([{ key: 'ui:navigate', opts: undefined }])
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  })

  it('does not allocate, play or queue an already cancelled cue', async () => {
    const controller = new AbortController()
    controller.abort()
    await SoundManager.play(KEY, { signal: controller.signal })
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(manager._sfxPools.size).toBe(0)
    expect(manager._playQueue).toHaveLength(0)
  })

  it('stops an active envelope and removes the deferred seek when the scene ends', async () => {
    const controller = new AbortController()
    await SoundManager.play(KEY, {
      signal: controller.signal,
      startAtSec: 4,
      fadeInMs: 400,
      durationMs: 4000,
      fadeOutMs: 200,
    })
    expect(element().paused).toBe(false)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    controller.abort()
    expect(element().paused).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    element().dispatchEvent(new Event('loadedmetadata'))
    expect(element().currentTime).toBe(0)
    vi.advanceTimersByTime(20_000)
    expect(element().paused).toBe(true)
  })

  it('silences a play promise that resolves after cancellation', async () => {
    const delayed = deferred()
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (
      this: HTMLMediaElement
    ) {
      paused.set(this, false)
      return delayed.promise
    })
    const controller = new AbortController()
    const request = SoundManager.play(KEY, { signal: controller.signal, fadeInMs: 400 })
    controller.abort()
    paused.set(element(), false)
    delayed.resolve()
    await request
    expect(element().paused).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(manager._failedKeys.has(KEY)).toBe(false)
  })

  it('does not pause, fade or requeue a newer user of the same pooled element', async () => {
    const delayed = deferred()
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (
      this: HTMLMediaElement
    ) {
      paused.set(this, false)
      return delayed.promise
    })
    const controller = new AbortController()
    const oldRequest = SoundManager.play(KEY, {
      signal: controller.signal,
      allowDuplicate: true,
      fadeInMs: 400,
    })
    const original = element()
    controller.abort()
    await SoundManager.play(KEY, { allowDuplicate: true, volume: 0.7, durationMs: 2000 })
    expect(element()).toBe(original)
    const timers = vi.getTimerCount()
    delayed.reject(new DOMException('Old scene', 'NotAllowedError'))
    await oldRequest
    expect(element().paused).toBe(false)
    expect(element().volume).toBe(0.7)
    expect(vi.getTimerCount()).toBe(timers)
    expect(manager._playQueue).toHaveLength(0)
  })

  it('releases the old abort listener on a natural end', async () => {
    const controller = new AbortController()
    await SoundManager.play(KEY, { signal: controller.signal, allowDuplicate: true })
    const original = element()
    paused.set(original, true)
    original.dispatchEvent(new Event('ended'))
    await SoundManager.play(KEY, { allowDuplicate: true })
    expect(element()).toBe(original)
    controller.abort()
    expect(element().paused).toBe(false)
  })

  it('invalidates a stolen pending instance without stopping its replacement', async () => {
    const delayed = deferred()
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (
      this: HTMLMediaElement
    ) {
      paused.set(this, false)
      return delayed.promise
    })
    const controller = new AbortController()
    const oldRequest = SoundManager.play(KEY, { signal: controller.signal, allowDuplicate: true })
    const original = element()
    for (let index = 0; index < 3; index += 1)
      await SoundManager.play(KEY, { allowDuplicate: true })
    expect(manager._sfxPools.get(KEY)).toHaveLength(4)
    await SoundManager.play(KEY, { allowDuplicate: true, volume: 0.8 })
    controller.abort()
    delayed.resolve()
    await oldRequest
    expect(original.paused).toBe(false)
    expect(original.volume).toBe(0.8)
    expect(manager._sfxPools.get(KEY)).toHaveLength(4)
  })

  it('keeps ordinary game cues on the native path and cancels scoped cues independently', async () => {
    vi.mocked(NativeAudioAdapter.isAvailable).mockReturnValue(true)
    const native = vi.spyOn(NativeAudioAdapter, 'playSfx').mockImplementation(() => {})
    await SoundManager.play('ui:navigate', { allowDuplicate: true })
    expect(native).toHaveBeenCalledTimes(1)
    const controller = new AbortController()
    await SoundManager.play('ui:navigate', { signal: controller.signal, allowDuplicate: true })
    expect(native).toHaveBeenCalledTimes(1)
    const scoped = manager._sfxPools.get('ui:navigate')![0]
    expect(scoped.paused).toBe(false)
    controller.abort()
    expect(scoped.paused).toBe(true)
  })

  it('treats an aborted play as cancellation rather than an asset failure', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new DOMException('Cancelled', 'AbortError')
    )
    await SoundManager.play(KEY, { allowDuplicate: true })
    expect(manager._failedKeys.has(KEY)).toBe(false)
    expect(manager._playQueue).toHaveLength(0)
    await SoundManager.play(KEY, { allowDuplicate: true })
    expect(element().paused).toBe(false)
  })
})
