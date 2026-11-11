import { mulberry32 } from '../../store/rng'
import {
  HOUSE_OF_CARDS_BONUS_BET_PENALTY,
  HOUSE_OF_CARDS_BONUS_BET_REWARD,
  HOUSE_OF_CARDS_BRIGHT_PAIR_BONUS,
  HOUSE_OF_CARDS_PEEK_REVEALS,
  buildHouseOfCardsBoard,
  chooseHouseOfCardsBrightPairSymbol,
  getHouseOfCardsEarlyPairLimit,
  getHouseOfCardsScoringMistakes,
  getHouseOfCardsShieldAllowance,
  isHouseOfCardsBlindBetPair,
  chooseHouseOfCardsReplayIndexes,
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
  tournamentSeed: number
): Record<string, HouseOfCardsAiSessionProfile> {
  return Object.fromEntries(
    participantIds
      .filter((id) => id !== humanId)
      .map((playerId) => [
        playerId,
        { playerId, sessionAbility: createHouseOfCardsSessionAbility(playerId, tournamentSeed) },
      ])
  )
}

/** The AI commits to one of the same round tools using only public context. */
export function chooseHouseOfCardsAiTool({
  playerId,
  round,
  tournamentSeed,
  sessionAbility,
  isBehind,
  recentMistakes = 1,
  pairCount = 4,
}: HouseOfCardsAiWagerParams): HouseOfCardsRoundToolId {
  const rng = mulberry32(
    (tournamentSeed ^ hashId(playerId) ^ Math.imul(round, 0x27d4eb2d) ^ 0x19a4c2d1) >>> 0
  )
  const personalityRng = mulberry32((tournamentSeed ^ hashId(playerId) ^ 0x517cc1b7) >>> 0)
  const riskTolerance = 0.75 + personalityRng() * 0.5
  const ability = clamp(sessionAbility, 20, 90)
  const toolValues = [
    { tool: 'peek' as const, value: 52 + pairCount * 3 + ability * 0.24 },
    {
      tool: 'shield' as const,
      value:
        65 * getHouseOfCardsShieldAllowance(round) +
        Math.min(4, recentMistakes) * 10 +
        (100 - ability) * 0.12,
    },
    { tool: 'bonus-bet' as const, value: 28 + (isBehind ? 28 : 0) + riskTolerance * 22 },
    { tool: 'keep-open' as const, value: 64 + pairCount * 4 + (100 - ability) * 0.3 },
    { tool: 'replay' as const, value: 40 + pairCount * 4 + recentMistakes * 5 },
  ].map((entry) => ({ ...entry, value: entry.value + (rng() - 0.5) * 12 }))
  toolValues.sort((a, b) => b.value - a.value)
  const pool =
    rng() < 0.8
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
  peekReveals?: number
  recentMistakes?: number
  brightTargetSymbol?: string
  isBehind?: boolean
}): HouseOfCardsRoundPerformance {
  const { playerId, round, pairCount, tournamentSeed, sessionAbility } = params
  const tool = params.tool ?? 'peek'
  const roundSeed = (tournamentSeed ^ Math.imul(round, 0x85ebca6b)) >>> 0
  const board = buildHouseOfCardsBoard(roundSeed, pairCount)
  const brightTarget =
    params.brightTargetSymbol || chooseHouseOfCardsBrightPairSymbol(tournamentSeed, round, board)
  const outcomeRng = mulberry32(
    (tournamentSeed ^ hashId(playerId) ^ Math.imul(round, 0x9e3779b9) ^ 0x6c8e9cf5) >>> 0
  )
  const betRng = mulberry32(
    (tournamentSeed ^ hashId(playerId) ^ Math.imul(round, 0x9e3779b9) ^ 0xf14d529b) >>> 0
  )
  const abilityForm = (outcomeRng() + outcomeRng() + outcomeRng() + outcomeRng()) / 4 - 0.5
  const ability = clamp(sessionAbility + abilityForm * 22, 20, 90)
  const ability01 = ability / 100
  const memoryStoreChance = clamp(0.34 + ability01 * 0.48, 0.42, 0.82)
  const recallChance = clamp(0.22 + ability01 * 0.46, 0.28, 0.72)
  const memoryAccessChance = clamp(0.48 + ability01 * 0.34, 0.54, 0.84)
  const seen = new Set<number>()
  const keptOpen = new Set<number>()
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
  let attemptCount = 0
  let replayCount = 0
  const targetWindow = getHouseOfCardsEarlyPairLimit(pairCount)
  const peekReveals = tool === 'peek' ? (params.peekReveals ?? HOUSE_OF_CARDS_PEEK_REVEALS) : 0
  let peeksRemaining = peekReveals

  const maxAttempts = Math.max(8, pairCount * 5)
  while (completedPairs < pairCount && attemptCount < maxAttempts) {
    attemptCount += 1
    const available = cards.filter((card) => !matched.has(card.index))
    if (available.length < 2) break
    const recalled = new Map<number, string>()
    if (tool === 'replay' && !toolUsed) {
      const eligible = available.filter((card) => seen.has(card.index)).map((card) => card.index)
      if (eligible.length >= 2 && (remembered.size < eligible.length || attemptCount > pairCount)) {
        const indexes = chooseHouseOfCardsReplayIndexes(
          eligible,
          (tournamentSeed ^ Math.imul(round, 0x27d4eb2d) ^ 0xd937f4a1) >>> 0
        )
        for (const index of indexes) {
          remembered.set(index, cards[index]!.symbol)
          recalled.set(index, cards[index]!.symbol)
        }
        replayCount = indexes.length
        toolUsed = true
      }
    }
    for (const [index, symbol] of remembered) {
      if (!recalled.has(index) && !matched.has(index) && outcomeRng() < memoryAccessChance) {
        const recalledSymbol =
          outcomeRng() < 0.075
            ? (cards[Math.floor(outcomeRng() * cards.length)]?.symbol ?? symbol)
            : symbol
        recalled.set(index, recalledSymbol)
      }
    }
    for (const index of keptOpen) {
      if (!matched.has(index)) recalled.set(index, cards[index]!.symbol)
    }
    const rememberedIndexes = [...recalled.keys()]
    const knownPairs: Array<[number, number]> = []
    for (let i = 0; i < rememberedIndexes.length; i += 1) {
      const firstIndex = rememberedIndexes[i]!
      const mate = rememberedIndexes
        .slice(i + 1)
        .find((index) => recalled.get(index) === recalled.get(firstIndex))
      if (mate !== undefined) knownPairs.push([firstIndex, mate])
    }
    const knowsPair = knownPairs.length > 0 && outcomeRng() < recallChance
    const unseen = available.filter((card) => !seen.has(card.index))
    const useBonusBet =
      tool === 'bonus-bet' &&
      !toolUsed &&
      unseen.length >= 2 &&
      (unseen.length <= 4 || betRng() < 0.16)
    const useKeepOpen = tool === 'keep-open' && !toolUsed && !knowsPair
    let firstIndex: number
    let secondIndex: number
    if (useBonusBet) {
      firstIndex = unseen[Math.floor(betRng() * unseen.length)]!.index
      const secondPool = unseen.filter((card) => card.index !== firstIndex)
      secondIndex = secondPool[Math.floor(betRng() * secondPool.length)]!.index
    } else if (knowsPair) {
      const pair = knownPairs[Math.floor(outcomeRng() * knownPairs.length)]!
      firstIndex = pair[0]
      secondIndex = pair[1]
    } else {
      const unremembered = available.filter((card) => !recalled.has(card.index))
      const firstPool = unremembered.length > 0 ? unremembered : available
      firstIndex = firstPool[Math.floor(outcomeRng() * firstPool.length)]!.index
      const firstCard = cards[firstIndex]!
      const rememberedMate = rememberedIndexes.find(
        (index) => index !== firstIndex && recalled.get(index) === firstCard.symbol
      )
      if (
        rememberedMate !== undefined &&
        (keptOpen.has(rememberedMate) || outcomeRng() < recallChance * 0.74)
      )
        secondIndex = rememberedMate
      else {
        let secondPool = available.filter((card) => card.index !== firstIndex)
        // Check a plausible second card before committing. The decision to
        // spend a reveal uses only the first flip and recalled information.
        const peekCandidates = secondPool.filter(
          (card) => !recalled.has(card.index) && !peeked.has(card.index)
        )
        if (peeksRemaining > 0 && secondPool.length > 1 && peekCandidates.length > 0) {
          const candidate = peekCandidates[Math.floor(outcomeRng() * peekCandidates.length)]!
          peeksRemaining -= 1
          seen.add(candidate.index)
          peeked.add(candidate.index)
          remembered.set(candidate.index, candidate.symbol)
          secondPool =
            candidate.symbol === firstCard.symbol
              ? [candidate]
              : secondPool.filter((card) => card.index !== candidate.index)
        }
        secondIndex = secondPool[Math.floor(outcomeRng() * secondPool.length)]!.index
      }
    }

    const first = cards[firstIndex]!
    const second = cards[secondIndex]!
    const isMatch = first.symbol === second.symbol
    const eligibleBet = useBonusBet && isHouseOfCardsBlindBetPair(firstIndex, secondIndex, seen)
    seen.add(firstIndex)
    seen.add(secondIndex)
    if (useKeepOpen) {
      keptOpen.add(firstIndex)
      keptOpen.add(secondIndex)
      toolUsed = true
    }

    if (isMatch) {
      matched.add(firstIndex)
      matched.add(secondIndex)
      completedPairs += 1
      streak += 1
      bestStreak = Math.max(bestStreak, streak)
      if (brightPairBonus === 0 && first.symbol === brightTarget && completedPairs <= targetWindow)
        brightPairBonus = HOUSE_OF_CARDS_BRIGHT_PAIR_BONUS
    } else {
      mistakes += 1
      streak = 0
    }

    if (eligibleBet) {
      toolUsed = true
      toolDelta = isMatch ? HOUSE_OF_CARDS_BONUS_BET_REWARD : -HOUSE_OF_CARDS_BONUS_BET_PENALTY
    }

    for (const card of [first, second]) {
      if (outcomeRng() < memoryStoreChance || peeked.has(card.index))
        remembered.set(card.index, card.symbol)
      else if (remembered.has(card.index) && outcomeRng() < 0.24) remembered.delete(card.index)
    }
  }

  scoringMistakes = getHouseOfCardsScoringMistakes(mistakes, round, tool)
  const timeMs = Math.max(
    3_000,
    Math.round(
      pairCount * (920 + (1 - ability01) * 560) +
        mistakes * (760 + outcomeRng() * 520) +
        1_100 +
        outcomeRng() * 2_800
    )
  )
  const toolOutcome =
    tool === 'peek'
      ? `Private reveals used: ${peekReveals - peeksRemaining}`
      : tool === 'shield'
        ? `Shield deducted ${mistakes - scoringMistakes} ${mistakes - scoringMistakes === 1 ? 'miss' : 'misses'}`
        : tool === 'keep-open'
          ? toolUsed
            ? 'Kept two cards visible'
            : 'Keep Open unused'
          : tool === 'replay'
            ? replayCount > 0
              ? 'Replayed two seen cards'
              : 'Replay unused'
            : toolUsed
              ? `Bonus Bet ${toolDelta > 0 ? 'hit' : 'missed'}`
              : 'Bonus Bet unspent'
  const score = resolveHouseOfCardsRoundScore({
    pairCount,
    matchedPairs: completedPairs,
    mistakes,
    scoringMistakes,
    timeMs,
    bestStreak,
    toolBonus: toolDelta,
    brightPairBonus,
  })
  return {
    score,
    completedPairs,
    mistakes,
    scoringMistakes,
    timeMs,
    bestStreak,
    tool,
    toolDelta,
    toolOutcome,
    brightPairBonus,
  }
}
