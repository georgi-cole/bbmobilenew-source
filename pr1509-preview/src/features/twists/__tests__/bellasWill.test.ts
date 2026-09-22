import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../types'
import type { SeasonArchive } from '../../../store/seasonArchive'
import { withSeasonLaunchIntent } from '../../../modes/seasonLaunchIntent'
import {
  BELLA_WILL_HINTS,
  activateBellaInheritance,
  chooseBellaHeir,
  createBellaWillState,
  expireBellaWillAtEndgame,
  expireBellaWillImmunity,
  isBellaHeirImmune,
  pickBellaWillReward,
  shouldCastBella,
} from '../bellasWill'

function archive(
  seasonIndex: number,
  flags: Pick<
    SeasonArchive,
    'twinShockConsumed' | 'bellaCast' | 'cupidArrowActivated' | 'voxPopuliActivated'
  > = {}
): SeasonArchive {
  return {
    seasonIndex,
    seasonId: `season-${seasonIndex}`,
    endAt: '2026-09-20T00:00:00.000Z',
    playerSummaries: [],
    ...flags,
  }
}

describe("Bella's Will", () => {
  it('never casts Bella before Twin Shock has been consumed', () => {
    expect(
      shouldCastBella({
        season: 2,
        seasonArchives: [],
        twinShockConsumed: false,
        seed: 10,
      })
    ).toBe(false)
  })

  it('guarantees Bella in the next compatible Classic season after Twin Shock', () => {
    const archives = [archive(1, { twinShockConsumed: true })]
    const result = withSeasonLaunchIntent('classic', () =>
      shouldCastBella({
        season: 2,
        seasonArchives: archives,
        twinShockConsumed: true,
        seed: 10,
      })
    )
    expect(result).toBe(true)
  })

  it('does not cast Bella into Vox or Cupid expansion launches', () => {
    const archives = [archive(1, { twinShockConsumed: true })]
    const options = {
      season: 2,
      seasonArchives: archives,
      twinShockConsumed: true,
      seed: 10,
    }
    expect(withSeasonLaunchIntent('voxPopuli', () => shouldCastBella(options))).toBe(false)
    expect(withSeasonLaunchIntent('cupidArrow', () => shouldCastBella(options))).toBe(false)
  })

  it('skips the next compatible season after Bella first appears', () => {
    const archives = [
      archive(1, { twinShockConsumed: true }),
      archive(2, { twinShockConsumed: true, bellaCast: true }),
    ]
    expect(
      withSeasonLaunchIntent('classic', () =>
        shouldCastBella({
          season: 3,
          seasonArchives: archives,
          twinShockConsumed: true,
          seed: 10,
        })
      )
    ).toBe(false)
  })

  it('uses an approximately ten-percent deterministic return roll after the skip', () => {
    const archives = [
      archive(1, { twinShockConsumed: true }),
      archive(2, { twinShockConsumed: true, bellaCast: true }),
      archive(3, { twinShockConsumed: true, bellaCast: false }),
    ]
    let castCount = 0
    for (let seed = 0; seed < 1_000; seed += 1) {
      if (
        withSeasonLaunchIntent('classic', () =>
          shouldCastBella({
            season: 4,
            seasonArchives: archives,
            twinShockConsumed: true,
            seed,
          })
        )
      ) {
        castCount += 1
      }
    }
    expect(castCount).toBeGreaterThanOrEqual(70)
    expect(castCount).toBeLessThanOrEqual(130)
  })

  it('selects only authored Will rewards', () => {
    const authored = new Set(['immunity_2_days', 'extra_vote', 'remove_vote'])
    for (let seed = 0; seed < 50; seed += 1) {
      expect(authored.has(pickBellaWillReward(seed, 7))).toBe(true)
    }
  })

  it('protects the heir for the next two days but never at Final 4 or lower', () => {
    const will = createBellaWillState({
      active: true,
      seed: 7,
      season: 2,
      reward: 'immunity_2_days',
    })
    will.heirId = 'heir'
    const state = {
      week: 5,
      players: [
        { id: 'bella', name: 'Bella', avatar: '', status: 'evicted' },
        { id: 'heir', name: 'Heir', avatar: '', status: 'active' },
        { id: 'p2', name: 'P2', avatar: '', status: 'active' },
        { id: 'p3', name: 'P3', avatar: '', status: 'active' },
        { id: 'p4', name: 'P4', avatar: '', status: 'active' },
        { id: 'p5', name: 'P5', avatar: '', status: 'active' },
      ],
      bellaWill: will,
    } as unknown as GameState

    activateBellaInheritance(state)
    expect(state.bellaWill?.immunityStartWeek).toBe(6)
    expect(state.bellaWill?.immunityEndWeek).toBe(7)

    state.week = 6
    expect(isBellaHeirImmune(state, 'heir')).toBe(true)
    state.week = 7
    expect(isBellaHeirImmune(state, 'heir')).toBe(true)
    state.week = 8
    expect(isBellaHeirImmune(state, 'heir')).toBe(false)

    state.week = 6
    state.players = state.players.slice(0, 4)
    expect(isBellaHeirImmune(state, 'heir')).toBe(false)
  })

  it('queues a private Confessional briefing only when the human player inherits', () => {
    const will = createBellaWillState({
      active: true,
      seed: 7,
      season: 2,
      reward: 'immunity_2_days',
    })
    will.heirId = 'human'
    const state = {
      week: 5,
      players: [
        { id: 'bella', name: 'Bella', avatar: '', status: 'evicted' },
        { id: 'human', name: 'You', avatar: '', status: 'active', isUser: true },
        { id: 'p2', name: 'P2', avatar: '', status: 'active' },
        { id: 'p3', name: 'P3', avatar: '', status: 'active' },
        { id: 'p4', name: 'P4', avatar: '', status: 'active' },
        { id: 'p5', name: 'P5', avatar: '', status: 'active' },
      ],
      bellaWill: will,
    } as unknown as GameState

    activateBellaInheritance(state)
    expect(state.bellaWill?.publicAnnouncementPending).toBe(true)
    expect(state.bellaWill?.privateBriefingPending).toBe(true)
    expect(state.bellaWill?.privateBriefingInvited).toBe(false)
  })

  it('completes two-day immunity only after the second protected day', () => {
    const will = createBellaWillState({
      active: true,
      seed: 7,
      season: 2,
      reward: 'immunity_2_days',
    })
    will.heirId = 'heir'
    const state = {
      week: 5,
      players: [
        { id: 'bella', name: 'Bella', avatar: '', status: 'evicted' },
        { id: 'heir', name: 'Heir', avatar: '', status: 'active' },
        { id: 'p2', name: 'P2', avatar: '', status: 'active' },
        { id: 'p3', name: 'P3', avatar: '', status: 'active' },
        { id: 'p4', name: 'P4', avatar: '', status: 'active' },
        { id: 'p5', name: 'P5', avatar: '', status: 'active' },
      ],
      bellaWill: will,
    } as unknown as GameState

    activateBellaInheritance(state)
    state.week = 7
    expect(expireBellaWillImmunity(state)).toBe(false)
    expect(state.bellaWill?.immunityDaysRemaining).toBe(2)

    state.week = 8
    expect(expireBellaWillImmunity(state)).toBe(true)
    expect(state.bellaWill?.immunityDaysRemaining).toBe(0)
  })

  it('uses durable profile progress even when the old Twin/Bella archives are gone', () => {
    const base = {
      season: 1002,
      seasonArchives: [] as SeasonArchive[],
      twinShockConsumed: false,
      seed: 10,
    }
    expect(
      withSeasonLaunchIntent('classic', () =>
        shouldCastBella({
          ...base,
          bellaProgress: {
            twinShockConsumedEver: true,
            unlocked: false,
            hasAppeared: false,
            mandatorySkipConsumed: false,
          },
        })
      )
    ).toBe(true)

    expect(
      withSeasonLaunchIntent('classic', () =>
        shouldCastBella({
          ...base,
          bellaProgress: {
            twinShockConsumedEver: true,
            unlocked: true,
            hasAppeared: true,
            mandatorySkipConsumed: false,
          },
        })
      )
    ).toBe(false)
  })

  it('expires every unresolved Will effect once Final 4 begins', () => {
    const will = createBellaWillState({
      active: true,
      seed: 8,
      season: 3,
      reward: 'extra_vote',
    })
    will.heirId = 'heir'
    will.inherited = true
    will.extraVotePending = true
    will.voteRemovalPending = true
    will.immunityDaysRemaining = 2
    will.immunityStartWeek = 5
    will.immunityEndWeek = 6
    const state = {
      week: 5,
      players: [
        { id: 'heir', name: 'Heir', avatar: '', status: 'active' },
        { id: 'p2', name: 'P2', avatar: '', status: 'active' },
        { id: 'p3', name: 'P3', avatar: '', status: 'active' },
        { id: 'p4', name: 'P4', avatar: '', status: 'active' },
        { id: 'bella', name: 'Bella', avatar: '', status: 'jury' },
      ],
      bellaWill: will,
    } as unknown as GameState

    expect(expireBellaWillAtEndgame(state)).toBe(true)
    expect(state.bellaWill?.expiredAtEndgame).toBe(true)
    expect(state.bellaWill?.extraVotePending).toBe(false)
    expect(state.bellaWill?.voteRemovalPending).toBe(false)
    expect(state.bellaWill?.immunityDaysRemaining).toBe(0)
  })

  it('can exclude a committed Double Eviction departure when choosing Bella heir', () => {
    const will = createBellaWillState({ active: true, seed: 9, season: 4 })
    const state = {
      week: 5,
      players: [
        { id: 'bella', name: 'Bella', avatar: '', status: 'jury' },
        { id: 'leaving', name: 'Leaving', avatar: '', status: 'active' },
        { id: 'safe', name: 'Safe', avatar: '', status: 'active' },
        { id: 'p3', name: 'P3', avatar: '', status: 'active' },
        { id: 'p4', name: 'P4', avatar: '', status: 'active' },
        { id: 'p5', name: 'P5', avatar: '', status: 'active' },
      ],
      strategicRelationships: {
        bella: {
          leaving: { affinity: 100, tags: ['alliance'] },
          safe: { affinity: 70, tags: ['alliance'] },
        },
      },
      bellaWill: will,
    } as unknown as GameState

    expect(chooseBellaHeir(state)).toBe('leaving')
    expect(chooseBellaHeir(state, ['leaving'])).toBe('safe')
  })

  it('keeps hint copy reusable instead of framing Bella as a one-time mystery', () => {
    for (const hint of BELLA_WILL_HINTS) {
      expect(hint.toLowerCase()).not.toContain('mystery')
      expect(hint.toLowerCase()).not.toContain('first time')
      expect(hint.length).toBeGreaterThan(20)
    }
  })
})
