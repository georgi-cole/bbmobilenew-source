import { describe, expect, it } from 'vitest'
import type { StrategicAllianceSnapshot } from '../../types'
import { getGame } from '../registry'
import { buildChallengeCompletion, socialPreference } from './shared'
import { simulateSocialChallengeScores } from './simulation'

const alliance: StrategicAllianceSnapshot = {
  id: 'north',
  memberIds: ['rae', 'ash'],
  leaderIds: ['rae'],
  status: 'ACTIVE',
  cohesion: 50,
  fractureRisk: 0,
  currentTargetIds: [],
  fallbackTargetIds: [],
  memberCommitment: {},
  memberPerceivedStatus: {},
  memberPlanBeliefs: {},
  infiltratorIds: [],
}

describe('social challenge season integration', () => {
  it('uses a shared alliance and weighs only the chooser’s own feelings', () => {
    const alliances = [alliance]
    const relationships = {
      rae: { ash: { affinity: 55, tags: ['bromance'] } },
      ash: {
        rae: {
          affinity: -20,
          tags: [],
          reality: { trust: -10, loyalty: 0, resentment: 0, suspicion: 80, fear: 0 },
        },
      },
    }
    expect(socialPreference({ alliances }, 'rae', 'ash')).toBeGreaterThan(0)
    expect(socialPreference({ alliances, relationships }, 'rae', 'ash')).toBeGreaterThan(
      socialPreference({ alliances }, 'rae', 'ash')
    )
    expect(socialPreference({ alliances, relationships }, 'ash', 'rae')).toBeLessThan(0)
    expect(socialPreference({ alliances, relationships }, 'rae', 'other')).toBe(0)
  })

  it('passes complete standings and preserves a tied last place', () => {
    expect(
      buildChallengeCompletion([['rae'], ['ash', 'lan']], { rae: 200, ash: 100, lan: 100 }, 'ash')
    ).toMatchObject({
      authoritativeWinnerId: 'rae',
      authoritativeRankedIds: ['rae', 'ash', 'lan'],
      authoritativeLastPlaceId: null,
      authoritativeLastPlaceIds: ['ash', 'lan'],
      rawValue: 100,
    })
  })

  it.each([
    ['rockPaperScissors', 5, 8],
    ['lastLight', 5, 8],
    ['riskWheelAbyss', 2, 16],
  ] as const)(
    'creates a repeatable AI competition result for %s with one winner',
    (key, minPlayers, maxPlayers) => {
      const ids = ['rae', 'ash', 'lan', 'echo', 'nia', 'vee', 'blue', 'zed']
      const score = simulateSocialChallengeScores(key, ids, 772, { alliances: [alliance] })
      expect(getGame(key)).toMatchObject({ minPlayers, maxPlayers, authoritative: true })
      expect(Object.keys(score ?? {}).sort()).toEqual([...ids].sort())
      const points = Object.values(score ?? {})
      expect(points.filter((p) => p === Math.max(...points))).toHaveLength(1)
      expect(score).toEqual(simulateSocialChallengeScores(key, ids, 772, { alliances: [alliance] }))
    }
  )
})
