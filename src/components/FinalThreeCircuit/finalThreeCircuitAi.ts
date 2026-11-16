import {
  buildSignalBoard,
  buildSignalRounds,
  buildSequenceBoards,
  EMPTY_SEQUENCE_TILE,
  scoreSignalRound,
  scoreSequenceBoard,
  type CircuitStageScores,
  type SequenceBoard,
} from './finalThreeCircuitLogic'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function hashStringU32(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function centeredHumanNoise(random: () => number): number {
  // Three samples create a bell-ish distribution without allowing every AI run
  // to live at an extreme. The output is approximately -1..1 and clusters near 0.
  return ((random() + random() + random()) / 3 - 0.5) * 2
}

export interface AiSignalTapAttempt {
  targetStep: number
  correct: boolean
  elapsedMs: number
}

export interface AiSignalRoundRun {
  found: number
  targetCount: number
  mistakes: number
  elapsedMs: number
  remainingMs: number
  timeLimitMs: number
  score: number
  attempts: AiSignalTapAttempt[]
}

export interface AiSignalRun {
  score: number
  rounds: AiSignalRoundRun[]
}

/**
 * Simulates Signal Hunt from its visible targets, board positions, clock, and mistake rules.
 * Search speed and mis-tap odds are deterministic ability heuristics, not telemetry fits; time
 * costs, penalties, and round scoring reuse the same rules as human play.
 */
export function simulateAiSignalRun(
  rawAbilityScore: number,
  seed: number,
  playerId: string,
  part: 1 | 2 = 1
): AiSignalRun {
  const ability = normalizeCircuitAiAbility(rawAbilityScore)
  const rounds = buildSignalRounds(seed, part)
  let totalScore = 0
  const roundRuns: AiSignalRoundRun[] = []

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const round = rounds[roundIndex]
    let elapsedMs = 0
    let found = 0
    let mistakes = 0
    let attemptsForTarget = 0
    const attempts: AiSignalTapAttempt[] = []

    while (found < round.targetCount && elapsedMs < round.timeLimitMs) {
      const random = seededRandom(
        (seed ^
          hashStringU32(
            `circuit-signal:${playerId}:${roundIndex}:${found}:${attemptsForTarget}`
          )) >>>
          0
      )
      const board = buildSignalBoard(seed, roundIndex, found, round.cellCount)
      const target = round.targetOrder[found]
      const scanPosition = Math.max(0, board.indexOf(target))
      const scanMsPerCell = 19 + (1 - ability) * 43
      const reactionMs = 180 + (1 - ability) * 280 + Math.floor(random() * 81)
      const searchMs = reactionMs + Math.round((scanPosition + 1) * scanMsPerCell)
      elapsedMs += searchMs
      if (elapsedMs >= round.timeLimitMs) break

      // Lower skill and denser boards cause occasional mis-taps. Each costs the
      // same 900 ms and scoring penalty as the human interaction.
      const mistakeChance = clamp(
        0.015 + (1 - ability) * 0.16 + (round.cellCount - 16) * 0.0015,
        0,
        0.24
      )
      if (random() < mistakeChance) {
        mistakes += 1
        attempts.push({ targetStep: found, correct: false, elapsedMs })
        elapsedMs += 900
        attemptsForTarget += 1
        // A wrong tap leaves the current target and board in place, so retry it.
        continue
      }

      attempts.push({ targetStep: found, correct: true, elapsedMs })
      found += 1
      attemptsForTarget = 0
    }

    const remainingMs = Math.max(0, round.timeLimitMs - elapsedMs)
    const score = scoreSignalRound(
      found,
      round.targetCount,
      remainingMs,
      round.timeLimitMs,
      round.maxPoints,
      mistakes
    )
    totalScore += score
    roundRuns.push({
      found,
      targetCount: round.targetCount,
      mistakes,
      elapsedMs,
      remainingMs,
      timeLimitMs: round.timeLimitMs,
      score,
      attempts,
    })
  }

  return { score: clamp(Math.round(totalScore), 0, 100), rounds: roundRuns }
}

export function simulateAiSignalScore(
  rawAbilityScore: number,
  seed: number,
  playerId: string,
  part: 1 | 2 = 1
): number {
  return simulateAiSignalRun(rawAbilityScore, seed, playerId, part).score
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

function partialSequenceOrder(
  board: SequenceBoard,
  requestedCorrectTiles: number,
  random: () => number
): string[] {
  const emptyIndex = board.target.indexOf(EMPTY_SEQUENCE_TILE)
  const tileIndexes = board.target
    .map((_tile, index) => index)
    .filter((index) => index !== emptyIndex)
  const maximumPartialTiles = Math.max(0, tileIndexes.length - 2)
  const correctIndexes = new Set(
    shuffled(tileIndexes, random).slice(0, clamp(requestedCorrectTiles, 0, maximumPartialTiles))
  )
  const order = Array<string>(board.target.length).fill('')
  order[emptyIndex] = EMPTY_SEQUENCE_TILE

  for (const index of correctIndexes) order[index] = board.target[index]

  const incorrectIndexes = tileIndexes.filter((index) => !correctIndexes.has(index))
  const incorrectTiles = incorrectIndexes.map((index) => board.target[index])
  const shift =
    incorrectTiles.length > 1 ? 1 + Math.floor(random() * (incorrectTiles.length - 1)) : 0
  incorrectIndexes.forEach((index, offset) => {
    order[index] = incorrectTiles[(offset + shift) % incorrectTiles.length]
  })

  return order
}

export interface AiSequenceRun {
  score: number
  completedBoards: number
}

/**
 * Estimates solve chance, speed, and partial progress with deterministic ability heuristics.
 * Completed and failed boards use the same time, move, and tile scoring as human play.
 */
export function simulateAiSequenceRun(
  rawAbilityScore: number,
  seed: number,
  playerId: string,
  part: 1 | 2 = 1
): AiSequenceRun {
  const ability = normalizeCircuitAiAbility(rawAbilityScore)
  const boards = buildSequenceBoards(seed, part)
  const random = seededRandom((seed ^ hashStringU32(`circuit-sequence:${playerId}:${part}`)) >>> 0)
  let remainingMs = boards[0]?.timeLimitMs ?? 0
  let score = 0
  let completedBoards = 0

  for (const board of boards) {
    if (remainingMs <= 0) break

    // The 2 × 3 board is the warm-up; the 3 × 3 board has a much higher solve
    // cost. Part 2's extra scramble moves and shorter shared clock lower the
    // solve chance through the board's actual settings, not a blanket score cut.
    const isHardBoard = board.rows === 3
    const referenceScramble = isHardBoard ? 22 : 8
    const baseSolveChance = isHardBoard ? 0.46 : 0.84
    const skillWeight = isHardBoard ? 0.46 : 0.12
    const scramblePenalty = Math.max(0, board.scrambleMoves - referenceScramble) * 0.02
    const timePenalty = (Math.max(0, 300_000 - board.timeLimitMs) / 300_000) * 0.05
    const solveChance = clamp(
      baseSolveChance + ability * skillWeight - scramblePenalty - timePenalty,
      0.12,
      0.96
    )

    const extraMoveRatio = 0.1 + (1 - ability) * 0.45 + random() * 0.3
    const moves = board.scrambleMoves + Math.round(board.scrambleMoves * extraMoveRatio)
    const solveTimeMs = Math.round(
      board.scrambleMoves * (2_000 + (1 - ability) * 2_300 + random() * 1_000)
    )
    const solved = random() < solveChance && solveTimeMs <= remainingMs

    if (solved) {
      remainingMs -= solveTimeMs
      score += scoreSequenceBoard(board, board.target, moves, remainingMs, true)
      completedBoards += 1
      continue
    }

    const nonEmptyTiles = board.target.length - 1
    const correctTiles = Math.floor(nonEmptyTiles * (0.2 + ability * 0.35 + random() * 0.18))
    const partialOrder = partialSequenceOrder(board, correctTiles, random)
    score += scoreSequenceBoard(board, partialOrder, moves, 0, false)

    // A player stays on an unsolved board until the shared timer expires, so a
    // failed board prevents them from entering the next puzzle.
    break
  }

  return { score: Math.max(0, Math.min(100, score)), completedBoards }
}

export function simulateAiSequenceScore(
  rawAbilityScore: number,
  seed: number,
  playerId: string,
  part: 1 | 2 = 1
): number {
  return simulateAiSequenceRun(rawAbilityScore, seed, playerId, part).score
}

export function normalizeCircuitAiAbility(rawScore: number): number {
  if (!Number.isFinite(rawScore)) return 0.5

  // Minigame Lab passes generic 0-100 scores. Real challenge simulation can pass
  // the Circuit's native 150-285 range. In both cases this value is treated as
  // an ability signal, not as a final score that must be preserved exactly.
  if (rawScore <= 100) return clamp(rawScore / 100, 0, 1)
  return clamp((rawScore - 150) / 135, 0, 1)
}

function stageScore(
  meanLow: number,
  meanHigh: number,
  spread: number,
  floor: number,
  ceiling: number,
  ability: number,
  random: () => number,
  meanAdjustment: number
): number {
  const mean = meanLow + (meanHigh - meanLow) * ability + meanAdjustment
  let score = mean + centeredHumanNoise(random) * spread

  // Even strong humans occasionally make a material mistake. This prevents the
  // AI from feeling like a deterministic calculator while still rewarding skill.
  const errorChance = 0.2 - ability * 0.12
  if (random() < errorChance) {
    score -= 7 + random() * (10 + (1 - ability) * 7)
  }

  return Math.round(clamp(score, floor, ceiling))
}

/**
 * Produces deterministic, profile-sensitive Final Three Circuit stage scores.
 * Modeled stages use their gameplay scoring rules, so the total varies with
 * completion, time, and mistakes instead of being forced to the profile score.
 */
export function simulateAiCircuitScores(
  rawAbilityScore: number,
  seed: number,
  playerId: string,
  part: 1 | 2 = 1
): CircuitStageScores {
  const ability = normalizeCircuitAiAbility(rawAbilityScore)
  const random = seededRandom((seed ^ hashStringU32(`circuit-human-ai:${playerId}`)) >>> 0)

  // Generic competition AI scores already incorporate profile skills, form,
  // and intent. Use that score only as a static reference for the Risk model.
  const targetTotal = clamp(
    rawAbilityScore <= 100 ? 150 + rawAbilityScore * 1.35 : rawAbilityScore,
    150,
    285
  )
  const sequence = simulateAiSequenceScore(rawAbilityScore, seed, playerId, part)
  const baselineMeans = [52 + 34 * ability, 43 + 41 * ability, 39 + 40 * ability]
  const expectedError = 3 * (0.2 - ability * 0.12) * (12 + 3.5 * (1 - ability))
  // Keep this profile baseline fixed across seeds. Signal and Sequence outcomes
  // can move the total naturally; they are not offset to force a target total.
  const profileAdjustment =
    (targetTotal - baselineMeans.reduce((sum, value) => sum + value, 0) + expectedError) / 3

  // A finalist can favor one discipline over another. Keep these tendencies
  // centered so they shape the run without changing its profile baseline.
  const tendencies = [random(), random(), random()].map((roll) => (roll - 0.5) * 10)
  const tendencyMean = tendencies.reduce((sum, value) => sum + value, 0) / tendencies.length
  const stageAdjustment = (index: number) => profileAdjustment + tendencies[index] - tendencyMean

  const signal = simulateAiSignalScore(rawAbilityScore, seed, playerId, part)
  const risk = stageScore(39, 79, 13, 18, 94, ability, random, stageAdjustment(2))

  return [signal, sequence, risk]
}
