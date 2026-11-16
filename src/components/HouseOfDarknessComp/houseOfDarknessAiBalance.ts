import { mulberry32 } from '../../store/rng'
import {
  simulateHouseOfCardsAiRound,
  type HouseOfCardsAiMemoryProfile,
  type HouseOfCardsRoundPerformance,
} from '../../features/houseOfCards/houseOfCardsAi'
import {
  applyHouseOfDarknessMistakes,
  recoverHouseOfDarknessHealth,
  type DamageResolution,
  type HouseOfDarknessCharmId,
} from './houseOfDarknessUtils'
import {
  orderMinigameTargets,
  type MinigameStrategicContext,
} from '../../ai/competition/allianceMinigameStrategy'

export interface HouseOfDarknessAiAbilityParams {
  baseAbility: number
  round: number
  health: number
}

/** Darkness AI receives a private card peek only when it selected Peek. */
export function simulateHouseOfDarknessAiMemory(params: {
  playerId: string
  round: number
  pairCount: number
  tournamentSeed: number
  sessionAbility: number
  charm: HouseOfDarknessCharmId
  recentMistakes?: number
}): HouseOfCardsRoundPerformance {
  const { charm, ...simulation } = params
  const normalizedAbility = clamp(params.sessionAbility / 100, 0, 1)
  const memoryProfile: HouseOfCardsAiMemoryProfile = {
    memoryStoreChance: clamp(0.93 + normalizedAbility * 0.07, 0.93, 0.99),
    memoryAccessChance: 1,
    recallChance: clamp(0.86 + normalizedAbility * 0.14, 0.86, 0.98),
    misrememberChance: clamp(0.04 - normalizedAbility * 0.03, 0.01, 0.04),
  }
  return simulateHouseOfCardsAiRound({
    ...simulation,
    tool: charm === 'peek' ? 'peek' : 'shield',
    peekReveals: charm === 'peek' ? 1 : 0,
    forceTool: true,
    memoryProfile,
  })
}

/** A surviving simulation only clears the board after every pair is matched. */
export function didHouseOfDarknessAiCompleteBoard(params: {
  completedPairs: number
  pairCount: number
  lethalMistakeIndex: number | null
}): boolean {
  return params.completedPairs >= params.pairCount && params.lethalMistakeIndex === null
}

export interface HouseOfDarknessAiBoardOutcome {
  performance: HouseOfCardsRoundPerformance
  damageResolution: DamageResolution
  completedBoard: boolean
  mistakesTaken: number
  elapsedMs: number
  endingHealth: number
  alive: boolean
}

/** Resolve the same complete-board and survival rules used for a human round. */
export function simulateHouseOfDarknessAiBoard(params: {
  playerId: string
  round: number
  pairCount: number
  tournamentSeed: number
  sessionAbility: number
  health: number
  charm: HouseOfDarknessCharmId
  recentMistakes?: number
  curseCharges?: number
  omenDamageBonus?: number
  firstMistakeBonus?: number
  recoveryBonus?: number
}): HouseOfDarknessAiBoardOutcome {
  const performance = simulateHouseOfDarknessAiMemory(params)
  const damageResolution = applyHouseOfDarknessMistakes({
    health: params.health,
    sessionSeed: params.tournamentSeed,
    playerId: params.playerId,
    round: params.round,
    mistakeStartIndex: 0,
    mistakeCount: performance.mistakes,
    damageBonus: (params.omenDamageBonus ?? 0) + (params.charm === 'bargain' ? 3 : 0),
    firstMistakeBonus: params.firstMistakeBonus,
    curseCharges: params.charm === 'cleanse' ? 0 : params.curseCharges,
    shieldBlocks: params.charm === 'shield' ? 2 : 0,
    lastChanceAvailable: params.charm === 'last-chance',
  })
  const completedBoard = didHouseOfDarknessAiCompleteBoard({
    completedPairs: performance.completedPairs,
    pairCount: params.pairCount,
    lethalMistakeIndex: damageResolution.lethalMistakeIndex,
  })
  const mistakesTaken =
    damageResolution.lethalMistakeIndex === null
      ? performance.mistakes
      : damageResolution.lethalMistakeIndex + 1
  const elapsedMs =
    damageResolution.lethalMistakeIndex === null
      ? performance.timeMs
      : Math.max(
          1,
          Math.round((performance.timeMs * mistakesTaken) / Math.max(1, performance.mistakes))
        )
  const endingHealth = recoverHouseOfDarknessHealth(
    damageResolution.health,
    damageResolution.damage,
    completedBoard,
    (params.charm === 'heal' ? 8 : params.charm === 'bargain' ? 14 : 0) +
      (params.recoveryBonus ?? 0),
    !damageResolution.lastChanceUsed
  )

  return {
    performance,
    damageResolution,
    completedBoard,
    mistakesTaken,
    elapsedMs,
    endingHealth,
    alive: completedBoard && endingHealth > 0,
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

/**
 * Adapt the original Deck of Cards AI profile for a longer survival run.
 * Board size and damage already add difficulty, so fatigue and health pressure
 * stay modest instead of stacking a steep skill penalty on every round.
 */
export function getHouseOfDarknessAiAbility({
  baseAbility,
  round,
  health,
}: HouseOfDarknessAiAbilityParams): number {
  const compressedAbility = 55 + (baseAbility - 55) * 0.9
  const fatiguePenalty = Math.min(3, Math.max(0, round - 1) * 0.6)
  const pressurePenalty = health < 75 ? Math.min(3, (75 - health) * 0.04) : 0

  return Math.round(clamp(compressedAbility - fatiguePenalty - pressurePenalty, 18, 85))
}
export interface HouseOfDarknessAiCharmContext {
  playerId: string
  seed: number
  offers: HouseOfDarknessCharmId[]
  ability: number
  round: number
  health: number
  averageRecentMistakes: number
  queuedCurseCharges: number
  omenDamageBonus: number
  omenFirstMistakeBonus: number
  aliveCount: number
  leaderId?: string
  strategicContext?: MinigameStrategicContext
  potentialTargets: Array<{ id: string; health: number; queuedCurseCharges: number }>
}

export interface HouseOfDarknessAiCharmChoice {
  charm: HouseOfDarknessCharmId
  targetId?: string
  estimatedMistakes: number
}

function hashPlayer(value: string): number {
  let hash = 2166136261
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return hash >>> 0
}

/**
 * Choose from the same public offers as the human. The AI estimates its error
 * rate from skill and recent form, then makes a reproducible, imperfect choice.
 * It never receives the generated board outcome or future error count.
 */
export function chooseHouseOfDarknessAiCharm(
  context: HouseOfDarknessAiCharmContext
): HouseOfDarknessAiCharmChoice {
  const {
    playerId,
    seed,
    offers,
    ability,
    round,
    health,
    averageRecentMistakes,
    queuedCurseCharges,
    omenDamageBonus,
    omenFirstMistakeBonus,
    aliveCount,
    leaderId,
    strategicContext,
    potentialTargets,
  } = context
  const rng = mulberry32(
    (seed ^ hashPlayer(playerId) ^ Math.imul(round, 0x9e3779b9) ^ 0xa511e9b3) >>> 0
  )
  const personality = mulberry32((seed ^ hashPlayer(playerId) ^ 0x517cc1b7) >>> 0)
  const caution = 0.82 + personality() * 0.38
  const aggression = 0.72 + personality() * 0.62
  const confidence = 0.8 + personality() * 0.4
  const pairCount = Math.min(8, 3 + Math.max(1, round))
  const skillEstimate = Math.max(18, Math.min(56, ability + (personality() - 0.5) * 5))
  const expectedErrors = Math.max(
    0.55,
    Math.min(
      pairCount * 1.35,
      (averageRecentMistakes * 0.42 + pairCount * (0.76 - skillEstimate * 0.0044) * 0.58) *
        confidence
    )
  )
  const averageHit = Math.max(
    1,
    4 +
      round -
      1 +
      omenDamageBonus +
      expectedErrors / pairCount +
      omenFirstMistakeBonus / Math.max(1, expectedErrors)
  )
  const completionChance = Math.max(0.36, Math.min(0.94, 0.9 - (expectedErrors / pairCount) * 0.28))
  const averageTarget = orderMinigameTargets(
    potentialTargets,
    playerId,
    strategicContext ?? {},
    (target) =>
      (target.id === leaderId ? 8 : 0) +
      Math.max(0, 100 - target.health) * 0.04 +
      Math.min(4, target.queuedCurseCharges) * 0.75
  )[0]

  const scores = offers.map((charm) => {
    let value = 0
    switch (charm) {
      case 'heal':
        value = Math.min(8, 100 - health) * completionChance
        break
      case 'bargain':
        value = (14 - expectedErrors * 3) * completionChance + expectedErrors * 0.2
        break
      case 'shield': {
        const blockedErrors = Math.min(2, expectedErrors)
        value =
          blockedErrors * Math.min(4.2, averageHit - 1) * (health < 30 ? 1.75 : 1.14) * caution
        break
      }
      case 'last-chance': {
        const expectedDamage = expectedErrors * averageHit
        const lethalRisk = Math.max(
          0,
          Math.min(1, (expectedDamage - health + 18) / Math.max(24, expectedDamage))
        )
        value = lethalRisk * 26 * caution
        break
      }
      case 'peek':
        value =
          Math.min(13, averageHit * 0.66 * (0.55 + skillEstimate / 120)) *
          (expectedErrors > 0.8 ? 1 : 0.68)
        break
      case 'curse':
        value = averageTarget
          ? Math.min(8, 4 * 2 * 0.54 * (averageTarget.queuedCurseCharges >= 4 ? 0.2 : 1)) *
            aggression *
            (aliveCount <= 2 ? 1.35 : 1)
          : 0
        break
      case 'cleanse':
        value = Math.min(16, queuedCurseCharges * averageHit * 0.8) * caution
        break
    }
    // Modest estimation error keeps the decisions human without making an
    // objectively weak choice the default.
    const estimateNoise = (rng() - 0.5) * Math.max(2, Math.abs(value) * 0.32)
    return { charm, value: value + estimateNoise }
  })
  scores.sort((a, b) => b.value - a.value)
  const best = scores[0]!
  const nearBest = scores.filter(
    (entry) => entry.value >= best.value - Math.max(2.5, Math.abs(best.value) * 0.22)
  )
  const exploratory = rng() >= 0.95
  const pool = exploratory ? scores : nearBest
  const chosen = pool[Math.floor(rng() * pool.length)] ?? best
  const targetId = chosen.charm === 'curse' && averageTarget ? averageTarget.id : undefined
  return { charm: chosen.charm, targetId, estimatedMistakes: Math.round(expectedErrors * 10) / 10 }
}
