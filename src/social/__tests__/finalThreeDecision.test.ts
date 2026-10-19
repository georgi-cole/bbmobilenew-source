import { describe, expect, it } from 'vitest'
import type { Player, StrategicAllianceSnapshot } from '../../types'
import { chooseFinalThreeEvictee, readFinalThreeDecision } from '../finalThreeDecision'
import type { StrategicThreatSnapshot } from '../strategicThreat'

function makePlayer(
  id: string,
  archetype: NonNullable<Player['aiGameIdentity']>['archetype'],
  temperament: NonNullable<Player['aiGameIdentity']>['temperament'] = 'calm',
  overrides: Partial<NonNullable<Player['stats']>> = {}
): Player {
  return {
    id,
    name: id,
    avatar: '',
    status: 'active',
    stats: { lohWins: 0, posWins: 0, timesNominated: 0, ...overrides },
    aiGameIdentity: {
      archetype,
      temperament,
      competitionDrive: 0.7,
      emotionalVolatility: temperament === 'impulsive' ? 0.95 : 0.25,
      audienceFocus: 0.5,
      survivalFocus: 0.6,
    },
  }
}

function threatRead(juryAppeal: number) {
  return { persuasion: 0.5, networkReach: 0.5, publicRespect: 0.5, juryAppeal, score: 5 }
}

function pact(holderId: string, partnerId: string): StrategicAllianceSnapshot {
  return {
    id: `pact-${holderId}-${partnerId}`,
    memberIds: [holderId, partnerId],
    leaderIds: [holderId],
    status: 'ACTIVE',
    cohesion: 0.9,
    fractureRisk: 0.05,
    currentTargetIds: [],
    fallbackTargetIds: [],
    memberCommitment: { [holderId]: 0.95, [partnerId]: 0.95 },
    memberPerceivedStatus: { [holderId]: 'CORE', [partnerId]: 'CORE' },
    memberPlanBeliefs: { [holderId]: [], [partnerId]: [] },
    infiltratorIds: [],
  }
}

describe('Final Three decision', () => {
  it('lets a calculated holder cut the finalist they think will beat them at the Tribunal', () => {
    const holder = makePlayer('holder', 'strategic_operator')
    const popularAlly = makePlayer('popular-ally', 'social_butterfly')
    const quietAlly = makePlayer('quiet-ally', 'loyal_anchor')
    const reads: StrategicThreatSnapshot = {
      holder: {
        [popularAlly.id]: threatRead(0.92),
        [quietAlly.id]: threatRead(0.18),
      },
    }

    const choice = chooseFinalThreeEvictee({
      holderId: holder.id,
      holder,
      nominees: [popularAlly, quietAlly],
      relationships: {
        holder: { 'popular-ally': { affinity: 80, tags: ['alliance', 'romance'] } },
      },
      alliances: [pact(holder.id, popularAlly.id)],
      threatReads: reads,
    })

    expect(choice?.player.id).toBe(popularAlly.id)
    expect(choice?.reason).toContain('Tribunal')
  })

  it('lets a loyal holder honor a close pact even when that finalist has a stronger case', () => {
    const holder = makePlayer('holder', 'loyal_anchor')
    const closeAlly = makePlayer('close-ally', 'social_butterfly', 'calm', {
      lohWins: 2,
      posWins: 1,
    })
    const rival = makePlayer('rival', 'opportunist')
    const reads: StrategicThreatSnapshot = {
      holder: {
        [closeAlly.id]: threatRead(0.96),
        [rival.id]: threatRead(0.2),
      },
    }

    const choice = chooseFinalThreeEvictee({
      holderId: holder.id,
      holder,
      nominees: [closeAlly, rival],
      relationships: {
        holder: { 'close-ally': { affinity: 88, tags: ['alliance', 'romance'] } },
      },
      alliances: [pact(holder.id, closeAlly.id)],
      threatReads: reads,
    })

    expect(choice?.player.id).toBe(rival.id)
    expect(choice?.reason).toContain('promise')
  })

  it('lets an impulsive holder cut a weaker rival out of resentment', () => {
    const holder = makePlayer('holder', 'chaos_agent', 'impulsive')
    const resentfulRival = makePlayer('resentful-rival', 'lone_wolf')
    const strongerTribunalCase = makePlayer('stronger-case', 'jury_artisan')
    const reads: StrategicThreatSnapshot = {
      holder: {
        [resentfulRival.id]: threatRead(0.12),
        [strongerTribunalCase.id]: threatRead(0.88),
      },
    }

    const choice = chooseFinalThreeEvictee({
      holderId: holder.id,
      holder,
      nominees: [resentfulRival, strongerTribunalCase],
      relationships: {
        holder: { 'resentful-rival': { affinity: -55, tags: ['betrayal', 'rivalry'] } },
      },
      threatReads: reads,
    })

    expect(choice?.player.id).toBe(resentfulRival.id)
    expect(choice?.reason).toContain('what happened between us')
  })

  it('keeps Tribunal reads observer-specific and marks missing evidence as uncertain', () => {
    const holder = makePlayer('holder', 'strategic_operator')
    const finalist = makePlayer('finalist', 'jury_artisan', 'calm', { lohWins: 2 })

    const observedRead = readFinalThreeDecision({ holderId: holder.id }, finalist)
    const perspectiveRead = readFinalThreeDecision(
      {
        holderId: holder.id,
        threatReads: {
          holder: { finalist: threatRead(0.18) },
          outsider: { finalist: threatRead(0.94) },
        },
      },
      finalist
    )

    expect(observedRead.tribunalReadConfidence).toBe(0.25)
    expect(observedRead.comparison).toContain('hard to judge')
    expect(observedRead.estimatedTribunalAppeal).toBeLessThan(0.5)
    expect(perspectiveRead.tribunalReadConfidence).toBe(0.7)
    expect(perspectiveRead.estimatedTribunalAppeal).toBeLessThan(0.3)
  })
})
