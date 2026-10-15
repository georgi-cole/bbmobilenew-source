export const COLS = 10
export const ROWS = 20
export const BUFFER_ROWS = 2
export const TOTAL_ROWS = ROWS + BUFFER_ROWS
export const LINE_CLEAR_POINTS = [0, 100, 300, 500, 800]
export const HARD_DROP_PER_ROW = 2
export const LINES_PER_LEVEL = 10
export const WALL_KICK_OFFSETS = [0, -1, 1, -2, 2]

export type PieceKey = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

export interface Piece {
  key: PieceKey
  shape: number[][]
  color: string
}

export interface FallingPiece extends Piece {
  x: number
  y: number
  rotationIndex: number
}

export interface BoardCell {
  color: string
  avatarId?: string
}

export type Board = (BoardCell | null)[][]

export const SHAPES: Record<PieceKey, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
}

export const COLORS: Record<PieceKey, string> = {
  I: '#00d4ff',
  O: '#ffe000',
  T: '#c855f5',
  S: '#44ee66',
  Z: '#ff4444',
  J: '#4477ff',
  L: '#ff9000',
}

export const PIECE_KEYS: PieceKey[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

export function emptyBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () => Array<BoardCell | null>(COLS).fill(null))
}

export function rotateShape(shape: number[][]): number[][] {
  return shape[0].map((_, column) => shape.map((row) => row[column]).reverse())
}

export function collides(board: Board, shape: number[][], x: number, y: number): boolean {
  for (let row = 0; row < shape.length; row++) {
    for (let column = 0; column < shape[row].length; column++) {
      if (!shape[row][column]) continue
      const nextX = x + column
      const nextY = y + row
      if (nextX < 0 || nextX >= COLS) return true
      if (nextY >= TOTAL_ROWS) return true
      if (nextY >= 0 && board[nextY][nextX] !== null) return true
    }
  }
  return false
}

export function ghostY(board: Board, piece: FallingPiece): number {
  let y = piece.y
  while (!collides(board, piece.shape, piece.x, y + 1)) y++
  return y
}

export function buildBag(rng: () => number): PieceKey[] {
  const bag = [...PIECE_KEYS]
  for (let index = bag.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]]
  }
  return bag
}

export function makePiece(key: PieceKey): Piece {
  return { key, shape: SHAPES[key].map((row) => [...row]), color: COLORS[key] }
}

export function spawnFalling(key: PieceKey): FallingPiece {
  const piece = makePiece(key)
  return {
    ...piece,
    x: Math.floor((COLS - piece.shape[0].length) / 2),
    y: BUFFER_ROWS - piece.shape.length,
    rotationIndex: 0,
  }
}

export function lockPiece(
  board: Board,
  piece: FallingPiece,
  createCell: (color: string) => BoardCell
): Board {
  const next = board.map((row) => [...row])
  for (let row = 0; row < piece.shape.length; row++) {
    for (let column = 0; column < piece.shape[row].length; column++) {
      if (!piece.shape[row][column]) continue
      const boardY = piece.y + row
      const boardX = piece.x + column
      if (boardY >= 0 && boardY < TOTAL_ROWS && boardX >= 0 && boardX < COLS) {
        next[boardY][boardX] = createCell(piece.color)
      }
    }
  }
  return next
}

export function clearFullLines(board: Board): { clearedBoard: Board; clearedRows: number[] } {
  const clearedRows: number[] = []
  let remaining = board.filter((row, index) => {
    const full = row.every((cell) => cell !== null)
    if (full) clearedRows.push(index)
    return !full
  })

  while (remaining.length < TOTAL_ROWS) {
    remaining = [Array<BoardCell | null>(COLS).fill(null), ...remaining]
  }

  return { clearedBoard: remaining, clearedRows }
}

export function boardStackHeight(board: Board): number {
  for (let row = BUFFER_ROWS; row < TOTAL_ROWS; row++) {
    if (board[row].some((cell) => cell !== null)) return TOTAL_ROWS - row
  }
  return 0
}

export function dropIntervalMs(level: number, speedMultiplier: number): number {
  const standardInterval = 1000 - (Math.min(level, 20) - 1) * 47
  return Math.max(65, Math.round(standardInterval * speedMultiplier))
}
