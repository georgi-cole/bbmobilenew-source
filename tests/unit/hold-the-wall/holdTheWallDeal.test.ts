import { describe, expect, it } from 'vitest'
import {
  FINAL_DUEL_AI_DROP_CHANCE,
  getFinalTwoAiDealAcceptanceChance,
  getFinalTwoAiDealOfferChance,
  getHoldTheWallDealBetrayalChance,
  getHoldTheWallDealDisposition,
  shouldFinalDuelAiDrop,
  type HoldTheWallSafetyDeal,
} from '../../../src/features/holdTheWall/deal'

describe('Hold the Wall final-two deal rules', () => {
  it('makes close relationships very likely to make and accept a deal', () => {
    const close = { affinity: 78, tags: ['alliance', 'ride_or_die'] }

    expect(getFinalTwoAiDealOfferChance(close)).toBeGreaterThanOrEqual(0.7)
    expect(getFinalTwoAiDealAcceptanceChance(close)).toBeGreaterThanOrEqual(0.9)
  })

  it('makes hostile relationships materially less willing to make or accept a deal', () => {
    const hostile = { affinity: -48, tags: ['rivalry', 'strained'] }

    expect(getFinalTwoAiDealOfferChance(hostile)).toBeLessThan(0.3)
    expect(getFinalTwoAiDealAcceptanceChance(hostile)).toBeLessThan(0.35)
  })

  it('keeps an unchanged close deal at only a very small betrayal chance', () => {
    const deal: HoldTheWallSafetyDeal = {
      week: 4,
      promisorId: 'ai',
      beneficiaryId: 'human',
      source: 'hold_the_wall',
      affinityAtDeal: 80,
      tagsAtDeal: ['alliance'],
    }

    const chance = getHoldTheWallDealBetrayalChance(
      {
        strategicRelationships: {
          ai: {
            human: { affinity: 80, tags: ['alliance'] },
          },
        },
      },
      deal
    )

    expect(chance).toBeLessThanOrEqual(0.05)
  })

  it('raises betrayal sharply when the relationship deteriorates after the bargain', () => {
    const deal: HoldTheWallSafetyDeal = {
      week: 4,
      promisorId: 'ai',
      beneficiaryId: 'human',
      source: 'hold_the_wall',
      affinityAtDeal: 80,
      tagsAtDeal: ['alliance'],
    }

    const damagedChance = getHoldTheWallDealBetrayalChance(
      {
        strategicRelationships: {
          ai: {
            human: { affinity: -45, tags: ['strained', 'rivalry'] },
          },
        },
      },
      deal
    )

    expect(damagedChance).toBeGreaterThanOrEqual(0.55)
  })

  it('can flip the same seeded promise from honor to betrayal after relationship damage', () => {
    const deal: HoldTheWallSafetyDeal = {
      week: 5,
      promisorId: 'ai',
      beneficiaryId: 'human',
      source: 'hold_the_wall',
      affinityAtDeal: 80,
      tagsAtDeal: ['alliance'],
    }

    let foundFlip = false
    for (let seed = 1; seed <= 250 && !foundFlip; seed += 1) {
      const base = {
        gameId: 'deal-deterioration-test',
        seed,
        week: 5,
        strategicRelationships: {
          ai: {
            human: { affinity: 80, tags: ['alliance'] },
          },
        },
      }
      const damaged = {
        ...base,
        strategicRelationships: {
          ai: {
            human: { affinity: -45, tags: ['strained', 'rivalry'] },
          },
        },
      }
      foundFlip =
        getHoldTheWallDealDisposition(base, deal) === 'honor' &&
        getHoldTheWallDealDisposition(damaged, deal) === 'betray'
    }

    expect(foundFlip).toBe(true)
  })
})

describe('Hold the Wall final duel', () => {
  it('uses a deterministic 10% drop roll with no fixed final-opponent deadline', () => {
    const results = Array.from({ length: 1_000 }, (_, index) =>
      shouldFinalDuelAiDrop(8123, 'ai-finalist', index + 1)
    )
    const dropCount = results.filter(Boolean).length

    expect(dropCount / results.length).toBeGreaterThan(0.07)
    expect(dropCount / results.length).toBeLessThan(0.13)
    expect(FINAL_DUEL_AI_DROP_CHANCE).toBe(0.1)
    expect(shouldFinalDuelAiDrop(8123, 'ai-finalist', 37)).toBe(
      shouldFinalDuelAiDrop(8123, 'ai-finalist', 37)
    )
  })
})
