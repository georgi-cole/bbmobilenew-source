import { describe, expect, it } from 'vitest'
import {
  createInitialRealityDomainState,
  MAX_REALITY_MEMORIES_PER_ACTOR,
  normalizeRealityDomainState,
  REALITY_RESOLVED_INTERACTION_LIMIT,
} from '../reality'
import type { RealityInteraction, RealityMemory } from '../reality'

function interaction(
  id: string,
  sequence: number,
  status: RealityInteraction['status']
): RealityInteraction {
  return {
    id,
    actionId: 'whisper',
    actorId: 'actor',
    targetIds: ['target'],
    direction: 'AI_TO_AI',
    contextSnapshot: {
      day: 1,
      phase: 'social_1',
      gameMode: 'CLASSIC',
      socialIntensity: 'REALITY',
      audienceMode: 'OFF',
      feedPerspective: 'PLAYER_LIMITED',
      activeActorIds: ['actor', 'target'],
      rolesByActor: { actor: ['active'], target: ['active'] },
      atRiskActorIds: [],
      powerHolderIds: [],
    },
    intentTags: [],
    visibility: 'PRIVATE',
    witnessIds: [],
    status,
    responseOptions: [],
    outcomeEventIds: [],
    createdSequence: sequence,
  }
}

describe('Reality state retention', () => {
  it('caps oversized hydrated memory collections per actor', () => {
    const domain = createInitialRealityDomainState()
    domain.memoriesByOwner.actor = Array.from(
      { length: MAX_REALITY_MEMORIES_PER_ACTOR + 5 },
      (_, index) => ({ id: `memory-${index}` }) as RealityMemory
    )

    const normalized = normalizeRealityDomainState(domain)

    expect(normalized.memoriesByOwner.actor).toHaveLength(MAX_REALITY_MEMORIES_PER_ACTOR)
    expect(normalized.memoriesByOwner.actor?.[0]?.id).toBe('memory-5')
  })

  it('keeps active conversations and only the newest resolved records', () => {
    const domain = createInitialRealityDomainState()
    for (let sequence = 0; sequence < REALITY_RESOLVED_INTERACTION_LIMIT + 5; sequence += 1) {
      domain.interactions[`resolved-${sequence}`] = interaction(
        `resolved-${sequence}`,
        sequence,
        'RESOLVED'
      )
    }
    domain.interactions.active = interaction('active', 9999, 'AWAITING_HUMAN')

    const normalized = normalizeRealityDomainState(domain)
    const ids = Object.keys(normalized.interactions)

    expect(ids).toHaveLength(REALITY_RESOLVED_INTERACTION_LIMIT + 1)
    expect(normalized.interactions.active?.status).toBe('AWAITING_HUMAN')
    expect(normalized.interactions['resolved-0']).toBeUndefined()
    expect(normalized.interactions['resolved-5']).toBeDefined()
    expect(
      normalized.interactions[`resolved-${REALITY_RESOLVED_INTERACTION_LIMIT + 4}`]
    ).toBeDefined()
  })
})
