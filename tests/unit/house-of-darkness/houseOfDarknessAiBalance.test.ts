import { describe, expect, it } from 'vitest'
import {
  chooseHouseOfDarknessAiCharm,
  didHouseOfDarknessAiCompleteBoard,
  getHouseOfDarknessAiAbility,
  simulateHouseOfDarknessAiBoard,
  simulateHouseOfDarknessAiMemory,
} from '../../../src/components/HouseOfDarknessComp/houseOfDarknessAiBalance'
import {
  getHouseOfDarknessCharmOffers,
  getHouseOfDarknessOmen,
  getHouseOfDarknessPairCount,
  HOUSE_OF_DARKNESS_MAX_ROUNDS,
  HOUSE_OF_DARKNESS_STARTING_HEALTH,
} from '../../../src/components/HouseOfDarknessComp/houseOfDarknessUtils'
import { getHouseOfCardsAttemptToolOffer } from '../../../src/components/HouseOfCardsComp/houseOfCardsUtils'
import { simulateHouseOfCardsAiRound } from '../../../src/features/houseOfCards/houseOfCardsAi'

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function simulateDepthRun(seed: number, baseAbility: number) {
  const playerId = 'ai'
  let health = HOUSE_OF_DARKNESS_STARTING_HEALTH
  let totalMistakes = 0
  let roundsSurvived = 0

  for (let round = 1; round <= HOUSE_OF_DARKNESS_MAX_ROUNDS; round += 1) {
    const omen = getHouseOfDarknessOmen(round, seed)
    const offers = getHouseOfDarknessCharmOffers(seed, round, {
      aliveCount: 5,
      lowHealthPresent: health <= 25,
      queuedCursePresent: false,
      mode: 'depth',
      round,
    })
    const ability = getHouseOfDarknessAiAbility({ baseAbility, round, health })
    const choice = chooseHouseOfDarknessAiCharm({
      playerId,
      seed,
      offers: offers.map(({ id }) => id),
      ability,
      round,
      health,
      averageRecentMistakes: roundsSurvived > 0 ? totalMistakes / roundsSurvived : 1.4,
      queuedCurseCharges: 0,
      omenDamageBonus: omen.damageBonus,
      omenFirstMistakeBonus: omen.firstMistakeBonus,
      aliveCount: 5,
      potentialTargets: [],
    })
    const outcome = simulateHouseOfDarknessAiBoard({
      playerId,
      round,
      pairCount: getHouseOfDarknessPairCount(round),
      tournamentSeed: seed,
      sessionAbility: ability,
      health,
      charm: choice.charm,
      recentMistakes: roundsSurvived > 0 ? totalMistakes / roundsSurvived : undefined,
      omenDamageBonus: omen.damageBonus,
      firstMistakeBonus: omen.firstMistakeBonus,
      recoveryBonus: omen.recoveryBonus,
    })
    totalMistakes += outcome.mistakesTaken
    health = outcome.endingHealth
    if (!outcome.alive) return { survived: false, roundsSurvived, totalMistakes }
    roundsSurvived += 1
  }

  return { survived: true, roundsSurvived, totalMistakes }
}

describe('House of Darkness AI fatigue', () => {
  it('does not count an incomplete board or lethal result as cleared', () => {
    expect(
      didHouseOfDarknessAiCompleteBoard({
        completedPairs: 3,
        pairCount: 4,
        lethalMistakeIndex: null,
      })
    ).toBe(false)
    expect(
      didHouseOfDarknessAiCompleteBoard({
        completedPairs: 4,
        pairCount: 4,
        lethalMistakeIndex: 0,
      })
    ).toBe(false)
    expect(
      didHouseOfDarknessAiCompleteBoard({
        completedPairs: 4,
        pairCount: 4,
        lethalMistakeIndex: null,
      })
    ).toBe(true)
  })

  it('completes every Darkness board under fallible, skill-scaled memory', () => {
    for (const baseAbility of [25, 55, 85]) {
      for (let seed = 1; seed <= 100; seed += 1) {
        const round = 4
        const aiAbility = getHouseOfDarknessAiAbility({
          baseAbility,
          round,
          health: 70,
        })
        const performance = simulateHouseOfDarknessAiMemory({
          playerId: 'ai',
          round,
          pairCount: getHouseOfDarknessPairCount(round),
          tournamentSeed: seed,
          sessionAbility: aiAbility,
          charm: 'shield',
        })

        expect(performance.completedPairs).toBe(getHouseOfDarknessPairCount(round))
      }
    }
  })

  it('uses only the Darkness charm tool even when Deck of Light offers differ', () => {
    const round = 4
    const peekSeed = Array.from({ length: 500 }, (_, index) => index + 1).find(
      (seed) => !getHouseOfCardsAttemptToolOffer(seed, 0, round).includes('peek')
    )!
    const shieldSeed = Array.from({ length: 500 }, (_, index) => index + 1).find(
      (seed) => !getHouseOfCardsAttemptToolOffer(seed, 0, round).includes('shield')
    )!
    const peekPerformance = simulateHouseOfDarknessAiMemory({
      playerId: 'dark-ai',
      round,
      pairCount: getHouseOfDarknessPairCount(round),
      tournamentSeed: peekSeed,
      sessionAbility: 55,
      charm: 'peek',
    })
    const nonPeekPerformance = simulateHouseOfDarknessAiMemory({
      playerId: 'dark-ai',
      round,
      pairCount: getHouseOfDarknessPairCount(round),
      tournamentSeed: shieldSeed,
      sessionAbility: 55,
      charm: 'heal',
    })

    expect(peekPerformance.tool).toBe('peek')
    expect(peekPerformance.toolOutcome).toBe('Private reveals used: 1')
    expect(nonPeekPerformance.tool).toBe('shield')
    expect(nonPeekPerformance.toolOutcome).toMatch(/^Shield deducted /)
  })

  it('keeps full-run survival challenging and improves it with stronger profiles', () => {
    const survivalFor = (baseAbility: number) =>
      Array.from({ length: 500 }, (_, index) => simulateDepthRun(index + 1, baseAbility))
    const low = survivalFor(25)
    const typical = survivalFor(55)
    const elite = survivalFor(85)
    const lowRate = low.filter(({ survived }) => survived).length / low.length
    const typicalRate = typical.filter(({ survived }) => survived).length / typical.length
    const eliteRate = elite.filter(({ survived }) => survived).length / elite.length
    const averageRounds = (runs: ReturnType<typeof survivalFor>) =>
      average(runs.map(({ roundsSurvived }) => roundsSurvived))

    expect(lowRate).toBeGreaterThan(0)
    expect(typicalRate).toBeGreaterThan(lowRate)
    expect(eliteRate).toBeGreaterThan(typicalRate)
    expect(typicalRate).toBeLessThan(1)
    expect(eliteRate).toBeLessThan(1)
    expect(averageRounds(elite)).toBeGreaterThan(averageRounds(low))
  })

  it('keeps late-round recall fallible and close to an attentive seen-card strategy', () => {
    const round = HOUSE_OF_DARKNESS_MAX_ROUNDS
    const pairCount = getHouseOfDarknessPairCount(round)
    const ability = getHouseOfDarknessAiAbility({ baseAbility: 55, round, health: 50 })
    const attentiveErrors = Array.from(
      { length: 500 },
      (_, index) =>
        simulateHouseOfCardsAiRound({
          playerId: 'ai',
          round,
          pairCount,
          tournamentSeed: index + 1,
          sessionAbility: ability,
          tool: 'shield',
          forceTool: true,
          memoryProfile: {
            memoryStoreChance: 1,
            memoryAccessChance: 1,
            recallChance: 1,
            misrememberChance: 0,
          },
        }).mistakes
    )
    const darknessErrors = Array.from(
      { length: 500 },
      (_, index) =>
        simulateHouseOfDarknessAiMemory({
          playerId: 'ai',
          round,
          pairCount,
          tournamentSeed: index + 1,
          sessionAbility: ability,
          charm: 'shield',
        }).mistakes
    )
    const attentiveMean = average(attentiveErrors)
    const darknessMean = average(darknessErrors)

    expect(darknessMean).toBeGreaterThan(attentiveMean)
    expect(darknessMean).toBeLessThan(attentiveMean + 1.5)
  })

  it('preserves meaningful profile differences while keeping elite skill capped', () => {
    const elite = getHouseOfDarknessAiAbility({ baseAbility: 85, round: 1, health: 100 })
    const low = getHouseOfDarknessAiAbility({ baseAbility: 25, round: 1, health: 100 })

    expect(elite).toBe(82)
    expect(elite).toBeGreaterThan(low)
  })

  it('adds only modest fatigue as board size and damage already rise each round', () => {
    const early = getHouseOfDarknessAiAbility({ baseAbility: 70, round: 2, health: 100 })
    const late = getHouseOfDarknessAiAbility({ baseAbility: 70, round: 9, health: 100 })

    expect(late).toBeLessThan(early)
    expect(early - late).toBeLessThanOrEqual(4)
  })

  it('adds meaningful pressure when lifespan is low', () => {
    const healthy = getHouseOfDarknessAiAbility({ baseAbility: 60, round: 5, health: 80 })
    const wounded = getHouseOfDarknessAiAbility({ baseAbility: 60, round: 5, health: 20 })

    expect(healthy - wounded).toBeGreaterThanOrEqual(2)
  })

  it('keeps AI ability inside the simulator range', () => {
    expect(
      getHouseOfDarknessAiAbility({ baseAbility: 100, round: 1, health: 100 })
    ).toBeLessThanOrEqual(85)
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
