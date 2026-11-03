import { closeDebugPanelIfOpen, expect, test, type Page, type TestInfo } from './support/test'

import { getAllGames, type GameRegistryEntry } from '../../src/minigames/registry'
import { isInMinigameCertificationScope } from '../../tests/helpers/minigameCertificationScope'
import { minigameCertificationName } from './support/minigameLabels'
import {
  assertMinigameDriversCoverRegistry,
  installMinigameFastClock,
  installTiltLabyrinthTestClock,
  playVisibleMinigame,
  tiltLabyrinthDriverDiagnostic,
} from './season-sim/minigames'
import { SeededRandom } from './season-sim/seededRandom'
import type { SimulationSkill } from './season-sim/types'

const PLAYABLE_GAMES = getAllGames()
  .filter(isInMinigameCertificationScope)
  .slice()
  .sort((left, right) => left.key.localeCompare(right.key))
const DRIVER_SKILL: SimulationSkill = 'competent'
const MAX_STALLED_ACTIONS = 40

interface PlaythroughScenario {
  label: 'minimum' | 'maximum' | 'default'
  players: number
  seed: number
}

function isCastleRescueGame(key: string): boolean {
  return [
    'castleRescue',
    'castleRescueRemastered',
    'castleRescue2',
    'castleRescue2Remastered',
  ].includes(key)
}

function scenariosFor(game: GameRegistryEntry): PlaythroughScenario[] {
  if (game.key === 'tiltLabyrinth') {
    return [
      { label: 'minimum', players: Math.max(2, game.minPlayers ?? 2), seed: 3663 },
      {
        label: 'maximum',
        players: Math.max(Math.max(2, game.minPlayers ?? 2), game.maxPlayers ?? 4),
        seed: 3396,
      },
    ]
  }
  if (game.key === 'cardClash' || isCastleRescueGame(game.key)) {
    return [{ label: 'default', players: 4, seed: 0x5eedc0de }]
  }
  if (game.key === 'chainOfGreed') {
    return [{ label: 'minimum', players: Math.max(2, game.minPlayers ?? 2), seed: 424242 }]
  }
  const minimum = Math.max(2, game.minPlayers ?? 2)
  const maximum = Math.max(minimum, game.maxPlayers ?? Math.max(minimum, 4))
  const candidates: PlaythroughScenario[] = [
    { label: 'minimum', players: minimum, seed: 424242 },
    { label: game.maxPlayers == null ? 'default' : 'maximum', players: maximum, seed: 0x5eedc0de },
  ]
  return candidates.filter(
    (scenario, index) =>
      candidates.findIndex((candidate) => candidate.players === scenario.players) === index
  )
}

function completionBudgetMs(game: GameRegistryEntry): number {
  if (game.key === 'cardClash') return 240_000
  if (game.key === 'chainOfGreed') return 360_000
  if (game.key === 'tiltLabyrinth') return 180_000
  return game.timeLimitMs > 0 ? Math.min(game.timeLimitMs + 45_000, 210_000) : 90_000
}

async function openGame(
  page: Page,
  game: GameRegistryEntry,
  scenario: PlaythroughScenario
): Promise<void> {
  const vipPreview = game.vipOnly ? '&vipPreview=1' : ''
  await page.goto(
    './#/minigame-lab?game=' +
      encodeURIComponent(game.key) +
      '&seed=' +
      scenario.seed +
      '&players=' +
      scenario.players +
      '&skipRules=1&skipCountdown=1&showLab=1' +
      '&testCompetitionContext=loh' +
      vipPreview,
    { waitUntil: 'commit' }
  )
  await expect(page.getByTestId('minigame-lab-selected-title')).toHaveText(game.title, {
    timeout: 60_000,
  })
  await closeDebugPanelIfOpen(page)
  await page.addStyleTag({
    content:
      '.minigame-lab__panel { visibility: hidden !important; pointer-events: none !important; }',
  })
  await expect(page.getByTestId('minigame-lab-completion-count')).toHaveText('0')
  await expect(
    page.getByRole('dialog', { name: new RegExp(game.title + ' minigame', 'i') })
  ).toBeVisible()
}

async function attachFailureEvidence(
  page: Page,
  testInfo: TestInfo,
  game: GameRegistryEntry
): Promise<void> {
  const attachmentPrefix = minigameCertificationName(game)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  await testInfo.attach(attachmentPrefix + '-failure-screen.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  const screenText = await page
    .locator('body')
    .innerText()
    .catch(() => '')
  await testInfo.attach(attachmentPrefix + '-failure-text.txt', {
    body: Buffer.from(screenText.slice(0, 20_000)),
    contentType: 'text/plain',
  })
}

async function continueFinishedHostResult(page: Page, game: GameRegistryEntry): Promise<void> {
  const host = page.getByRole('dialog', { name: new RegExp(game.title + ' minigame', 'i') }).last()
  const finished = host.getByRole('heading', { name: /Finished!/i })
  if (!(await finished.isVisible().catch(() => false))) return

  const continueButton = host.getByRole('button', { name: /^Continue/i }).last()
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click({ timeout: 2_000, force: true })
  }
}

test.describe('full minigame gameplay certification @full-playthrough', () => {
  test.describe.configure({ mode: 'parallel' })

  test('every active release-scope registry entry has a visible-control driver', () => {
    assertMinigameDriversCoverRegistry()
  })

  for (const game of PLAYABLE_GAMES) {
    for (const scenario of scenariosFor(game)) {
      test(
        minigameCertificationName(game) +
          ' completes at ' +
          scenario.label +
          ' player count with seed ' +
          scenario.seed,
        async ({ page }, testInfo) => {
          testInfo.setTimeout(completionBudgetMs(game) + 10_000)
          const startedAt = Date.now()
          const fastClock =
            game.key === 'cardClash' ||
            game.key === 'chainOfGreed' ||
            game.key === 'blackjackTournament' ||
            game.key === 'famousFigures' ||
            game.key === 'mysticChamber' ||
            game.key === 'finalThreeCircuit' ||
            game.key === 'riskWheel' ||
            game.key === 'trapAuction' ||
            game.key === 'silentSaboteur' ||
            game.key === 'wildcardWestern'
          const installClockBeforeMount =
            game.key === 'famousFigures' ||
            game.key === 'mysticChamber' ||
            game.key === 'finalThreeCircuit' ||
            game.key === 'silentSaboteur'
          if (game.key === 'mysticChamber') await page.emulateMedia({ reducedMotion: 'reduce' })
          if (fastClock && installClockBeforeMount) await installMinigameFastClock(page)
          if (isCastleRescueGame(game.key)) await page.clock.install()
          if (game.key === 'tiltLabyrinth') await installTiltLabyrinthTestClock(page)
          await openGame(page, game, scenario)
          page.setDefaultTimeout(5_000)
          if (fastClock && !installClockBeforeMount) await installMinigameFastClock(page)

          const completionCount = page.getByTestId('minigame-lab-completion-count')
          const lastResult = page.getByTestId('minigame-lab-last-result')
          const random = new SeededRandom(scenario.seed ^ 0x9e3779b9)
          let steps = 0
          let stalledActions = 0
          let completed = false
          const maxSteps = game.key === 'chainOfGreed' ? 1_500 : 500

          if (isCastleRescueGame(game.key)) {
            const host = page.getByRole('dialog', {
              name: new RegExp(game.title + ' minigame', 'i'),
            })
            if (game.vipOnly) {
              const twin = page.frameLocator('iframe')
              await expect(twin.locator('canvas')).toBeVisible()
              await twin.getByRole('button', { name: '▶', exact: true }).click({ timeout: 5_000 })
              await twin
                .getByRole('button', { name: 'JUMP', exact: true })
                .click({ timeout: 5_000 })
              await twin.getByRole('button', { name: /ENTER/ }).click({ timeout: 5_000 })
              await page.clock.fastForward(game.timeLimitMs + 1_000)
              const gameContinue = twin.getByRole('button', { name: 'Continue', exact: true })
              await expect(gameContinue).toBeVisible()
              await gameContinue.click({ force: true })
            } else {
              await expect(host.locator('canvas')).toBeVisible()
              await host.getByRole('button', { name: 'Move right', exact: true }).click()
              await host.getByRole('button', { name: 'Jump', exact: true }).click()
              await host.getByRole('button', { name: /Enter (?:pipe|door)/i }).click()
              await page.clock.runFor(game.timeLimitMs + 1_000)
            }
            await expect(host.getByRole('heading', { name: /Finished!/i })).toBeVisible()
            await host.getByRole('button', { name: /Continue/i }).click()
            await expect(completionCount).toHaveText('1')
            completed = true
          }

          while (!completed && Date.now() - startedAt < completionBudgetMs(game)) {
            if ((await completionCount.textContent())?.trim() === '1') {
              completed = true
              break
            }

            const gameSkill: SimulationSkill =
              game.key === 'houseOfDarkness' ? 'thrower' : DRIVER_SKILL
            const action = await playVisibleMinigame(page, game.key, gameSkill, random)
            steps += 1
            if (fastClock) {
              const clockStepMs =
                game.key === 'chainOfGreed'
                  ? 5_000
                  : game.key === 'mysticChamber'
                    ? 10_000
                    : game.key === 'finalThreeCircuit'
                      ? 50
                      : game.key === 'famousFigures'
                        ? 10_000
                        : 1_000
              const effectiveClockStep = game.key === 'silentSaboteur' ? 10_000 : clockStepMs
              await page.clock.fastForward(
                game.key === 'mysticChamber'
                  ? clockStepMs
                  : action.interacted
                    ? effectiveClockStep
                    : 1_000
              )
            } else if (action.completed) await page.waitForTimeout(100)
            await continueFinishedHostResult(page, game)
            stalledActions =
              action.interacted || (fastClock && game.key === 'silentSaboteur')
                ? 0
                : stalledActions + 1
            if (stalledActions >= MAX_STALLED_ACTIONS || steps > maxSteps) break
            if (!fastClock && !action.interacted && !action.completed)
              await page.waitForTimeout(250)
          }

          if (!completed && (await completionCount.textContent())?.trim() === '1') completed = true
          if (!completed) {
            await attachFailureEvidence(page, testInfo, game)
            if (game.key === 'tiltLabyrinth') {
              await testInfo.attach('tilt-labyrinth-driver-state.txt', {
                body: Buffer.from(tiltLabyrinthDriverDiagnostic(page)),
                contentType: 'text/plain',
              })
            }
            throw new Error(
              minigameCertificationName(game) +
                ' did not commit a complete host result after ' +
                steps +
                ' visible actions (' +
                scenario.players +
                ' players, seed ' +
                scenario.seed +
                ').'
            )
          }

          await continueFinishedHostResult(page, game)
          await expect(lastResult).toContainText(/: (?:authoritative winner|completed with)/)
          await expect(lastResult).not.toContainText('[partial]')
          await expect(completionCount).toHaveText('1')
        }
      )
    }
  }
})
