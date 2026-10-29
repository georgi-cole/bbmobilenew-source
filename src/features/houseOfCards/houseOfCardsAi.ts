import { mulberry32 } from '../../store/rng'
import {
  buildHouseOfCardsBoard,
  chooseHouseOfCardsBrightPairSymbol,
  resolveHouseOfCardsRoundScore,
  type HouseOfCardsRoundToolId,
} from '../../components/HouseOfCardsComp/houseOfCardsUtils'

export interface HouseOfCardsAiSessionProfile {
  playerId: string
  sessionAbility: number
}

export interface HouseOfCardsRoundPerformance {
  score: number
  completedPairs: number
  mistakes: number
  scoringMistakes: number
  timeMs: number
  bestStreak: number
  tool: HouseOfCardsRoundToolId
  toolDelta: number
  toolOutcome: string
  brightPairBonus: number
}

export interface HouseOfCardsAiWagerParams {
  playerId: string
  round: number
  tournamentSeed: number
  sessionAbility: number
  isBehind: boolean
  recentMistakes?: number
  pairCount?: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function hashId(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createHouseOfCardsSessionAbility(playerId: string, tournamentSeed: number): number {
  const rng = mulberry32((tournamentSeed ^ hashId(playerId) ^ 0x517cc1b7) >>> 0)
  const centered = (rng() + rng() + rng() + rng()) / 4 - 0.5
  return Math.round(clamp(55 + centered * 80, 25, 85))
}

export function createHouseOfCardsAiProfiles(
  participantIds: string[],
  humanId: string | null,
  tournamentSeed: number,
): Record<string, HouseOfCardsAiSessionProfile> {
  return Object.fromEntries(participantIds.filter((id) => id !== humanId).map((playerId) => [
    playerId, { playerId, sessionAbility: createHouseOfCardsSessionAbility(playerId, tournamentSeed) },
  ]))
}

/** The AI commits to one of the same round tools using only public context. */
export function chooseHouseOfCardsAiTool({
  playerId, round, tournamentSeed, sessionAbility, isBehind, recentMistakes = 1, pairCount = 4,
}: HouseOfCardsAiWagerParams): HouseOfCardsRoundToolId {
  const rng = mulberry32((tournamentSeed ^ hashId(playerId) ^ Math.imul(round, 0x27d4eb2d) ^ 0x19a4c2d1) >>> 0)
  const personalityRng = mulberry32((tournamentSeed ^ hashId(playerId) ^ 0x517cc1b7) >>> 0)
  const riskTolerance = 0.75 + personalityRng() * 0.5
  const ability = clamp(sessionAbility, 20, 90)
  const toolValues = [
    { tool: 'peek' as const, value: 75 + pairCount * 3 + Math.max(0, recentMistakes - 1) * 8 + ability * 0.15 },
    { tool: 'shield' as const, value: 60 + recentMistakes * 17 + (isBehind ? 4 : 0) + (100 - ability) * 0.12 },
    { tool: 'bonus-bet' as const, value: 49 + (isBehind ? 17 : 0) + ability * 0.28 + riskTolerance * 12 },
  ].map((entry) => ({ ...entry, value: entry.value + (rng() - 0.5) * 12 }))
  toolValues.sort((a, b) => b.value - a.value)
  const pool = rng() < 0.8
    ? toolValues.filter((entry) => entry.value >= toolValues[0]!.value - 12)
    : toolValues
  return pool[Math.floor(rng() * pool.length)]?.tool ?? 'peek'
}

/**
 * Simulates the same shuffled board and reveal sequence for every contestant.
 * The tool choice is already committed before this function receives the
 * hidden board. AI memory and recall are fallible and remain player-specific.
 */
export function simulateHouseOfCardsAiRound(params: {
  playerId: string
  round: number
  pairCount: number
  tournamentSeed: number
  sessionAbility: number
  tool?: HouseOfCardsRoundToolId
  recentMistakes?: number
  brightTargetSymbol?: string
  isBehind?: boolean
}): HouseOfCardsRoundPerformance {
  const { playerId, round, pairCount, tournamentSeed, sessionAbility } = params
  const tool = params.tool ?? 'peek'
  const roundSeed = (tournamentSeed ^ Math.imul(round, 0x85ebca6b)) >>> 0
  const board = buildHouseOfCardsBoard(roundSeed, pairCount)
  const brightTarget = params.brightTargetSymbol || chooseHouseOfCardsBrightPairSymbol(tournamentSeed, round, board)
  const outcomeRng = mulberry32((tournamentSeed ^ hashId(playerId) ^ Math.imul(round, 0x9e3779b9) ^ 0x6c8e9cf5) >>> 0)
  const abilityForm = (outcomeRng() + outcomeRng() + outcomeRng() + outcomeRng()) / 4 - 0.5
  const ability = clamp(sessionAbility + abilityForm * 22, 20, 90)
  const ability01 = ability / 100
  const memoryStoreChance = clamp(0.34 + ability01 * 0.48, 0.42, 0.82)
  const recallChance = clamp(0.22 + ability01 * 0.46, 0.28, 0.72)
  const memoryAccessChance = clamp(0.48 + ability01 * 0.34, 0.54, 0.84)
  const remembered = new Map<number, string>()
  const matched = new Set<number>()
  const peeked = new Set<number>()
  const cards = board
  let mistakes = 0
  let scoringMistakes = 0
  let streak = 0
  let bestStreak = 0
  let completedPairs = 0
  let brightPairBonus = 0
  let toolDelta = 0
  let toolUsed = false
  let shieldUsed = false
  let attemptCount = 0
  const targetWindow = Math.ceil(pairCount / 2)

  if (tool === 'peek') {
    const index = Math.floor(outcomeRng() * cards.length)
    const card = cards[index]
    if (card) {
      remembered.set(index, card.symbol)
      peeked.add(index)
    }
  }

  const maxAttempts = Math.max(8, pairCount * 5)
  while (completedPairs < pairCount && attemptCount < maxAttempts) {
    attemptCount += 1
    const available = cards.filter((card) => !matched.has(card.index))
    if (available.length < 2) break
    const recalled = new Map<number, string>()
    for (const [index, symbol] of remembered) {
      if (!matched.has(index) && outcomeRng() < memoryAccessChance) {
        const recalledSymbol = outcomeRng() < 0.075 ? cards[Math.floor(outcomeRng() * cards.length)]?.symbol ?? symbol : symbol
        recalled.set(index, recalledSymbol)
      }
    }
    const rememberedIndexes = [...recalled.keys()]
    const knownPairs: Array<[number, number]> = []
    for (let i = 0; i < rememberedIndexes.length; i += 1) {
      const firstIndex = rememberedIndexes[i]!
      const mate = rememberedIndexes.slice(i + 1).find((index) => recalled.get(index) === recalled.get(firstIndex))
      if (mate !== undefined) knownPairs.push([firstIndex, mate])
    }
    const knowsPair = knownPairs.length > 0 && outcomeRng() < recallChance
    let firstIndex: number
    let secondIndex: number
    if (knowsPair) {
      const pair = knownPairs[Math.floor(outcomeRng() * knownPairs.length)]!
      firstIndex = pair[0]
      secondIndex = pair[1]
    } else {
      const unremembered = available.filter((card) => !recalled.has(card.index))
      const firstPool = unremembered.length > 0 ? unremembered : available
      firstIndex = firstPool[Math.floor(outcomeRng() * firstPool.length)]!.index
      const firstCard = cards[firstIndex]!
      const rememberedMate = rememberedIndexes.find((index) => index !== firstIndex && recalled.get(index) === firstCard.symbol)
      if (rememberedMate !== undefined && outcomeRng() < recallChance * 0.74) secondIndex = rememberedMate
      else {
        const secondPool = available.filter((card) => card.index !== firstIndex)
        secondIndex = secondPool[Math.floor(outcomeRng() * secondPool.length)]!.index
      }
    }

    const first = cards[firstIndex]!
    const second = cards[secondIndex]!
    const isMatch = first.symbol === second.symbol
    const useBonusBet = tool === 'bonus-bet' && !toolUsed && (knowsPair || attemptCount > 1 && outcomeRng() < 0.34)

    if (isMatch) {
      matched.add(firstIndex)
      matched.add(secondIndex)
      completedPairs += 1
      streak += 1
      bestStreak = Math.max(bestStreak, streak)
      if (brightPairBonus === 0 && first.symbol === brightTarget && completedPairs <= targetWindow) brightPairBonus = 120
    } else {
      mistakes += 1
      const protectedByShield = tool === 'shield' && !shieldUsed
      if (protectedByShield) shieldUsed = true
      else {
        scoringMistakes += 1
        streak = 0
      }
    }

    if (useBonusBet) {
      toolUsed = true
      toolDelta = isMatch ? 150 : -120
    }

    for (const card of [first, second]) {
      if (outcomeRng() < memoryStoreChance || peeked.has(card.index)) remembered.set(card.index, card.symbol)
      else if (remembered.has(card.index) && outcomeRng() < 0.24) remembered.delete(card.index)
    }
  }

  const timeMs = Math.max(3_000, Math.round(
    pairCount * (920 + (1 - ability01) * 560)
      + mistakes * (760 + outcomeRng() * 520)
      + 1_100 + outcomeRng() * 2_800,
  ))
  const toolOutcome = tool === 'peek'
    ? 'Peeked privately'
    : tool === 'shield'
      ? `Shield ${shieldUsed ? 'protected one miss' : 'unused'}`
      : toolUsed ? `Bonus Bet ${toolDelta > 0 ? 'hit' : 'missed'}` : 'Bonus Bet unspent'
  const score = resolveHouseOfCardsRoundScore({
    pairCount, matchedPairs: completedPairs, mistakes, scoringMistakes, timeMs, bestStreak,
    toolBonus: toolDelta, brightPairBonus,
  })
  return { score, completedPairs, mistakes, scoringMistakes, timeMs, bestStreak, tool, toolDelta, toolOutcome, brightPairBonus }
}
