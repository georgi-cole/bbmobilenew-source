import { describe, expect, it } from 'vitest'
import { getAutomaticAdBreak } from './adPolicy'

function context(overrides: Partial<Parameters<typeof getAutomaticAdBreak>[0]> = {}) {
  return {
    gameId: 'season-42',
    week: 4,
    previousPhase: 'social_2',
    currentPhase: 'live_vote',
    mode: 'classic',
    voxPopuliActive: false,
    posHolderName: 'Ivy',
    ...overrides,
  }
}

describe('Advertising V2 automatic cadence', () => {
  it('places a break before each normal house vote', () => {
    expect(getAutomaticAdBreak(context())?.placement).toBe('live_vote_auto')
  })

  it('does not treat Vox or Surveyeval voting as a normal house-vote interstitial', () => {
    expect(getAutomaticAdBreak(context({ voxPopuliActive: true }))).toBeNull()
    expect(getAutomaticAdBreak(context({ mode: 'survival' }))).toBeNull()
  })

  it('places the Safety break only on every second applicable day', () => {
    expect(
      getAutomaticAdBreak(
        context({
          currentPhase: 'pos_ceremony_results',
          previousPhase: 'pos_ceremony',
          week: 4,
        })
      )?.placement
    ).toBe('safety_decision_auto')
    expect(
      getAutomaticAdBreak(
        context({
          currentPhase: 'pos_ceremony_results',
          previousPhase: 'pos_ceremony',
          week: 3,
        })
      )
    ).toBeNull()
  })

  it('places one break after each Final 3 competition beat', () => {
    expect(
      getAutomaticAdBreak(
        context({ previousPhase: 'final3_comp1', currentPhase: 'final3_comp2' })
      )?.placement
    ).toBe('final3_part1_break')
    expect(
      getAutomaticAdBreak(
        context({ previousPhase: 'final3_comp2', currentPhase: 'final3_comp3' })
      )?.placement
    ).toBe('final3_part2_break')
    expect(
      getAutomaticAdBreak(
        context({ previousPhase: 'final3_comp3', currentPhase: 'final3_decision' })
      )?.placement
    ).toBe('final3_part3_break')
  })

  it('uses a stable per-season beat key for duplicate prevention', () => {
    const first = getAutomaticAdBreak(context())
    const second = getAutomaticAdBreak(context())
    expect(first?.breakKey).toBe(second?.breakKey)
    expect(first?.breakKey).toContain('season-42')
  })

  it('does not emit a second decision without a phase transition', () => {
    expect(getAutomaticAdBreak(context({ previousPhase: 'live_vote' }))).toBeNull()
  })
})
