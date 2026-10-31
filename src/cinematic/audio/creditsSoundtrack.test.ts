import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  pauseCreditsSoundtrack,
  startCreditsSoundtrackFromGesture,
  stopCreditsSoundtrack,
} from './creditsSoundtrack'

vi.mock('../../services/sound/SoundManager', () => ({
  SoundManager: {
    claimExternalMusic: vi.fn(),
    releaseExternalMusic: vi.fn(),
    setExternalMusicVolume: vi.fn(),
  },
}))

afterEach(() => {
  stopCreditsSoundtrack()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('credits soundtrack cancellation', () => {
  it.each(['pause', 'stop'] as const)(
    'does not restart the volume clock after a late play resolution following %s',
    async (action) => {
      const audio = document.createElement('audio')
      let resolvePlay: () => void = () => undefined
      vi.spyOn(audio, 'play').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePlay = resolve
          })
      )
      vi.spyOn(audio, 'pause').mockImplementation(() => {})
      vi.spyOn(audio, 'load').mockImplementation(() => {})
      vi.stubGlobal(
        'Audio',
        class {
          constructor(src: string) {
            audio.src = src
            return audio
          }
        }
      )
      const animationFrame = vi.spyOn(window, 'requestAnimationFrame')
      const promise = startCreditsSoundtrackFromGesture(3)
      if (action === 'pause') pauseCreditsSoundtrack()
      else stopCreditsSoundtrack()
      animationFrame.mockClear()
      resolvePlay()
      await promise
      expect(animationFrame).not.toHaveBeenCalled()
      audio.currentTime = 0
      audio.dispatchEvent(new Event('loadedmetadata'))
      expect(audio.currentTime).toBe(0)
    }
  )
})
