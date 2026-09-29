import { mulberry32 } from '../../store/rng'

export type WordDifficulty = 1 | 2 | 3 | 4 | 5
export type RevealKind = 'vowel' | 'consonant'

export interface WordEntry {
  text: string
  category: string
  difficulty: WordDifficulty
  parSeconds: number
  hints: [string, string, string]
  finalEligible?: boolean
}

export interface ScoreLineItem {
  label: string
  value: number
}

export interface RoundScoreBreakdown {
  solved: boolean
  budgetScore: number
  pressurePenalty: number
  bonuses: ScoreLineItem[]
  roundScore: number
  cumulativeDelta: number
}

export interface RoundResult {
  participantId: string
  participantName: string
  solved: boolean
  budgetRemaining: number
  wrongGuesses: number
  elapsedSeconds: number
  hintsUsed: number
  revealedRatio: number
  roundScore: number
  cumulativeBefore: number
  cumulativeAfter: number
}

export interface AiRoundResult {
  result: RoundResult
  revealedPositions: number[]
  purchases: Array<{ kind: RevealKind | 'hint'; cost: number }>
}

export const STARTING_BUDGET = 100
export const BUDGET_CAP = 110
export const SURVIVAL_BONUS = 10
export const VOWEL_COST = 4
export const CONSONANT_COST = 6
export const HINT_COSTS = [5, 6, 7] as const
export const MAX_WRONG_GUESSES = 10
export const FAILURE_PENALTY = -25
export const MAX_QUALIFYING_ROUNDS = 6
export const ROUND_TIME_LIMIT_SECONDS = 95

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

const WORD_BANK: WordEntry[] = [
  {
    text: 'alliance',
    category: 'social',
    difficulty: 1,
    parSeconds: 34,
    hints: [
      'A relationship that can make the game safer.',
      'It is built when contestants agree to protect or support one another.',
      'A strategic group held together by trust, promises, or common targets.',
    ],
  },
  {
    text: 'target',
    category: 'strategy',
    difficulty: 1,
    parSeconds: 30,
    hints: [
      'Nobody wants to become this too early.',
      'Strategy conversations often decide who carries this label.',
      'The contestant a player or alliance most wants removed.',
    ],
  },
  {
    text: 'warning',
    category: 'pressure',
    difficulty: 1,
    parSeconds: 32,
    hints: [
      'It tells you that danger may be getting closer.',
      'It can appear before a consequence becomes unavoidable.',
      'A signal that something risky or damaging may happen next.',
    ],
  },
  {
    text: 'verdict',
    category: 'authority',
    difficulty: 1,
    parSeconds: 32,
    hints: [
      'It comes after a decision has been considered.',
      'It communicates a final judgment.',
      'The conclusion delivered after evidence, debate, or review.',
    ],
  },
  {
    text: 'betrayal',
    category: 'social',
    difficulty: 2,
    parSeconds: 38,
    hints: [
      'Trust usually exists before this happens.',
      'It can destroy an alliance in a single move.',
      'A player turns against someone who believed they were loyal.',
    ],
  },
  {
    text: 'campaign',
    category: 'strategy',
    difficulty: 2,
    parSeconds: 38,
    hints: [
      'It involves persuasion rather than direct power.',
      'A player may do this when their safety depends on other people.',
      'The social effort to gather support for a desired vote or outcome.',
    ],
  },
  {
    text: 'challenge',
    category: 'competition',
    difficulty: 2,
    parSeconds: 36,
    hints: [
      'Performance matters here.',
      'It can grant power, safety, or an advantage.',
      'A competition contestants play to earn a result in the game.',
    ],
  },
  {
    text: 'coalition',
    category: 'social',
    difficulty: 2,
    parSeconds: 40,
    hints: [
      'It is larger than a simple one-to-one agreement.',
      'Different players can cooperate without fully trusting each other.',
      'A temporary bloc formed to create enough influence for a shared goal.',
    ],
  },
  {
    text: 'confession',
    category: 'social',
    difficulty: 2,
    parSeconds: 42,
    hints: [
      'Something private becomes spoken.',
      'It can reveal feelings, motives, or responsibility.',
      'An admission that exposes information the speaker had kept inside.',
    ],
  },
  {
    text: 'showdown',
    category: 'competition',
    difficulty: 2,
    parSeconds: 38,
    hints: [
      'It usually happens when tension has narrowed to only a few people.',
      'Two sides face each other directly.',
      'A decisive head-to-head confrontation.',
    ],
  },
  {
    text: 'tribunal',
    category: 'authority',
    difficulty: 2,
    parSeconds: 40,
    hints: [
      'Judgment is central to this setting.',
      'People may have to answer questions or defend themselves here.',
      'A formal body or proceeding that examines a case and reaches a decision.',
    ],
  },
  {
    text: 'nomination',
    category: 'game',
    difficulty: 3,
    parSeconds: 42,
    hints: [
      'Something most contestants would rather not receive.',
      'It is assigned during one of the game\'s formal ceremonies.',
      'The Leader of House uses their power to place contestants in danger.',
    ],
  },
  {
    text: 'elimination',
    category: 'game',
    difficulty: 3,
    parSeconds: 42,
    hints: [
      'It ends somebody\'s current run.',
      'The game field becomes smaller after this happens.',
      'A contestant is removed from the competition.',
    ],
  },
  {
    text: 'immunity',
    category: 'safety',
    difficulty: 3,
    parSeconds: 40,
    hints: [
      'It makes danger less immediate.',
      'A protected contestant cannot be affected by a specified threat.',
      'Temporary protection from nomination, elimination, or another game consequence.',
    ],
  },
  {
    text: 'influence',
    category: 'social',
    difficulty: 3,
    parSeconds: 42,
    hints: [
      'You can have it without holding an official title.',
      'Other people change their choices because of it.',
      'The ability to shape decisions, votes, or behaviour.',
    ],
  },
  {
    text: 'interrogation',
    category: 'pressure',
    difficulty: 3,
    parSeconds: 48,
    hints: [
      'Answers matter more than comfort here.',
      'Pressure is applied through repeated questioning.',
      'An intense process of questioning someone to uncover information or inconsistencies.',
    ],
  },
  {
    text: 'deflection',
    category: 'strategy',
    difficulty: 3,
    parSeconds: 44,
    hints: [
      'Attention moves away from where it was pointing.',
      'It can be used when blame or suspicion becomes dangerous.',
      'A strategy that redirects focus from yourself toward another subject or person.',
    ],
  },
  {
    text: 'maneuver',
    category: 'strategy',
    difficulty: 3,
    parSeconds: 40,
    hints: [
      'It is deliberate rather than accidental.',
      'A player uses one to improve their position without necessarily being obvious.',
      'A calculated strategic move designed to create an advantage.',
    ],
  },
  {
    text: 'danger zone',
    category: 'safety',
    difficulty: 3,
    parSeconds: 46,
    hints: [
      'You would rather be outside it.',
      'The phrase describes a position where the risk level is high.',
      'A part of the ranking or game state associated with immediate danger.',
    ],
  },
  {
    text: 'breaking point',
    category: 'pressure',
    difficulty: 3,
    parSeconds: 48,
    hints: [
      'Pressure has been building before this arrives.',
      'After this moment, maintaining control becomes difficult.',
      'The threshold where strain becomes too much to contain.',
    ],
  },
  {
    text: 'observer room',
    category: 'game',
    difficulty: 4,
    parSeconds: 52,
    hints: [
      'The people here are watching rather than participating directly.',
      'Information can be gathered here without entering the action.',
      'A dedicated place from which events or contestants are monitored.',
    ],
  },
  {
    text: 'power of safety',
    category: 'safety',
    difficulty: 4,
    parSeconds: 56,
    hints: [
      'Its purpose is protection.',
      'Winning or holding it can change who remains vulnerable.',
      'A named game power that can protect a contestant from danger.',
    ],
  },
  {
    text: 'public meter',
    category: 'public',
    difficulty: 4,
    parSeconds: 50,
    hints: [
      'The audience affects what this displays.',
      'It rises and falls as viewers react to contestants.',
      'A visible measure of public approval or sentiment.',
    ],
  },
  {
    text: 'secret deal',
    category: 'strategy',
    difficulty: 4,
    parSeconds: 48,
    hints: [
      'Its value depends partly on other people not knowing about it.',
      'Two or more players privately agree on an exchange or future action.',
      'A hidden agreement involving protection, votes, information, or cooperation.',
    ],
  },
  {
    text: 'silent vote',
    category: 'game',
    difficulty: 4,
    parSeconds: 48,
    hints: [
      'The choice is made without publicly announcing it first.',
      'Every participant can affect the outcome while keeping their decision private.',
      'A ballot or elimination decision cast secretly.',
    ],
  },
  {
    text: 'turning point',
    category: 'game',
    difficulty: 4,
    parSeconds: 48,
    hints: [
      'The direction before and after this moment is noticeably different.',
      'Momentum changes here.',
      'A decisive event that alters the course of the game.',
    ],
  },
  {
    text: 'inner circle',
    category: 'social',
    difficulty: 4,
    parSeconds: 50,
    hints: [
      'Not everybody is trusted enough to be included.',
      'It is smaller and more trusted than the wider alliance network.',
      'The closest group of allies or confidants around a player.',
    ],
  },
  {
    text: 'social game',
    category: 'social',
    difficulty: 4,
    parSeconds: 48,
    hints: [
      'Winning competitions is not the main skill being described.',
      'Relationships, trust, persuasion, and reputation all contribute to it.',
      'The part of strategy built around managing people and interpersonal connections.',
    ],
  },
  {
    text: 'eviction night',
    category: 'game',
    difficulty: 5,
    parSeconds: 58,
    finalEligible: true,
    hints: [
      'Someone\'s place in the house is at risk.',
      'Votes and nominations reach their consequence during this event.',
      'The ceremony or episode in which a contestant is removed from the house.',
    ],
  },
  {
    text: 'leader of house',
    category: 'authority',
    difficulty: 5,
    parSeconds: 60,
    finalEligible: true,
    hints: [
      'The title grants temporary authority.',
      'This player influences danger for the current cycle.',
      'The weekly power-holder who makes nominations and leads the house.',
    ],
  },
  {
    text: 'exposure night',
    category: 'event',
    difficulty: 5,
    parSeconds: 60,
    finalEligible: true,
    hints: [
      'Hidden information becomes dangerous here.',
      'Secrets or contradictions may be brought into the open.',
      'A dramatic event built around revealing concealed actions or information.',
    ],
  },
  {
    text: 'pressure zone',
    category: 'pressure',
    difficulty: 5,
    parSeconds: 54,
    finalEligible: true,
    hints: [
      'Comfort is not associated with this place.',
      'Mistakes feel more consequential while you are in it.',
      'A game state or area defined by elevated risk and stress.',
    ],
  },
  {
    text: 'final call',
    category: 'authority',
    difficulty: 5,
    parSeconds: 50,
    finalEligible: true,
    hints: [
      'There is little room to change the outcome after this.',
      'It comes at the end of deliberation.',
      'The last decision or judgment before an outcome becomes official.',
    ],
  },
  {
    text: 'recruitment',
    category: 'social',
    difficulty: 5,
    parSeconds: 52,
    finalEligible: true,
    hints: [
      'The group is trying to become larger.',
      'A player is persuaded to join an existing plan or alliance.',
      'The act of bringing a new person into a group, coalition, or strategy.',
    ],
  },
  {
    text: 'ultimatum',
    category: 'authority',
    difficulty: 5,
    parSeconds: 52,
    finalEligible: true,
    hints: [
      'It leaves very little room for compromise.',
      'One side presents a final demand with a consequence attached.',
      'A take-it-or-leave-it demand backed by a threatened outcome.',
    ],
  },
  {
    text: 'social outcast',
    category: 'social',
    difficulty: 5,
    parSeconds: 58,
    finalEligible: true,
    hints: [
      'Belonging is the problem.',
      'The person is isolated from the group rather than integrated into it.',
      'A contestant pushed to the edge of the house\'s social network.',
    ],
  },
  {
    text: 'double elimination',
    category: 'event',
    difficulty: 5,
    parSeconds: 62,
    finalEligible: true,
    hints: [
      'The night removes more people than usual.',
      'Two departures are compressed into one game cycle or event.',
      'An accelerated event where two contestants are eliminated instead of one.',
    ],
  },
  {
    text: 'replacement nominee',
    category: 'game',
    difficulty: 5,
    parSeconds: 64,
    finalEligible: true,
    hints: [
      'This role exists because an earlier nomination changed.',
      'A protected or removed nominee can create the need for this person.',
      'The contestant placed in danger after an original nominee comes off the block.',
    ],
  },
  {
    text: 'public favorite',
    category: 'public',
    difficulty: 5,
    parSeconds: 56,
    finalEligible: true,
    hints: [
      'The house does not decide this status by itself.',
      'Viewer affection can protect or reward the contestant who holds it.',
      'The contestant currently receiving the strongest audience support.',
    ],
  },
  {
    text: 'secret mission',
    category: 'event',
    difficulty: 5,
    parSeconds: 56,
    finalEligible: true,
    hints: [
      'Success depends partly on keeping the objective hidden.',
      'A contestant receives a private task with a reward or consequence.',
      'A covert assignment that must be completed without exposing its purpose.',
    ],
  },
]

export function normalizeWord(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function normalizeGuess(text: string): string {
  return normalizeWord(text).replace(/[^A-Z ]/g, '')
}

export function isLetter(char: string): boolean {
  return /^[A-Z]$/i.test(char)
}

export function isVowel(char: string): boolean {
  return VOWELS.has(char.toUpperCase())
}

export function getWordBank(): WordEntry[] {
  return WORD_BANK
}

export function getSolutionLetters(word: string): string[] {
  return Array.from(new Set(normalizeWord(word).split('').filter(isLetter)))
}

export function getLetterPositions(word: string, kind: RevealKind): number[] {
  const chars = normalizeWord(word).split('')
  const wantVowel = kind === 'vowel'
  return chars.flatMap((char, index) => {
    if (!isLetter(char)) return []
    return isVowel(char) === wantVowel ? [index] : []
  })
}

export function getAvailableRevealPositions(
  word: string,
  revealedPositions: Iterable<number>,
  kind: RevealKind
): number[] {
  const revealed = new Set(revealedPositions)
  return getLetterPositions(word, kind).filter((index) => !revealed.has(index))
}

export function pickRevealPosition(
  word: string,
  revealedPositions: Iterable<number>,
  kind: RevealKind,
  randomValue: number
): number | null {
  const available = getAvailableRevealPositions(word, revealedPositions, kind)
  if (available.length === 0) return null
  const safeRandom = Math.min(0.999999, Math.max(0, randomValue))
  return available[Math.floor(safeRandom * available.length)]
}

export function buildDisplayTokens(word: string, revealedPositions: Iterable<number>): string[] {
  const revealed = new Set(revealedPositions)
  return normalizeWord(word)
    .split('')
    .map((char, index) => {
      if (!isLetter(char)) return char
      return revealed.has(index) ? char : '•'
    })
}

export function computeRevealRatio(word: string, revealedPositions: Iterable<number>): number {
  const revealed = new Set(revealedPositions)
  const chars = normalizeWord(word).split('')
  const letterPositions = chars.flatMap((char, index) => (isLetter(char) ? [index] : []))
  if (letterPositions.length === 0) return 1
  const visible = letterPositions.filter((index) => revealed.has(index)).length
  return visible / letterPositions.length
}

export function revealAllMatchingPositions(
  word: string,
  revealedPositions: Iterable<number>,
  guess: string
): number[] {
  const normalizedGuess = normalizeGuess(guess)
  if (normalizedGuess !== normalizeWord(word)) return Array.from(revealedPositions)
  const next = new Set(revealedPositions)
  normalizeWord(word)
    .split('')
    .forEach((char, index) => {
      if (isLetter(char)) next.add(index)
    })
  return Array.from(next).sort((a, b) => a - b)
}

export function getRevealCost(kind: RevealKind): number {
  return kind === 'vowel' ? VOWEL_COST : CONSONANT_COST
}

export function getHintCost(index: number): number | null {
  return HINT_COSTS[index] ?? null
}

export function pressurePenaltyForWrongGuesses(wrongGuesses: number): number {
  let total = 0
  for (let attempt = 1; attempt <= wrongGuesses; attempt += 1) {
    if (attempt <= 3) total += 1
    else if (attempt <= 6) total += 2
    else total += 3
  }
  return total
}

export function calculateRoundScore(params: {
  solved: boolean
  budgetRemaining: number
  wrongGuesses: number
  elapsedSeconds: number
  parSeconds: number
  hintsUsed: number
}): RoundScoreBreakdown {
  const {
    solved,
    budgetRemaining,
    wrongGuesses,
    elapsedSeconds,
    parSeconds,
    hintsUsed,
  } = params

  if (!solved) {
    return {
      solved: false,
      budgetScore: 0,
      pressurePenalty: 0,
      bonuses: [],
      roundScore: 0,
      cumulativeDelta: FAILURE_PENALTY,
    }
  }

  const bonuses: ScoreLineItem[] = []
  const ratio = parSeconds > 0 ? elapsedSeconds / parSeconds : 1
  if (ratio <= 0.6) bonuses.push({ label: 'Lightning solve', value: 10 })
  else if (ratio <= 0.8) bonuses.push({ label: 'Fast solve', value: 6 })
  else if (ratio <= 1) bonuses.push({ label: 'On-par solve', value: 3 })

  if (wrongGuesses === 0) bonuses.push({ label: 'Perfect read', value: 8 })
  else if (wrongGuesses === 1) bonuses.push({ label: 'Precision', value: 5 })
  else if (wrongGuesses === 2) bonuses.push({ label: 'Clean recovery', value: 2 })

  if (hintsUsed === 0) bonuses.push({ label: 'No-hint bonus', value: 5 })

  const pressurePenalty = pressurePenaltyForWrongGuesses(wrongGuesses)
  const roundScore = Math.max(
    0,
    Math.round(
      budgetRemaining +
        bonuses.reduce((sum, item) => sum + item.value, 0) -
        pressurePenalty
    )
  )

  return {
    solved: true,
    budgetScore: budgetRemaining,
    pressurePenalty: -pressurePenalty,
    bonuses,
    roundScore,
    cumulativeDelta: roundScore,
  }
}

export function applySurvivalBonus(budget: number, solved: boolean): number {
  if (!solved) return budget
  return Math.min(BUDGET_CAP, budget + SURVIVAL_BONUS)
}

export function buildEliminationPlan(
  playerCount: number,
  maxRounds = MAX_QUALIFYING_ROUNDS
): number[] {
  let remaining = Math.max(2, Math.floor(playerCount))
  if (remaining <= 2) return []

  const rounds = Math.min(maxRounds, remaining - 2)
  const eliminations: number[] = []

  for (let round = 0; round < rounds && remaining > 2; round += 1) {
    const roundsLeft = rounds - round
    const twentyPercent = Math.max(1, Math.floor(remaining * 0.2))
    const paceRequired = Math.ceil((remaining - 2) / roundsLeft)
    const eliminate = Math.min(remaining - 2, Math.max(twentyPercent, paceRequired))
    eliminations.push(eliminate)
    remaining -= eliminate
  }

  return eliminations
}

export function rankRoundResults(results: RoundResult[]): RoundResult[] {
  return [...results].sort((a, b) => {
    if (a.solved !== b.solved) return a.solved ? -1 : 1
    if (a.solved && b.solved) {
      if (a.roundScore !== b.roundScore) return b.roundScore - a.roundScore
      if (a.wrongGuesses !== b.wrongGuesses) return a.wrongGuesses - b.wrongGuesses
      if (a.elapsedSeconds !== b.elapsedSeconds) return a.elapsedSeconds - b.elapsedSeconds
    } else {
      if (a.revealedRatio !== b.revealedRatio) return b.revealedRatio - a.revealedRatio
      if (a.hintsUsed !== b.hintsUsed) return a.hintsUsed - b.hintsUsed
      if (a.wrongGuesses !== b.wrongGuesses) return a.wrongGuesses - b.wrongGuesses
    }
    if (a.cumulativeBefore !== b.cumulativeBefore) {
      return b.cumulativeBefore - a.cumulativeBefore
    }
    return a.participantId.localeCompare(b.participantId)
  })
}

function difficultyForRound(index: number, total: number): WordDifficulty {
  if (total <= 1) return 3
  const fraction = index / Math.max(1, total - 1)
  if (fraction < 0.2) return 1
  if (fraction < 0.4) return 2
  if (fraction < 0.65) return 3
  if (fraction < 0.85) return 4
  return 5
}

export function pickTournamentWords(seed: number, qualifyingRounds: number): {
  qualifying: WordEntry[]
  final: WordEntry
} {
  const rng = mulberry32((seed ^ 0x41c6ce57) >>> 0)
  const used = new Set<string>()
  const qualifying: WordEntry[] = []

  for (let index = 0; index < qualifyingRounds; index += 1) {
    const difficulty = difficultyForRound(index, qualifyingRounds)
    const preferred = WORD_BANK.filter(
      (entry) => entry.difficulty === difficulty && !entry.finalEligible && !used.has(entry.text)
    )
    const fallback = WORD_BANK.filter((entry) => !entry.finalEligible && !used.has(entry.text))
    const pool = preferred.length > 0 ? preferred : fallback
    const chosen = pool[Math.floor(rng() * pool.length)]
    used.add(chosen.text)
    qualifying.push(chosen)
  }

  const finalPool = WORD_BANK.filter((entry) => entry.finalEligible && !used.has(entry.text))
  const final = finalPool[Math.floor(rng() * finalPool.length)]
  return { qualifying, final }
}

export function pickRoundWords(seed: number): WordEntry[] {
  return pickTournamentWords(seed, 5).qualifying
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function simulateAiRound(params: {
  participantId: string
  participantName: string
  word: WordEntry
  budget: number
  cumulativeScore: number
  seed: number
  roundIndex: number
}): AiRoundResult {
  const { participantId, participantName, word, cumulativeScore, roundIndex } = params
  let budget = params.budget
  const seed = (params.seed ^ hashString(participantId + '-' + roundIndex + '-' + word.text)) >>> 0
  const rng = mulberry32(seed)
  const skill = clamp(0.42 + (hashString(participantId) % 43) / 100, 0.42, 0.84)
  const revealed = new Set<number>()
  const purchases: Array<{ kind: RevealKind | 'hint'; cost: number }> = []
  let hintsUsed = 0

  const desiredReveal = clamp(
    0.3 + word.difficulty * 0.045 + (1 - skill) * 0.32 + rng() * 0.08,
    0.32,
    0.72
  )

  while (computeRevealRatio(word.text, revealed) < desiredReveal) {
    const vowelOptions = getAvailableRevealPositions(word.text, revealed, 'vowel')
    const consonantOptions = getAvailableRevealPositions(word.text, revealed, 'consonant')
    const canHint = hintsUsed < 3 && budget >= (getHintCost(hintsUsed) ?? Number.POSITIVE_INFINITY)

    if (canHint && word.difficulty >= 3 && rng() < 0.12 + word.difficulty * 0.035) {
      const cost = getHintCost(hintsUsed) ?? 0
      budget -= cost
      purchases.push({ kind: 'hint', cost })
      hintsUsed += 1
      continue
    }

    const preferVowel = rng() < 0.46
    let kind: RevealKind = preferVowel ? 'vowel' : 'consonant'
    if (
      (kind === 'vowel' && (vowelOptions.length === 0 || budget < VOWEL_COST)) ||
      (kind === 'consonant' && (consonantOptions.length === 0 || budget < CONSONANT_COST))
    ) {
      kind = kind === 'vowel' ? 'consonant' : 'vowel'
    }

    const cost = getRevealCost(kind)
    const position = pickRevealPosition(word.text, revealed, kind, rng())
    if (position == null || budget < cost) break
    budget -= cost
    revealed.add(position)
    purchases.push({ kind, cost })
  }

  const revealRatio = computeRevealRatio(word.text, revealed)
  const solveChance = clamp(
    0.18 +
      skill * 0.58 +
      revealRatio * 0.52 +
      hintsUsed * 0.08 -
      word.difficulty * 0.065,
    0.12,
    0.96
  )
  const solved = rng() < solveChance
  const wrongGuesses = solved
    ? Math.round(clamp((1 - skill) * 3.2 + word.difficulty * 0.45 + rng() * 2 - revealRatio * 2, 0, 7))
    : MAX_WRONG_GUESSES
  const elapsedSeconds = Math.round(
    clamp(
      word.parSeconds * (0.58 + (1 - skill) * 0.55 + rng() * 0.35 + hintsUsed * 0.04),
      18,
      ROUND_TIME_LIMIT_SECONDS
    )
  )

  const breakdown = calculateRoundScore({
    solved,
    budgetRemaining: budget,
    wrongGuesses,
    elapsedSeconds,
    parSeconds: word.parSeconds,
    hintsUsed,
  })

  return {
    result: {
      participantId,
      participantName,
      solved,
      budgetRemaining: budget,
      wrongGuesses,
      elapsedSeconds,
      hintsUsed,
      revealedRatio: revealRatio,
      roundScore: breakdown.roundScore,
      cumulativeBefore: cumulativeScore,
      cumulativeAfter: cumulativeScore + breakdown.cumulativeDelta,
    },
    revealedPositions: Array.from(revealed).sort((a, b) => a - b),
    purchases,
  }
}
