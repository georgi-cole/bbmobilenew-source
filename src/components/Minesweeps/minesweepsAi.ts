import { mulberry32 } from '../../store/rng'
import {
  buildBoard,
  computeFinalScore,
  countRevealedSafeCells,
  countSafeCells,
  isBoardSolved,
  MINESWEEPS_MINES,
  revealCell,
  toggleFlag,
  type MinesweepsBoard,
} from './minesweepsLogic'

export interface MinesweepsAiRun {
  won: boolean
  attempts: number
  revealedSafeCells: number
  totalSafeCells: number
  elapsedMs: number
  score: number
}

interface CellPoint {
  row: number
  col: number
}

interface Constraint {
  cells: Set<number>
  mines: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function hashPlayerId(playerId: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function getNeighbors(board: MinesweepsBoard, row: number, col: number): CellPoint[] {
  const neighbors: CellPoint[] = []
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue
      const nextRow = row + rowOffset
      const nextCol = col + colOffset
      if (nextRow >= 0 && nextRow < board.length && nextCol >= 0 && nextCol < board[0].length) {
        neighbors.push({ row: nextRow, col: nextCol })
      }
    }
  }
  return neighbors
}

function pointKey({ row, col }: CellPoint, cols: number): number {
  return row * cols + col
}

function pointFromKey(key: number, cols: number): CellPoint {
  return { row: Math.floor(key / cols), col: key % cols }
}

function getConstraints(board: MinesweepsBoard): Constraint[] {
  const constraints: Constraint[] = []
  const cols = board[0].length
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = board[row][col]
      if (!cell.revealed || cell.mine || cell.adjacent === 0) continue
      const neighbors = getNeighbors(board, row, col)
      const flaggedCount = neighbors.filter(
        ({ row: nextRow, col: nextCol }) => board[nextRow][nextCol].flagged
      ).length
      const hidden = neighbors
        .filter(({ row: nextRow, col: nextCol }) => {
          const neighbor = board[nextRow][nextCol]
          return !neighbor.revealed && !neighbor.flagged
        })
        .map((point) => pointKey(point, cols))
      if (hidden.length === 0) continue
      constraints.push({ cells: new Set(hidden), mines: cell.adjacent - flaggedCount })
    }
  }
  return constraints
}

function subtractCells(large: Set<number>, small: Set<number>): Set<number> {
  return new Set([...large].filter((cell) => !small.has(cell)))
}

function isSubset(left: Set<number>, right: Set<number>): boolean {
  return left.size <= right.size && [...left].every((cell) => right.has(cell))
}

function deriveForcedCells(
  board: MinesweepsBoard,
  useSubsetDeduction: boolean
): { safe: Set<number>; mines: Set<number>; constraintCount: number } {
  const safe = new Set<number>()
  const mines = new Set<number>()
  const constraints = getConstraints(board)

  for (const constraint of constraints) {
    if (constraint.mines === 0) {
      for (const cell of constraint.cells) safe.add(cell)
    } else if (constraint.mines === constraint.cells.size) {
      for (const cell of constraint.cells) mines.add(cell)
    }
  }

  if (useSubsetDeduction) {
    for (let leftIndex = 0; leftIndex < constraints.length; leftIndex += 1) {
      const left = constraints[leftIndex]
      for (let rightIndex = 0; rightIndex < constraints.length; rightIndex += 1) {
        if (leftIndex === rightIndex) continue
        const right = constraints[rightIndex]
        if (!isSubset(left.cells, right.cells) || left.cells.size === right.cells.size) continue
        const remainingCells = subtractCells(right.cells, left.cells)
        const remainingMines = right.mines - left.mines
        if (remainingMines === 0) {
          for (const cell of remainingCells) safe.add(cell)
        } else if (remainingMines === remainingCells.size) {
          for (const cell of remainingCells) mines.add(cell)
        }
      }
    }
  }

  return { safe, mines, constraintCount: constraints.length }
}

export function chooseLowestRiskCell(
  board: MinesweepsBoard,
  rng: () => number,
  skill: number
): CellPoint | null {
  const cols = board[0].length
  const hiddenCells: CellPoint[] = []
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = board[row][col]
      if (!cell.revealed && !cell.flagged) hiddenCells.push({ row, col })
    }
  }
  if (hiddenCells.length === 0) return null

  const constraints = getConstraints(board)
  const sums = new Map<number, number>()
  const counts = new Map<number, number>()
  for (const constraint of constraints) {
    const risk = clamp(constraint.mines / constraint.cells.size, 0, 1)
    for (const key of constraint.cells) {
      sums.set(key, (sums.get(key) ?? 0) + risk)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const remainingMines = Math.max(
    0,
    MINESWEEPS_MINES - board.flat().filter((cell) => cell.flagged).length
  )
  const unconstrainedRisk = remainingMines / hiddenCells.length
  const ranked = hiddenCells
    .map((point) => {
      const key = pointKey(point, cols)
      const constraintCount = counts.get(key) ?? 0
      const risk = constraintCount > 0 ? (sums.get(key) ?? 0) / constraintCount : unconstrainedRisk
      return { point, risk }
    })
    .sort((left, right) => left.risk - right.risk)

  // Lower-skill solvers spread guesses across more of the plausible low-risk
  // cells; stronger solvers consistently choose the smallest estimated risk.
  const candidateCount = Math.max(1, Math.ceil(1 + (1 - skill) * 4))
  const chosenIndex = Math.floor(rng() * Math.min(candidateCount, ranked.length))
  return ranked[chosenIndex]?.point ?? null
}

export function simulateMinesweepsAiRun({
  seed,
  playerId,
  skill = 0.5,
}: {
  seed: number
  playerId: string
  skill?: number
}): MinesweepsAiRun {
  const normalizedSkill = clamp(skill, 0, 1)
  const playerHash = hashPlayerId(playerId)
  const boardSeed = ((seed >>> 0) ^ playerHash) >>> 0
  const rng = mulberry32((boardSeed ^ 0xa511e9b3) >>> 0)
  const subsetReasoningRng = mulberry32((boardSeed ^ 0x6d2b79f5) >>> 0)
  const start = { row: 4, col: 4 }
  let board = buildBoard({ seed: boardSeed, safeCell: start })
  let attempts = 0
  let elapsedMs = 4_000 + Math.round(rng() * 6_000)
  let won = false
  let finished = false

  const firstReveal = revealCell(board, start.row, start.col)
  board = firstReveal.board
  attempts += 1
  if (isBoardSolved(board)) {
    won = true
    finished = true
  }

  // Every non-terminal action reveals a previously hidden cell, so the board
  // area is also a hard upper bound on solver iterations.
  while (!finished && attempts < board.length * board[0].length) {
    const canCompareConstraintPairs = subsetReasoningRng() < normalizedSkill
    const { safe, mines, constraintCount } = deriveForcedCells(board, canCompareConstraintPairs)
    let newlyFlagged = 0
    for (const key of mines) {
      const point = pointFromKey(key, board[0].length)
      if (!board[point.row][point.col].flagged) {
        board = toggleFlag(board, point.row, point.col)
        newlyFlagged += 1
      }
    }
    // The live game uses a 420ms long press for each flag. Include that input
    // time plus the reasoning needed to mark each newly proved mine.
    elapsedMs += newlyFlagged * (420 + 180 + Math.round(rng() * 350))

    const safePoints = [...safe]
      .filter((key) => {
        const point = pointFromKey(key, board[0].length)
        const cell = board[point.row][point.col]
        return !cell.revealed && !cell.flagged
      })
      .map((key) => pointFromKey(key, board[0].length))
    const target =
      safePoints.length > 0
        ? safePoints[Math.floor(rng() * safePoints.length)]
        : chooseLowestRiskCell(board, rng, normalizedSkill)
    if (!target) break

    // Human pace is dominated by reading nearby clues, comparing constraints,
    // and deciding whether a safe deduction is strong enough to act on. Scale
    // those costs with the visible frontier and slow risk guesses modestly.
    const clueReviewMs = Math.min(1_500, constraintCount * 110)
    const uncertaintyReviewMs = safePoints.length > 0 ? 350 : 850
    const actionThinkMs =
      1_500 + (1 - normalizedSkill) * 1_800 + rng() * 1_600 + clueReviewMs + uncertaintyReviewMs
    elapsedMs += Math.round(actionThinkMs)
    attempts += 1
    const result = revealCell(board, target.row, target.col)
    board = result.board
    if (result.hitMine) {
      finished = true
    } else if (isBoardSolved(board)) {
      won = true
      finished = true
    }
  }

  const revealedSafeCells = countRevealedSafeCells(board)
  const totalSafeCells = countSafeCells(board)
  return {
    won,
    attempts,
    revealedSafeCells,
    totalSafeCells,
    elapsedMs,
    score: computeFinalScore({ won, revealedSafeCells, totalSafeCells, elapsedMs }),
  }
}

export function simulateMinesweepsAiScore(args: {
  seed: number
  playerId: string
  skill?: number
}): number {
  return simulateMinesweepsAiRun(args).score
}
