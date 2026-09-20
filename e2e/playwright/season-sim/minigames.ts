import { expect, type Locator, type Page } from '@playwright/test'

import { getAllGames } from '../../../src/minigames/registry'
import type { SimulationSkill } from './types'
import { SeededRandom } from './seededRandom'

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
  pressurePlank: { kind: 'tap', primaryInput: 'timed balance control' },
  colorMatch: { kind: 'memory', primaryInput: 'colour choice' },
  logicLocks: { kind: 'board', primaryInput: 'lock controls' },
  snake: { kind: 'keyboard', primaryInput: 'direction controls' },
  cardClash: { kind: 'choice', primaryInput: 'card choice and peek' },
  hangman: { kind: 'keyboard', primaryInput: 'letter entry' },
  tiltLabyrinth: { kind: 'keyboard', primaryInput: 'keyboard/drag direction' },
  threeDigitsQuiz: { kind: 'choice', primaryInput: 'numeric answer choice' },
  capitalization: { kind: 'keyboard', primaryInput: 'capitalized text entry' },
  tetris: { kind: 'keyboard', primaryInput: 'move and rotate controls' },
  minesweeps: { kind: 'board', primaryInput: 'reveal and flag tiles' },
  dontGoOver: { kind: 'keyboard', primaryInput: 'numeric estimate' },
  blackjackTournament: { kind: 'choice', primaryInput: 'card actions' },
  riskWheel: { kind: 'choice', primaryInput: 'spin and wager choices' },
  wildcardWestern: { kind: 'choice', primaryInput: 'duel choices' },
  castleRescue: { kind: 'keyboard', primaryInput: 'platform controls' },
  castleRescueRemastered: { kind: 'keyboard', primaryInput: 'platform controls' },
  castleRescue2: { kind: 'keyboard', primaryInput: 'platform controls' },
  castleRescue2Remastered: { kind: 'keyboard', primaryInput: 'platform controls' },
  glass_bridge_brutal: { kind: 'path', primaryInput: 'bridge path choice' },
  crystal_path_shattered: { kind: 'path', primaryInput: 'bridge path choice' },
  rescueTheKing: { kind: 'board', primaryInput: 'board movement' },
  trapAuction: { kind: 'choice', primaryInput: 'bid and target choice' },
  gridOfLuck: { kind: 'choice', primaryInput: 'grid selection' },
  bigSpender: { kind: 'choice', primaryInput: 'spend or bank choice' },
  chainOfGreed: { kind: 'choice', primaryInput: 'split, steal, vote, or duel choice' },
  batteryLow: { kind: 'choice', primaryInput: 'reserve and bank choices' },
  houseOfDarkness: { kind: 'memory', primaryInput: 'memory-card selection' },
  finalThreeCircuit: { kind: 'finale', primaryInput: 'six visible finale stages' },
  downMemoryLane: { kind: 'choice', primaryInput: 'buzz and season-history answer' },
}

export function assertMinigameDriversCoverRegistry(): void {
  const playableKeys = getAllGames()
    .filter((game) => !game.retired || game.vipOnly)
    .map((game) => game.key)
    .sort()
  const configuredKeys = Object.keys(MINIGAME_DRIVER_PROFILES).sort()
  expect(
    configuredKeys,
    'every playable registry game needs a season-simulation input driver'
  ).toEqual(playableKeys)
}

async function firstVisibleEnabled(locator: Locator): Promise<Locator | null> {
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index)
    if ((await candidate.isVisible()) && (await candidate.isEnabled())) return candidate
  }
  return null
}

async function acknowledgeHostIntro(page: Page): Promise<void> {
  const rules = page.getByRole('dialog').filter({ hasText: /Rules|How to play/i })
  if (
    await rules
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    const button = await firstVisibleEnabled(rules.first().getByRole('button'))
    if (button) await button.click()
  }
  const demo = page.getByRole('dialog', { name: /example turn/i })
  if (await demo.isVisible().catch(() => false)) {
    const interactive = await firstVisibleEnabled(demo.getByRole('button'))
    if (interactive) await interactive.click()
    const continueButton = await firstVisibleEnabled(demo.getByRole('button', { name: /got it/i }))
    if (continueButton) await continueButton.click()
  }
}

async function clickCanvas(page: Page, random: SeededRandom, repeats: number): Promise<void> {
  const canvas = page.locator('canvas').last()
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

async function clickMeaningfulButton(page: Page, random: SeededRandom): Promise<boolean> {
  const controls = page.getByRole('button').filter({
    hasNotText: /open minigame menu|leave competition|keep playing|exit with 0|close results/i,
  })
  const button = await firstVisibleEnabled(controls)
  if (!button) return false
  await button.click({ delay: random.int(20, 85) })
  return true
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
  await acknowledgeHostIntro(page)
  let interacted = false

  if (profile.kind === 'keyboard') {
    const input = await firstVisibleEnabled(page.locator('input:not([type="hidden"]), textarea'))
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
    interacted = await clickMeaningfulButton(page, random)
    await clickCanvas(page, random, skill === 'competent' ? 8 : 2)
    interacted = true
  } else if (profile.kind === 'board' || profile.kind === 'path') {
    interacted = await clickMeaningfulButton(page, random)
    if (!interacted) {
      await clickCanvas(page, random, skill === 'competent' ? 3 : 1)
      interacted = true
    }
  } else {
    const attempts = skill === 'competent' ? 3 : 1
    for (let index = 0; index < attempts; index += 1) {
      interacted = (await clickMeaningfulButton(page, random)) || interacted
    }
  }

  const results = page.getByRole('heading', { name: /finished|results|wins|exited early/i })
  return {
    interacted,
    completed: await results
      .first()
      .isVisible()
      .catch(() => false),
    primaryInput: profile.primaryInput,
  }
}
