import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicCueEngine } from '../../../src/services/sound/MusicCueEngine'
import { createDefaultMusicCue } from '../../../src/services/sound/musicCue'

function installAudioContextMock() {
  const gains: Array<{ gain: { value: number }; connect: ReturnType<typeof vi.fn> }> = []
  const filters: Array<{
    type: string
    frequency: { value: number }
    Q: { value: number }
    gain: { value: number }
    connect: ReturnType<typeof vi.fn>
  }> = []
  const createMediaElementSourceMock = vi.fn(() => ({ connect: vi.fn() }))

  const createGainMock = vi.fn(() => {
    const gain = { gain: { value: 1 }, connect: vi.fn() }
    gains.push(gain)
    return gain
  })
  const createBiquadFilterMock = vi.fn(() => {
    // Match the browser default that caused clear cues to sound low-passed
    // before the engine explicitly neutralised the graph.
    const filter = {
      type: 'lowpass',
      frequency: { value: 350 },
      Q: { value: 1 },
      gain: { value: 0 },
      connect: vi.fn(),
    }
    filters.push(filter)
    return filter
  })

  class FakeAudioContext {
    state = 'running'
    destination = {}
    resume = vi.fn(async () => undefined)
    createMediaElementSource = createMediaElementSourceMock
    createGain = createGainMock
    createBiquadFilter = createBiquadFilterMock
  }

  vi.stubGlobal('AudioContext', FakeAudioContext)
  return { filters, gains, createMediaElementSource: createMediaElementSourceMock }
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('MusicCueEngine', () => {
  it('starts at the configured segment and loops inside its cue boundary', async () => {
    const engine = new MusicCueEngine()
    const cue = {
      ...createDefaultMusicCue('competition'),
      id: 'segment',
      startAtSec: 10,
      endAtSec: 20,
      loop: true,
      loopStartSec: 12,
      loopEndSec: 18,
    }

    await engine.play(
      {
        key: 'music:test',
        track: 'competition',
        src: '/test.mp3',
        volume: 0.5,
        loop: true,
      },
      cue
    )

    const element = engine.currentElement!
    expect(element.currentTime).toBe(10)
    element.currentTime = 0
    element.dispatchEvent(new Event('loadedmetadata'))
    expect(element.currentTime).toBe(10)
    element.currentTime = 18
    element.dispatchEvent(new Event('timeupdate'))
    expect(element.currentTime).toBe(12)
  })

  it('keeps effectPreset none acoustically transparent while using the Web Audio gain graph', async () => {
    const { filters, gains } = installAudioContextMock()
    const engine = new MusicCueEngine()

    await engine.play(
      { key: 'music:clear', track: 'nominations', src: '/clear.mp3', volume: 0.8, loop: true },
      { ...createDefaultMusicCue('nominations'), id: 'clear' }
    )

    expect(filters[0]?.type).toBe('allpass')
    expect(gains[0]?.gain.value).toBe(0.8)
    expect(engine.currentElement?.volume).toBe(1)
  })

  it('still applies the distant-room low-pass preset when requested', async () => {
    const { filters } = installAudioContextMock()
    const engine = new MusicCueEngine()

    await engine.play(
      { key: 'music:muffled', track: 'nominations', src: '/muffled.mp3', volume: 1, loop: true },
      {
        ...createDefaultMusicCue('nominations'),
        id: 'muffled',
        effectPreset: 'muffled',
      }
    )

    expect(filters[0]?.type).toBe('lowpass')
    expect(filters[0]?.frequency.value).toBe(900)
  })

  it('clears a prior effect preset when a pooled deck plays a clear cue', async () => {
    const { filters } = installAudioContextMock()
    const engine = new MusicCueEngine()
    const asset = {
      key: 'music:test',
      track: 'nominations' as const,
      src: '/test.mp3',
      volume: 1,
      loop: true,
    }

    await engine.play(asset, {
      ...createDefaultMusicCue('nominations'),
      id: 'muffled-first',
      effectPreset: 'muffled',
      crossfadeMs: 0,
    })
    expect(filters[0]?.type).toBe('lowpass')

    await engine.play(asset, {
      ...createDefaultMusicCue('nominations'),
      id: 'radio-second',
      effectPreset: 'radio',
      crossfadeMs: 0,
    })
    expect(filters[1]?.type).toBe('bandpass')

    await engine.play(asset, {
      ...createDefaultMusicCue('nominations'),
      id: 'clear-third',
      effectPreset: 'none',
      crossfadeMs: 0,
    })
    expect(filters[0]?.type).toBe('allpass')
    expect(filters[0]?.frequency.value).toBe(350)
  })

  it('uses a second deck for a configured crossfade', async () => {
    vi.useFakeTimers()
    const engine = new MusicCueEngine()
    const asset = {
      key: 'music:test',
      track: 'competition' as const,
      src: '/test.mp3',
      volume: 1,
      loop: true,
    }
    await engine.play(asset, { ...createDefaultMusicCue('competition'), id: 'a' })
    const first = engine.currentElement
    const pending = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'b',
      startAtSec: 30,
      crossfadeMs: 200,
    })
    await vi.runAllTimersAsync()
    await pending
    expect(engine.currentElement).not.toBe(first)
  })

  it('reuses two media elements and Web Audio graphs across many cue changes', async () => {
    const { createMediaElementSource } = installAudioContextMock()
    const createElement = vi.spyOn(document, 'createElement')
    const engine = new MusicCueEngine()
    const asset = {
      key: 'music:test',
      track: 'competition' as const,
      src: '/test.mp3',
      volume: 1,
      loop: true,
    }

    for (let index = 0; index < 60; index += 1) {
      await engine.play(asset, {
        ...createDefaultMusicCue('competition'),
        id: `cue-${index}`,
        crossfadeMs: 0,
      })
    }

    expect(createElement.mock.calls.filter(([tagName]) => tagName === 'audio')).toHaveLength(2)
    expect(createMediaElementSource).toHaveBeenCalledTimes(2)
    engine.stop()
  })

  it('uses an external entry fade when crossing from legacy music', async () => {
    vi.useFakeTimers()
    const engine = new MusicCueEngine()
    const pending = engine.play(
      { key: 'music:test', track: 'competition', src: '/test.mp3', volume: 1, loop: true },
      { ...createDefaultMusicCue('competition'), id: 'external', startAtSec: 20 },
      { entryFadeMs: 200 }
    )
    await vi.runAllTimersAsync()
    await pending
    expect(engine.currentElement?.volume).toBe(1)
  })

  it('keeps only the newest cue when async play requests resolve out of order', async () => {
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play)
    const pauseSpy = vi.mocked(HTMLMediaElement.prototype.pause)
    let releaseFirstPlay!: () => void
    playSpy
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstPlay = resolve
          })
      )
      .mockResolvedValueOnce(undefined)

    const engine = new MusicCueEngine()
    const asset = {
      key: 'music:test',
      track: 'competition' as const,
      src: '/test.mp3',
      volume: 1,
      loop: true,
    }

    const first = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'first',
      startAtSec: 10,
    })
    const second = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'second',
      startAtSec: 20,
    })

    await second
    releaseFirstPlay()
    // Replacing a cue is ordinary navigation, not a playback failure. The
    // caller can safely await the older request without touching the new deck.
    await expect(first).resolves.toBeUndefined()

    expect(engine.currentCue?.id).toBe('second')
    expect(engine.currentElement?.currentTime).toBe(20)
    expect(pauseSpy).toHaveBeenCalledTimes(1)
  })

  it('quietly finishes an older promoted cue that is superseded while its crossfade is running', async () => {
    vi.useFakeTimers()
    const engine = new MusicCueEngine()
    const asset = {
      key: 'music:test',
      track: 'competition' as const,
      src: '/test.mp3',
      volume: 1,
      loop: true,
    }

    await engine.play(asset, { ...createDefaultMusicCue('competition'), id: 'base' })
    const middle = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'middle',
      crossfadeMs: 400,
    })
    const middleCompletion = expect(middle).resolves.toBeUndefined()
    await Promise.resolve()
    await Promise.resolve()
    expect(engine.currentCue?.id).toBe('middle')

    const newest = engine.play(asset, {
      ...createDefaultMusicCue('competition'),
      id: 'newest',
      crossfadeMs: 0,
    })
    await newest
    await vi.runAllTimersAsync()

    await middleCompletion
    expect(engine.currentCue?.id).toBe('newest')
  })

  it('does not allow an explicitly stopped pending cue to become active later', async () => {
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play)
    let releasePlay!: () => void
    playSpy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releasePlay = resolve
        })
    )

    const engine = new MusicCueEngine()
    const pending = engine.play(
      { key: 'music:test', track: 'competition', src: '/test.mp3', volume: 1, loop: true },
      { ...createDefaultMusicCue('competition'), id: 'pending' }
    )

    engine.stop()
    releasePlay()

    await expect(pending).resolves.toBeUndefined()
    expect(engine.currentElement).toBeNull()
    expect(engine.currentCue).toBeNull()
  })
})
