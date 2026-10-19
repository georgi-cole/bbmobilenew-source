import { describe, expect, it } from 'vitest'
import { appendRealityEvent } from '../reality/events'
import { createInitialRealityDomainState } from '../reality/state'
import type { RealityDomainState, RealityVisibility } from '../reality/types'
import { buildStrategicThreatSnapshot } from '../strategicThreat'

function recordSocialEvent(
  state: RealityDomainState,
  input: {
    actorId: string
    targetId: string
    visibility: RealityVisibility
    witnessIds?: string[]
    publicEligible?: boolean
  }
) {
  return appendRealityEvent(state, {
    day: 3,
    phase: 'social_1',
    type: 'SOCIAL_INTERACTION_RESOLVED',
    actorId: input.actorId,
    targetIds: [input.targetId],
    participantIds: [input.actorId, input.targetId],
    witnessIds: input.witnessIds ?? [],
    visibility: input.visibility,
    outcome: 'SUCCESS',
    reason: 'The target agreed with the proposal.',
    tags: ['PERSUADE', 'ACCEPTED'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: input.publicEligible ?? false,
    juryEligible: true,
  })
}

describe('observer-specific strategic threat reads', () => {
  it('counts witnessed persuasion while keeping private influence out of outsiders’ reads', () => {
    const reality = createInitialRealityDomainState()
    const publicEvent = recordSocialEvent(reality, {
      actorId: 'social_player',
      targetId: 'housemate',
      visibility: 'HOUSE_PUBLIC',
      publicEligible: true,
    })
    recordSocialEvent(reality, {
      actorId: 'social_player',
      targetId: 'secret_ally',
      visibility: 'PRIVATE',
    })
    reality.publicPerception.social_player = {
      authenticity: 0,
      entertainment: 0,
      likability: 12,
      underdog: 0,
      strategicRespect: 20,
      competitionRespect: 0,
      loyalty: 0,
      controversy: 0,
      fatigue: 0,
      sourceEventIds: [publicEvent.id],
    }

    const reads = buildStrategicThreatSnapshot({
      reality,
      players: [
        { id: 'outsider', status: 'active' },
        { id: 'social_player', status: 'active' },
        { id: 'housemate', status: 'active' },
        { id: 'secret_ally', status: 'active' },
      ],
    })

    expect(reads.outsider.social_player.persuasion).toBeGreaterThan(0)
    expect(reads.outsider.social_player.publicRespect).toBeGreaterThan(0)
    expect(reads.outsider.social_player.networkReach).toBeCloseTo(1 / 7)
    expect(reads.secret_ally.social_player.score).toBeGreaterThan(
      reads.outsider.social_player.score
    )
  })

  it('uses witnessed relationships with jurors when estimating Tribunal appeal', () => {
    const reality = createInitialRealityDomainState()
    recordSocialEvent(reality, {
      actorId: 'finalist',
      targetId: 'juror',
      visibility: 'GROUP_VISIBLE',
      witnessIds: ['observer'],
    })
    const players = [
      { id: 'observer', status: 'active' },
      { id: 'finalist', status: 'active' },
      { id: 'other_finalist', status: 'active' },
      { id: 'juror', status: 'jury' },
    ]

    const finalStageRead = buildStrategicThreatSnapshot({ reality, players })
    const preJuryRead = buildStrategicThreatSnapshot({
      reality,
      players: players.map((player) =>
        player.id === 'juror' ? { ...player, status: 'active' } : player
      ),
    })

    expect(finalStageRead.observer.finalist.juryAppeal).toBeGreaterThan(0)
    expect(preJuryRead.observer.finalist.juryAppeal).toBe(0)
    expect(finalStageRead.observer.finalist.score).toBeGreaterThan(
      preJuryRead.observer.finalist.score
    )
  })
})
