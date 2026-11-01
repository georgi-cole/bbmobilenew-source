import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayOptions } from '../../../services/sound/SoundManager'
import { createFinalDecisionAudio, FINAL_DECISION_AUDIO } from '../finalDecisionAudio'

const sound = vi.hoisted(() => ({
  claimExternalMusic: vi.fn(),
  releaseExternalMusic: vi.fn(),
  setExternalMusicVolume: vi.fn(),
  play: vi.fn<(key: string, options: PlayOptions) => Promise<void>>(async () => {}),
}))
vi.mock('../../../services/sound/SoundManager', () => ({ SoundManager: sound }))

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = []
  static nextPlay: (() => Promise<void>) | null = null
  volume = 1
  loop = false
  preload = ''
  currentTime = 0
  paused = true
  play = vi.fn(() => {
    const result = FakeAudio.nextPlay?.() ?? Promise.resolve()
    FakeAudio.nextPlay = null
    this.paused = false
    return result
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  load = vi.fn()
  removeAttribute = vi.fn()
  src: string
  constructor(src: string) {
    super()
    this.src = src
    FakeAudio.instances.push(this)
  }
}

const enabled = { musicOn: true, sfxOn: true }
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  FakeAudio.instances = []
  FakeAudio.nextPlay = null
  vi.stubGlobal('Audio', FakeAudio)
  sound.claimExternalMusic.mockImplementation((_owner, element, volume) => {
    element.volume = volume
  })
  sound.setExternalMusicVolume.mockImplementation((_owner, element, volume) => {
    element.volume = volume
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Final Decision scene audio ownership', () => {
  it('starts one quiet existing bed only after the scene begins and lowers it beneath pleas', async () => {
    const audio = createFinalDecisionAudio('test', enabled)
    audio.setActive(true)
    expect(FakeAudio.instances).toHaveLength(0)
    audio.cue('decision:begin')
    audio.cue('decision:begin')
    const element = FakeAudio.instances[0]
    expect(FakeAudio.instances).toHaveLength(1)
    expect(element.src).toContain('assets/music/final_three_week.mp3')
    expect(element.loop).toBe(true)
    expect(element.play).toHaveBeenCalledTimes(1)
    expect(sound.claimExternalMusic).toHaveBeenCalledTimes(1)
    expect(sound.play).toHaveBeenCalledTimes(1)
    expect(sound.play).toHaveBeenLastCalledWith(
      'tv:live_vote',
      expect.objectContaining({ volume: 0.16, durationMs: 1200, signal: expect.any(AbortSignal) })
    )
    await settle()
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.fadeInMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.musicVolume)
    audio.setStage('plea-a')
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.mixTransitionMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.pleaVolume)
    audio.dispose()
  })

  it('keeps a silent music claim while suspended and resumes the same position without replaying accents', async () => {
    const audio = createFinalDecisionAudio('pause', enabled)
    audio.setActive(true)
    audio.cue('decision:begin')
    await settle()
    const element = FakeAudio.instances[0]
    element.currentTime = 13
    const signal = sound.play.mock.calls[0][1].signal as AbortSignal
    audio.cue('presentation:pause')
    expect(signal.aborted).toBe(true)
    expect(element.paused).toBe(true)
    expect(element.volume).toBe(0)
    expect(sound.releaseExternalMusic).not.toHaveBeenCalled()
    // The shared manager may retry its external element after a mute toggle.
    // A scene that is still suspended must remain paused and silent.
    element.paused = false
    element.dispatchEvent(new Event('play'))
    expect(element.paused).toBe(true)
    audio.setStage('plea-b')
    await vi.advanceTimersByTimeAsync(900)
    expect(element.volume).toBe(0)
    expect(element.play).toHaveBeenCalledTimes(1)
    audio.cue('presentation:resume')
    await settle()
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.fadeInMs + 50)
    expect(element.currentTime).toBe(13)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.pleaVolume)
    expect(element.play).toHaveBeenCalledTimes(2)
    expect(sound.play).toHaveBeenCalledTimes(1)
    audio.dispose()
  })

  it('releases music on ownership loss and preserves another pause reason across ownership restoration', async () => {
    const audio = createFinalDecisionAudio('foreground', enabled)
    audio.setActive(true)
    audio.setStage('choose')
    await settle()
    const element = FakeAudio.instances[0]
    audio.cue('decision:seal')
    const signal = sound.play.mock.calls[0][1].signal as AbortSignal
    audio.cue('presentation:pause')
    audio.setActive(false)
    expect(sound.releaseExternalMusic).toHaveBeenLastCalledWith(
      'final-decision:foreground',
      element
    )
    expect(signal.aborted).toBe(true)
    audio.cue('decision:begin')
    expect(sound.play).toHaveBeenCalledTimes(1)
    audio.setActive(true)
    expect(element.volume).toBe(0)
    expect(element.play).toHaveBeenCalledTimes(1)
    audio.cue('presentation:resume')
    await settle()
    expect(element.play).toHaveBeenCalledTimes(2)
    audio.dispose()
  })

  it('respects music and SFX preferences independently and aborts an in-flight accent when SFX are disabled', async () => {
    const audio = createFinalDecisionAudio('muted', { musicOn: false, sfxOn: false })
    audio.setActive(true)
    audio.cue('decision:begin')
    audio.setStage('choose')
    expect(FakeAudio.instances).toHaveLength(0)
    expect(sound.play).not.toHaveBeenCalled()
    audio.setPreferences({ musicOn: true, sfxOn: false })
    await settle()
    expect(FakeAudio.instances).toHaveLength(1)
    const element = FakeAudio.instances[0]
    audio.setPreferences({ musicOn: false, sfxOn: true })
    expect(element.volume).toBe(0)
    expect(element.paused).toBe(true)
    audio.setStage('seal')
    audio.cue('decision:seal')
    expect(sound.play).toHaveBeenLastCalledWith(
      'tv:voting_eviction',
      expect.objectContaining({ durationMs: 2600, volume: 0.28 })
    )
    const signal = sound.play.mock.lastCall![1].signal as AbortSignal
    audio.setPreferences({ musicOn: false, sfxOn: false })
    expect(signal.aborted).toBe(true)
    expect(element.play).toHaveBeenCalledTimes(1)
    audio.dispose()
  })

  it('releases a failed audio source without blocking the presentation or silently retaining the music channel', async () => {
    FakeAudio.nextPlay = () =>
      Promise.reject(new DOMException('Unsupported source', 'NotSupportedError'))
    const audio = createFinalDecisionAudio('failure', enabled)
    audio.setActive(true)
    audio.cue('decision:begin')
    await settle()
    const element = FakeAudio.instances[0]
    expect(sound.releaseExternalMusic).toHaveBeenLastCalledWith('final-decision:failure', element)
    audio.setStage('plea-a')
    audio.cue('decision:seal')
    expect(element.play).toHaveBeenCalledTimes(1)
    expect(sound.claimExternalMusic).toHaveBeenCalledTimes(1)
    audio.dispose()
  })

  it('cancels an autoplay retry after losing foreground ownership', async () => {
    FakeAudio.nextPlay = () => Promise.reject(new DOMException('Gesture needed', 'NotAllowedError'))
    const audio = createFinalDecisionAudio('autoplay', enabled)
    audio.setActive(true)
    audio.cue('decision:begin')
    await settle()
    expect(sound.releaseExternalMusic).toHaveBeenCalledTimes(1)
    audio.setActive(false)
    document.dispatchEvent(new Event('pointerdown'))
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(1)
    audio.dispose()
  })

  it('autostarts at establishment, builds toward confirmation and drops the bed beneath the verdict accent', async () => {
    const audio = createFinalDecisionAudio('dramatic-mix', enabled)
    audio.setActive(true)
    audio.setStage('establish')
    audio.cue('decision:begin')
    await settle()
    const element = FakeAudio.instances[0]
    expect(element.play).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.fadeInMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.musicVolume)
    audio.setStage('plea-a')
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.mixTransitionMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.pleaVolume)
    audio.setStage('choose')
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.suspenseBuildMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.choiceVolume)
    audio.setStage('confirm')
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.suspenseBuildMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.confirmationVolume)
    audio.setStage('seal')
    audio.cue('decision:seal')
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.verdictDropMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.sealVolume)
    audio.setStage('announcement')
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.mixTransitionMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.revealVolume)
    expect(FakeAudio.instances).toHaveLength(1)
    expect(element.play).toHaveBeenCalledTimes(1)
    audio.dispose()
  })

  it('recovers blocked autoplay on the next gesture without restarting the scene or its opening accent', async () => {
    FakeAudio.nextPlay = () => Promise.reject(new DOMException('Gesture needed', 'NotAllowedError'))
    const audio = createFinalDecisionAudio('automatic-start', enabled)
    audio.setActive(true)
    audio.setStage('establish')
    audio.cue('decision:begin')
    await settle()
    const element = FakeAudio.instances[0]
    expect(element.play).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('pointerdown'))
    await settle()
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.fadeInMs + 50)
    expect(element.play).toHaveBeenCalledTimes(2)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.musicVolume)
    expect(sound.play).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('pointerdown'))
    expect(element.play).toHaveBeenCalledTimes(2)
    audio.dispose()
  })

  it('continues the same musical phrase through departure and fades only after its handoff', async () => {
    const audio = createFinalDecisionAudio('continuous-exit', enabled)
    audio.setActive(true)
    audio.setStage('announcement')
    await settle()
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.fadeInMs + 50)
    const element = FakeAudio.instances[0]
    element.currentTime = 27.5
    audio.setStage('complete')
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.mixTransitionMs + 50)
    expect(element.volume).toBeCloseTo(FINAL_DECISION_AUDIO.exitVolume)
    expect(element.currentTime).toBe(27.5)
    expect(element.paused).toBe(false)
    expect(element.play).toHaveBeenCalledTimes(1)
    expect(FakeAudio.instances).toHaveLength(1)
    expect(sound.releaseExternalMusic).not.toHaveBeenCalled()
    audio.finish()
    audio.finish()
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.exitFadeOutMs / 2)
    expect(element.volume).toBeGreaterThan(0)
    expect(element.volume).toBeLessThan(FINAL_DECISION_AUDIO.exitVolume)
    expect(element.paused).toBe(false)
    await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.exitFadeOutMs)
    expect(element.paused).toBe(true)
    expect(sound.releaseExternalMusic).toHaveBeenCalledTimes(1)
    expect(element.load).toHaveBeenCalledTimes(1)
    audio.dispose()
    expect(element.load).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends a fading tail immediately when its foreground ownership or music preference is lost', async () => {
    for (const suspend of ['ownership', 'preference'] as const) {
      const audio = createFinalDecisionAudio(suspend, enabled)
      audio.setActive(true)
      audio.setStage('complete')
      await settle()
      await vi.advanceTimersByTimeAsync(FINAL_DECISION_AUDIO.fadeInMs + 50)
      const element = FakeAudio.instances.at(-1)!
      audio.finish()
      if (suspend === 'ownership') audio.setActive(false)
      else audio.setPreferences({ musicOn: false, sfxOn: true })
      expect(element.paused).toBe(true)
      expect(element.load).toHaveBeenCalledTimes(1)
      audio.setActive(true)
      audio.setPreferences(enabled)
      expect(element.play).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    }
  })

  it('cleans up an interrupted departure and ignores late playback promises and events', async () => {
    let resolvePlay = () => {}
    FakeAudio.nextPlay = () =>
      new Promise<void>((resolve) => {
        resolvePlay = resolve
      })
    const audio = createFinalDecisionAudio('exit-handoff', enabled)
    audio.setActive(true)
    audio.cue('decision:begin')
    const element = FakeAudio.instances[0]
    const signal = sound.play.mock.lastCall![1].signal as AbortSignal
    audio.setStage('complete')
    audio.dispose()
    resolvePlay()
    await settle()
    await vi.advanceTimersByTimeAsync(1000)
    audio.cue('presentation:resume')
    audio.setActive(true)
    expect(signal.aborted).toBe(true)
    expect(sound.releaseExternalMusic).toHaveBeenCalledTimes(1)
    expect(element.removeAttribute).toHaveBeenCalledWith('src')
    expect(element.load).toHaveBeenCalledTimes(1)
    expect(element.play).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
