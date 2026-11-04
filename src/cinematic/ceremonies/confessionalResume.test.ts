import { describe, expect, it } from 'vitest'
import type { GameState } from '../../types'
import { canResumeCinematicCeremony } from './confessionalResume'

const context = { gameId: 'run', week: 3, receiptCount: 1 }
const game = { gameId: 'run', week: 3, phase: 'pos_ceremony_results' } as GameState
describe('cinematic return from the real Confessional', () => {
  it('keeps a binary Use choice in the Confessional until a real target is confirmed', () => {
    expect(canResumeCinematicCeremony(context, game, 1, true)).toBe(false)
  })
  it('returns after a committed target even when another mandatory choice follows', () => {
    expect(canResumeCinematicCeremony(context, game, 2, true)).toBe(true)
  })
  it('returns when no further choice remains, including a declined power', () => {
    expect(canResumeCinematicCeremony(context, game, 1, false)).toBe(true)
  })
  it('returns a confirmed staged target to middleware without bypassing an earned-power intervention', () => {
    const staged = { ...game, missionPowers: { safetyIntent: { targetId: 'b' } } } as GameState
    expect(canResumeCinematicCeremony(context, staged, 1, true)).toBe(true)
    const intervention = {
      ...staged,
      missionPowers: { ...staged.missionPowers, decision: { kind: 'vetoSafety' } },
    } as GameState
    expect(canResumeCinematicCeremony(context, intervention, 1, true)).toBe(false)
  })
  it('rejects stale or ordinary route entries', () => {
    expect(canResumeCinematicCeremony(undefined, game, 2, false)).toBe(false)
    for (const patch of [{ gameId: 'other' }, { week: 4 }, { phase: 'social_2' }])
      expect(
        canResumeCinematicCeremony(context, { ...game, ...patch } as GameState, 2, false)
      ).toBe(false)
  })
})
