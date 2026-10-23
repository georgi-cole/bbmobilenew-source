import { cryptoSeed } from '../../features/riskWheel/cryptoSpin'
import { mulberry32 } from '../../store/rng'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import {
  getMinigameTargetPriority,
  type MinigameStrategicContext,
} from '../../ai/competition/allianceMinigameStrategy'

export const CHAIN_LADDER = [50, 100, 150, 250, 400, 650, 950, 1300] as const
export const MAX_STANDARD_PLAYERS = 16
export const MIN_STANDARD_PLAYERS = 7
export const SEMIFINAL_TURNS_PER_PLAYER = 3
export const FINAL_TURNS_PER_PLAYER = 4
export const FINAL_ROUND_DURATION_MS = 30000
export const SOLO_RUSH_DURATION_MS = 60000
export const CHAIN_SHOE_COPIES_PER_NUMBER = 2
export const CHAIN_SHOE_TOTAL_CARDS = 100 * CHAIN_SHOE_COPIES_PER_NUMBER
export const CHAIN_TURN_PIPELINE_DURATIONS = {
  decision: 480,
  reveal: 600,
  verdict: 750,
  consequence: 820,
  ladderUpdate: 900,
  settle: 600,
} as const

export type ChainAction = 'higher' | 'equal' | 'lower' | 'bank'

export interface ChainOfGreedResolvedParticipant {
  id: string
  name: string
  isHuman: boolean
  avatar: string
  precomputedScore: number
}

export interface ChainOfGreedPersonality {
  aggression: number
  caution: number
  volatility: number
  social: number
}

export interface ChainOfGreedPlayerState extends ChainOfGreedResolvedParticipant {
  isEliminated: boolean
  safetyAvailable: boolean
  totalContribution: number
  roundContribution: number
  totalBanked: number
  roundBanked: number
  totalRecovered: number
  roundRecovered: number
  roundLost: number
  roundCorrectGuesses: number
  roundWrongGuesses: number
  roundBanks: number
  roundBusts: number
  totalCorrectGuesses: number
  totalWrongGuesses: number
  totalBanks: number
  totalBusts: number
  voteCount: number
  semifinalScore: number
  finalScore: number
  finalWrongGuesses: number
  finalCorrectGuesses: number
  finalBanks: number
  turnsTakenThisRound: number
  personality: ChainOfGreedPersonality
  lastRoundPerformance: number
  // Tracks the last readable turn result shown in the player rail.
  latestMoment: 'higher' | 'equal' | 'lower' | 'wrong' | 'bank' | 'bust' | 'safe' | null
}

export interface ChainOfGreedChainState {
  step: number
  pot: number
  referenceNumber: number
  recentNumbers: number[]
  drawnNumbers?: number[]
}

export interface ChainOfGreedTurnRecord {
  actorId: string
  actorName: string
  choice: ChainAction
  referenceNumber: number
  revealedNumber: number | null
  wasCorrect: boolean | null
  bankedAmount: number
  recoveredAmount: number
  safetyUsed: boolean
  lostAmount: number
  message: string
  phase: 'standard' | 'semifinal' | 'final'
}

export interface ChainOfGreedVoteRecord {
  voterId: string
  voterName: string
  targetId: string
  targetName: string
  reason: string
}

export interface ChainOfGreedTieBreakInfo {
  type: 'stats' | 'duel'
  message: string
  transcript: string[]
}

export interface ChainActionResolution {
  updatedChain: ChainOfGreedChainState
  securedDelta: number
  individualDelta: number
  revealedNumber: number | null
  wasCorrect: boolean | null
  lostAmount: number
  recoveredDelta: number
  safetyUsed: boolean
  message: string
  equalMiss: boolean
  busted: boolean
}

const FALLBACK_NAMES = [
  'You',
  'Mira',
  'Alex',
  'Nina',
  'Sasha',
  'Eli',
  'Lena',
  'Jules',
  'Noa',
  'Rhea',
]
const AVATAR_TOKENS = ['◉', '✦', '⬢', '◆', '✳', '⬡', '✺', '◈', '▣', '✷']

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function randomInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min
}

function createPairRng(seed: number, voterId: string, targetId: string) {
  let mixed = seed >>> 0
  const key = `${voterId}:${targetId}`
  for (let index = 0; index < key.length; index += 1) {
    mixed = (mixed ^ key.charCodeAt(index)) * 16777619
  }
  return mulberry32(mixed >>> 0)
}

export function createChainOfGreedRng(seed?: number) {
  const resolvedSeed = seed ?? cryptoSeed()
  return {
    seed: resolvedSeed,
    rng: mulberry32(resolvedSeed >>> 0),
  }
}

export function resolveChainOfGreedParticipants(
  props: Pick<GenericMinigameProps, 'participants' | 'participantIds'>
): ChainOfGreedResolvedParticipant[] {
  if (props.participants && props.participants.length > 0) {
    return props.participants.slice(0, MAX_STANDARD_PLAYERS).map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      isHuman: participant.isHuman,
      avatar: participant.avatar || AVATAR_TOKENS[index % AVATAR_TOKENS.length],
      precomputedScore: participant.precomputedScore,
    }))
  }

  const ids =
    props.participantIds && props.participantIds.length > 0
      ? props.participantIds.slice(0, MAX_STANDARD_PLAYERS)
      : Array.from({ length: 8 }, (_, index) => `cog-${index + 1}`)

  return ids.map((id, index) => ({
    id,
    name: FALLBACK_NAMES[index] ?? `Player ${index + 1}`,
    isHuman: index === 0,
    avatar: AVATAR_TOKENS[index % AVATAR_TOKENS.length],
    precomputedScore: 50 - index * 2,
  }))
}

export function createChainOfGreedPlayers(
  participants: ChainOfGreedResolvedParticipant[],
  rng: () => number
): ChainOfGreedPlayerState[] {
  return participants.map((participant, index) => {
    const baseSkill = clamp((participant.precomputedScore || 50) / 100, 0.2, 0.95)
    // Every 4th player cycles through aggressive (+0.14) → safe (−0.07) → moderate-agg (+0.06) → moderate-safe (−0.13)
    const indexTier = index % 4
    const indexBonusMap: Record<number, number> = {
      0: 0.14, // aggressive
      1: -0.07, // cautious / safe
      2: 0.06, // moderate-aggressive
      3: -0.13, // moderate-safe
    }
    const indexBonus = indexBonusMap[indexTier] ?? 0
    const aggression = clamp(0.25 + baseSkill * 0.4 + rng() * 0.18 + indexBonus, 0.15, 0.9)
    const caution = clamp(0.95 - aggression + rng() * 0.14, 0.1, 0.9)
    return {
      ...participant,
      isEliminated: false,
      safetyAvailable: true,
      totalContribution: 0,
      roundContribution: 0,
      totalBanked: 0,
      roundBanked: 0,
      totalRecovered: 0,
      roundRecovered: 0,
      roundLost: 0,
      roundCorrectGuesses: 0,
      roundWrongGuesses: 0,
      roundBanks: 0,
      roundBusts: 0,
      totalCorrectGuesses: 0,
      totalWrongGuesses: 0,
      totalBanks: 0,
      totalBusts: 0,
      voteCount: 0,
      semifinalScore: 0,
      finalScore: 0,
      finalWrongGuesses: 0,
      finalCorrectGuesses: 0,
      finalBanks: 0,
      turnsTakenThisRound: 0,
      personality: {
        aggression,
        caution,
        volatility: clamp(0.15 + rng() * 0.55, 0.15, 0.75),
        social: clamp(rng(), 0.05, 0.95),
      },
      lastRoundPerformance: 0,
      latestMoment: null,
    }
  })
}

export function createInitialChainState(rng: () => number): ChainOfGreedChainState {
  const referenceNumber = randomInt(rng, 1, 100)
  return {
    step: 0,
    pot: 0,
    referenceNumber,
    recentNumbers: [referenceNumber],
    drawnNumbers: [referenceNumber],
  }
}

export function getStandardRoundEliminationCount(
  startingPlayers: number,
  roundNumber: number,
  remainingPlayers: number
) {
  if (remainingPlayers <= 2) return 0
  const base =
    startingPlayers >= 12
      ? roundNumber <= 3
        ? 2
        : 1
      : startingPlayers >= 9
        ? roundNumber <= 2
          ? 2
          : 1
        : 1
  return Math.min(base, remainingPlayers - 2)
}

export function getStandardRoundTurnCap(remainingPlayers: number) {
  return remainingPlayers * (remainingPlayers >= 12 ? 1 : 2)
}

function getRemainingNumberCounts(chain: ChainOfGreedChainState): number[] {
  const remainingCounts = Array.from({ length: 100 }, () => CHAIN_SHOE_COPIES_PER_NUMBER)
  for (const number of chain.drawnNumbers ?? chain.recentNumbers) {
    const index = number - 1
    if (index >= 0 && index < remainingCounts.length && remainingCounts[index]! > 0) {
      remainingCounts[index] = remainingCounts[index]! - 1
    }
  }
  return remainingCounts
}

export function getRemainingNumberCount(chain: ChainOfGreedChainState) {
  return getRemainingNumberCounts(chain).reduce((total, count) => total + count, 0)
}

export function drawNextNumber(chain: ChainOfGreedChainState, rng: () => number): number {
  const remainingCounts = getRemainingNumberCounts(chain)
  const remaining = remainingCounts.reduce((total, count) => total + count, 0)
  if (remaining === 0) return randomInt(rng, 1, 100)
  let cardIndex = randomInt(rng, 0, remaining - 1)
  for (let index = 0; index < remainingCounts.length; index += 1) {
    cardIndex -= remainingCounts[index]!
    if (cardIndex < 0) return index + 1
  }
  return randomInt(rng, 1, 100)
}

export function getNextNumberOdds(chain: ChainOfGreedChainState) {
  const remainingCounts = getRemainingNumberCounts(chain)
  const totals = remainingCounts.reduce(
    (result, count, index) => {
      const candidate = index + 1
      if (candidate < chain.referenceNumber) result.lower += count
      else if (candidate > chain.referenceNumber) result.higher += count
      else result.equal += count
      return result
    },
    { lower: 0, equal: 0, higher: 0 }
  )
  const denominator = Math.max(1, totals.lower + totals.equal + totals.higher)
  return {
    lower: totals.lower / denominator,
    equal: totals.equal / denominator,
    higher: totals.higher / denominator,
  }
}

export function resolveChainAction(
  choice: ChainAction,
  chain: ChainOfGreedChainState,
  rng: () => number,
  useSafety = false
): ChainActionResolution {
  if (choice === 'bank') {
    return {
      updatedChain: {
        ...chain,
        step: 0,
        pot: 0,
      },
      securedDelta: chain.pot,
      individualDelta: chain.pot,
      revealedNumber: null,
      wasCorrect: null,
      lostAmount: 0,
      recoveredDelta: 0,
      safetyUsed: false,
      equalMiss: false,
      busted: false,
      message:
        chain.pot > 0
          ? `Bank locks in ${chain.pot} influence. The reference number stays at ${chain.referenceNumber}.`
          : 'Bank resets the chain, but there was nothing to secure yet.',
    }
  }

  const revealedNumber = drawNextNumber(chain, rng)
  const wasCorrect =
    choice === 'higher'
      ? revealedNumber > chain.referenceNumber
      : choice === 'lower'
        ? revealedNumber < chain.referenceNumber
        : revealedNumber === chain.referenceNumber
  const equalMiss = revealedNumber === chain.referenceNumber

  if (wasCorrect) {
    const nextStep = Math.min(CHAIN_LADDER.length, chain.step + 1)
    const nextPot = CHAIN_LADDER[nextStep - 1] ?? CHAIN_LADDER[CHAIN_LADDER.length - 1]
    return {
      updatedChain: {
        step: nextStep,
        pot: nextPot,
        referenceNumber: revealedNumber,
        recentNumbers: [...chain.recentNumbers.slice(-5), revealedNumber],
        drawnNumbers: [...(chain.drawnNumbers ?? chain.recentNumbers), revealedNumber],
      },
      securedDelta: 0,
      individualDelta: 0,
      revealedNumber,
      wasCorrect: true,
      lostAmount: 0,
      recoveredDelta: 0,
      safetyUsed: useSafety && chain.pot > 0,
      equalMiss: false,
      busted: false,
      message: `Correct. The chain climbs to ${nextPot} influence.`,
    }
  }

  const safetyUsed = useSafety && chain.pot > 0
  const recoveredDelta = safetyUsed ? Math.floor(chain.pot / 2) : 0
  const lostAmount = Math.max(0, chain.pot - recoveredDelta)

  return {
    updatedChain: {
      step: 0,
      pot: 0,
      referenceNumber: revealedNumber,
      recentNumbers: [...chain.recentNumbers.slice(-5), revealedNumber],
      drawnNumbers: [...(chain.drawnNumbers ?? chain.recentNumbers), revealedNumber],
    },
    revealedNumber,
    wasCorrect: false,
    securedDelta: 0,
    individualDelta: recoveredDelta,
    lostAmount,
    recoveredDelta,
    safetyUsed,
    equalMiss,
    busted: chain.pot > 0,
    message: safetyUsed
      ? `${equalMiss ? 'Equal numbers count as a miss. ' : 'Wrong guess. '}Safety recovers ${recoveredDelta} influence; ${lostAmount} is lost.`
      : equalMiss
        ? `Equal numbers count as a miss unless you call Equal. ${chain.pot || 0} influence is gone.`
        : `Wrong guess. ${chain.pot || 0} influence is lost and the chain resets.`,
  }
}

export function resolvePawnedRoundBank(
  currentBank: number,
  pawnStake: number,
  wasCorrect: boolean,
  bankDelta = 0
) {
  const bankAfterPawn = wasCorrect ? currentBank + pawnStake : Math.max(0, currentBank - pawnStake)
  return bankAfterPawn + bankDelta
}

export function applyRoundReset(player: ChainOfGreedPlayerState): ChainOfGreedPlayerState {
  return {
    ...player,
    lastRoundPerformance:
      player.roundContribution - player.roundWrongGuesses * 20 - player.roundBusts * 35,
    roundContribution: 0,
    roundBanked: 0,
    roundRecovered: 0,
    roundLost: 0,
    roundCorrectGuesses: 0,
    roundWrongGuesses: 0,
    roundBanks: 0,
    roundBusts: 0,
    voteCount: 0,
    turnsTakenThisRound: 0,
    latestMoment: null,
  }
}

function performanceComparator(a: ChainOfGreedPlayerState, b: ChainOfGreedPlayerState) {
  // Most mistakes first (eliminated first: higher weighted mistakes = worse)
  const aMistakes = a.roundWrongGuesses + a.roundBusts * 2
  const bMistakes = b.roundWrongGuesses + b.roundBusts * 2
  if (aMistakes !== bMistakes) return bMistakes - aMistakes
  // Least banked contribution
  if (a.roundContribution !== b.roundContribution) return a.roundContribution - b.roundContribution
  // Worse efficiency: fewer correct guesses
  if (a.roundCorrectGuesses !== b.roundCorrectGuesses)
    return a.roundCorrectGuesses - b.roundCorrectGuesses
  // Lower total contribution
  if (a.totalContribution !== b.totalContribution) return a.totalContribution - b.totalContribution
  return 0
}

export function decideAiAction(options: {
  player: ChainOfGreedPlayerState
  chain: ChainOfGreedChainState
  remainingTurns: number
  phase: 'standard' | 'semifinal' | 'final'
  activePlayers: ChainOfGreedPlayerState[]
  playerScore?: number
  bankAvailable?: boolean
}): ChainAction {
  const {
    player,
    chain,
    remainingTurns,
    phase,
    activePlayers,
    playerScore = 0,
    bankAvailable = true,
  } = options
  const livePlayers = activePlayers.filter((entry) => !entry.isEliminated)
  const bestContribution = Math.max(
    1,
    ...livePlayers.map((entry) => entry.roundContribution ?? entry.totalContribution ?? 0)
  )
  const standings = [...livePlayers].sort((left, right) => {
    const leftScore =
      phase === 'standard'
        ? (left.roundContribution ?? left.totalContribution ?? 0)
        : left.id === player.id
          ? playerScore
          : phase === 'semifinal'
            ? left.semifinalScore
            : left.finalScore
    const rightScore =
      phase === 'standard'
        ? (right.roundContribution ?? right.totalContribution ?? 0)
        : right.id === player.id
          ? playerScore
          : phase === 'semifinal'
            ? right.semifinalScore
            : right.finalScore
    return rightScore - leftScore
  })
  const standingIndex = Math.max(
    0,
    standings.findIndex((entry) => entry.id === player.id)
  )
  const pressureFromStanding = standings.length > 1 ? standingIndex / (standings.length - 1) : 0
  const dangerLevel = clamp(
    0.28 +
      (bestContribution - (player.roundContribution ?? player.totalContribution ?? 0)) /
        (bestContribution + 1) +
      player.roundWrongGuesses * 0.08 +
      player.roundBusts * 0.15,
    0,
    1.3
  )
  const potPressure = chain.pot / CHAIN_LADDER[CHAIN_LADDER.length - 1]
  const stepPressure = chain.step / CHAIN_LADDER.length
  const middleReferenceRisk =
    chain.referenceNumber > 28 && chain.referenceNumber < 72 ? 0.07 : -0.04
  const meaningfulPot = chain.pot >= CHAIN_LADDER[1]
  // Deep chains (5+) naturally invite pushing unless the player is safely ahead.
  const deepChainBias = chain.step >= 5 && pressureFromStanding >= 0.4 ? -0.06 : 0
  const comebackDrive = clamp(
    pressureFromStanding * 0.75 +
      (phase === 'standard'
        ? Math.max(0, 0.22 - player.roundContribution / 600)
        : Math.max(0, -playerScore / 220)) +
      (remainingTurns <= 2 ? 0.2 : 0),
    0,
    1
  )
  const safetyBias = clamp(
    player.personality.caution * 0.56 +
      potPressure * 0.48 +
      stepPressure * 0.24 +
      middleReferenceRisk +
      (pressureFromStanding < 0.3 ? 0.16 : 0),
    0,
    1.35
  )
  const lateRoundBankPressure = phase === 'standard' && remainingTurns <= 2 ? 0.18 : 0
  const bankUrgency =
    phase === 'standard'
      ? 0.12 +
        safetyBias +
        dangerLevel * 0.14 +
        lateRoundBankPressure -
        comebackDrive * 0.3 +
        deepChainBias
      : 0.16 +
        player.personality.caution * 0.28 +
        potPressure * 0.52 +
        stepPressure * 0.38 +
        (remainingTurns <= 1 ? 0.46 : 0) -
        comebackDrive * 0.24

  if (bankAvailable && chain.pot > 0) {
    const cautiousBank = player.personality.caution >= 0.68 && meaningfulPot && bankUrgency >= 0.6
    const balancedBank =
      player.personality.caution >= 0.42 &&
      player.personality.aggression < 0.7 &&
      chain.pot >= CHAIN_LADDER[2] &&
      bankUrgency >= 0.66
    const aggressiveBank = chain.pot >= CHAIN_LADDER[4] && bankUrgency >= 0.75
    const lateRoundBank =
      phase === 'standard' && remainingTurns <= 2 && meaningfulPot && bankUrgency >= 0.58
    if (cautiousBank || balancedBank || aggressiveBank || lateRoundBank) return 'bank'
    if (phase !== 'standard' && playerScore <= 0 && remainingTurns <= 1) return 'bank'
  }

  const odds = getNextNumberOdds(chain)
  const volatilitySwing = (player.personality.volatility - 0.5) * 0.18
  const pressureBias = comebackDrive * 0.2 - safetyBias * 0.07
  const bias =
    player.personality.aggression -
    player.personality.caution * 0.2 +
    volatilitySwing +
    pressureBias
  const higherScore = odds.higher + bias
  const lowerScore = odds.lower - bias
  if (odds.equal > Math.max(higherScore, lowerScore)) return 'equal'
  return higherScore >= lowerScore ? 'higher' : 'lower'
}

export interface SoloRushAiMove {
  choice: ChainAction
  pawnStake: number
}

/** Makes Solo Rush rivals use the visible shoe odds and wager their bank selectively. */
export function decideSoloRushMove(
  player: ChainOfGreedPlayerState,
  chain: ChainOfGreedChainState,
  roundBank: number,
  bankAvailable: boolean,
  secondsRemaining: number
): SoloRushAiMove {
  const odds = getNextNumberOdds(chain)
  const options: Array<{ choice: ChainAction; probability: number }> = [
    { choice: 'lower', probability: odds.lower },
    { choice: 'equal', probability: odds.equal },
    { choice: 'higher', probability: odds.higher },
  ]
  const tieBreak = player.personality.aggression - player.personality.caution * 0.25
  options.sort((a, b) => {
    const probabilityDifference = b.probability - a.probability
    if (Math.abs(probabilityDifference) > 0.015) return probabilityDifference
    const aPreference = a.choice === 'higher' ? tieBreak : a.choice === 'lower' ? -tieBreak : 0
    const bPreference = b.choice === 'higher' ? tieBreak : b.choice === 'lower' ? -tieBreak : 0
    return bPreference - aPreference
  })
  const best = options[0]!
  const nextStep = Math.min(CHAIN_LADDER.length, chain.step + 1)
  const nextPot = CHAIN_LADDER[nextStep - 1] ?? CHAIN_LADDER[CHAIN_LADDER.length - 1]
  const continuationValue = best.probability * nextPot
  const bankValue = chain.pot * (1.02 + player.personality.caution * 0.12)
  const lastChanceToBank = secondsRemaining <= 3 && bankAvailable && chain.pot > 0

  if (
    bankAvailable &&
    chain.pot > 0 &&
    (lastChanceToBank || (chain.pot >= CHAIN_LADDER[1] && bankValue >= continuationValue))
  ) {
    return { choice: 'bank', pawnStake: 0 }
  }

  const pawnThreshold = clamp(
    0.58 + player.personality.caution * 0.15 - player.personality.aggression * 0.1,
    0.45,
    0.78
  )
  const pawnStake = roundBank > 0 && best.probability >= pawnThreshold ? roundBank : 0
  return { choice: best.choice, pawnStake }
}

export function shouldAiUseSafety(
  player: ChainOfGreedPlayerState,
  chain: ChainOfGreedChainState,
  choice: ChainAction
) {
  if (!player.safetyAvailable || chain.pot <= 0 || choice === 'bank') return false
  const odds = getNextNumberOdds(chain)
  const missChance = 1 - odds[choice]
  const stakePressure = chain.pot / CHAIN_LADDER[CHAIN_LADDER.length - 1]
  const depthPressure = chain.step / CHAIN_LADDER.length
  const caution = player.personality.caution * 0.22
  const aggression = player.personality.aggression * 0.12
  return (
    missChance * 0.52 + stakePressure * 0.34 + depthPressure * 0.18 + caution - aggression >= 0.55
  )
}

function buildVoteReason(target: ChainOfGreedPlayerState) {
  if (target.roundBusts > 0)
    return `Lost ${target.roundLost.toLocaleString()} influence on ${target.roundBusts} broken chain${target.roundBusts === 1 ? '' : 's'}.`
  if (target.roundWrongGuesses > target.roundCorrectGuesses)
    return `${target.roundWrongGuesses} misses against ${target.roundCorrectGuesses} correct calls.`
  if (target.roundContribution <= 0) return 'No influence banked or recovered this round.'
  if (target.roundContribution >= 400)
    return `Led the round with ${target.roundContribution.toLocaleString()} influence earned.`
  return `Earned ${target.roundContribution.toLocaleString()} influence, with ${target.roundCorrectGuesses} correct call${target.roundCorrectGuesses === 1 ? '' : 's'}.`
}

function duelGuess(
  referenceNumber: number,
  player: ChainOfGreedPlayerState,
  rng: () => number
): 'higher' | 'lower' {
  const pullHigher =
    (100 - referenceNumber) / 100 + player.personality.aggression * 0.08 + rng() * 0.1
  const pullLower = referenceNumber / 100 + player.personality.caution * 0.08 + rng() * 0.1
  return pullHigher >= pullLower ? 'higher' : 'lower'
}

function resolveSuddenDeathDuel(
  contenders: ChainOfGreedPlayerState[],
  rng: () => number
): { orderedIds: string[]; transcript: string[] } {
  const transcript: string[] = ['Tie-break duel begins. One wrong guess ends it.']
  let remaining = [...contenders]
  let duelChain = createInitialChainState(rng)
  let reference = duelChain.referenceNumber

  while (remaining.length > 1) {
    const survivors: ChainOfGreedPlayerState[] = []
    for (const contender of remaining) {
      const guess = duelGuess(reference, contender, rng)
      const revealed = drawNextNumber(duelChain, rng)
      const correct = guess === 'higher' ? revealed > reference : revealed < reference
      transcript.push(
        `${contender.name} called ${guess} on ${reference} → ${revealed}${correct ? ' and survives.' : ' and misses.'}`
      )
      if (correct) {
        survivors.push(contender)
      }
      reference = revealed
      duelChain = {
        ...duelChain,
        referenceNumber: revealed,
        recentNumbers: [...duelChain.recentNumbers, revealed],
        drawnNumbers: [...(duelChain.drawnNumbers ?? duelChain.recentNumbers), revealed],
      }
    }
    if (survivors.length === 0) {
      const fallback = remaining[Math.floor(rng() * remaining.length)]!
      transcript.push(`${fallback.name} survives the deadlock after the board stays brutal.`)
      survivors.push(fallback)
    }
    remaining = survivors
  }

  const winnerId = remaining[0]!.id
  return {
    orderedIds: [
      winnerId,
      ...contenders
        .filter((contender) => contender.id !== winnerId)
        .map((contender) => contender.id),
    ],
    transcript,
  }
}

export function buildAiVoteRecords(options: {
  activePlayers: ChainOfGreedPlayerState[]
  roundNumber: number
  seed: number
  humanVoteTargetId?: string | null
  strategicContext?: MinigameStrategicContext
}): ChainOfGreedVoteRecord[] {
  const { activePlayers, roundNumber, seed, humanVoteTargetId, strategicContext = {} } = options
  const votes: ChainOfGreedVoteRecord[] = []

  for (const voter of activePlayers) {
    if (voter.isEliminated) continue
    if (voter.isHuman) {
      if (humanVoteTargetId) {
        const target = activePlayers.find((entry) => entry.id === humanVoteTargetId)
        if (target) {
          votes.push({
            voterId: voter.id,
            voterName: voter.name,
            targetId: target.id,
            targetName: target.name,
            reason: buildVoteReason(target),
          })
        }
      }
      continue
    }

    let bestTarget: ChainOfGreedPlayerState | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    for (const candidate of activePlayers) {
      if (candidate.id === voter.id || candidate.isEliminated) continue
      const priority = getMinigameTargetPriority(strategicContext, voter.id, candidate.id)
      const poorPerformance =
        candidate.roundWrongGuesses * 0.9 +
        candidate.roundBusts * 1.4 +
        Math.max(0, 120 - candidate.roundContribution) / 120
      const weakness =
        Math.max(0, 160 - candidate.roundContribution) / 160 + candidate.roundBanks * 0.08
      const recentMistake =
        candidate.latestMoment === 'bust' || candidate.latestMoment === 'wrong' ? 1 : 0
      const threat =
        candidate.totalContribution > voter.totalContribution
          ? candidate.totalContribution / 500
          : 0
      const performance = Math.min(
        18,
        poorPerformance * 0.4 + weakness * 0.25 + recentMistake * 3 + Math.min(10, threat * 0.4)
      )
      const score =
        priority +
        performance +
        createPairRng(seed + roundNumber * 97, voter.id, candidate.id)() * 2
      if (score > bestScore) {
        bestScore = score
        bestTarget = candidate
      }
    }

    if (bestTarget) {
      votes.push({
        voterId: voter.id,
        voterName: voter.name,
        targetId: bestTarget.id,
        targetName: bestTarget.name,
        reason: buildVoteReason(bestTarget),
      })
    }
  }

  return votes
}

export function resolveVoteElimination(options: {
  activePlayers: ChainOfGreedPlayerState[]
  votes: ChainOfGreedVoteRecord[]
  eliminateCount: number
  rng: () => number
}): {
  eliminatedIds: string[]
  updatedPlayers: ChainOfGreedPlayerState[]
  tieBreaks: ChainOfGreedTieBreakInfo[]
} {
  const { activePlayers, votes, eliminateCount, rng } = options
  const tally = new Map<string, number>()
  for (const vote of votes) {
    tally.set(vote.targetId, (tally.get(vote.targetId) ?? 0) + 1)
  }

  const tieBreaks: ChainOfGreedTieBreakInfo[] = []
  const candidates = [...activePlayers]
    .filter((player) => !player.isEliminated)
    .map((player) => ({ ...player, voteCount: tally.get(player.id) ?? 0 }))

  candidates.sort((left, right) => {
    if (right.voteCount !== left.voteCount) return right.voteCount - left.voteCount
    return performanceComparator(left, right)
  })

  if (eliminateCount <= 0) {
    return { eliminatedIds: [], updatedPlayers: activePlayers, tieBreaks }
  }

  const ordered: ChainOfGreedPlayerState[] = []
  let index = 0
  while (index < candidates.length) {
    const sameVoteCount = candidates[index]!.voteCount
    const sameVote = candidates.filter((candidate) => candidate.voteCount === sameVoteCount)
    const affectsElimination =
      ordered.length < eliminateCount && ordered.length + sameVote.length > eliminateCount
    const decisivelyEliminated = ordered.length + sameVote.length <= eliminateCount
    if (sameVote.length === 1) {
      ordered.push(candidates[index]!)
      index += 1
      continue
    }

    if (decisivelyEliminated || !affectsElimination) {
      ordered.push(...sameVote)
      index += sameVote.length
      continue
    }

    const unresolved = [...sameVote].sort((left, right) => performanceComparator(left, right))
    const equalStats = unresolved.every(
      (candidate, candidateIndex, array) =>
        candidateIndex === 0 || performanceComparator(array[candidateIndex - 1]!, candidate) === 0
    )
    if (!equalStats) {
      tieBreaks.push({
        type: 'stats',
        message: 'Tie detected. The weaker record decides it.',
        transcript: unresolved.map(
          (candidate) =>
            `${candidate.name}: contribution ${candidate.roundContribution}, correct ${candidate.roundCorrectGuesses}, banks ${candidate.roundBanks}, busts ${candidate.roundBusts}`
        ),
      })
      ordered.push(...unresolved)
    } else {
      const duel = resolveSuddenDeathDuel(unresolved, rng)
      tieBreaks.push({
        type: 'duel',
        message: 'Tie-break duel begins.',
        transcript: duel.transcript,
      })
      // Sudden death returns best-to-worst, but elimination needs worst-first.
      ordered.push(
        ...duel.orderedIds
          .map((id) => unresolved.find((candidate) => candidate.id === id)!)
          .filter(Boolean)
          .reverse()
      )
    }
    index += sameVote.length
  }

  const eliminatedIds = ordered.slice(0, eliminateCount).map((candidate) => candidate.id)
  const updatedPlayers = activePlayers.map((player) =>
    eliminatedIds.includes(player.id) ? { ...player, isEliminated: true } : player
  )

  return { eliminatedIds, updatedPlayers, tieBreaks }
}

export function summarizeRound(activePlayers: ChainOfGreedPlayerState[]) {
  const rankedByContribution = [...activePlayers].sort(
    (left, right) => right.roundContribution - left.roundContribution
  )
  const rankedByMistakes = [...activePlayers].sort((left, right) => {
    const leftPenalty = left.roundBusts * 3 + left.roundWrongGuesses
    const rightPenalty = right.roundBusts * 3 + right.roundWrongGuesses
    return rightPenalty - leftPenalty
  })
  const bestContributors = rankedByContribution.slice(0, 3)
  const worstContributors = rankedByMistakes.slice(0, 3)
  const mostCorrect =
    [...activePlayers].sort(
      (left, right) => right.roundCorrectGuesses - left.roundCorrectGuesses
    )[0] ?? null
  const biggestBuster =
    [...activePlayers].sort((left, right) => right.roundBusts - left.roundBusts)[0] ?? null
  return {
    bestContributors,
    worstContributors,
    mostCorrect,
    biggestBuster,
  }
}

export function rankPlayersByScore(
  scores: Record<string, number>,
  players: ChainOfGreedPlayerState[],
  rng: () => number
) {
  const contenders = players.filter((player) => !player.isEliminated)
  const sorted = [...contenders].sort(
    (left, right) => (scores[right.id] ?? 0) - (scores[left.id] ?? 0)
  )
  const topScore = scores[sorted[0]?.id ?? ''] ?? 0
  const tied = sorted.filter((player) => (scores[player.id] ?? 0) === topScore)
  if (tied.length <= 1)
    return { ordered: sorted, tieBreak: null as ChainOfGreedTieBreakInfo | null }
  const duel = resolveSuddenDeathDuel(tied, rng)
  const ordered = [
    ...duel.orderedIds.map((id) => sorted.find((player) => player.id === id)!).filter(Boolean),
    ...sorted.filter((player) => !duel.orderedIds.includes(player.id)),
  ]
  return {
    ordered,
    tieBreak: {
      type: 'duel' as const,
      message: 'Scores were tied, so sudden death decided it.',
      transcript: duel.transcript,
    },
  }
}

export function rankSoloRushPlayers(
  scores: Record<string, number>,
  players: ChainOfGreedPlayerState[],
  roundNumber = 1,
  immuneIds: string[] = []
) {
  const immune = new Set(immuneIds)
  const roundPlayers = players.filter((player) => Object.hasOwn(scores, player.id))
  const ordered = [...roundPlayers].sort((left, right) => {
    const bankDelta = (scores[right.id] ?? 0) - (scores[left.id] ?? 0)
    if (bankDelta !== 0) return bankDelta
    const correctDelta = right.finalCorrectGuesses - left.finalCorrectGuesses
    if (correctDelta !== 0) return correctDelta
    return left.finalWrongGuesses - right.finalWrongGuesses
  })
  if (roundNumber === 3) {
    const safeCount = Math.max(2, immune.size)
    const advancing = new Set([
      ...immune,
      ...ordered
        .filter((player) => !immune.has(player.id))
        .slice(0, Math.max(0, safeCount - immune.size))
        .map((player) => player.id),
    ])
    return {
      ordered,
      eliminatedIds: ordered
        .filter((player) => !advancing.has(player.id))
        .map((player) => player.id),
    }
  }

  if (roundNumber === 4 && immune.size > 0) {
    return {
      ordered,
      eliminatedIds: ordered.filter((player) => !immune.has(player.id)).map((player) => player.id),
    }
  }

  const eligible = ordered.filter((player) => !immune.has(player.id))
  if (eligible.length === 0) return { ordered, eliminatedIds: [] as string[] }

  const lowestBank = eligible.at(-1)
  if (!lowestBank) return { ordered, eliminatedIds: [] as string[] }

  const lowestBankScore = scores[lowestBank.id] ?? 0
  const tiedForLowestBank = eligible.filter(
    (player) => (scores[player.id] ?? 0) === lowestBankScore
  )
  const fewestCorrect = Math.min(...tiedForLowestBank.map((player) => player.finalCorrectGuesses))
  const tiedForFewestCorrect = tiedForLowestBank.filter(
    (player) => player.finalCorrectGuesses === fewestCorrect
  )
  const mostMistakes = Math.max(...tiedForFewestCorrect.map((player) => player.finalWrongGuesses))
  const eliminatedIds = tiedForFewestCorrect
    .filter((player) => player.finalWrongGuesses === mostMistakes)
    .map((player) => player.id)

  return { ordered, eliminatedIds }
}

export function rankFinalPlayersByScore(
  scores: Record<string, number>,
  players: ChainOfGreedPlayerState[],
  rng: () => number
) {
  const contenders = players.filter((player) => !player.isEliminated)
  const compareFinalists = (left: ChainOfGreedPlayerState, right: ChainOfGreedPlayerState) => {
    const scoreDelta = (scores[right.id] ?? 0) - (scores[left.id] ?? 0)
    if (scoreDelta !== 0) return scoreDelta
    const mistakeDelta = left.finalWrongGuesses - right.finalWrongGuesses
    if (mistakeDelta !== 0) return mistakeDelta
    return left.finalBanks - right.finalBanks
  }
  const sorted = [...contenders].sort(compareFinalists)
  const top = sorted[0]
  if (!top) return { ordered: sorted, tieBreak: null as ChainOfGreedTieBreakInfo | null }

  const scoreTied = sorted.filter((player) => (scores[player.id] ?? 0) === (scores[top.id] ?? 0))
  if (scoreTied.length <= 1)
    return { ordered: sorted, tieBreak: null as ChainOfGreedTieBreakInfo | null }

  const statBest = scoreTied[0]!
  const fullyTied = scoreTied.filter(
    (player) =>
      player.finalWrongGuesses === statBest.finalWrongGuesses &&
      player.finalBanks === statBest.finalBanks
  )
  if (fullyTied.length <= 1) {
    return {
      ordered: sorted,
      tieBreak: {
        type: 'stats' as const,
        message: 'Final score tied. Fewer mistakes, then fewer banks decided the LOH.',
        transcript: scoreTied.map(
          (player) =>
            `${player.name}: score ${scores[player.id] ?? 0}, mistakes ${player.finalWrongGuesses}, banks ${player.finalBanks}`
        ),
      },
    }
  }

  const duel = resolveSuddenDeathDuel(fullyTied, rng)
  const duelOrderedIds = duel.orderedIds
  const ordered = [
    ...duelOrderedIds.map((id) => sorted.find((player) => player.id === id)!).filter(Boolean),
    ...sorted.filter((player) => !duelOrderedIds.includes(player.id)),
  ]
  return {
    ordered,
    tieBreak: {
      type: 'duel' as const,
      message: 'Final score, mistakes, and banks were tied; sudden death decided the LOH.',
      transcript: [
        ...fullyTied.map(
          (player) =>
            `${player.name}: score ${scores[player.id] ?? 0}, mistakes ${player.finalWrongGuesses}, banks ${player.finalBanks}`
        ),
        ...duel.transcript,
      ],
    },
  }
}

export function formatInfluence(value: number) {
  return `${value.toLocaleString()} Influence`
}

export function buildFinalRawResults(
  players: ChainOfGreedPlayerState[],
  winnerId: string,
  securedTotal: number
) {
  return Object.fromEntries(
    players.map((player) => [player.id, player.id === winnerId ? securedTotal : 0])
  )
}
