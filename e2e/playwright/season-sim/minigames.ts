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
  mysticChamber: { kind: 'choice', primaryInput: 'power, target, and turn-continuation choices' },
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

async function playMysticChamberTurn(host: Locator, random: SeededRandom): Promise<boolean> {
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
    await resultContinue.click()
    return true
  }

  const nextRound = await firstVisibleEnabled(host.getByRole('button', { name: /^Start round / }))
  if (nextRound) {
    await nextRound.click()
    return true
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

  const release = await firstVisibleEnabled(host.getByRole('button', { name: 'Release power' }))
  if (release) {
    if (await selectRival()) {
      await expect(release).toBeEnabled({ timeout: 2_000 })
      await release.click()
      return true
    }
    return false
  }

  const confirmChoice = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Confirm choice' })
  )
  if (confirmChoice) {
    if (await selectRival()) {
      await expect(confirmChoice).toBeEnabled({ timeout: 2_000 })
      await confirmChoice.click()
      return true
    }
    return false
  }

  const confirmPower = await firstVisibleEnabled(
    host.getByRole('button', { name: 'Confirm power' })
  )
  if (confirmPower) {
    await confirmPower.click()
    return true
  }

  const offers = host.locator('button.mystic-chamber__offer').filter({
    hasNotText: /Forbidden Box/i,
  })
  const preferred = await firstVisibleEnabled(offers.filter({ hasText: /Gather power/i }))
  const offer = preferred ?? (await firstVisibleEnabled(offers))
  if (offer) {
    await offer.click({ delay: random.int(20, 85) })
    return true
  }

  return false
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

  let interacted = false
  let completedByFinalVerdict = false

  if (gameKey === 'mysticChamber') {
    interacted = await playMysticChamberTurn(host, random)
  } else if (gameKey === 'majorityRules') {
    const finish = await firstVisibleEnabled(
      host.getByRole('button', { name: 'Finish', exact: true })
    )
    if (finish) {
      // The last-player-standing reveal is the terminal state for Majority Rules.
      // Advancing it closes the minigame and returns control to the season flow.
      await finish.click({ delay: random.int(20, 85) })
      interacted = true
      completedByFinalVerdict = true
    } else {
      const answer = await firstVisibleEnabled(
        host.getByRole('button', { name: /^SELECT [A-Z]\b/i })
      )
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
