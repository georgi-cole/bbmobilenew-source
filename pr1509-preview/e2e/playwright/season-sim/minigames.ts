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

async function acknowledgeHostIntro(host: Locator): Promise<void> {
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
  const demo = host.locator('[role="dialog"]').filter({ hasText: /example turn/i })
  if (await demo.isVisible().catch(() => false)) {
    const interactive = await firstVisibleEnabled(demo.getByRole('button'))
    if (interactive) await interactive.click()
    const continueButton = await firstVisibleEnabled(demo.getByRole('button', { name: /got it/i }))
    if (continueButton) await continueButton.click()
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

async function clickMeaningfulButton(host: Locator, random: SeededRandom): Promise<boolean> {
  const controls = host.getByRole('button').filter({
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
  const host = page.getByRole('dialog', { name: /minigame/i }).last()
  await expect(host).toBeVisible()
  await acknowledgeHostIntro(host)
  let interacted = false

  if (gameKey === 'majorityRules') {
    const answer = await firstVisibleEnabled(host.getByRole('button', { name: /^SELECT [A-Z]\b/i }))
    if (answer) {
      await answer.click({ delay: random.int(20, 85) })
      const lock = await firstVisibleEnabled(host.getByRole('button', { name: 'Lock in answer' }))
      if (lock) await lock.click({ delay: random.int(20, 85) })
      interacted = true
    } else {
      const continueButton = host
        .getByRole('button', { name: /^(?:Continue|Continue watching|Skip to results)$/i })
        .first()
      if (await continueButton.isVisible().catch(() => false)) {
        await page.waitForTimeout(350)
        const stableContinue = await firstVisibleEnabled(
          host.getByRole('button', {
            name: /^(?:Continue|Continue watching|Skip to results)$/i,
          })
        )
        if (stableContinue) {
          try {
            await stableContinue.click({ delay: random.int(20, 85), timeout: 2_000 })
            interacted = true
          } catch {
            // The game may replace the result card during its animation;
            // retry from the next bounded simulation action.
          }
        }
      }
    }
  }

  if (interacted || gameKey === 'majorityRules') {
    // Majority Rules requires a visible answer selection followed by a
    // separate visible confirmation; do not fall through to generic choice
    // handling, which can repeatedly click the same selected answer.
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
    interacted = await clickMeaningfulButton(host, random)
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

  const results = host.getByRole('heading', { name: /finished|results|wins|exited early/i })
  return {
    interacted,
    completed: await results
      .first()
      .isVisible()
      .catch(() => false),
    primaryInput: profile.primaryInput,
  }
}
