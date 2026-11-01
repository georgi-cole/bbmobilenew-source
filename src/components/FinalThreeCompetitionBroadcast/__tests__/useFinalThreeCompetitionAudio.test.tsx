import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayOptions } from '../../../services/sound/SoundManager'
import { useFinalThreeCompetitionAudio } from '../useFinalThreeCompetitionAudio'

const sound = vi.hoisted(() => ({
  play: vi.fn<(key: string, options: PlayOptions) => Promise<void>>(async () => {}),
}))
const preferences = vi.hoisted(() => ({ sfxOn: true }))
vi.mock('../../../services/sound/SoundManager', () => ({ SoundManager: sound }))
vi.mock('../../../store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ settings: { audio: preferences } }),
}))

const settle = () => act(async () => Promise.resolve())

beforeEach(() => {
  preferences.sfxOn = true
  sound.play.mockClear()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
afterEach(cleanup)

describe('Final Three spectator sound accents', () => {
  it('plays each accent once in Strict Mode without taking over the music channel', async () => {
    const { rerender } = renderHook(
      ({ stage, active }) => useFinalThreeCompetitionAudio('round-1', stage, active),
      {
        initialProps: { stage: 'establish', active: true },
        wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
      }
    )
    await settle()
    expect(sound.play).toHaveBeenCalledTimes(1)
    expect(sound.play.mock.calls[0][0]).toBe('tv:live_vote')
    rerender({ stage: 'establish', active: false })
    expect(sound.play.mock.calls[0][1].signal?.aborted).toBe(true)
    rerender({ stage: 'establish', active: true })
    await settle()
    expect(sound.play).toHaveBeenCalledTimes(1)
    rerender({ stage: 'lock', active: true })
    await settle()
    rerender({ stage: 'verdict', active: true })
    await settle()
    expect(sound.play.mock.calls.map(([key]) => key)).toEqual([
      'tv:live_vote',
      'tv:voting_eviction',
      'tv:winner_reveal',
    ])
    expect(
      sound.play.mock.calls.every(([, options]) => options.signal instanceof AbortSignal)
    ).toBe(true)
  })

  it('cancels on preference changes and never replays an already heard cue', async () => {
    const { rerender } = renderHook(
      ({ stage }) => useFinalThreeCompetitionAudio('round-1', stage, true),
      { initialProps: { stage: 'lock' } }
    )
    await settle()
    const signal = sound.play.mock.calls[0][1].signal
    preferences.sfxOn = false
    rerender({ stage: 'lock' })
    expect(signal?.aborted).toBe(true)
    preferences.sfxOn = true
    rerender({ stage: 'lock' })
    await settle()
    expect(sound.play).toHaveBeenCalledTimes(1)
  })

  it('does not play while hidden and aborts promptly when the page leaves the foreground', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const { rerender, unmount } = renderHook(
      ({ active }) => useFinalThreeCompetitionAudio('round-1', 'verdict', active),
      { initialProps: { active: false } }
    )
    await settle()
    expect(sound.play).not.toHaveBeenCalled()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    rerender({ active: true })
    await settle()
    const signal = sound.play.mock.calls[0][1].signal
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(signal?.aborted).toBe(true)
    unmount()
  })

  it('cancels a queued cue on unmount and grants a new round its own receipt', async () => {
    const abandoned = renderHook(() => useFinalThreeCompetitionAudio('old', 'establish', true))
    abandoned.unmount()
    await settle()
    expect(sound.play).not.toHaveBeenCalled()
    const { rerender } = renderHook(
      ({ sceneId }) => useFinalThreeCompetitionAudio(sceneId, 'establish', true),
      { initialProps: { sceneId: 'round-1' } }
    )
    await settle()
    rerender({ sceneId: 'round-2' })
    await settle()
    expect(sound.play).toHaveBeenCalledTimes(2)
    expect(sound.play.mock.calls[0][1].signal?.aborted).toBe(true)
    expect(sound.play.mock.calls[1][1].signal?.aborted).toBe(false)
  })
})
