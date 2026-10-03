import { describe, expect, it } from 'vitest'
import {
  getHoldTheWallDealAcceptanceChance,
  getHoldTheWallDealHonorChance,
  shouldAiHonorHoldTheWallDeal,
} from '../../../src/features/holdTheWall/holdTheWallDeals'
import {
  createInitialGameState,
  getEligibleNominationTargets,
} from '../../../src/store/gameSlice'
import type { RelationshipsMap } from '../../../src/social/types'

function relationshipMap(
  aiId: string,
  humanId: string,
  affinity: number,
  tags: string[]
): RelationshipsMap {
  return {
    [aiId]: {
      [humanId]: { affinity, tags },
    },
    [humanId]: {
      [aiId]: { affinity, tags: [...tags] },
    },
  }
}

describe('Hold the Wall final-two deals', () => {
  it('makes close/allied promises much more reliable than strained or enemy promises', () => {
    const close = relationshipMap('ai', 'human', 88, ['alliance', 'primary_alliance'])
    const strained = relationshipMap('ai', 'human', -72, ['enemy', 'rivalry', 'strained'])

    expect(getHoldTheWallDealAcceptanceChance(close, 'ai', 'human')).toBeGreaterThan(
      getHoldTheWallDealAcceptanceChance(strained, 'ai', 'human')
    )
    expect(getHoldTheWallDealHonorChance(close, 'ai', 'human')).toBeGreaterThanOrEqual(0.9)
    expect(getHoldTheWallDealHonorChance(strained, 'ai', 'human')).toBeLessThan(0.4)
  })

  it('can turn the same accepted AI promise into a betrayal after relationship damage', () => {
    const close = relationshipMap('ai', 'human', 90, ['alliance', 'primary_alliance'])
    const strained = relationshipMap('ai', 'human', -80, ['enemy', 'rivalry', 'strained'])
    const seed = Array.from({ length: 5000 }, (_, index) => index + 1).find(
      (candidate) =>
        shouldAiHonorHoldTheWallDeal({
          seed: candidate,
          week: 4,
          relationships: close,
          promisorId: 'ai',
          beneficiaryId: 'human',
        }) &&
        !shouldAiHonorHoldTheWallDeal({
          seed: candidate,
          week: 4,
          relationships: strained,
          promisorId: 'ai',
          beneficiaryId: 'human',
        })
    )

    expect(seed).toBeDefined()
  })

  it('keeps the beneficiary off an allied AI winner block but can expose them after the bond collapses', () => {
    const state = createInitialGameState({ seed: 51 })
    const human = state.players.find((player) => player.isUser)
    const ai = state.players.find((player) => !player.isUser)
    if (!human || !ai) throw new Error('Expected human and AI contestants')

    state.players.forEach((player) => {
      player.status = 'active'
    })
    ai.status = 'loh'
    state.lohId = ai.id
    state.coLohIds = null
    state.publicModeEnabled = false
    state.lastHohCompFinisherId = null
    if (state.voxPopuli) state.voxPopuli.status = 'inactive'
    if (state.doubleEviction) state.doubleEviction.weekActive = false
    state.week = 4
    state.holdTheWallSafetyDeal = {
      week: state.week,
      promisorId: ai.id,
      beneficiaryId: human.id,
      source: 'final_two',
    }

    const close = relationshipMap(ai.id, human.id, 92, ['alliance', 'primary_alliance'])
    const strained = relationshipMap(ai.id, human.id, -85, ['enemy', 'rivalry', 'strained'])
    const dynamicSeed = Array.from({ length: 5000 }, (_, index) => index + 1).find(
      (candidate) =>
        shouldAiHonorHoldTheWallDeal({
          seed: candidate,
          week: state.week,
          relationships: close,
          promisorId: ai.id,
          beneficiaryId: human.id,
        }) &&
        !shouldAiHonorHoldTheWallDeal({
          seed: candidate,
          week: state.week,
          relationships: strained,
          promisorId: ai.id,
          beneficiaryId: human.id,
        })
    )
    if (!dynamicSeed) throw new Error('Expected a deterministic relationship-sensitive seed')
    state.seed = dynamicSeed

    state.strategicRelationships = close
    expect(getEligibleNominationTargets(state, ai.id).map((player) => player.id)).not.toContain(
      human.id
    )

    state.strategicRelationships = strained
    expect(getEligibleNominationTargets(state, ai.id).map((player) => player.id)).toContain(
      human.id
    )
  })
})
