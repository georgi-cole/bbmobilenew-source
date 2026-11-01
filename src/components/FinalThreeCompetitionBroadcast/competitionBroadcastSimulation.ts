import type { GameState, Player } from '../../types'
import {
  buildMemoryLaneQuestionBank,
  type MemoryLaneQuestion,
} from '../DownMemoryLane/downMemoryLaneLogic'
import {
  buildSequenceBoards,
  buildSignalBoard,
  buildSignalRounds,
  EMPTY_SEQUENCE_TILE,
  isSequenceSolved,
  scoreSequenceBoard,
  scoreSignalRound,
  slideSequenceTile,
  type SequenceBoard,
} from '../FinalThreeCircuit/finalThreeCircuitLogic'
import type { FinalThreeCompetitionPart } from './competitionBroadcastTimeline'

export type CompetitionReplayKind = 'signal' | 'sequence' | 'memory'
export type CompetitionReplayPhase =
  | 'ready'
  | 'thinking'
  | 'buzz'
  | 'answer'
  | 'correct'
  | 'wrong'
  | 'finished'

export interface CompetitionReplayPlayer {
  id: string
  score: number
  /** Signals found, correctly placed numbered tiles, or remaining lives. */
  progress: number
  total: number
  mistakes: number
  lives?: number
  solved?: boolean
}

interface CompetitionReplayFrameBase {
  atMs: number
  eventId: string
  phase: CompetitionReplayPhase
  activePlayerId: string | null
  players: CompetitionReplayPlayer[]
  leaderIds: string[]
  round: number
  roundCount: number
  tension: 'calm' | 'pressure' | 'climax'
  feedback: string
}

export interface SignalReplayFrame extends CompetitionReplayFrameBase {
  kind: 'signal'
  signal: {
    cells: number[]
    columns: number
    target: number
    selectedValue: number | null
    selectedIndex: number | null
    remainingMs: number
  }
}

export interface SequenceReplayBoard {
  id: string
  order: string[]
  previousOrder: string[]
  movedTile: string | null
  fromIndex: number | null
  toIndex: number | null
  moves: number
}

export interface SequenceReplayFrame extends CompetitionReplayFrameBase {
  kind: 'sequence'
  sequence: {
    target: string[]
    rows: number
    columns: number
    boards: SequenceReplayBoard[]
  }
}

export interface MemoryReplayFrame extends CompetitionReplayFrameBase {
  kind: 'memory'
  memory: {
    question: MemoryLaneQuestion
    answerPlayerId: string | null
    /** Only exposed after the answer is marked. */
    correctPlayerId: string | null
    damagedPlayerId: string | null
  }
}

export type CompetitionBroadcastFrame = SignalReplayFrame | SequenceReplayFrame | MemoryReplayFrame

export interface CompetitionBroadcastSimulation {
  part: FinalThreeCompetitionPart
  kind: CompetitionReplayKind
  title: string
  competitorIds: string[]
  winnerId: string
  durationMs: number
  frames: CompetitionBroadcastFrame[]
}

export const COMPETITION_REPLAY_DURATION_MS = {
  signal: 22_000,
  sequence: 24_000,
  memory: 37_800,
} as const

interface SimulationInput {
  game: GameState
  part: FinalThreeCompetitionPart
  competitorIds: readonly string[]
  expectedWinnerId?: string
}

function randomFor(seed: number, salt: string): () => number {
  let hash = seed >>> 0
  for (const char of salt) hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619) >>> 0
  return () => {
    hash += 0x6d2b79f5
    let value = hash
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function stateFor(players: readonly Player[], total: number): CompetitionReplayPlayer[] {
  return players.map(({ id }) => ({ id, score: 0, progress: 0, total, mistakes: 0 }))
}

function frameBase(
  atMs: number,
  durationMs: number,
  eventId: string,
  phase: CompetitionReplayPhase,
  activePlayerId: string | null,
  players: readonly CompetitionReplayPlayer[],
  feedback: string,
  round = 1,
  roundCount = 1
): CompetitionReplayFrameBase {
  const rank = (player: CompetitionReplayPlayer) =>
    player.lives ?? player.progress + player.score / 1000
  const lead = Math.max(...players.map(rank))
  return {
    atMs,
    eventId,
    phase,
    activePlayerId,
    players: players.map((player) => ({ ...player })),
    leaderIds: players.filter((player) => rank(player) === lead).map((player) => player.id),
    round,
    roundCount,
    tension: atMs < durationMs * 0.42 ? 'calm' : atMs < durationMs * 0.78 ? 'pressure' : 'climax',
    feedback,
  }
}

function signalSimulation(
  input: SimulationInput,
  players: Player[]
): CompetitionBroadcastSimulation {
  const winnerId = input.expectedWinnerId!
  const random = randomFor(
    input.game.seed,
    `signal:${players.map((player) => player.id).join(':')}`
  )
  const opponents = players.filter((player) => player.id !== winnerId)
  if (random() > 0.5) opponents.reverse()
  const [first, second] = opponents
  const durationMs = COMPETITION_REPLAY_DURATION_MS.signal
  const round = buildSignalRounds(input.game.seed, 1)[0]
  const scores = stateFor(players, round.targetCount)
  const finishedAt = new Map<string, number>()
  const frames: SignalReplayFrame[] = []
  // A close opening lead, one costly miss and a late clean run. These are
  // presentation events conditioned on the authoritative winner, never inputs
  // to the actual competition resolver.
  const actions: [string, boolean][] = [
    [first.id, true],
    [second.id, true],
    [winnerId, false],
    [first.id, true],
    [winnerId, true],
    [second.id, false],
    [first.id, true],
    [winnerId, true],
    [second.id, true],
    [first.id, true],
    [winnerId, true],
    [second.id, true],
    [winnerId, true],
    [first.id, false],
    [second.id, true],
    [first.id, true],
    [winnerId, true],
    [second.id, false],
    [winnerId, true],
  ]
  const timeLeft = (atMs: number, mistakes: number) =>
    Math.max(0, round.timeLimitMs * (1 - atMs / durationMs) - mistakes * 900)
  const push = (
    atMs: number,
    eventId: string,
    phase: CompetitionReplayPhase,
    id: string | null,
    cells: number[],
    target: number,
    selectedValue: number | null,
    feedback: string
  ) => {
    frames.push({
      ...frameBase(
        atMs,
        durationMs,
        eventId,
        phase,
        id,
        scores,
        feedback,
        Math.min(round.targetCount, Math.max(...scores.map((score) => score.progress)) + 1),
        round.targetCount
      ),
      kind: 'signal',
      signal: {
        cells: [...cells],
        columns: round.columns,
        target,
        selectedValue,
        selectedIndex: selectedValue == null ? null : cells.indexOf(selectedValue),
        remainingMs: timeLeft(atMs, scores.find((score) => score.id === id)?.mistakes ?? 0),
      },
    })
  }
  push(
    0,
    'signal-ready',
    'ready',
    null,
    buildSignalBoard(input.game.seed, 0, 0, round.cellCount),
    round.targetOrder[0],
    null,
    'Find six signals'
  )
  actions.forEach(([id, correct], index) => {
    const atMs = 1200 + index * 1000 + Math.round(random() * 120)
    const score = scores.find((player) => player.id === id)!
    const target = round.targetOrder[score.progress]
    const cells = buildSignalBoard(input.game.seed, 0, score.progress, round.cellCount)
    push(
      atMs - 520,
      `signal-${index}-search`,
      'thinking',
      id,
      cells,
      target,
      null,
      'Find the signal'
    )
    const wrongValues = cells.filter((value) => value !== target)
    const selected = correct ? target : wrongValues[Math.floor(random() * wrongValues.length)]
    if (correct) score.progress += 1
    else score.mistakes += 1
    const remaining = timeLeft(atMs, score.mistakes)
    score.score = scoreSignalRound(
      score.progress,
      round.targetCount,
      remaining,
      round.timeLimitMs,
      round.maxPoints,
      score.mistakes
    )
    if (score.progress === round.targetCount) finishedAt.set(id, atMs)
    push(
      atMs,
      `signal-${index}-hit`,
      correct ? 'correct' : 'wrong',
      id,
      cells,
      target,
      selected,
      correct ? 'Signal found' : 'Wrong node · time lost'
    )
  })
  for (const score of scores) {
    const finish = finishedAt.get(score.id)
    score.score = scoreSignalRound(
      score.progress,
      round.targetCount,
      finish == null ? 0 : timeLeft(finish, score.mistakes),
      round.timeLimitMs,
      round.maxPoints,
      score.mistakes
    )
  }
  const last = frames[frames.length - 1].signal
  push(
    durationMs,
    'signal-finished',
    'finished',
    winnerId,
    last.cells,
    last.target,
    last.selectedValue,
    'Signal Hunt complete'
  )
  return {
    part: 1,
    kind: 'signal',
    title: 'Signal Hunt',
    competitorIds: players.map((p) => p.id),
    winnerId,
    durationMs,
    frames,
  }
}

function legalMoves(order: readonly string[], board: SequenceBoard): number[] {
  return order.flatMap((_tile, index) =>
    slideSequenceTile(order, index, board.rows, board.columns) ? [index] : []
  )
}

/** The six-cell board has only 360 reachable arrangements. BFS gives legal,
 * minimal slides without introducing a second puzzle implementation. */
function solveSequence(board: SequenceBoard): number[] {
  const queue: { order: string[]; moves: number[] }[] = [{ order: [...board.initial], moves: [] }]
  const seen = new Set([board.initial.join(',')])
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (isSequenceSolved(current.order, board.target)) return current.moves
    for (const tileIndex of legalMoves(current.order, board)) {
      const next = slideSequenceTile(current.order, tileIndex, board.rows, board.columns)!
      const key = next.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      queue.push({ order: next, moves: [...current.moves, tileIndex] })
    }
  }
  return []
}

function sequenceSimulation(
  input: SimulationInput,
  players: Player[]
): CompetitionBroadcastSimulation {
  const winnerId = input.expectedWinnerId!
  const loserId = players.find((player) => player.id !== winnerId)!.id
  const durationMs = COMPETITION_REPLAY_DURATION_MS.sequence
  const board = buildSequenceBoards(input.game.seed, 2)[0]
  const solution = solveSequence(board)
  const originalBlank = board.initial.indexOf(EMPTY_SEQUENCE_TILE)
  const detour =
    legalMoves(board.initial, board).find((index) => index !== solution[0]) ?? solution[0]
  const winnerMoves = [detour, originalBlank, ...solution]
  const loserMoves = solution.slice(0, -1)
  let loserOrder = [...board.initial]
  for (const move of loserMoves)
    loserOrder = slideSequenceTile(loserOrder, move, board.rows, board.columns)!
  const beforeDetour = loserOrder.indexOf(EMPTY_SEQUENCE_TILE)
  const safeDetour = legalMoves(loserOrder, board).find((index) => {
    const next = slideSequenceTile(loserOrder, index, board.rows, board.columns)!
    return !isSequenceSolved(next, board.target)
  })!
  loserMoves.push(safeDetour, beforeDetour, safeDetour, beforeDetour)
  const scores = stateFor(players, board.target.length - 1)
  const boards: SequenceReplayBoard[] = players.map(({ id }) => ({
    id,
    order: [...board.initial],
    previousOrder: [...board.initial],
    movedTile: null,
    fromIndex: null,
    toIndex: null,
    moves: 0,
  }))
  const progress = (order: readonly string[]) =>
    order.reduce(
      (count, tile, index) =>
        count + Number(tile !== EMPTY_SEQUENCE_TILE && tile === board.target[index]),
      0
    )
  for (const player of scores) player.progress = progress(board.initial)
  const frames: SequenceReplayFrame[] = []
  const push = (
    atMs: number,
    eventId: string,
    phase: CompetitionReplayPhase,
    id: string | null,
    feedback: string
  ) => {
    frames.push({
      ...frameBase(atMs, durationMs, eventId, phase, id, scores, feedback),
      kind: 'sequence',
      sequence: {
        target: [...board.target],
        rows: board.rows,
        columns: board.columns,
        boards: boards.map((value) => ({
          ...value,
          order: [...value.order],
          previousOrder: [...value.previousOrder],
        })),
      },
    })
  }
  push(0, 'sequence-ready', 'ready', null, 'Slide the tiles into order')
  const events = [
    ...winnerMoves.map((move, index) => ({
      id: winnerId,
      move,
      atMs: Math.round(1800 + index * (19_200 / Math.max(1, winnerMoves.length - 1))),
    })),
    ...loserMoves.map((move, index) => ({
      id: loserId,
      move,
      atMs:
        index < solution.length - 1
          ? Math.round(1100 + index * (10_500 / Math.max(1, solution.length - 2)))
          : 14_000 + (index - (solution.length - 1)) * 2200,
    })),
  ].sort((a, b) => a.atMs - b.atMs)
  let previousActionAt = 0
  events.forEach(({ id, move, atMs: desiredAt }, index) => {
    // Each planning beat follows the last committed slide. Without this gap,
    // sorting two close contestants' beats could expose a future board state.
    const atMs = Math.max(desiredAt, previousActionAt + 560)
    previousActionAt = atMs
    const current = boards.find((value) => value.id === id)!
    const player = scores.find((value) => value.id === id)!
    const previousProgress = player.progress
    for (const other of boards) {
      other.previousOrder = [...other.order]
      other.movedTile = null
      other.fromIndex = null
      other.toIndex = null
    }
    push(Math.max(0, atMs - 280), `sequence-${index}-plan`, 'thinking', id, 'Find the next move')
    current.toIndex = current.order.indexOf(EMPTY_SEQUENCE_TILE)
    current.fromIndex = move
    current.movedTile = current.order[move]
    current.previousOrder = [...current.order]
    current.order = slideSequenceTile(current.order, move, board.rows, board.columns)!
    current.moves += 1
    player.progress = progress(current.order)
    player.solved = isSequenceSolved(current.order, board.target)
    player.score = scoreSequenceBoard(
      board,
      current.order,
      current.moves,
      Math.max(0, board.timeLimitMs - atMs),
      player.solved
    )
    const phase =
      player.solved || player.progress > previousProgress
        ? 'correct'
        : player.progress < previousProgress
          ? 'wrong'
          : 'answer'
    push(
      atMs,
      `sequence-${index}-slide`,
      phase,
      id,
      player.solved ? 'Circuit complete' : `Slide ${current.movedTile}`
    )
  })
  push(durationMs, 'sequence-finished', 'finished', winnerId, 'Sequence Builder complete')
  frames.sort((a, b) => a.atMs - b.atMs)
  return {
    part: 2,
    kind: 'sequence',
    title: 'Sequence Builder',
    competitorIds: players.map((p) => p.id),
    winnerId,
    durationMs,
    frames,
  }
}

function memorySimulation(
  input: SimulationInput,
  players: Player[]
): CompetitionBroadcastSimulation | null {
  const winnerId = input.expectedWinnerId!
  const loserId = players.find((player) => player.id !== winnerId)!.id
  const bank = buildMemoryLaneQuestionBank(input.game, input.game.seed)
  if (!bank.length) return null
  const orderedBank = [
    ...bank.filter((question) => question.prompt.length <= 110),
    ...bank.filter((question) => question.prompt.length > 110),
  ]
  const random = randomFor(input.game.seed, `memory:${winnerId}:${loserId}`)
  const durationMs = COMPETITION_REPLAY_DURATION_MS.memory
  const scores = stateFor(players, 5)
  for (const player of scores) {
    player.progress = 5
    player.lives = 5
  }
  const frames: MemoryReplayFrame[] = []
  const damagedIds = [
    winnerId,
    winnerId,
    loserId,
    loserId,
    winnerId,
    loserId,
    winnerId,
    loserId,
    loserId,
  ]
  damagedIds.forEach((damagedPlayerId, index) => {
    const question = orderedBank[index % orderedBank.length]
    const atMs = index * 4200
    const correct = index === damagedIds.length - 1 || random() > 0.26
    const activePlayerId = correct
      ? players.find((player) => player.id !== damagedPlayerId)!.id
      : damagedPlayerId
    const wrongOptions = question.optionPlayerIds.filter((id) => id !== question.correctPlayerId)
    const answerPlayerId = correct
      ? question.correctPlayerId
      : wrongOptions[Math.floor(random() * wrongOptions.length)]
    const push = (offset: number, phase: CompetitionReplayPhase, feedback: string) => {
      const answered = phase === 'correct' || phase === 'wrong' || phase === 'finished'
      frames.push({
        ...frameBase(
          atMs + offset,
          durationMs,
          `memory-${index}-${phase}`,
          phase,
          phase === 'thinking' ? null : activePlayerId,
          scores,
          feedback,
          index + 1,
          damagedIds.length
        ),
        kind: 'memory',
        memory: {
          question,
          answerPlayerId: phase === 'answer' || answered ? answerPlayerId : null,
          correctPlayerId: answered ? question.correctPlayerId : null,
          damagedPlayerId: answered ? damagedPlayerId : null,
        },
      })
    }
    push(
      0,
      'thinking',
      index === 0 ? 'Five lives each' : index === 8 ? 'Final life' : 'Read the memory'
    )
    push(2800, 'buzz', 'Buzzes first')
    push(3050, 'answer', 'Answer locked')
    const damaged = scores.find((player) => player.id === damagedPlayerId)!
    damaged.lives = Math.max(0, damaged.lives! - 1)
    damaged.progress = damaged.lives
    const actor = scores.find((player) => player.id === activePlayerId)!
    if (correct) actor.score += 1
    else actor.mistakes += 1
    push(
      3400,
      correct ? 'correct' : 'wrong',
      correct ? 'Correct · rival loses a life' : 'Wrong · loses a life'
    )
    if (index === damagedIds.length - 1) push(4200, 'finished', 'Down Memory Lane complete')
  })
  return {
    part: 3,
    kind: 'memory',
    title: 'Down Memory Lane',
    competitorIds: players.map((p) => p.id),
    winnerId,
    durationMs,
    frames,
  }
}

/** A seeded, result-bound broadcast simulation requested for spectator mode.
 * Its events are presentation-only. Scores are never dispatched into gameplay;
 * the existing resolver remains authoritative for the round winner. */
export function buildCompetitionBroadcastSimulation(
  input: SimulationInput
): CompetitionBroadcastSimulation | null {
  const requiredCount = input.part === 1 ? 3 : 2
  if (
    input.competitorIds.length !== requiredCount ||
    new Set(input.competitorIds).size !== requiredCount ||
    !input.expectedWinnerId ||
    !input.competitorIds.includes(input.expectedWinnerId)
  )
    return null
  const players = input.competitorIds.map((id) =>
    input.game.players.find((player) => player.id === id)
  )
  if (
    players.some(
      (player) =>
        !player || player.isUser || player.status === 'evicted' || player.status === 'jury'
    )
  )
    return null
  const cast = players as Player[]
  return input.part === 1
    ? signalSimulation(input, cast)
    : input.part === 2
      ? sequenceSimulation(input, cast)
      : memorySimulation(input, cast)
}

/** Resolve from active scene time, so skipping, seeking and visibility suspension
 * cannot drift from the score/board state or consume hidden match time. */
export function competitionBroadcastFrameAt(
  simulation: CompetitionBroadcastSimulation,
  elapsedMs: number
): CompetitionBroadcastFrame {
  const elapsed = Number.isNaN(elapsedMs)
    ? 0
    : Math.max(0, Math.min(simulation.durationMs, elapsedMs))
  let low = 0
  let high = simulation.frames.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (simulation.frames[middle].atMs <= elapsed) low = middle
    else high = middle - 1
  }
  return simulation.frames[low]
}
