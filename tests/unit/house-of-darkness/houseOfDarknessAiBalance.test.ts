import { describe, expect, it } from 'vitest'
import {
  chooseHouseOfDarknessAiCharm,
  getHouseOfDarknessAiAbility,
} from '../../../src/components/HouseOfDarknessComp/houseOfDarknessAiBalance'

describe('House of Darkness AI fatigue', () => {
  it('keeps elite profiles inside a strong but human early-round band', () => {
    expect(getHouseOfDarknessAiAbility({ baseAbility: 85, round: 1, health: 100 })).toBe(52)
  })

  it('reduces effective memory ability substantially as fatigue accumulates', () => {
    const early = getHouseOfDarknessAiAbility({ baseAbility: 70, round: 2, health: 100 })
    const late = getHouseOfDarknessAiAbility({ baseAbility: 70, round: 9, health: 100 })

    expect(late).toBeLessThan(early)
    expect(early - late).toBeGreaterThanOrEqual(18)
  })

  it('adds meaningful pressure when lifespan is low', () => {
    const healthy = getHouseOfDarknessAiAbility({ baseAbility: 60, round: 5, health: 80 })
    const wounded = getHouseOfDarknessAiAbility({ baseAbility: 60, round: 5, health: 20 })

    expect(healthy - wounded).toBeGreaterThanOrEqual(7)
  })

  it('caps AI ability inside a human survival range', () => {
    expect(
      getHouseOfDarknessAiAbility({ baseAbility: 100, round: 1, health: 100 })
    ).toBeLessThanOrEqual(56)
    expect(getHouseOfDarknessAiAbility({ baseAbility: 20, round: 20, health: 1 })).toBe(18)
  })

  it('replays seeded charm choices, varies between runs, and responds to danger', () => {
    const choose = (seed: number, health: number, averageRecentMistakes: number, round: number) =>
      chooseHouseOfDarknessAiCharm({
        playerId: 'ai-strategist',
        seed,
        offers: ['heal', 'shield', 'bargain', 'peek'],
        ability: 43,
        round,
        health,
        averageRecentMistakes,
        queuedCurseCharges: 0,
        omenDamageBonus: 0,
        omenFirstMistakeBonus: 0,
        aliveCount: 5,
        potentialTargets: [],
      })

    expect(choose(17, 90, 0.8, 2)).toEqual(choose(17, 90, 0.8, 2))
    const calmChoices = Array.from({ length: 128 }, (_, seed) => choose(seed, 90, 0.8, 2))
    const pressuredChoices = Array.from({ length: 128 }, (_, seed) => choose(seed, 20, 4.5, 4))
    expect(new Set(calmChoices.map(({ charm }) => charm)).size).toBeGreaterThan(1)
    expect(new Set(pressuredChoices.map(({ charm }) => charm)).size).toBeGreaterThan(1)
    expect(pressuredChoices.filter(({ charm }) => charm === 'shield').length).toBeGreaterThan(
      calmChoices.filter(({ charm }) => charm === 'shield').length
    )
  })

  it('targets an eligible rival when the AI chooses Curse', () => {
    const choice = chooseHouseOfDarknessAiCharm({
      playerId: 'ai-1',
      seed: 101,
      offers: ['curse'],
      ability: 43,
      round: 4,
      health: 65,
      averageRecentMistakes: 1.5,
      queuedCurseCharges: 0,
      omenDamageBonus: 0,
      omenFirstMistakeBonus: 0,
      aliveCount: 3,
      leaderId: 'rival-leader',
      potentialTargets: [
        { id: 'rival-leader', health: 80, queuedCurseCharges: 0 },
        { id: 'rival-low', health: 20, queuedCurseCharges: 4 },
      ],
    })

    expect(choice.charm).toBe('curse')
    expect(choice.targetId).toBe('rival-leader')
  })

  it('curses a committed enemy before a weaker pact member', () => {
    const choice = chooseHouseOfDarknessAiCharm({
      playerId: 'actor',
      seed: 23,
      offers: ['curse'],
      ability: 45,
      round: 4,
      health: 100,
      averageRecentMistakes: 1,
      queuedCurseCharges: 0,
      omenDamageBonus: 0,
      omenFirstMistakeBonus: 0,
      aliveCount: 3,
      leaderId: 'ally',
      strategicContext: {
        alliances: [
          {
            id: 'pact-alpha',
            memberIds: ['actor', 'ally'],
            leaderIds: ['ally'],
            status: 'ACTIVE',
            cohesion: 0.96,
            fractureRisk: 0.04,
            currentTargetIds: [],
            fallbackTargetIds: [],
            memberCommitment: { actor: 0.98, ally: 0.99 },
            memberPerceivedStatus: { actor: 'CORE', ally: 'CORE' },
            memberPlanBeliefs: {},
            infiltratorIds: [],
          },
        ],
        relationships: { actor: { enemy: { affinity: -60, tags: ['rivalry'] } } },
      },
      potentialTargets: [
        { id: 'ally', health: 18, queuedCurseCharges: 0 },
        { id: 'enemy', health: 100, queuedCurseCharges: 0 },
      ],
    })

    expect(choice.targetId).toBe('enemy')
  })
})
