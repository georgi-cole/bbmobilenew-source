import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCinematicAudio } from '../../../src/services/sound/cinematicAudio'

class MockAudio {
  currentTime = 0
  volume = 1
  preload = ''
  paused = true
  ended = false
  play = vi.fn<() => Promise<void>>()
  pause = vi.fn(() => {
    this.paused = true
  })
  removeAttribute = vi.fn()
  load = vi.fn()
}

function installAudioConstructor(audio: MockAudio): void {
  class AudioStub {
    constructor(_src?: string) {
      return audio
    }
  }

  globalThis.Audio = AudioStub as unknown as typeof Audio
}

describe('createCinematicAudio', () => {
  const OriginalAudio = globalThis.Audio

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.Audio = OriginalAudio
  })

  it('retries playback on the next user gesture after autoplay is blocked', async () => {
    const audio = new MockAudio()
    const autoplayBlocked = Object.assign(new Error('blocked'), { name: 'NotAllowedError' })
    audio.play.mockRejectedValueOnce(autoplayBlocked).mockImplementation(async () => {
      audio.paused = false
    })
    installAudioConstructor(audio)

    const controller = createCinematicAudio('/assets/final_recap_sound.mp3')
    controller.play()
    await Promise.resolve()

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()

    expect(audio.play).toHaveBeenCalledTimes(2)
  })

  it('clears the pending autoplay retry when disposed', async () => {
    const audio = new MockAudio()
    const autoplayBlocked = Object.assign(new Error('blocked'), { name: 'NotAllowedError' })
    audio.play.mockRejectedValueOnce(autoplayBlocked)
    installAudioConstructor(audio)

    const controller = createCinematicAudio('/assets/final_recap_sound.mp3')
    controller.play()
    await Promise.resolve()

    controller.dispose()
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()

    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.removeAttribute).toHaveBeenCalledWith('src')
    expect(audio.load).toHaveBeenCalled()
  })

  it('pauses and resumes without resetting the synchronized media position', async () => {
    const audio = new MockAudio()
    audio.play.mockImplementation(async () => {
      audio.paused = false
    })
    installAudioConstructor(audio)

    const controller = createCinematicAudio('/assets/final_recap_sound.mp3')
    controller.play()
    await Promise.resolve()
    audio.currentTime = 4.5

    controller.pause()
    controller.syncTo(6.25)
    controller.resume()
    await Promise.resolve()

    expect(audio.currentTime).toBe(6.25)
    expect(audio.play).toHaveBeenCalledTimes(2)
    controller.dispose()
  })

  it('ignores an autoplay rejection arriving after disposal', async () => {
    const audio = new MockAudio()
    let rejectPlay: (error: Error) => void = () => undefined
    audio.play.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectPlay = reject
        })
    )
    installAudioConstructor(audio)
    const controller = createCinematicAudio('/assets/final_recap_sound.mp3')
    controller.play()
    controller.dispose()
    rejectPlay(Object.assign(new Error('blocked late'), { name: 'NotAllowedError' }))
    await Promise.resolve()
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    controller.resume()
    expect(audio.play).toHaveBeenCalledTimes(1)
  })
})
