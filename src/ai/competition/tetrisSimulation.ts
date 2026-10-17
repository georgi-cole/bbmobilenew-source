import { mulberry32 } from '../../store/rng'
import {
  boardStackHeight,
  buildBag,
  clearFullLines,
  collides,
  dropIntervalMs,
  emptyBoard,
  ghostY,
  HARD_DROP_PER_ROW,
  LINES_PER_LEVEL,
  LINE_CLEAR_POINTS,
  lockPiece,
  rotateShape,
  spawnFalling,
  WALL_KICK_OFFSETS,
} from '../../components/TetrisComp/tetrisEngine'
import type { Board, FallingPiece, PieceKey } from '../../components/TetrisComp/tetrisEngine'

export interface TetrisAiParticipantInput {
  id: string
  /** Competition skill rating on the shared 0–100 scale. */
  baselineScore?: number
}

export interface TetrisAiRoundInput extends TetrisAiParticipantInput {
  seed: number
  durationMs: number
  speedMultiplier: number
  tensionLevel: number
}

export interface TetrisAiRoundPerformance {
  score: number
  lines: number
  pieces: number
  maxStackHeight: number
}

interface Placement {
  piece: FallingPiece
  evaluation: number
}

type AiAction = { kind: 'rotate' } | { kind: 'move'; delta: -1 | 1 }

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function hashString(value: string): number {
  let hash = 0x811c9dc5 >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function getBoardFeatures(board: Board): {
  aggregateHeight: number
  holes: number
  bumpiness: number
  maxHeight: number
} {
  const columnHeights: number[] = []
  let holes = 0

  for (let column = 0; column < board[0].length; column += 1) {
    let firstFilledRow = board.length
    for (let row = 0; row < board.length; row += 1) {
      if (board[row][column] !== null) {
        firstFilledRow = row
        break
      }
    }

    const height = firstFilledRow === board.length ? 0 : board.length - firstFilledRow
    columnHeights.push(height)
    if (height > 0) {
      for (let row = firstFilledRow; row < board.length; row += 1) {
        if (board[row][column] === null) holes += 1
      }
    }
  }

  let bumpiness = 0
  for (let column = 0; column < columnHeights.length - 1; column += 1) {
    bumpiness += Math.abs(columnHeights[column] - columnHeights[column + 1])
  }

  return {
    aggregateHeight: columnHeights.reduce((sum, height) => sum + height, 0),
    holes,
    bumpiness,
    maxHeight: Math.max(0, ...columnHeights),
  }
}

function* enumeratePlacements(
  board: Board,
  key: PieceKey,
  cooperative: boolean
): Generator<void, Placement[], void> {
  const placements: Placement[] = []
  const initialPiece = spawnFalling(key)
  let shape = initialPiece.shape
  const seenOrientations = new Set<string>()

  for (let rotationSteps = 0; rotationSteps < 4; rotationSteps += 1) {
    const width = shape[0].length
    const orientationKey = shape.map((row) => row.join('')).join('/')
    if (!seenOrientations.has(orientationKey)) {
      seenOrientations.add(orientationKey)
      for (let x = 0; x <= board[0].length - width; x += 1) {
        if (collides(board, shape, x, initialPiece.y)) continue
        let landingY = initialPiece.y
        while (!collides(board, shape, x, landingY + 1)) landingY += 1

        const piece = { ...initialPiece, shape, x, rotationIndex: rotationSteps }
        const landedPiece = { ...piece, y: landingY }
        const lockedBoard = lockPiece(board, landedPiece, (color) => ({ color }))
        const { clearedBoard, clearedRows } = clearFullLines(lockedBoard)
        const features = getBoardFeatures(clearedBoard)
        // Favor clears and a low, open surface. Holes are costly because they
        // usually take several later pieces to repair.
        const evaluation =
          clearedRows.length * 7.5 -
          features.aggregateHeight * 0.46 -
          features.holes * 1.15 -
          features.bumpiness * 0.2 -
          features.maxHeight * 0.3 +
          (landingY - initialPiece.y) * 0.012

        placements.push({ piece, evaluation })
        if (cooperative) yield
      }
    }
    shape = rotateShape(shape)
  }

  return placements.sort((left, right) => right.evaluation - left.evaluation)
}

function* findMovementActions(
  board: Board,
  start: FallingPiece,
  target: FallingPiece,
  cooperative: boolean
): Generator<void, AiAction[], void> {
  const queue: Array<{ piece: FallingPiece; actions: AiAction[] }> = [{ piece: start, actions: [] }]
  const visited = new Set<string>()
  let queueIndex = 0

  while (queueIndex < queue.length) {
    const current = queue[queueIndex]
    queueIndex += 1
    const stateKey = `${current.piece.rotationIndex}:${current.piece.x}`
    if (visited.has(stateKey)) continue
    visited.add(stateKey)

    if (current.piece.rotationIndex === target.rotationIndex && current.piece.x === target.x) {
      return current.actions
    }

    for (const delta of [-1, 1] as const) {
      if (!collides(board, current.piece.shape, current.piece.x + delta, current.piece.y)) {
        queue.push({
          piece: { ...current.piece, x: current.piece.x + delta },
          actions: [...current.actions, { kind: 'move', delta }],
        })
      }
    }

    const rotatedShape = rotateShape(current.piece.shape)
    for (const offset of WALL_KICK_OFFSETS) {
      if (collides(board, rotatedShape, current.piece.x + offset, current.piece.y)) continue
      queue.push({
        piece: {
          ...current.piece,
          shape: rotatedShape,
          x: current.piece.x + offset,
          rotationIndex: (current.piece.rotationIndex + 1) % 4,
        },
        actions: [...current.actions, { kind: 'rotate' }],
      })
      break
    }

    if (cooperative) yield
  }

  return []
}

/**
 * Plays one seeded round on the same board, piece bag, gravity, hard-drop,
 * line-clear, level, and top-out rules as the human component. Skill changes
 * placement errors and handling time; no human score or opponent ranking is read.
 */
function* simulateTetrisAiRunSteps(
  { id, baselineScore = 50, seed, durationMs, speedMultiplier, tensionLevel }: TetrisAiRoundInput,
  cooperative: boolean
): Generator<void, TetrisAiRoundPerformance, void> {
  const skill = clamp(baselineScore / 100, 0, 1)
  const rng = mulberry32(((seed >>> 0) ^ hashString(id) ^ 0x71e715) >>> 0)
  const pieceRng = mulberry32(((seed >>> 0) ^ hashString(id) ^ 0x7e7715) >>> 0)
  let bag: PieceKey[] = []
  let queuedPiece: PieceKey | null = null
  let board = emptyBoard()
  let score = 0
  let lines = 0
  let level = 1
  let pieces = 0
  let elapsedMs = 0
  let maxHeight = 0

  const drawPiece = () => {
    if (queuedPiece) {
      const key = queuedPiece
      queuedPiece = null
      return key
    }
    if (bag.length === 0) bag = buildBag(pieceRng)
    return bag.shift()!
  }

  while (elapsedMs < durationMs) {
    if (cooperative) yield
    const key = drawPiece()
    const placements = yield* enumeratePlacements(board, key, cooperative)
    if (placements.length === 0) break

    const mistakeChance = clamp(0.44 - skill * 0.2 + (tensionLevel - 1) * 0.02, 0.12, 0.52)
    const madeMistake = rng() < mistakeChance
    const mistakePool = Math.min(10 + Math.round((1 - skill) * 8), placements.length)
    const selected = madeMistake
      ? (placements[2 + Math.floor(rng() * Math.max(1, mistakePool - 2))] ?? placements[0])
      : placements[0]

    let currentPiece = spawnFalling(key)
    const actions = yield* findMovementActions(board, currentPiece, selected.piece, cooperative)

    const thinkMs = 650 + (1 - skill) * 350 + rng() * 500 + (madeMistake ? 800 + rng() * 600 : 0)
    const moveStepMs = 70 + (1 - skill) * 35
    let actionIndex = 0
    let actionAt = elapsedMs + thinkMs
    let gravityAt = elapsedMs + dropIntervalMs(level, speedMultiplier)
    let locked = false

    const lockCurrent = (hardDrop: boolean) => {
      if (hardDrop) {
        const landingY = ghostY(board, currentPiece)
        score += (landingY - currentPiece.y) * HARD_DROP_PER_ROW
        currentPiece = { ...currentPiece, y: landingY }
      }

      const lockedBoard = lockPiece(board, currentPiece, (color) => ({ color }))
      const { clearedBoard, clearedRows } = clearFullLines(lockedBoard)
      lines += clearedRows.length
      score += LINE_CLEAR_POINTS[Math.min(clearedRows.length, 4)] * level
      level = Math.floor(lines / LINES_PER_LEVEL) + 1
      pieces += 1
      board = clearedBoard
      maxHeight = Math.max(maxHeight, boardStackHeight(board))
      locked = true
    }

    if (collides(board, currentPiece.shape, currentPiece.x, currentPiece.y)) break

    while (!locked && elapsedMs < durationMs) {
      if (cooperative) yield
      const nextEventAt = Math.min(actionAt, gravityAt, durationMs)
      elapsedMs = nextEventAt

      if (elapsedMs >= durationMs) break

      if (actionAt <= gravityAt) {
        if (actionIndex >= actions.length) {
          lockCurrent(true)
          continue
        }

        const action = actions[actionIndex]
        actionIndex += 1
        if (action.kind === 'move') {
          if (!collides(board, currentPiece.shape, currentPiece.x + action.delta, currentPiece.y)) {
            currentPiece = { ...currentPiece, x: currentPiece.x + action.delta }
          }
        } else {
          const rotatedShape = rotateShape(currentPiece.shape)
          for (const offset of WALL_KICK_OFFSETS) {
            if (!collides(board, rotatedShape, currentPiece.x + offset, currentPiece.y)) {
              currentPiece = {
                ...currentPiece,
                shape: rotatedShape,
                x: currentPiece.x + offset,
                rotationIndex: (currentPiece.rotationIndex + 1) % 4,
              }
              break
            }
          }
        }

        actionAt =
          actionIndex < actions.length
            ? elapsedMs + (action.kind === 'rotate' ? 135 : moveStepMs)
            : elapsedMs
      }

      if (!locked && gravityAt <= elapsedMs) {
        if (collides(board, currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
          lockCurrent(false)
        } else {
          currentPiece = { ...currentPiece, y: currentPiece.y + 1 }
        }
        gravityAt = elapsedMs + dropIntervalMs(level, speedMultiplier)
      }
    }

    if (!locked) break
  }

  return { score, lines, pieces, maxStackHeight: maxHeight }
}

export function simulateTetrisAiRun(input: TetrisAiRoundInput): TetrisAiRoundPerformance {
  const simulation = simulateTetrisAiRunSteps(input, false)
  let step = simulation.next()
  while (!step.done) step = simulation.next()
  return step.value
}

export interface TetrisAiSliceOptions {
  /** Main-thread CPU budget spent between animation frames. */
  timeSliceMs?: number
  /** Scheduling and clock overrides keep chunking deterministic in tests. */
  yieldToFrame?: () => Promise<void>
  now?: () => number
  shouldCancel?: () => boolean
}

function yieldToBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

/** Runs seeded AI simulations over frame-sized slices without changing their decisions. */
export async function simulateTetrisAiRunsInSlices(
  inputs: readonly TetrisAiRoundInput[],
  {
    timeSliceMs = 6,
    yieldToFrame = yieldToBrowserFrame,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    shouldCancel = () => false,
  }: TetrisAiSliceOptions = {}
): Promise<TetrisAiRoundPerformance[] | null> {
  if (inputs.length === 0) return []

  const simulations = inputs.map((input) => simulateTetrisAiRunSteps(input, true))
  const results: TetrisAiRoundPerformance[] = []
  let simulationIndex = 0

  // Let the caller render its pending state before the first CPU slice.
  await yieldToFrame()

  while (simulationIndex < simulations.length) {
    if (shouldCancel()) return null

    const deadline = now() + Math.max(0, timeSliceMs)
    let advanced = false
    while (simulationIndex < simulations.length && (!advanced || now() < deadline)) {
      const step = simulations[simulationIndex].next()
      advanced = true
      if (step.done) {
        results.push(step.value)
        simulationIndex += 1
      }
    }

    if (simulationIndex < simulations.length) await yieldToFrame()
  }

  return results
}
