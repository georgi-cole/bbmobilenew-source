import { expect, type Locator, type Page } from '@playwright/test'

import { getAllGames } from '../../../src/minigames/registry'
import { isInMinigameCertificationScope } from '../../../tests/helpers/minigameCertificationScope'
import type { SimulationSkill } from './types'
import { SeededRandom } from './seededRandom'
import { createVaultCrackerLayout } from '../../../src/minigames/vaultCracker/engine/layout'
import { hasAnyValidMove } from '../../../src/minigames/rescueTheKing/rescueTheKingLogic'
import {
  SYMBOL_EMOJI,
  type Board,
  type Cell,
  type TileSymbol,
} from '../../../src/minigames/rescueTheKing/rescueTheKingTypes'
import { FINAL_OVERRIDE_QUESTION_BANK } from '../../../src/components/FinalThreeCircuit/finalOverrideQuestionBank'

type DriverKind = 'tap' | 'memory' | 'keyboard' | 'board' | 'choice' | 'path' | 'finale'

interface MinigameDriverProfile {
  kind: DriverKind
  primaryInput: string
}

/**
 * This explicit table is the registry completeness boundary. Adding a playable
 * game requires choosing a real input family before the season matrix can run.
 */
export const MINIGAME_DRIVER_PROFILES: Readonly<Record<string, MinigameDriverProfile>> = {
  quickTap: { kind: 'tap', primaryInput: 'rapid tap target' },
  quickTapSeasons: { kind: 'tap', primaryInput: 'rapid tap target and season modifiers' },
  memoryMatch: { kind: 'memory', primaryInput: 'ordered colour buttons' },
  timingBar: { kind: 'tap', primaryInput: 'timed stop button' },
  estimationGame: { kind: 'keyboard', primaryInput: 'numeric estimate' },
  holdWall: { kind: 'tap', primaryInput: 'press and hold' },
  famousFigures: { kind: 'keyboard', primaryInput: 'text guess and hint' },
  silentSaboteur: { kind: 'choice', primaryInput: 'target and vote choice' },
  majorityRules: { kind: 'choice', primaryInput: 'multiple-choice vote' },
  percentagePanic: { kind: 'choice', primaryInput: 'percentage estimate and final duel guess' },
  pressurePlank: { kind: 'tap', primaryInput: 'timed balance control' },
  colorMatch: { kind: 'memory', primaryInput: 'colour choice' },
  logicLocks: { kind: 'board', primaryInput: 'lock controls' },
  snake: { kind: 'keyboard', primaryInput: 'direction controls' },
  cardClash: { kind: 'choice', primaryInput: 'card choice and peek' },
  hangman: { kind: 'keyboard', primaryInput: 'letter entry' },
  tiltLabyrinth: { kind: 'keyboard', primaryInput: 'keyboard/drag direction' },
  threeDigitsQuiz: { kind: 'choice', primaryInput: 'numeric answer choice' },
  capitalization: { kind: 'keyboard', primaryInput: 'capitalized text entry' },
  minesweeps: { kind: 'board', primaryInput: 'reveal and flag tiles' },
  gatesOfTheEye: { kind: 'choice', primaryInput: 'risk-and-reward door choice' },
  dontGoOver: { kind: 'keyboard', primaryInput: 'numeric estimate' },
  blackjackTournament: { kind: 'choice', primaryInput: 'card actions' },
  riskWheel: { kind: 'choice', primaryInput: 'spin and wager choices' },
  wildcardWestern: { kind: 'choice', primaryInput: 'duel choices' },
  castleRescue: { kind: 'keyboard', primaryInput: 'platform controls' },
  castleRescueRemastered: { kind: 'keyboard', primaryInput: 'platform controls' },
  castleRescue2: { kind: 'keyboard', primaryInput: 'platform controls' },
  castleRescue2Remastered: { kind: 'keyboard', primaryInput: 'platform controls' },
  glass_bridge_brutal: { kind: 'path', primaryInput: 'The Crystal Path tile choice' },
  crystal_path_shattered: { kind: 'path', primaryInput: 'Crystal Path: Infinity tile choice' },
  trapAuction: { kind: 'choice', primaryInput: 'bid and target choice' },
  mysticChamber: { kind: 'choice', primaryInput: 'power and target choices' },
  chainOfGreed: { kind: 'choice', primaryInput: 'split, steal, vote, or duel choice' },
  batteryLow: { kind: 'choice', primaryInput: 'reserve and bank choices' },
  boxedOut: { kind: 'choice', primaryInput: 'box choice and lock-in' },
  houseOfDarkness: { kind: 'memory', primaryInput: 'memory-card selection' },
  finalThreeCircuit: { kind: 'finale', primaryInput: 'six visible finale stages' },
  downMemoryLane: { kind: 'choice', primaryInput: 'buzz and season-history answer' },
}

const HOUSE_OF_CARDS_MEMORY = new WeakMap<Page, Map<string, Map<string, Set<number>>>>()
const HOUSE_OF_DARKNESS_MEMORY = new WeakMap<Page, Map<string, Map<string, Set<number>>>>()
const HANGMAN_GUESS_SEQUENCE = new WeakMap<Page, number>()
const VAULT_CRACKER_DIGITS = new WeakMap<Page, number[]>()
const RESCUE_THE_KING_NO_MOVE_STREAK = new WeakMap<Page, { board: string; count: number }>()
const FINAL_THREE_SEQUENCE_PLANS = new WeakMap<
  Page,
  { target: string; moves: string[]; index: number }
>()
const MINIGAME_FAST_CLOCK = new WeakSet<Page>()
const TILT_LABYRINTH_CLOCK = new WeakSet<Page>()
interface TiltLabyrinthPoint {
  col: number
  row: number
}

interface TiltLabyrinthDriveState {
  route: TiltLabyrinthPoint[]
  keyPoint: TiltLabyrinthPoint
  maze: TiltLabyrinthMazeGraph
  waypointIndex: number
  ball: { x: number; y: number }
  lastDirection: string | null
  actions: number
  stallCount: number
}

const TILT_LABYRINTH_DRIVE = new WeakMap<Page, TiltLabyrinthDriveState>()

export async function installTiltLabyrinthTestClock(page: Page): Promise<void> {
  await page.clock.install()
  TILT_LABYRINTH_CLOCK.add(page)
}

type TiltLabyrinthMazeGraph = Map<string, TiltLabyrinthPoint[]>

interface TiltLabyrinthVisibleBoard {
  route: TiltLabyrinthPoint[]
  keyPoint: TiltLabyrinthPoint
  maze: TiltLabyrinthMazeGraph
}

function tiltLabyrinthPointKey(point: TiltLabyrinthPoint): string {
  return point.col + ':' + point.row
}

function buildVisibleTiltRoute(
  candidates: TiltLabyrinthPoint[],
  maze: TiltLabyrinthMazeGraph,
  keyPoint: TiltLabyrinthPoint
): TiltLabyrinthPoint[] {
  const visible = new Set(candidates.map(tiltLabyrinthPointKey))
  const start = { col: 0, row: 0 }
  const goal = { col: 18, row: 24 }
  visible.add(tiltLabyrinthPointKey(start))
  visible.add(tiltLabyrinthPointKey(goal))
  visible.add(tiltLabyrinthPointKey(keyPoint))
  const findSegment = (from: TiltLabyrinthPoint, to: TiltLabyrinthPoint) => {
    const queue = [from]
    const previous = new Map<string, TiltLabyrinthPoint | null>([
      [tiltLabyrinthPointKey(from), null],
    ])
    while (queue.length > 0) {
      const current = queue.shift()!
      const currentKey = tiltLabyrinthPointKey(current)
      if (currentKey === tiltLabyrinthPointKey(to)) {
        const route: TiltLabyrinthPoint[] = []
        let point: TiltLabyrinthPoint | null = current
        while (point) {
          route.push(point)
          point = previous.get(tiltLabyrinthPointKey(point)) ?? null
        }
        return route.reverse()
      }
      for (const next of maze.get(currentKey) ?? []) {
        const nextKey = tiltLabyrinthPointKey(next)
        if (!visible.has(nextKey) || previous.has(nextKey)) continue
        previous.set(nextKey, current)
        queue.push(next)
      }
    }
    return []
  }
  const toKey = findSegment(start, keyPoint)
  const toGoal = findSegment(keyPoint, goal)
  return toKey.length && toGoal.length ? [...toKey, ...toGoal.slice(1)] : []
}

async function readVisibleTiltRoute(canvas: Locator): Promise<TiltLabyrinthVisibleBoard> {
  const board = await canvas.evaluate((element) => {
    const surface = element as HTMLCanvasElement
    const context = surface.getContext('2d', { willReadFrequently: true })
    if (!context) return { candidates: [], maze: {} }
    const image = context.getImageData(0, 0, surface.width, surface.height)
    const candidates: Array<{ col: number; row: number }> = []
    let keyPoint = { col: 0, row: 0 }
    let keyScore = -1
    const isWallPixel = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return false
      const offset = (y * surface.width + x) * 4
      const red = image.data[offset]!
      const green = image.data[offset + 1]!
      const blue = image.data[offset + 2]!
      return red >= 150 && green >= 120 && blue >= 220
    }
    const isWallAcross = (vertical: boolean, x: number, y: number) => {
      const offsets = [-5, 0, 5]
      return (
        offsets.filter((offset) =>
          isWallPixel(vertical ? x : x + offset, vertical ? y + offset : y)
        ).length >= 2
      )
    }
    for (let row = 0; row < 25; row += 1) {
      for (let col = 0; col < 19; col += 1) {
        const centerX = Math.round(((col + 0.5) * surface.width) / 19)
        const centerY = Math.round(((row + 0.5) * surface.height) / 25)
        let yellowPixels = 0
        let goldPixels = 0
        for (let y = centerY - 5; y <= centerY + 5; y += 1) {
          for (let x = centerX - 5; x <= centerX + 5; x += 1) {
            if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) continue
            const offset = (y * surface.width + x) * 4
            const red = image.data[offset]!
            const green = image.data[offset + 1]!
            const blue = image.data[offset + 2]!
            if (red > 65 && green > 50 && red > green * 1.05 && green > blue * 1.25) {
              yellowPixels += 1
            }
            // The key marker uses a deeper gold than the pale hint line.
            if (red > 190 && green > 110 && green < 210 && blue < 90) goldPixels += 1
          }
        }
        if (yellowPixels >= 5) candidates.push({ col, row })
        // Ignore the player ball at the starting cell, which uses a similar gold tone.
        if ((col !== 0 || row !== 0) && goldPixels > keyScore) {
          keyScore = goldPixels
          keyPoint = { col, row }
        }
      }
    }

    const maze: Record<string, Array<{ col: number; row: number }>> = {}
    for (let row = 0; row < 25; row += 1) {
      for (let col = 0; col < 19; col += 1) {
        const neighbors: Array<{ col: number; row: number }> = []
        const centerX = Math.round((col + 0.5) * 25)
        const centerY = Math.round((row + 0.5) * 25)
        if (col > 0 && !isWallAcross(true, col * 25, centerY)) {
          neighbors.push({ col: col - 1, row })
        }
        if (col < 18 && !isWallAcross(true, (col + 1) * 25, centerY)) {
          neighbors.push({ col: col + 1, row })
        }
        if (row > 0 && !isWallAcross(false, centerX, row * 25)) {
          neighbors.push({ col, row: row - 1 })
        }
        if (row < 24 && !isWallAcross(false, centerX, (row + 1) * 25)) {
          neighbors.push({ col, row: row + 1 })
        }
        maze[col + ':' + row] = neighbors
      }
    }
    return { candidates, maze, keyPoint }
  })
  const maze = new Map<string, TiltLabyrinthPoint[]>(Object.entries(board.maze))
  return {
    route: buildVisibleTiltRoute(board.candidates, maze, board.keyPoint),
    keyPoint: board.keyPoint,
    maze,
  }
}

async function readTiltBallPosition(
  canvas: Locator,
  previous: { x: number; y: number }
): Promise<{ x: number; y: number } | null> {
  return canvas.evaluate((element, prior) => {
    const surface = element as HTMLCanvasElement
    const context = surface.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    const searchRadius = 250
    const left = Math.max(0, Math.floor(prior.x - searchRadius))
    const top = Math.max(0, Math.floor(prior.y - searchRadius))
    const right = Math.min(surface.width, Math.ceil(prior.x + searchRadius + 1))
    const bottom = Math.min(surface.height, Math.ceil(prior.y + searchRadius + 1))
    const width = right - left
    const height = bottom - top
    const image = context.getImageData(left, top, width, height)
    const mask = new Uint8Array(width * height)
    const visited = new Uint8Array(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        const red = image.data[offset]!
        const green = image.data[offset + 1]!
        const blue = image.data[offset + 2]!
        if (red >= 235 && green >= 155 && green <= 210 && blue <= 55) {
          mask[y * width + x] = 1
        }
      }
    }
    const candidates: Array<{ x: number; y: number }> = []
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index] || visited[index]) continue
      const stack = [index]
      visited[index] = 1
      let count = 0
      let sumX = 0
      let sumY = 0
      while (stack.length > 0) {
        const current = stack.pop()!
        const x = current % width
        const y = Math.floor(current / width)
        count += 1
        sumX += x
        sumY += y
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const neighbor = ny * width + nx
            if (!mask[neighbor] || visited[neighbor]) continue
            visited[neighbor] = 1
            stack.push(neighbor)
          }
        }
      }
      if (count >= 35 && count <= 90) {
        candidates.push({ x: left + sumX / count, y: top + sumY / count })
      }
    }
    if (candidates.length === 0) return null
    candidates.sort(
      (leftPoint, rightPoint) =>
        Math.hypot(leftPoint.x - prior.x, leftPoint.y - prior.y) -
        Math.hypot(rightPoint.x - prior.x, rightPoint.y - prior.y)
    )
    return candidates[0]!
  }, previous)
}

export function tiltLabyrinthDriverDiagnostic(page: Page): string {
  const state = TILT_LABYRINTH_DRIVE.get(page)
  if (!state) return 'The visible hint route was not captured.'
  return (
    'Visible hint route: ' +
    state.route.length +
    '; key waypoint ' +
    state.keyPoint.col +
    ',' +
    state.keyPoint.row +
    '; route progress ' +
    state.waypointIndex +
    '/' +
    (state.route.length - 1) +
    '; ball at ' +
    state.ball.x.toFixed(1) +
    ',' +
    state.ball.y.toFixed(1) +
    '; next waypoint ' +
    (state.route[state.waypointIndex + 1]
      ? state.route[state.waypointIndex + 1]!.col + ',' + state.route[state.waypointIndex + 1]!.row
      : 'complete') +
    '; last direction ' +
    (state.lastDirection ?? 'none') +
    '; route prefix ' +
    state.route
      .slice(0, 10)
      .map((point) => point.col + ',' + point.row)
      .join(' -> ') +
    '; route window ' +
    state.route
      .slice(Math.max(0, state.waypointIndex - 2), state.waypointIndex + 4)
      .map((point) => point.col + ',' + point.row)
      .join(' -> ') +
    '; current cell neighbors ' +
    (state.maze.get(Math.floor(state.ball.x / 25) + ':' + Math.floor(state.ball.y / 25)) ?? [])
      .map((point) => point.col + ',' + point.row)
      .join(',') +
    '; steering actions ' +
    state.actions +
    '; consecutive no-movement actions ' +
    state.stallCount +
    '.'
  )
}

async function playTiltLabyrinthTurn(page: Page, host: Locator): Promise<boolean> {
  const continueButton = await firstVisibleEnabled(host.getByRole('button', { name: /^Continue$/ }))
  if (continueButton) {
    await continueButton.click()
    return true
  }

  const canvas = host.locator('canvas.tilt-labyrinth-canvas')
  if (!(await canvas.isVisible().catch(() => false))) return false
  let state = TILT_LABYRINTH_DRIVE.get(page)
  if (!state) {
    const hint = await firstVisibleEnabled(
      host.getByRole('button', { name: /Use hint: add 10 seconds and show the correct path/i })
    )
    if (hint) {
      if (!(await clickWithShortTimeout(hint))) return false
      if (TILT_LABYRINTH_CLOCK.has(page)) {
        await page.clock.runFor(50)
      } else {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
      }
      const board = await readVisibleTiltRoute(canvas)
      if (board.route.length < 3) {
        throw new Error("Tilt Labyrinth's visible hint did not expose a connected route.")
      }
      state = {
        route: board.route,
        keyPoint: board.keyPoint,
        maze: board.maze,
        waypointIndex: 0,
        ball: { x: 12.5, y: 12.5 },
        lastDirection: null,
        actions: 0,
        stallCount: 0,
      }
      TILT_LABYRINTH_DRIVE.set(page, state)
      return true
    }
    return false
  }

  state.actions += 1
  const currentCell = {
    col: Math.max(0, Math.min(18, Math.floor(state.ball.x / 25))),
    row: Math.max(0, Math.min(24, Math.floor(state.ball.y / 25))),
  }
  const routeIndexes = new Map(
    state.route.map((point, index) => [tiltLabyrinthPointKey(point), index])
  )
  const currentKey = tiltLabyrinthPointKey(currentCell)
  let routeIndex = routeIndexes.get(currentKey)
  let targetPoint: TiltLabyrinthPoint | undefined
  let straightCells = 1

  if (routeIndex != null) {
    state.waypointIndex = routeIndex
    if (routeIndex >= state.route.length - 1) return false
    const first = state.route[routeIndex + 1]!
    const direction = {
      col: Math.sign(first.col - currentCell.col),
      row: Math.sign(first.row - currentCell.row),
    }
    let targetIndex = routeIndex + 1
    while (targetIndex + 1 < state.route.length) {
      const current = state.route[targetIndex]!
      const next = state.route[targetIndex + 1]!
      if (
        Math.sign(next.col - current.col) !== direction.col ||
        Math.sign(next.row - current.row) !== direction.row
      ) {
        break
      }
      targetIndex += 1
    }
    targetPoint = state.route[targetIndex]
    straightCells = targetIndex - routeIndex
  } else {
    const queue = [currentCell]
    const previous = new Map<string, TiltLabyrinthPoint | null>([[currentKey, null]])
    let routeKey: string | undefined
    while (queue.length > 0) {
      const point = queue.shift()!
      const key = tiltLabyrinthPointKey(point)
      if (routeIndexes.has(key)) {
        routeKey = key
        break
      }
      for (const neighbor of state.maze.get(key) ?? []) {
        const neighborKey = tiltLabyrinthPointKey(neighbor)
        if (previous.has(neighborKey)) continue
        previous.set(neighborKey, point)
        queue.push(neighbor)
      }
    }
    if (!routeKey) return false
    routeIndex = routeIndexes.get(routeKey)
    if (routeIndex == null) return false
    state.waypointIndex = routeIndex
    const rejoinPath: TiltLabyrinthPoint[] = []
    let point: TiltLabyrinthPoint | null = state.route[routeIndex]!
    while (point) {
      rejoinPath.push(point)
      point = previous.get(tiltLabyrinthPointKey(point)) ?? null
    }
    rejoinPath.reverse()
    targetPoint = rejoinPath[1] ?? state.route[routeIndex + 1]
  }

  if (!targetPoint) return false
  const targetX = (targetPoint.col + 0.5) * 25
  const targetY = (targetPoint.row + 0.5) * 25
  const deltaX = targetX - state.ball.x
  const deltaY = targetY - state.ball.y
  const direction =
    Math.abs(deltaX) > Math.abs(deltaY)
      ? deltaX >= 0
        ? 'ArrowRight'
        : 'ArrowLeft'
      : deltaY >= 0
        ? 'ArrowDown'
        : 'ArrowUp'
  state.lastDirection = direction
  const movementMs = Math.min(
    1_200,
    450 + Math.max(0, straightCells - 1) * 130 + state.stallCount * 180
  )
  await page.keyboard.down(direction)
  if (TILT_LABYRINTH_CLOCK.has(page)) await page.clock.runFor(movementMs)
  else await page.waitForTimeout(movementMs)
  await page.keyboard.up(direction).catch(() => undefined)
  await page.waitForTimeout(30)
  const finishedContinue = await firstVisibleEnabled(
    host.getByRole('button', { name: /^Continue$/ })
  )
  if (finishedContinue) {
    await finishedContinue.click()
    return true
  }
  const previousBall = state.ball
  const movedBall = await readTiltBallPosition(canvas, previousBall)
  if (movedBall) {
    state.ball = movedBall
    state.stallCount =
      Math.hypot(movedBall.x - previousBall.x, movedBall.y - previousBall.y) < 3
        ? Math.min(5, state.stallCount + 1)
        : 0
  }
  return true
}

type VaultCode = [number, number, number, number]

function createVaultCodes(): VaultCode[] {
  const codes: VaultCode[] = []
  const build = (prefix: number[], used: Set<number>) => {
    if (prefix.length === 4) {
      codes.push(prefix as VaultCode)
      return
    }
    for (let digit = 0; digit <= 9; digit += 1) {
      if (used.has(digit)) continue
      used.add(digit)
      build([...prefix, digit], used)
      used.delete(digit)
    }
  }
  build([], new Set())
  return codes
}

const VAULT_CODES = createVaultCodes()

function vaultFeedback(secret: readonly number[], guess: readonly number[]): [number, number] {
  const exact = guess.filter((digit, index) => digit === secret[index]).length
  const shared = guess.filter((digit) => secret.includes(digit)).length
  return [exact, shared - exact]
}

function solveSlidingPuzzle(start: string[], target: string[], columns: number): string[] {
  const startKey = start.join(',')
  const targetKey = target.join(',')
  if (startKey === targetKey) return []

  const queue = [startKey]
  const previous = new Map<string, { state: string; movedTile: string } | null>([[startKey, null]])
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentKey = queue[cursor]!
    const current = currentKey.split(',')
    const empty = current.indexOf('')
    const rows = Math.ceil(current.length / columns)
    const candidates = [empty - columns, empty + columns, empty - 1, empty + 1].filter(
      (index) =>
        index >= 0 &&
        index < current.length &&
        (Math.abs(index - empty) === columns ||
          Math.floor(index / columns) === Math.floor(empty / columns))
    )

    for (const index of candidates) {
      if (index < 0 || index >= rows * columns) continue
      const next = [...current]
      const movedTile = next[index]!
      next[empty] = movedTile
      next[index] = ''
      const nextKey = next.join(',')
      if (previous.has(nextKey)) continue
      previous.set(nextKey, { state: currentKey, movedTile })
      if (nextKey === targetKey) {
        const moves: string[] = []
        let key = nextKey
        while (key !== startKey) {
          const step = previous.get(key)
          if (!step) throw new Error('The sliding-puzzle path could not be reconstructed.')
          moves.push(step.movedTile)
          key = step.state
        }
        return moves.reverse()
      }
      queue.push(nextKey)
    }
  }
  throw new Error('The visible sliding-puzzle board has no path to its target arrangement.')
}

export async function installMinigameFastClock(page: Page): Promise<void> {
  MINIGAME_FAST_CLOCK.add(page)
  await page.clock.install()
}

export function assertMinigameDriversCoverRegistry(): void {
  const playableKeys = getAllGames()
    .filter(isInMinigameCertificationScope)
    .map((game) => game.key)
    .sort()
  const configuredKeys = Object.keys(MINIGAME_DRIVER_PROFILES).sort()
  expect(
    configuredKeys,
    'every playable registry game needs a season-simulation input driver'
  ).toEqual(playableKeys)
}

async function playPercentagePanicTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const fastForward = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Fast-forward spectator mode', exact: true })
  )
  if (fastForward) return clickWithShortTimeout(fastForward, random.int(20, 85), true)

  const phase = await host
    .locator('.pp-shell')
    .getAttribute('data-phase')
    .catch(() => null)

  if (phase === 'question' || phase === 'duel') {
    const picks = host.locator('.pp-picks button')
    const pickCount = await picks.count()
    if (pickCount > 0) {
      await clickWithShortTimeout(picks.nth(random.int(0, pickCount - 1)), 0, true)
    }
    const submit = await firstVisibleEnabled(
      host.getByRole('button', {
        name: phase === 'question' ? 'LOCK GUESS' : 'SUBMIT GUESS',
        exact: true,
      })
    )
    if (submit) return clickWithShortTimeout(submit, random.int(20, 85), true)
  }

  if (phase === 'order') {
    const choices = host.getByRole('button', { name: /^I GUESS (FIRST|SECOND)$/ })
    const choiceCount = await choices.count()
    if (choiceCount > 0) {
      return clickWithShortTimeout(choices.nth(random.int(0, choiceCount - 1)), 20, true)
    }
  }

  const enterFinal = await firstVisibleEnabled(
    host.getByRole('button', { name: /^(?:REVEAL WINNER|ENTER ROUND 10 FINAL)$/i })
  )
  return enterFinal ? clickWithShortTimeout(enterFinal, random.int(20, 85), true) : false
}

async function playGatesOfTheEyeTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const watchRound = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Watch this round', exact: true })
  )
  if (watchRound) return clickWithShortTimeout(watchRound, random.int(20, 85), true)

  const nextRound = await firstVisibleEnabled(host.getByRole('button', { name: /^Round \d+$/ }))
  if (nextRound) return clickWithShortTimeout(nextRound, random.int(20, 85), true)

  const doorGroup = host.getByRole('radiogroup', { name: 'Choose a door' })
  const doors = doorGroup.getByRole('radio')
  const doorCount = await doors.count()
  if (doorCount > 0) {
    if ((await doorGroup.getByRole('radio', { checked: true }).count()) === 0) {
      await clickWithShortTimeout(doors.nth(random.int(0, doorCount - 1)), 0, true)
    }
    const sealDoor = await firstVisibleEnabled(host.getByRole('button', { name: /^Seal Door / }))
    if (sealDoor) return clickWithShortTimeout(sealDoor, random.int(20, 85), true)
  }

  // The Eye resolves after its visible opening and collapse beats. Let those
  // animations settle before the simulation asks the driver for another action.
  await host
    .locator('.gate-round-result')
    .waitFor({ state: 'visible', timeout: 4_500 })
    .catch(() => undefined)
  return false
}

async function playBoxpocalypseTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const continueButton = await firstVisibleEnabled(
    host.getByRole('button', { name: 'CONTINUE', exact: true })
  )
  if (continueButton) return clickWithShortTimeout(continueButton, random.int(20, 85), true)

  const nextRound = await firstVisibleEnabled(host.getByRole('button', { name: /^ROUND \d+$/ }))
  if (nextRound) return clickWithShortTimeout(nextRound, random.int(20, 85), true)

  const lockBox = await firstVisibleEnabled(
    host.getByRole('button', { name: 'LOCK MY BOX', exact: true })
  )
  if (lockBox) return clickWithShortTimeout(lockBox, random.int(20, 85), true)

  const boxes = host.getByRole('button', { name: /^Box [ABC]:/ })
  const boxCount = await boxes.count()
  if (boxCount > 0) {
    const unselected = host.locator('.boxed-out-box[aria-pressed="false"]')
    const availableCount = await unselected.count()
    const choice = availableCount > 0 ? unselected : boxes
    const count = await choice.count()
    if (count > 0) return clickWithShortTimeout(choice.nth(random.int(0, count - 1)), 20, true)
  }

  const tiebreakSubmit = await firstVisibleEnabled(
    host.getByRole('button', { name: 'LOCK ANSWER', exact: true })
  )
  if (tiebreakSubmit) {
    const answer = host.getByLabel('Your answer')
    await answer.fill(String(random.int(1, 100)))
    return clickWithShortTimeout(tiebreakSubmit, random.int(20, 85), true)
  }

  return false
}
async function firstVisibleEnabled(locator: Locator): Promise<Locator | null> {
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index)
    const visible = await candidate.isVisible().catch(() => false)
    if (visible && (await candidate.isEnabled({ timeout: 500 }).catch(() => false)))
      return candidate
  }
  return null
}

async function acknowledgeHostIntro(page: Page, host: Locator): Promise<void> {
  const chainHelpClose = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Close Help', exact: true })
  )
  if (chainHelpClose) {
    await clickWithShortTimeout(chainHelpClose)
    return
  }
  const chainSheetClose = await firstVisibleEnabled(
    host
      .locator('.chain-of-greed__modal--sheet')
      .getByRole('button', { name: 'Close', exact: true })
  )
  if (chainSheetClose) {
    await clickWithShortTimeout(chainSheetClose)
    return
  }

  // The mode picker includes “How to play” copy, so the generic rules-modal
  // detector below must leave it to the game-specific driver.
  const chainModeSelection = host.getByRole('dialog', { name: /How will you play the chain/i })
  if (await chainModeSelection.isVisible().catch(() => false)) return

  const investigationGuide = page.getByRole('dialog', { name: 'How to investigate' })
  const skipInvestigationGuide = await firstVisibleEnabled(
    investigationGuide.getByRole('button', { name: 'Skip guide', exact: true })
  )
  if (skipInvestigationGuide) {
    await clickWithShortTimeout(skipInvestigationGuide, 0, true)
    await investigationGuide.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => undefined)
    return
  }

  const rules = host.locator('[role="dialog"]').filter({ hasText: /Rules|How to play/i })
  if (
    await rules
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    const button = await firstVisibleEnabled(rules.first().getByRole('button'))
    if (button) await button.click()
  }
  const demo = host.getByRole('dialog', { name: /example turn/i })
  if (await demo.isVisible().catch(() => false)) {
    const interactive = await firstVisibleEnabled(
      demo.getByRole('button').filter({ hasNotText: /Got it|Try it yourself first/i })
    )
    if (interactive) await interactive.click({ force: true, timeout: 5_000 })
    const continueButton = await firstVisibleEnabled(demo.getByRole('button', { name: /got it/i }))
    if (continueButton) await continueButton.click()
  }
}

async function clickWithShortTimeout(
  locator: Locator,
  delay = 0,
  bypassPausedAnimation = false
): Promise<boolean> {
  try {
    await locator.click({
      timeout: 1_000,
      animations: 'disabled',
      ...(bypassPausedAnimation ? { force: true } : {}),
      ...(delay > 0 ? { delay } : {}),
    })
    return true
  } catch {
    return false
  }
}

async function clickCanvas(
  page: Page,
  host: Locator,
  random: SeededRandom,
  repeats: number
): Promise<void> {
  const canvas = host.locator('canvas').last()
  if (!(await canvas.isVisible().catch(() => false))) return
  const box = await canvas.boundingBox()
  if (!box) return
  for (let index = 0; index < repeats; index += 1) {
    await page.mouse.click(
      box.x + box.width * (0.3 + random.next() * 0.4),
      box.y + box.height * (0.3 + random.next() * 0.4)
    )
  }
}

async function clickMeaningfulButton(
  host: Locator,
  random: SeededRandom,
  force = false,
  immediate = false
): Promise<boolean> {
  const controls = host.getByRole('button').filter({
    hasNotText: /open minigame menu|leave competition|keep playing|exit with 0|close results/i,
  })
  const button = await firstVisibleEnabled(controls)
  if (!button) return false
  try {
    await button.click({
      ...(force || immediate ? { force: true } : {}),
      ...(immediate ? { animations: 'disabled', timeout: 1_000 } : { timeout: 1_000 }),
      delay: immediate ? 0 : random.int(20, 85),
    })
    return true
  } catch {
    // Concurrent AI actions may replace a visible control between selection
    // and input. The caller's next bounded loop reads the current screen again.
    return false
  }
}

async function playBlackjackTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const startDuel = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Confirm duel pair and start' })
  )
  if (startDuel) return clickWithShortTimeout(startDuel)

  const fighterChoices = host
    .locator('button[aria-label^="Select "]')
    .filter({ hasNotText: /\([AB]\)/ })
  const availableFighters: Locator[] = []
  for (let index = 0; index < (await fighterChoices.count()); index += 1) {
    const fighter = fighterChoices.nth(index)
    if (
      (await fighter.isVisible().catch(() => false)) &&
      (await fighter.isEnabled({ timeout: 500 }).catch(() => false))
    ) {
      availableFighters.push(fighter)
    }
  }
  if (availableFighters.length > 0) {
    const selectedCount = await host.locator('.bjt-fighter-slot--filled').count()
    const fighter = availableFighters[0]
    if (fighter && selectedCount < 2) {
      return clickWithShortTimeout(fighter, random.int(20, 85))
    }
  }

  const skip = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Skip to final result', exact: true })
  )
  if (skip) return clickWithShortTimeout(skip)

  const fastForward = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Fast-forward this round' })
  )
  if (fastForward) return clickWithShortTimeout(fastForward)

  const stand = await firstVisibleEnabled(host.getByRole('button', { name: /^Stand/i }))
  if (stand) return clickWithShortTimeout(stand, random.int(20, 85))

  const startFinals = await firstVisibleEnabled(
    host.getByRole('button', { name: /^Start Finals/i })
  )
  if (startFinals) return clickWithShortTimeout(startFinals)

  const continueButton = await firstVisibleEnabled(host.getByRole('button', { name: /^Continue/i }))
  if (continueButton) return clickWithShortTimeout(continueButton)

  return false
}

async function playColorMatchTurn(host: Locator): Promise<boolean> {
  const hintWarning = host.getByRole('dialog', { name: 'Hint purchase warning' })
  if (await hintWarning.isVisible().catch(() => false)) {
    const cancel = await firstVisibleEnabled(
      hintWarning.getByRole('button', { name: 'Cancel', exact: true })
    )
    return cancel ? clickWithShortTimeout(cancel) : false
  }

  const skipResults = await firstVisibleEnabled(
    host.getByRole('button', { name: /^Skip to Results$/i })
  )
  if (skipResults) return clickWithShortTimeout(skipResults)

  const advance = await firstVisibleEnabled(
    host.getByRole('button', {
      name: /^(?:See Results|Continue Watching|Next(?: Round)?|Continue)/i,
    })
  )
  if (advance) return clickWithShortTimeout(advance, 0, true)

  const submit = await firstVisibleEnabled(host.getByRole('button', { name: /^Submit Match$/i }))
  return submit ? clickWithShortTimeout(submit) : false
}

async function playChainOfGreedTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const startSharedChain = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Start Shared Chain', exact: true })
  )
  if (startSharedChain) return clickWithShortTimeout(startSharedChain, 0, true)

  const sharedMode = await firstVisibleEnabled(host.getByRole('button', { name: /Shared Chain/ }))
  if (sharedMode) return clickWithShortTimeout(sharedMode, 0, true)

  const roundIntro = host.locator('[data-testid="chain-round-intro"]')
  if (await roundIntro.isVisible().catch(() => false)) {
    try {
      await roundIntro.click({ force: true, timeout: 1_000 })
      return true
    } catch {
      return false
    }
  }

  const closeHelp = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Close Help', exact: true })
  )
  if (closeHelp) return clickWithShortTimeout(closeHelp)

  const closeSheet = await firstVisibleEnabled(
    host
      .locator('.chain-of-greed__modal--sheet')
      .getByRole('button', { name: 'Close', exact: true })
  )
  if (closeSheet) return clickWithShortTimeout(closeSheet)

  const revealVotes = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Reveal Votes', exact: true })
  )
  if (revealVotes) return clickWithShortTimeout(revealVotes)

  const voteTarget = await firstVisibleEnabled(host.locator('button.chain-of-greed__vote-card'))
  if (voteTarget) return clickWithShortTimeout(voteTarget)

  const advance = await firstVisibleEnabled(
    host.getByRole('button', {
      name: /^(?:Proceed to Vote|Keep watching|Fast watch|Continue to (?:Round \d+|Final)|Start Semifinal|Start Final|Claim Result)$/i,
    })
  )
  if (advance) return clickWithShortTimeout(advance)

  const higher = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Higher', exact: true })
  )
  const lower = await firstVisibleEnabled(host.getByRole('button', { name: 'Lower', exact: true }))
  const bank = await firstVisibleEnabled(host.getByRole('button', { name: 'Bank', exact: true }))
  const guesses = [higher, lower].filter((button): button is Locator => button !== null)
  if (bank && random.next() < 0.2) return clickWithShortTimeout(bank)
  if (guesses.length > 0) return clickWithShortTimeout(random.pick(guesses))
  return bank ? clickWithShortTimeout(bank) : false
}

async function playCapitalizationTurn(host: Locator): Promise<boolean> {
  const crown = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Crown LOH', exact: true })
  )
  if (crown) {
    await crown.click()
    return true
  }

  const skip = await firstVisibleEnabled(host.getByRole('button', { name: 'Skip', exact: true }))
  if (skip) {
    await skip.click()
    return true
  }

  const continueButton = await firstVisibleEnabled(host.getByRole('button', { name: /^Continue/i }))
  if (continueButton) {
    await continueButton.click()
    return true
  }

  return false
}

async function playEstimationTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const advance = await firstVisibleEnabled(
    host.getByRole('button', { name: /^(?:Next Round|See Final Results)/i })
  )
  if (advance) return clickWithShortTimeout(advance)

  const continueButton = await firstVisibleEnabled(host.getByRole('button', { name: /^Continue/i }))
  if (continueButton) return clickWithShortTimeout(continueButton)

  const input = await firstVisibleEnabled(host.getByRole('spinbutton', { name: 'Estimate count' }))
  if (!input) return false
  await input.fill(String(random.int(0, 100)))
  const submit = await firstVisibleEnabled(host.getByRole('button', { name: /^Lock In/i }))
  if (submit) return clickWithShortTimeout(submit)
  await input.press('Enter')
  return true
}

async function playDontGoOverTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const claimPrize = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Claim prize', exact: true })
  )
  if (claimPrize) return clickWithShortTimeout(claimPrize)

  const skipToWinner = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Skip to winner', exact: true })
  )
  if (skipToWinner) return clickWithShortTimeout(skipToWinner)

  const advance = await firstVisibleEnabled(
    host.getByRole('button', { name: /^(?:Continue|New question)$/i })
  )
  if (advance) return clickWithShortTimeout(advance)

  const startDuel = await firstVisibleEnabled(
    host.getByRole('button', { name: /^(?:Start duel|Send to duel)$/i })
  )
  if (startDuel) return clickWithShortTimeout(startDuel)

  const guess = await firstVisibleEnabled(host.locator('input[type="number"]'))
  if (guess) {
    // A low, valid guess keeps the player in the duel long enough to exercise
    // the reveal and life-loss decisions without relying on question content.
    await guess.fill(String(random.int(0, 3)))
    const lockGuess = await firstVisibleEnabled(
      host.getByRole('button', { name: /^Lock in (?:duel )?guess$/i })
    )
    if (lockGuess) return clickWithShortTimeout(lockGuess)
  }

  const duelChoice = await firstVisibleEnabled(host.locator('.cwgo-choose button'))
  return duelChoice ? clickWithShortTimeout(duelChoice) : false
}

async function playDownMemoryLaneTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const confirm = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Confirm Part 3 winner', exact: true })
  )
  if (confirm) return clickWithShortTimeout(confirm)

  const start = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Start the duel', exact: true })
  )
  if (start) return clickWithShortTimeout(start)

  const buzzer = await firstVisibleEnabled(host.getByRole('button', { name: /^(?:BUZZ|READY)\b/i }))
  if (buzzer) return clickWithShortTimeout(buzzer)

  const answers = host.locator('.memory-lane__answers button')
  if ((await answers.count()) > 0) {
    const answer = answers.nth(random.int(0, (await answers.count()) - 1))
    if (await answer.isVisible().catch(() => false)) return clickWithShortTimeout(answer)
  }

  return false
}

async function playHangmanTurn(page: Page, host: Locator): Promise<boolean> {
  const nextUniqueGuess = () => {
    let sequence = (HANGMAN_GUESS_SEQUENCE.get(page) ?? 0) + 1
    HANGMAN_GUESS_SEQUENCE.set(page, sequence)
    let suffix = ''
    while (sequence > 0) {
      sequence -= 1
      suffix = String.fromCharCode(97 + (sequence % 26)) + suffix
      sequence = Math.floor(sequence / 26)
    }
    return 'zzq' + suffix
  }
  const finish = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Finish competition', exact: true })
  )
  if (finish) return clickWithShortTimeout(finish)

  const continueButton = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Continue', exact: true })
  )
  if (continueButton) return clickWithShortTimeout(continueButton)

  const guess = await firstVisibleEnabled(host.getByRole('button', { name: /GUESS WORD/i }))
  if (guess) {
    await clickWithShortTimeout(guess)
    const input = await firstVisibleEnabled(
      host.getByRole('dialog', { name: 'Guess the word' }).getByLabel('Full word guess')
    )
    if (!input) return true
    await input.fill(nextUniqueGuess())
    const submit = await firstVisibleEnabled(
      host.getByRole('dialog', { name: 'Guess the word' }).getByRole('button', {
        name: 'LOCK VERDICT',
      })
    )
    if (submit) await clickWithShortTimeout(submit)
    return true
  }

  const buzz = await firstVisibleEnabled(host.getByRole('button', { name: /BUZZ\b/i }))
  if (buzz) {
    await clickWithShortTimeout(buzz)
    const input = await firstVisibleEnabled(
      host.getByRole('dialog', { name: 'Guess the word' }).getByLabel('Full word guess')
    )
    if (input) {
      await input.fill(nextUniqueGuess())
      const submit = await firstVisibleEnabled(
        host.getByRole('dialog', { name: 'Guess the word' }).getByRole('button', {
          name: 'LOCK VERDICT',
        })
      )
      if (submit) await clickWithShortTimeout(submit)
    }
    return true
  }

  const forceReveal = await firstVisibleEnabled(host.getByRole('button', { name: /REVEAL NOW/i }))
  return forceReveal ? clickWithShortTimeout(forceReveal) : false
}

async function playMinesweepsTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const continueButton = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Continue', exact: true })
  )
  if (continueButton) return clickWithShortTimeout(continueButton)

  const start = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Start sweep', exact: true })
  )
  if (start) return clickWithShortTimeout(start)

  const hiddenCells = host.getByRole('gridcell', { name: /, hidden$/i })
  const count = await hiddenCells.count()
  if (count === 0) return false
  return clickWithShortTimeout(hiddenCells.nth(random.int(0, count - 1)))
}

async function playVaultCrackerTurn(page: Page, host: Locator): Promise<boolean> {
  const continueButton = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Continue', exact: true })
  )
  if (continueButton) return clickWithShortTimeout(continueButton)

  const fallback = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Resolve and continue', exact: true })
  )
  if (fallback) return clickWithShortTimeout(fallback)

  const canvas = host.getByTestId('vault-cracker-canvas')
  const canvasBox = await canvas.boundingBox().catch(() => null)
  if (!canvasBox) return false

  const historyRows = host.locator('.cb__guess-row')
  const historyCount = await historyRows.count()
  const history: Array<{ guess: VaultCode; feedback: [number, number] }> = []
  for (let index = 0; index < historyCount; index += 1) {
    const row = historyRows.nth(index)
    const digits = (await row.locator('.cb__guess-digits').innerText())
      .trim()
      .split(/\s+/)
      .map(Number)
    const label = await row.locator('.cb__guess-feedback').getAttribute('aria-label')
    const feedback = label?.match(/^(\d+)\s+exact,\s*(\d+)\s+displaced$/i)
    if (digits.length !== 4 || digits.some((digit) => !Number.isInteger(digit)) || !feedback) {
      throw new Error('Vault Cracker did not expose a readable guess and feedback row.')
    }
    history.push({
      guess: digits as VaultCode,
      feedback: [Number(feedback[1]), Number(feedback[2])],
    })
  }

  const breached = host.getByText(/Vault breached in \d+ attempts?/i)
  if (await breached.isVisible().catch(() => false)) {
    const resultContinue = host.getByRole('button', { name: 'Continue', exact: true })
    try {
      await resultContinue.waitFor({ state: 'visible', timeout: 2_500 })
    } catch {
      return false
    }
    return clickWithShortTimeout(resultContinue)
  }

  const candidates = VAULT_CODES.filter((code) =>
    history.every(({ guess, feedback }) => {
      const actual = vaultFeedback(code, guess)
      return actual[0] === feedback[0] && actual[1] === feedback[1]
    })
  )
  const nextGuess = candidates[0]
  if (!nextGuess) throw new Error('Vault Cracker feedback eliminated every possible code.')

  const layout = createVaultCrackerLayout(canvasBox.width, canvasBox.height, 1)
  const currentDigits = VAULT_CRACKER_DIGITS.get(page) ?? [0, 0, 0, 0]
  for (let index = 0; index < nextGuess.length; index += 1) {
    const slot = layout.dialSlots[index]
    if (!slot) throw new Error('Vault Cracker is missing a dial slot.')
    const clicks = (nextGuess[index]! - currentDigits[index]! + 10) % 10
    for (let click = 0; click < clicks; click += 1) {
      await page.mouse.click(canvasBox.x + slot.centerX, canvasBox.y + slot.y + slot.height * 0.25)
    }
  }

  await page.mouse.click(
    canvasBox.x + layout.submitRect.x + layout.submitRect.width / 2,
    canvasBox.y + layout.submitRect.y + layout.submitRect.height / 2
  )
  VAULT_CRACKER_DIGITS.set(page, [...nextGuess])
  await expect(historyRows).toHaveCount(historyCount + 1, { timeout: 2_000 })
  return true
}

async function playNumberTriviaTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const advance = await firstVisibleEnabled(
    host.getByRole('button', {
      name: /^(?:Continue|Keep watching|Fast-forward to results|Start three-life final)$/i,
    })
  )
  if (advance) return clickWithShortTimeout(advance)

  const answer = await firstVisibleEnabled(host.getByRole('spinbutton', { name: 'Answer input' }))
  if (answer) {
    await answer.fill(String(random.int(1, 9_999)))
    const submit = await firstVisibleEnabled(
      host.getByRole('button', { name: 'Submit', exact: true })
    )
    if (submit) return clickWithShortTimeout(submit)
  }

  const skip = await firstVisibleEnabled(host.getByRole('button', { name: 'Skip', exact: true }))
  return skip ? clickWithShortTimeout(skip) : false
}

async function playTrapAuctionTurn(host: Locator): Promise<boolean> {
  const finish = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Finish', exact: true })
  )
  if (finish) return clickWithShortTimeout(finish)

  const start = await firstVisibleEnabled(
    host.getByRole('button', { name: "Let's Auction", exact: true })
  )
  if (start) return clickWithShortTimeout(start)

  const skip = await firstVisibleEnabled(host.getByRole('button', { name: /Skip to Results/i }))
  if (skip) return clickWithShortTimeout(skip)

  const watch = await firstVisibleEnabled(host.getByRole('button', { name: /Watch as Spectator/i }))
  if (watch) return clickWithShortTimeout(watch)

  const bid = await firstVisibleEnabled(host.getByRole('button', { name: /^Lock In \d+/i }))
  return bid ? clickWithShortTimeout(bid) : false
}

async function playWildcardWesternTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const champion = host.getByRole('heading', { name: 'Sheriff Champion!', exact: true })
  if (await champion.isVisible().catch(() => false)) {
    const finish = await firstVisibleEnabled(
      host.getByRole('button', { name: 'Finish', exact: true })
    )
    return finish ? clickWithShortTimeout(finish, 0, true) : false
  }

  const showdownResult = host.getByRole('heading', { name: 'Showdown Result', exact: true })
  if (await showdownResult.isVisible().catch(() => false)) {
    const continueDuel = await firstVisibleEnabled(
      host.getByRole('button', { name: 'Continue', exact: true })
    )
    if (continueDuel) return clickWithShortTimeout(continueDuel, 0, true)
  }

  const pairHeading = host.getByRole('heading', { name: /choose the next duel/i })
  if (await pairHeading.isVisible().catch(() => false)) {
    const confirm = await firstVisibleEnabled(
      host.getByRole('button', { name: 'Confirm Duel', exact: true })
    )
    if (confirm) return clickWithShortTimeout(confirm)

    const selected = host.locator('.ww-avatar-btn--selected')
    const selectedCount = await selected.count()
    const player =
      selectedCount === 0
        ? await firstVisibleEnabled(host.getByRole('button', { name: /\byou\b/i }))
        : await firstVisibleEnabled(host.locator('.ww-avatar-btn:not(.ww-avatar-btn--selected)'))
    return player ? clickWithShortTimeout(player) : false
  }

  const eliminationHeading = host.getByRole('heading', { name: /choose who to eliminate/i })
  if (await eliminationHeading.isVisible().catch(() => false)) {
    const options = host.getByRole('button', { name: /^AI \d+$/i })
    const option = await firstVisibleEnabled(options)
    if (option) return clickWithShortTimeout(option)
  }

  const finish = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Finish', exact: true })
  )
  if (finish) return clickWithShortTimeout(finish)

  const startFinal = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Start three-life final', exact: true })
  )
  if (startFinal) return clickWithShortTimeout(startFinal)

  return clickMeaningfulButton(host, random)
}

async function playFinalThreeCircuitTurn(page: Page, host: Locator): Promise<boolean> {
  const confirmResults = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Confirm results', exact: true })
  )
  if (confirmResults) return clickWithShortTimeout(confirmResults, 0, true)

  const lockFinalResult = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Lock in result', exact: true })
  )
  if (lockFinalResult) return clickWithShortTimeout(lockFinalResult, 0, true)

  const practice = host.locator('.f3-circuit__tutorial')
  if (await practice.isVisible().catch(() => false)) {
    const start = await firstVisibleEnabled(
      practice.getByRole('button', {
        name: /^(?:Start Signal Hunt|Start Sequence Builder|Begin Final Override|Choose Warden difficulty|Choose Power difficulty)$/i,
      })
    )
    if (start) return clickWithShortTimeout(start, 0, true)

    const signalPractice = practice.locator('.f3-circuit__practice--signal')
    if (await signalPractice.isVisible().catch(() => false)) {
      const target = (
        await signalPractice.locator('.f3-circuit__practice-command strong').innerText()
      ).trim()
      const targetButton = await firstVisibleEnabled(
        signalPractice.getByRole('button', { name: target, exact: true })
      )
      if (targetButton) return clickWithShortTimeout(targetButton, 0, true)
    }

    const correctPracticeMove = await firstVisibleEnabled(
      practice.locator(
        '.f3-circuit__practice button.is-target, .f3-circuit__practice button.is-highlighted, .f3-circuit__practice button[aria-label="Practice move"]'
      )
    )
    if (correctPracticeMove) return clickWithShortTimeout(correctPracticeMove, 0, true)

    if (
      await host
        .locator('.f3-circuit__tutorial--override')
        .isVisible()
        .catch(() => false)
    ) {
      const sampleAnswer = await firstVisibleEnabled(
        practice.getByRole('button', { name: '47', exact: true })
      )
      if (sampleAnswer) return clickWithShortTimeout(sampleAnswer, 0, true)
    }
  }

  const signalTarget = host.locator('.f3-circuit__signal-command strong')
  if (await signalTarget.isVisible().catch(() => false)) {
    const target = (await signalTarget.innerText()).trim()
    const node = await firstVisibleEnabled(host.getByRole('button', { name: `Node ${target}` }))
    if (node) return clickWithShortTimeout(node, 0, true)
  }

  const targetGrid = host.locator('[aria-label="Target arrangement"]')
  const puzzle = host.locator('[aria-label="Sliding puzzle"]')
  if (
    (await targetGrid.isVisible().catch(() => false)) &&
    (await puzzle.isVisible().catch(() => false))
  ) {
    const targetItems = await targetGrid.locator('span').allInnerTexts()
    const target = targetItems.map((item) => item.trim())
    const puzzleButtons = puzzle.getByRole('button')
    const buttonCount = await puzzleButtons.count()
    const current: string[] = []
    for (let index = 0; index < buttonCount; index += 1) {
      const label = await puzzleButtons.nth(index).getAttribute('aria-label')
      current.push(label === 'Empty slot' ? '' : (label?.replace(/^Tile\s+/, '') ?? ''))
    }
    const targetKey = target.join(',')
    const currentKey = current.join(',')
    let plan = FINAL_THREE_SEQUENCE_PLANS.get(page)
    if (!plan || plan.target !== targetKey || plan.expectedBoard !== currentKey) {
      const columns = await puzzle.evaluate(
        (element) => Number(element.getAttribute('style')?.match(/repeat\((\d+)/)?.[1]) || 3
      )
      plan = {
        target: targetKey,
        moves: solveSlidingPuzzle(current, target, columns),
        index: 0,
        expectedBoard: currentKey,
      }
      FINAL_THREE_SEQUENCE_PLANS.set(page, plan)
    }
    const tile = plan.moves[plan.index]
    if (tile == null) return false
    const moveIndex = current.indexOf(tile)
    const emptyIndex = current.indexOf('')
    const moveButton = puzzleButtons.nth(moveIndex)
    if (moveIndex < 0 || emptyIndex < 0)
      throw new Error('The visible sequence puzzle is malformed.')
    if (!(await clickWithShortTimeout(moveButton, 0, true))) return false
    const next = [...current]
    next[emptyIndex] = tile
    next[moveIndex] = ''
    plan.index += 1
    plan.expectedBoard = next.join(',')
    return true
  }

  const wardenGame = host.locator('.f3-circuit__warden-game')
  if (await wardenGame.isVisible().catch(() => false)) {
    const hintButton = await firstVisibleEnabled(
      wardenGame.locator('button.f3-circuit__warden-hint')
    )
    if (hintButton) {
      if (!(await clickWithShortTimeout(hintButton, 0, true))) return false
      try {
        await wardenGame
          .getByRole('button', { name: 'Hint: recommended move', exact: true })
          .waitFor({ state: 'visible', timeout: 1_000 })
      } catch {
        // Some seeded boards have no guaranteed route from the current position.
      }
    }
    const recommended = await firstVisibleEnabled(
      wardenGame.getByRole('button', { name: 'Hint: recommended move', exact: true })
    )
    if (recommended) return clickWithShortTimeout(recommended, 0, true)
    const validMoves = await firstVisibleEnabled(
      wardenGame.locator('.f3-circuit__warden-grid button.is-valid-move')
    )
    return validMoves ? clickWithShortTimeout(validMoves, 0, true) : false
  }

  const powerGame = host.locator('.f3-circuit__power-game')
  if (await powerGame.isVisible().catch(() => false)) {
    const targetText = await powerGame
      .locator('.f3-circuit__power-readout > div')
      .first()
      .locator('strong')
      .innerText()
    const currentText = await powerGame
      .locator('.f3-circuit__power-readout > div')
      .nth(1)
      .locator('strong')
      .innerText()
    const target = Number(targetText.match(/^-?\d+/)?.[0])
    const tolerance = Number(targetText.match(/±(\d+)/)?.[1] ?? 0)
    const current = Number(currentText.match(/^-?\d+/)?.[0])
    const maxPicks = Number(
      (await powerGame.locator('.f3-circuit__copy').innerText()).match(/Pick up to (\d+)/i)?.[1]
    )
    const selectedCount = await powerGame
      .locator('.f3-circuit__power-cells button.is-selected')
      .count()
    const available = await powerGame
      .locator('.f3-circuit__power-cells button:enabled')
      .evaluateAll((buttons) =>
        buttons.map((button, index) => ({
          index,
          value: Number(button.querySelector('strong')?.textContent?.replace(/[^-\d]/g, '')),
        }))
      )
    const picksLeft = Math.max(0, maxPicks - selectedCount)
    let best: { indexes: number[]; error: number } | null = null
    for (let mask = 1; mask < 1 << available.length; mask += 1) {
      const indexes: number[] = []
      let sum = 0
      for (let index = 0; index < available.length; index += 1) {
        if (!(mask & (1 << index))) continue
        indexes.push(index)
        sum += available[index]!.value
      }
      if (indexes.length > picksLeft) continue
      const error = Math.max(0, Math.abs(current + sum - target) - tolerance)
      if (
        !best ||
        error < best.error ||
        (error === best.error && indexes.length < best.indexes.length)
      )
        best = { indexes, error }
    }
    const nextPick = best?.indexes[0]
    if (nextPick != null) {
      const cells = powerGame.locator('.f3-circuit__power-cells button:enabled')
      return clickWithShortTimeout(cells.nth(nextPick))
    }
    return false
  }

  const riskTier = await firstVisibleEnabled(host.locator('.f3-circuit__risk-tiers button').first())
  if (riskTier) return clickWithShortTimeout(riskTier, 0, true)

  const finalPush = host.locator('.f3-circuit__stake-options button')
  const lowStake = await firstVisibleEnabled(finalPush.filter({ hasText: '10%' }))
  if (lowStake) return clickWithShortTimeout(lowStake, 0, true)

  const overrideAnswers = host.locator('.f3-circuit__override-options button:enabled')
  if ((await overrideAnswers.count()) > 0) {
    const prompt = (await host.locator('.f3-circuit__override-prompt strong').innerText()).trim()
    const visibleAnswers = await overrideAnswers.allInnerTexts()
    const question = FINAL_OVERRIDE_QUESTION_BANK.find(
      (entry) =>
        entry.prompt === prompt &&
        entry.options.length === visibleAnswers.length &&
        entry.options.every((answer) => visibleAnswers.includes(answer))
    )
    if (!question) throw new Error(`Final Override question was not found in the bank: ${prompt}`)
    const correctAnswer = await firstVisibleEnabled(
      host
        .locator('.f3-circuit__override-options')
        .getByRole('button', { name: question.correct, exact: true })
    )
    return correctAnswer ? clickWithShortTimeout(correctAnswer, 0, true) : false
  }

  const challengeControls = host.locator('.f3-circuit__arena-card--risk button:enabled')
  const challengeControl = await firstVisibleEnabled(challengeControls)
  return challengeControl ? clickWithShortTimeout(challengeControl, 0, true) : false
}

async function playHouseOfDarknessTurn(
  page: Page,
  host: Locator,
  thrower: boolean
): Promise<boolean> {
  const charmChoice = await firstVisibleEnabled(host.locator('.hod-charm-choice'))
  if (charmChoice) return clickWithShortTimeout(charmChoice)

  const chooseRun = await firstVisibleEnabled(host.getByRole('button', { name: /^Depth Run\b/i }))
  if (chooseRun) return clickWithShortTimeout(chooseRun)

  const advance = await firstVisibleEnabled(
    host.getByRole('button', {
      name: /^(?:Descend deeper|Leave the Hub|Leave the house|Leave the deck)$/i,
    })
  )
  if (advance) return clickWithShortTimeout(advance)

  const visibleGrid = host.getByRole('grid', {
    name: /Deck of Darkness round \d+ memory board/i,
  })
  if (!(await visibleGrid.isVisible().catch(() => false))) return false

  const boardName = await visibleGrid.getAttribute('aria-label', { timeout: 500 }).catch(() => null)
  if (!boardName) return false
  const grid = host.getByRole('grid', { name: boardName, exact: true })
  if (!(await grid.isVisible().catch(() => false))) return false

  let pageMemory = HOUSE_OF_DARKNESS_MEMORY.get(page)
  if (!pageMemory) {
    pageMemory = new Map()
    HOUSE_OF_DARKNESS_MEMORY.set(page, pageMemory)
  }
  let symbols = pageMemory.get(boardName)
  if (!symbols) {
    symbols = new Map()
    pageMemory.set(boardName, symbols)
  }

  const cards = grid.getByRole('gridcell')
  const count = await cards.count()
  const readAttribute = (card: Locator, name: string) =>
    card.getAttribute(name, { timeout: 300 }).catch(() => null)
  const clickCard = async (card: Locator): Promise<boolean> => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (!(await grid.isVisible().catch(() => false))) return false
      if (await card.isEnabled().catch(() => false)) return clickWithShortTimeout(card)
      await page.waitForTimeout(80)
    }
    return false
  }

  const matched = new Set<number>()
  const visible: Array<{ index: number; symbol: string }> = []
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index)
    if ((await readAttribute(card, 'data-matched')) === 'true') {
      matched.add(index)
      const symbol = await readAttribute(card, 'aria-label')
      if (symbol && symbol !== 'Hidden haunted card') rememberHouseSymbol(symbols, symbol, index)
      continue
    }
    const symbol = await readAttribute(card, 'aria-label')
    if (symbol && symbol !== 'Hidden haunted card' && symbol !== 'Sealed void slot') {
      rememberHouseSymbol(symbols, symbol, index)
      visible.push({ index, symbol })
    }
  }

  if (visible.length >= 2) {
    await expect(cards.nth(visible[1]!.index))
      .toHaveAttribute('data-flipped', 'false', { timeout: 1_500 })
      .catch(() => undefined)
    return false
  }

  const availableFor = (indexes: Set<number>) => [...indexes].filter((index) => !matched.has(index))
  if (thrower) {
    const knownSymbols = [...symbols.entries()].filter(
      ([, indexes]) => availableFor(indexes).length > 0
    )
    for (let firstSymbolIndex = 0; firstSymbolIndex < knownSymbols.length; firstSymbolIndex += 1) {
      for (
        let secondSymbolIndex = firstSymbolIndex + 1;
        secondSymbolIndex < knownSymbols.length;
        secondSymbolIndex += 1
      ) {
        const firstIndex = availableFor(knownSymbols[firstSymbolIndex]![1])[0]
        const secondIndex = availableFor(knownSymbols[secondSymbolIndex]![1])[0]
        if (firstIndex == null || secondIndex == null) continue
        const first = cards.nth(firstIndex)
        const second = cards.nth(secondIndex)
        if ((await readAttribute(first, 'data-flipped')) !== 'true' && !(await clickCard(first)))
          return false
        if (!(await clickCard(second))) return false
        return true
      }
    }
  }

  for (const indexes of symbols.values()) {
    const pair = availableFor(indexes)
    if (pair.length < 2) continue
    const first = cards.nth(pair[0]!)
    const second = cards.nth(pair[1]!)
    if ((await readAttribute(first, 'data-flipped')) !== 'true') {
      if (!(await clickCard(first))) return false
    }
    if (!(await clickCard(second))) return false
    await expect(second)
      .toHaveAttribute('data-matched', 'true', { timeout: 1_500 })
      .catch(() => undefined)
    return true
  }

  const seen = new Set([...symbols.values()].flatMap((indexes) => [...indexes]))
  const hiddenIndexes: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (matched.has(index)) continue
    if ((await readAttribute(cards.nth(index), 'aria-label')) === 'Hidden haunted card') {
      hiddenIndexes.push(index)
    }
  }

  let firstIndex = visible[0]?.index
  let firstSymbol = visible[0]?.symbol
  let secondIndex: number | undefined
  if (firstIndex != null) {
    secondIndex =
      hiddenIndexes.find((index) => !seen.has(index)) ??
      hiddenIndexes.find((index) => index !== firstIndex)
  } else {
    const unknown = hiddenIndexes.filter((index) => !seen.has(index))
    if (unknown.length >= 2) {
      firstIndex = unknown[0]
      secondIndex = unknown[1]
    } else if (unknown.length === 1) {
      for (const [symbol, indexes] of symbols) {
        const known = availableFor(indexes)
        if (known.length === 1) {
          firstIndex = known[0]
          firstSymbol = symbol
          secondIndex = unknown[0]
          break
        }
      }
    }
  }

  if (firstIndex == null || secondIndex == null) return false
  const first = cards.nth(firstIndex)
  if ((await readAttribute(first, 'data-flipped')) !== 'true') {
    if (!(await clickCard(first))) return false
    await expect(first)
      .not.toHaveAttribute('aria-label', 'Hidden haunted card', { timeout: 1_000 })
      .catch(() => undefined)
    firstSymbol = await readAttribute(first, 'aria-label')
  }
  if (!firstSymbol || firstSymbol === 'Hidden haunted card') return false
  rememberHouseSymbol(symbols, firstSymbol, firstIndex)

  const second = cards.nth(secondIndex)
  if (!(await clickCard(second))) return false
  await expect(second)
    .not.toHaveAttribute('aria-label', 'Hidden haunted card', { timeout: 1_000 })
    .catch(() => undefined)
  const secondSymbol = await readAttribute(second, 'aria-label')
  if (secondSymbol && secondSymbol !== 'Hidden haunted card') {
    rememberHouseSymbol(symbols, secondSymbol, secondIndex)
  }
  if (secondSymbol === firstSymbol) {
    await expect(second)
      .toHaveAttribute('data-matched', 'true', { timeout: 1_500 })
      .catch(() => undefined)
  } else if (secondSymbol) {
    await expect(second)
      .toHaveAttribute('data-flipped', 'false', { timeout: 2_000 })
      .catch(() => undefined)
  }
  return true
}

async function playRescueTheKingTurn(page: Page, host: Locator): Promise<boolean> {
  const board = host.locator('.rtk-board')
  if (!(await board.isVisible().catch(() => false))) return false

  const cells = await board.locator('.rtk-cell').evaluateAll((elements) =>
    elements.map((element) => ({
      row: Number(element.getAttribute('data-row')),
      col: Number(element.getAttribute('data-col')),
      normal: element.classList.contains('rtk-cell-normal'),
      blocker: element.classList.contains('rtk-cell-blocker'),
      blockerKind: element.classList.contains('rtk-cell-blocker-crate') ? 'crate' : 'stone',
      damaged: element.classList.contains('rtk-cell-blocker-damaged'),
      symbol: element.textContent?.trim() ?? '',
    }))
  )
  const rows = Math.max(...cells.map((cell) => cell.row)) + 1
  const cols = Math.max(...cells.map((cell) => cell.col)) + 1
  const symbols = Array.from({ length: rows }, () => Array<string | null>(cols).fill(null))
  const boardState: Board = Array.from({ length: rows }, () =>
    Array<Cell>(cols).fill({ kind: 'empty' })
  )
  const symbolByEmoji = new Map<string, TileSymbol>(
    Object.entries(SYMBOL_EMOJI).map(([symbol, emoji]) => [emoji, symbol as TileSymbol])
  )
  for (const cell of cells) {
    if (cell.normal) {
      const symbol = symbolByEmoji.get(cell.symbol)
      if (!symbol) throw new Error(`Rescue the King exposed an unknown tile: ${cell.symbol}`)
      symbols[cell.row]![cell.col] = cell.symbol
      boardState[cell.row]![cell.col] = { kind: 'normal', symbol }
    } else if (cell.blocker) {
      boardState[cell.row]![cell.col] = {
        kind: 'blocker',
        blockerKind: cell.blockerKind,
        hitsRemaining: cell.blockerKind === 'crate' || cell.damaged ? 1 : 2,
      }
    }
  }
  const boardFingerprint = JSON.stringify(symbols)

  const symbolAfterSwap = (
    row: number,
    col: number,
    first: { row: number; col: number },
    second: { row: number; col: number }
  ): string | null =>
    row === first.row && col === first.col
      ? symbols[second.row]![second.col]
      : row === second.row && col === second.col
        ? symbols[first.row]![first.col]
        : (symbols[row]?.[col] ?? null)

  const makesMatchAt = (
    row: number,
    col: number,
    first: { row: number; col: number },
    second: { row: number; col: number }
  ): boolean => {
    const symbol = symbolAfterSwap(row, col, first, second)
    if (symbol == null) return false
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      let count = 1
      for (const direction of [-1, 1]) {
        let nextRow = row + dr * direction
        let nextCol = col + dc * direction
        while (symbolAfterSwap(nextRow, nextCol, first, second) === symbol) {
          count += 1
          nextRow += dr * direction
          nextCol += dc * direction
        }
      }
      if (count >= 3) return true
    }
    return false
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (symbols[row]![col] == null) continue
      for (const [nextRow, nextCol] of [
        [row, col + 1],
        [row + 1, col],
      ] as const) {
        if (symbols[nextRow]?.[nextCol] == null) continue
        const first = { row, col }
        const second = { row: nextRow, col: nextCol }
        if (
          !makesMatchAt(row, col, first, second) &&
          !makesMatchAt(nextRow, nextCol, first, second)
        ) {
          continue
        }

        RESCUE_THE_KING_NO_MOVE_STREAK.delete(page)
        const firstCell = board.locator(`.rtk-cell-normal[data-row="${row}"][data-col="${col}"]`)
        const secondCell = board.locator(
          `.rtk-cell-normal[data-row="${nextRow}"][data-col="${nextCol}"]`
        )
        if (!(await clickWithShortTimeout(firstCell))) return false
        return clickWithShortTimeout(secondCell)
      }
    }
  }

  if (hasAnyValidMove(boardState)) {
    RESCUE_THE_KING_NO_MOVE_STREAK.delete(page)
    throw new Error('The Rescue the King driver missed a legal move confirmed by game rules.')
  }

  if (
    await host
      .locator('.rtk-reshuffle-toast')
      .isVisible()
      .catch(() => false)
  ) {
    RESCUE_THE_KING_NO_MOVE_STREAK.delete(page)
    return false
  }

  // Allow one clock step for the automatic reshuffle to finish. If the same
  // board remains immobile on the next visible read, report a game deadlock.
  const previous = RESCUE_THE_KING_NO_MOVE_STREAK.get(page)
  const count = previous?.board === boardFingerprint ? previous.count + 1 : 1
  RESCUE_THE_KING_NO_MOVE_STREAK.set(page, { board: boardFingerprint, count })
  if (count < 2) return false
  throw new Error('Rescue the King is stuck: no legal match-producing swap after reshuffling.')
}

async function playSilentSaboteurTurn(host: Locator): Promise<boolean> {
  const closeHistory = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Close Round History', exact: true })
  )
  if (closeHistory) return clickWithShortTimeout(closeHistory, 0, true)

  const continueGame = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Continue game', exact: true })
  )
  if (continueGame) return clickWithShortTimeout(continueGame, 0, true)

  const confirmAccusation = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Confirm accusation', exact: true })
  )
  if (confirmAccusation) return clickWithShortTimeout(confirmAccusation, 0, true)

  const suspect = await firstVisibleEnabled(host.getByRole('button', { name: /^Accuse / }))
  if (suspect) return clickWithShortTimeout(suspect, 0, true)

  const juryVote = await firstVisibleEnabled(
    host.getByRole('button', { name: /^(?:Cast ballot for|Choose survivor) / })
  )
  if (juryVote) return clickWithShortTimeout(juryVote, 0, true)

  const investigation = host.getByRole('heading', { name: /Round \d+ — Investigation/i })
  if (await investigation.isVisible().catch(() => false)) return false

  const stageControl = await firstVisibleEnabled(
    host.getByRole('button', {
      name: /^(?:Continue|Proceed to Tribunal Decision|Start|Finish|Reveal(?: the Truth)?|See Results|Confirm results|Skip to results)(?:\b|\s|$)/i,
    })
  )
  if (stageControl) return clickWithShortTimeout(stageControl, 0, true)

  return false
}

async function playBatteryLowTurn(
  page: Page,
  host: Locator,
  random: SeededRandom
): Promise<boolean> {
  const offer = page.getByRole('dialog', { name: 'Bank Offer' })
  const decideBankOffer = async (): Promise<boolean> => {
    const keepPlaying = await firstVisibleEnabled(
      offer.getByRole('button', { name: 'Keep playing', exact: true })
    )
    const acceptOffer = await firstVisibleEnabled(
      offer.getByRole('button', { name: 'Accept offer', exact: true })
    )
    const decision =
      random.next() < 0.35 ? (keepPlaying ?? acceptOffer) : (acceptOffer ?? keepPlaying)
    if (!decision) return false
    await decision.click({ delay: random.int(20, 85) })
    return true
  }

  if (await offer.isVisible().catch(() => false)) return decideBankOffer()

  const lockResult = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Lock result', exact: true })
  )
  if (lockResult) {
    await lockResult.click()
    return true
  }

  const closeValues = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Close battery values' })
  )
  if (closeValues) {
    await closeValues.click()
    return true
  }

  const battery = await firstVisibleEnabled(host.getByRole('button', { name: /^Battery \d+$/i }))
  if (battery) {
    await battery.click({ delay: random.int(20, 85) })
    return true
  }

  // Selecting the final battery can reveal the offer sheet on the next paint.
  // Wait briefly before reporting a stalled turn so the driver never probes
  // disabled board controls while the decision modal is opening.
  try {
    await offer.waitFor({ state: 'visible', timeout: 500 })
    return decideBankOffer()
  } catch {
    // The game may still be resolving its reveal animation.
  }

  return false
}

async function playMysticChamberTurn(host: Locator, random: SeededRandom): Promise<boolean> {
  const history = host.locator('details.mystic-chamber__history')
  if ((await history.getAttribute('open')) !== null) {
    await history.locator('summary').click()
  }

  const finish = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Continue to results' })
  )
  if (finish) {
    await finish.click()
    return true
  }

  const skip = await firstVisibleEnabled(host.getByRole('button', { name: 'Skip to results' }))
  if (skip) {
    await skip.click()
    return true
  }

  const resultContinue = await firstVisibleEnabled(
    host.getByRole('button', { name: /^(?:Continue|Show final standings)$/ })
  )
  if (resultContinue) {
    return clickWithShortTimeout(resultContinue, 0, true)
  }

  const nextRound = await firstVisibleEnabled(host.getByRole('button', { name: /^Start round / }))
  if (nextRound) {
    return clickWithShortTimeout(nextRound, 0, true)
  }

  const selectRival = async (): Promise<boolean> => {
    const players = host.locator(
      'section[aria-label="Players and Power standings"] button.mystic-chamber__player'
    )
    const rivals: Locator[] = []
    for (let index = 0; index < (await players.count()); index += 1) {
      const player = players.nth(index)
      if (
        (await player.isVisible()) &&
        (await player.isEnabled()) &&
        !(await player.getAttribute('class'))?.split(/\s+/).includes('is-active')
      ) {
        rivals.push(player)
      }
    }
    if (rivals.length === 0) return false
    await rivals[random.int(0, rivals.length - 1)]!.click()
    return true
  }

  const release = host.getByRole('button', { name: 'Release power' })
  if (await release.isVisible().catch(() => false)) {
    if (await selectRival()) {
      await expect(release).toBeEnabled({ timeout: 2_000 })
      await release.evaluate((element) =>
        element.scrollIntoView({ block: 'center', inline: 'nearest' })
      )
      return clickWithShortTimeout(release)
    }
    return false
  }

  const confirmChoice = host.getByRole('button', { name: 'Confirm choice' })
  if (await confirmChoice.isVisible().catch(() => false)) {
    if (await selectRival()) {
      await expect(confirmChoice).toBeEnabled({ timeout: 2_000 })
      await confirmChoice.evaluate((element) =>
        element.scrollIntoView({ block: 'center', inline: 'nearest' })
      )
      return clickWithShortTimeout(confirmChoice)
    }
    return false
  }

  const confirmPower = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Confirm power' })
  )
  if (confirmPower) {
    await confirmPower.evaluate((element) =>
      element.scrollIntoView({ block: 'center', inline: 'nearest' })
    )
    return clickWithShortTimeout(confirmPower)
  }

  const offers = host.locator('button.mystic-chamber__offer').filter({
    hasNotText: /Forbidden Box/i,
  })
  const preferred = await firstVisibleEnabled(offers.filter({ hasText: /Gather power/i }))
  const offer = preferred ?? (await firstVisibleEnabled(offers))
  if (offer) {
    return clickWithShortTimeout(offer, random.int(20, 85), true)
  }

  return false
}

async function playHouseOfCardsTurn(page: Page, host: Locator): Promise<boolean> {
  const toolChoice = await firstVisibleEnabled(host.locator('.hoc-tool-choice'))
  if (toolChoice) return clickWithShortTimeout(toolChoice)

  const skip = await firstVisibleEnabled(host.getByRole('button', { name: /^Skip to results$/i }))
  if (skip) {
    await skip.click()
    return true
  }

  const advance = await firstVisibleEnabled(
    host.getByRole('button', { name: /^(?:Next round|Watch the finalists)$/i })
  )
  if (advance) {
    await advance.click()
    return true
  }

  const resultsContinue = await firstVisibleEnabled(
    host.getByRole('button', { name: /^Continue(?: →)?$/i })
  )
  if (resultsContinue) {
    await resultsContinue.click()
    return true
  }

  const grid = host.getByRole('grid', { name: /card grid/i })
  if (!(await grid.isVisible().catch(() => false))) return false
  const boardName = (await grid.getAttribute('aria-label')) ?? 'card grid'
  let pageMemory = HOUSE_OF_CARDS_MEMORY.get(host.page())
  if (!pageMemory) {
    pageMemory = new Map()
    HOUSE_OF_CARDS_MEMORY.set(host.page(), pageMemory)
  }
  let symbols = pageMemory.get(boardName)
  if (!symbols) {
    symbols = new Map()
    pageMemory.set(boardName, symbols)
  }

  const cards = grid.locator('button.hoc-card')
  const count = await cards.count()
  const matched = new Set<number>()
  const visible: Array<{ index: number; symbol: string }> = []
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index)
    if ((await card.getAttribute('data-matched')) === 'true') {
      matched.add(index)
      const symbol = await card.getAttribute('aria-label')
      if (symbol && symbol !== 'Hidden card') rememberHouseSymbol(symbols, symbol, index)
      continue
    }
    const symbol = await card.getAttribute('aria-label')
    if (symbol && symbol !== 'Hidden card') {
      rememberHouseSymbol(symbols, symbol, index)
      visible.push({ index, symbol })
    }
  }

  const enabledCards = grid.locator('button.hoc-card:not(:disabled)')
  if ((await enabledCards.count()) === 0) {
    if (MINIGAME_FAST_CLOCK.has(page)) await page.clock.fastForward(2_500)
    else
      await expect(enabledCards.first())
        .toBeEnabled({ timeout: 4_000 })
        .catch(() => undefined)
  }

  if (visible.length >= 2) {
    const first = cards.nth(visible[0]!.index)
    await expect(first).toHaveAttribute('data-flipped', 'false', { timeout: 4_000 })
    return true
  }

  const availableFor = (indexes: Set<number>) => [...indexes].filter((index) => !matched.has(index))
  for (const indexes of symbols.values()) {
    const pair = availableFor(indexes)
    if (pair.length < 2) continue
    const first = cards.nth(pair[0]!)
    const second = cards.nth(pair[1]!)
    if ((await first.getAttribute('data-flipped')) !== 'true') {
      await expect(first).toBeEnabled({ timeout: 4_000 })
      await first.click()
    }
    await expect(second).toBeEnabled({ timeout: 4_000 })
    await second.click()
    await host.page().waitForTimeout(350)
    return true
  }

  const seen = new Set([...symbols.values()].flatMap((indexes) => [...indexes]))
  const hiddenIndexes: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (matched.has(index)) continue
    const card = cards.nth(index)
    if ((await card.getAttribute('aria-label')) === 'Hidden card') hiddenIndexes.push(index)
  }

  let firstIndex = visible[0]?.index
  let firstSymbol = visible[0]?.symbol
  let secondIndex: number | undefined

  if (firstIndex != null) {
    secondIndex =
      hiddenIndexes.find((index) => !seen.has(index)) ??
      hiddenIndexes.find((index) => index !== firstIndex)
  } else {
    const unknown = hiddenIndexes.filter((index) => !seen.has(index))
    if (unknown.length >= 2) {
      firstIndex = unknown[0]
      secondIndex = unknown[1]
    } else if (unknown.length === 1) {
      for (const [symbol, indexes] of symbols) {
        const known = availableFor(indexes)
        if (known.length === 1) {
          firstIndex = known[0]
          firstSymbol = symbol
          secondIndex = unknown[0]
          break
        }
      }
    } else {
      return false
    }
  }

  if (firstIndex == null || secondIndex == null) return false
  const first = cards.nth(firstIndex)
  if ((await first.getAttribute('data-flipped')) !== 'true') {
    await expect(first).toBeEnabled({ timeout: 4_000 })
    await first.click()
    firstSymbol = (await readRevealedHouseCard(host, grid, first)) ?? undefined
    if (!firstSymbol) return true
  }
  if (!firstSymbol) return false
  rememberHouseSymbol(symbols, firstSymbol, firstIndex)

  const second = cards.nth(secondIndex)
  await expect(second).toBeEnabled({ timeout: 4_000 })
  await second.click()
  const secondSymbol = await readRevealedHouseCard(host, grid, second)
  if (!secondSymbol) return true
  rememberHouseSymbol(symbols, secondSymbol, secondIndex)
  if (secondSymbol === firstSymbol) {
    if (MINIGAME_FAST_CLOCK.has(page)) await page.clock.fastForward(350)
    else await host.page().waitForTimeout(350)
    return true
  }
  await expect(second).toHaveAttribute('data-flipped', 'false', { timeout: 4_000 })
  return true
}

async function readRevealedHouseCard(
  host: Locator,
  grid: Locator,
  card: Locator
): Promise<string | null> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const symbol = await card.getAttribute('aria-label').catch(() => null)
    if (symbol && symbol !== 'Hidden card') return symbol
    if (!(await grid.isVisible().catch(() => false))) return null
    await host.page().waitForTimeout(100)
  }
  throw new Error('A House of Cards card did not reveal after it was clicked.')
}

function rememberHouseSymbol(
  symbols: Map<string, Set<number>>,
  symbol: string,
  index: number
): void {
  let indexes = symbols.get(symbol)
  if (!indexes) {
    indexes = new Set()
    symbols.set(symbol, indexes)
  }
  indexes.add(index)
}

/**
 * Uses only visible player controls. It deliberately does not dispatch scores,
 * inject winners, or call a game engine API. The caller decides whether a
 * slower game should continue naturally or use the already-shipped early-exit
 * path as a deliberate thrower scenario.
 */
export async function playVisibleMinigame(
  page: Page,
  gameKey: string,
  skill: SimulationSkill,
  random: SeededRandom
): Promise<{ interacted: boolean; completed: boolean; primaryInput: string }> {
  const profile = MINIGAME_DRIVER_PROFILES[gameKey]
  if (!profile) throw new Error(`No minigame driver registered for '${gameKey}'.`)
  const host = page.getByRole('dialog', { name: /minigame/i }).last()
  await expect(host).toBeVisible()
  await acknowledgeHostIntro(page, host)

  const closeResults = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Close results', exact: true })
  )
  if (closeResults) {
    // Resolve a finished result before sending any game-specific input. In
    // particular, a time-machine overlay also offers a retry action that must
    // not be mistaken for a gameplay control.
    await closeResults.click({ force: true })
    await host.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined)
    return { interacted: true, completed: true, primaryInput: profile.primaryInput }
  }

  if (gameKey === 'mysticChamber') {
    const interacted = await playMysticChamberTurn(host, random)
    const results = host.getByRole('heading', { name: /finished|results/i })
    return {
      interacted,
      completed: await results
        .first()
        .isVisible()
        .catch(() => false),
      primaryInput: profile.primaryInput,
    }
  }

  const spectatorOverlay = host.getByRole('dialog', { name: /you have been eliminated/i })
  const skipToResults = await firstVisibleEnabled(
    spectatorOverlay.getByRole('button', { name: 'Skip to Results', exact: true })
  )
  if (skipToResults && (await clickWithShortTimeout(skipToResults))) {
    return { interacted: true, completed: false, primaryInput: profile.primaryInput }
  }

  if (gameKey === 'silentSaboteur') {
    const interacted = await playSilentSaboteurTurn(host)
    const results = host.getByRole('heading', {
      name: /finished|results|wins|exited early|final verdict|last player standing/i,
    })
    return {
      interacted,
      completed: await results
        .first()
        .isVisible()
        .catch(() => false),
      primaryInput: profile.primaryInput,
    }
  }

  if (gameKey === 'wildcardWestern') {
    const interacted = await playWildcardWesternTurn(host, random)
    const results = host.getByRole('heading', {
      name: /finished|results|wins|exited early|final verdict|last player standing|sheriff champion/i,
    })
    const completed = await results
      .first()
      .isVisible()
      .catch(() => false)
    return {
      interacted,
      completed,
      primaryInput: profile.primaryInput,
    }
  }

  const progression = await firstVisibleEnabled(
    host.getByRole('button', {
      name: /^(?:Continue(?: game)?(?:\s*(?:→|▶|›))?|Next(?: stage| round)?(?:\s*→)?|Next: .+|See (?:Final )?Results|See standings|Reveal the Winner|Enter the Final|Start Finals(?: →)?|Start three-life final|Fast-forward to results|Fast-forward this round|Keep watching|Continue watching|Continue to results|Continue to next player|Start re-vote|New question|Hard board|Final Push|Enter Risk Run|Confirm results|Skip to results)$/i,
    })
  )
  if (progression && (await clickWithShortTimeout(progression, 0, true))) {
    return { interacted: true, completed: false, primaryInput: profile.primaryInput }
  }

  let interacted = false
  let completedByFinalVerdict = false

  if (gameKey === 'cardClash') {
    interacted = await playHouseOfCardsTurn(page, host)
  } else if (gameKey === 'colorMatch') {
    interacted = await playColorMatchTurn(host)
  } else if (gameKey === 'chainOfGreed') {
    interacted = await playChainOfGreedTurn(host, random)
  } else if (gameKey === 'blackjackTournament') {
    interacted = await playBlackjackTurn(host, random)
  } else if (gameKey === 'capitalization') {
    interacted = await playCapitalizationTurn(host)
  } else if (gameKey === 'estimationGame') {
    interacted = await playEstimationTurn(host, random)
  } else if (gameKey === 'famousFigures') {
    const hint = await firstVisibleEnabled(host.getByRole('button', { name: /^Request hint/i }))
    if (hint) {
      interacted = await clickWithShortTimeout(hint)
    } else {
      const input = await firstVisibleEnabled(
        host.getByRole('textbox', { name: 'Guess the famous figure' })
      )
      if (input) {
        await input.fill('I do not know')
        const submit = await firstVisibleEnabled(
          host.getByRole('button', { name: 'Submit guess', exact: true })
        )
        if (submit) interacted = await clickWithShortTimeout(submit)
      }
    }
  } else if (gameKey === 'dontGoOver') {
    interacted = await playDontGoOverTurn(host, random)
  } else if (gameKey === 'downMemoryLane') {
    interacted = await playDownMemoryLaneTurn(host, random)
  } else if (gameKey === 'hangman') {
    interacted = await playHangmanTurn(page, host)
  } else if (gameKey === 'minesweeps') {
    interacted = await playMinesweepsTurn(host, random)
  } else if (gameKey === 'logicLocks') {
    interacted = await playVaultCrackerTurn(page, host)
  } else if (gameKey === 'threeDigitsQuiz') {
    interacted = await playNumberTriviaTurn(host, random)
  } else if (gameKey === 'finalThreeCircuit') {
    interacted = await playFinalThreeCircuitTurn(page, host)
  } else if (gameKey === 'trapAuction') {
    interacted = await playTrapAuctionTurn(host)
  } else if (gameKey === 'houseOfDarkness') {
    interacted = await playHouseOfDarknessTurn(page, host, skill === 'thrower')
  } else if (gameKey === 'rescueTheKing') {
    interacted = await playRescueTheKingTurn(page, host)
  } else if (gameKey === 'batteryLow') {
    interacted = await playBatteryLowTurn(page, host, random)
  } else if (gameKey === 'gatesOfTheEye') {
    interacted = await playGatesOfTheEyeTurn(host, random)
  } else if (gameKey === 'boxedOut') {
    interacted = await playBoxpocalypseTurn(host, random)
  } else if (gameKey === 'majorityRules') {
    const skipSpectator = await firstVisibleEnabled(
      page.getByRole('button', { name: 'Skip to results', exact: true })
    )
    const continueSpectating = await firstVisibleEnabled(
      page.getByRole('button', { name: 'Continue watching', exact: true })
    )
    if (skipSpectator) {
      interacted = await clickWithShortTimeout(skipSpectator, 0, true)
    } else if (continueSpectating) {
      interacted = await clickWithShortTimeout(continueSpectating, 0, true)
    } else {
      const finish = await firstVisibleEnabled(
        host.getByRole('button', { name: 'Finish', exact: true })
      )
      if (finish) {
        // The last-player-standing reveal is the terminal state for Majority Rules.
        // Advancing it closes the minigame and returns control to the season flow.
        interacted = await clickWithShortTimeout(finish, random.int(20, 85), true)
        completedByFinalVerdict = interacted
      } else {
        const roll = await firstVisibleEnabled(host.getByRole('button', { name: 'Roll die' }))
        if (roll) {
          interacted = await clickWithShortTimeout(roll, random.int(20, 85), true)
        }

        const numberPick = await firstVisibleEnabled(
          host.getByRole('button', { name: /^[1-6]$/, exact: true })
        )
        if (!roll && numberPick) {
          interacted = await clickWithShortTimeout(numberPick, random.int(20, 85), true)
        }

        const answer = await firstVisibleEnabled(
          host.locator('button.majority-rules-option:not(.majority-rules-option--selected)')
        )
        const selectedAnswer = await firstVisibleEnabled(
          host.locator('button.majority-rules-option--selected')
        )
        if (!roll && !numberPick && (selectedAnswer || answer)) {
          if (!selectedAnswer && answer) {
            // These options animate into place and can be replaced when the
            // human's selection updates. Skip Playwright's stability wait, then
            // confirm the choice through the separate lock-in control.
            await clickWithShortTimeout(answer, 0, true)
          }
          const lock = await firstVisibleEnabled(
            host.getByRole('button', { name: 'Lock in answer' })
          )
          if (lock) interacted = await clickWithShortTimeout(lock, random.int(20, 85), true)
        } else if (!roll && !numberPick) {
          const continueButton = await firstVisibleEnabled(
            host.getByRole('button', {
              name: /^(?:Continue|Continue watching|Skip to results|Start re-vote|New question)$/i,
            })
          )
          if (continueButton)
            interacted = await clickWithShortTimeout(continueButton, random.int(20, 85), true)
        }
      }
    }
  } else if (gameKey === 'percentagePanic') {
    interacted = await playPercentagePanicTurn(host, random)
  }

  if (
    interacted ||
    [
      'majorityRules',
      'percentagePanic',
      'batteryLow',
      'blackjackTournament',
      'capitalization',
      'cardClash',
      'chainOfGreed',
      'dontGoOver',
      'downMemoryLane',
      'estimationGame',
      'famousFigures',
      'hangman',
      'houseOfDarkness',
      'rescueTheKing',
      'silentSaboteur',
      'finalThreeCircuit',
    ].includes(gameKey)
  ) {
    // Majority Rules requires a visible answer selection followed by a
    // separate visible confirmation; do not fall through to generic choice
    // handling, which can repeatedly click the same selected answer.
  } else if (gameKey === 'tiltLabyrinth') {
    interacted = await playTiltLabyrinthTurn(page, host)
  } else if (profile.kind === 'keyboard') {
    const input = await firstVisibleEnabled(host.locator('input:not([type="hidden"]), textarea'))
    if (input) {
      const value = skill === 'thrower' ? '0' : String(random.int(1, 9))
      await input.fill(value)
      await page.keyboard.press('Enter')
      interacted = true
    } else {
      await page.keyboard.press(
        random.pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'])
      )
      interacted = true
    }
  } else if (profile.kind === 'tap') {
    interacted = await clickMeaningfulButton(host, random)
    await clickCanvas(page, host, random, skill === 'competent' ? 8 : 2)
    interacted = true
  } else if (profile.kind === 'board' || profile.kind === 'path') {
    interacted = await clickMeaningfulButton(
      host,
      random,
      gameKey === 'crystal_path_shattered',
      gameKey === 'glass_bridge_brutal'
    )
    if (!interacted) {
      await clickCanvas(page, host, random, skill === 'competent' ? 3 : 1)
      interacted = true
    }
  } else {
    const attempts = skill === 'competent' ? 3 : 1
    for (let index = 0; index < attempts; index += 1) {
      interacted = (await clickMeaningfulButton(host, random)) || interacted
    }
  }

  const results = host.getByRole('heading', {
    name: /finished|results|wins|exited early|final verdict|last player standing/i,
  })
  return {
    interacted,
    completed:
      completedByFinalVerdict ||
      (await results
        .first()
        .isVisible()
        .catch(() => false)),
    primaryInput: profile.primaryInput,
  }
}
