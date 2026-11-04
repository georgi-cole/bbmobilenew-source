import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CEREMONY_CUES, ceremonyCuePlan, createCeremonyAudio } from './ceremony-audio'
import { SoundManager } from '../../services/sound/SoundManager'
import type { ReplacementPresentation } from './replacementPresentation'
import { replacementBeats } from './replacement-timing.js'
vi.mock('../../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(async () => {}) },
}))
beforeEach(() => {
  vi.clearAllMocks()
})
describe('ceremony sound ownership', () => {
  it('cancels its own playback, resumes the remaining tail and cannot replay after stop', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100)
    const audio = createCeremonyAudio()
    audio.play('shield')
    const first = vi.mocked(SoundManager.play).mock.calls[0][1]!
    clock.mockReturnValue(400)
    audio.pause()
    expect(first.signal?.aborted).toBe(true)
    audio.play('impact')
    expect(SoundManager.play).toHaveBeenCalledTimes(1)
    audio.resume()
    const resumed = vi.mocked(SoundManager.play).mock.calls[1][1]!
    expect(resumed.startAtSec).toBe(0.3)
    expect(resumed.durationMs).toBe(CEREMONY_CUES.shield.durationMs - 300)
    audio.stop()
    expect(resumed.signal?.aborted).toBe(true)
    audio.play('reveal')
    audio.resume()
    expect(SoundManager.play).toHaveBeenCalledTimes(2)
    clock.mockRestore()
  })
  it('does not cancel the next clip when an older clip finishes', () => {
    const a = createCeremonyAudio(),
      b = createCeremonyAudio()
    a.play('reveal')
    b.play('reveal')
    a.stop()
    expect(vi.mocked(SoundManager.play).mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(vi.mocked(SoundManager.play).mock.calls[1][1]?.signal?.aborted).toBe(false)
    b.stop()
  })
  it('uses exact committed consequence timings and deduplicates paired saves', () => {
    const outcome = {
      actionHistory: [
        { kind: 'save', playerId: 'a', actorId: 'pos', slotIndex: 0 },
        { kind: 'save', playerId: 'b', actorId: 'pos', slotIndex: 1 },
        { kind: 'replacement', playerId: 'c', actorId: 'loh', slotIndex: 0 },
      ],
      variant: 'detox',
      leaderIds: ['loh'],
    } as ReplacementPresentation
    const beats = replacementBeats(outcome)
    const cues = ceremonyCuePlan('replacement', 20000, outcome)
    expect(cues.filter((c) => c.cue === 'save')).toEqual([
      { at: beats[0].reveals[0].at, cue: 'save' },
    ])
    expect(cues).toContainEqual({ at: beats[1].reveals[0].at, cue: 'reveal' })
  })
  it('keeps cues inside the film and syncs royal shield and exit timing', () => {
    expect(ceremonyCuePlan('allPower', 5600)).toContainEqual({ at: 1700, cue: 'shield' })
    expect(
      ceremonyCuePlan('tiebreak', 16000, null, { exitAt: 3200, zoomAt: 7800 }, 2200)
    ).toContainEqual({ at: 9300, cue: 'door' })
    expect(ceremonyCuePlan('shock', 1000).every((c) => c.at >= 0 && c.at < 780)).toBe(true)
  })
})
