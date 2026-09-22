import { expect, type Page, type TestInfo } from '@playwright/test'

import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  readAppState,
} from '../support/test'
import { CoverageLedger, objectivesForMode } from './coverage'
import { SeasonAuditor } from './auditor'
import { getModeAdapter } from './modeAdapters'
import { assertMinigameDriversCoverRegistry, playVisibleMinigame } from './minigames'
import { choosePersonaAction, getPersona } from './personas'
import { SeededRandom } from './seededRandom'
import { getAllGames } from '../../../src/minigames/registry'
import {
  SEASON_SIMULATION_MODES,
  type SimulationAction,
  type SimulationContext,
  type SimulationRunConfig,
} from './types'

const UI_TIMEOUT = 30_000

function optionalSeed(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 0)
  return Number.isFinite(parsed) ? parsed >>> 0 : fallback
}

function optionalPositiveInt(name: string): number | undefined {
  const raw = process.env[name]
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer; received '${raw}'.`)
  }
  return parsed
}

function optionalMode(): SimulationRunConfig['mode'] | undefined {
  const raw = process.env.SEASON_SIM_MODE
  if (!raw) return undefined
  if ((SEASON_SIMULATION_MODES as readonly string[]).includes(raw)) {
    return raw as SimulationRunConfig['mode']
  }
  throw new Error(
    `SEASON_SIM_MODE must be one of ${SEASON_SIMULATION_MODES.join(', ')}; received '${raw}'.`
  )
}

function optionalEnum<T extends string>(name: string, values: readonly T[]): T | undefined {
  const raw = process.env[name]
  if (!raw) return undefined
  if ((values as readonly string[]).includes(raw)) return raw as T
  throw new Error(`${name} must be one of ${values.join(', ')}; received '${raw}'.`)
}

async function waitForHome(page: Page): Promise<void> {
  const menu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(menu).toBeVisible({ timeout: UI_TIMEOUT })
  await closeDebugPanelIfOpen(page)
  await dismissPermissionPromptIfPresent(page)
}

async function createFreshProfile(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Profile', exact: true })
    .click()
  await page.getByRole('button', { name: 'Select or Create a Profile' }).click()
  await page.getByRole('button', { name: /Create New Profile/ }).click()
  await page.getByPlaceholder('Enter display name').fill(name)
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
  const activeProfileId = (await readAppState(page)).profiles.activeProfileId
  if (activeProfileId) {
    await page.evaluate(
      (profileId) => localStorage.setItem(`bbmobilenew_season_tutorial_v1:${profileId}`, 'done'),
      activeProfileId
    )
  }
  await page.getByRole('button', { name: 'Go back' }).click()
  await waitForHome(page)
}

async function closePhaseInformation(page: Page): Promise<boolean> {
  const dialog = page.getByRole('dialog', { name: /^Phase info:/ })
  if (!(await dialog.isVisible().catch(() => false))) return false
  await dialog.getByRole('button', { name: 'Close' }).click()
  return true
}

async function resolveConfessional(page: Page): Promise<boolean> {
  const entry = page.getByRole('button', { name: /^Confessional \(\d+\)$/ })
  if (!(await entry.isVisible().catch(() => false)) || !(await entry.isEnabled())) return false
  await entry.click()
  const panel = page.getByTestId('required-confessional-decision')
  if (!(await panel.isVisible({ timeout: UI_TIMEOUT }).catch(() => false))) return false

  const confirms = panel.getByRole('button', {
    name: /Confirm nominations|Confirm power decision|Confirm replacement|Seal eviction vote|Seal deciding vote|Confirm eliminations/,
  })
  const confirm = confirms.first()
  for (let guard = 0; guard < 10 && !(await confirm.isEnabled().catch(() => false)); guard += 1) {
    const choice = panel
      .getByRole('group')
      .getByRole('button')
      .filter({ hasNotText: /confirm|seal/i })
    let clicked = false
    for (let index = 0; index < (await choice.count()); index += 1) {
      const candidate = choice.nth(index)
      if ((await candidate.isVisible()) && (await candidate.isEnabled())) {
        await candidate.click()
        clicked = true
        break
      }
    }
    if (!clicked) break
  }
  if (await confirm.isEnabled().catch(() => false)) await confirm.click()
  else {
    const binary = panel
      .getByRole('button', { name: /Leave nominations unchanged|Keep nominations|Use.*Safety/i })
      .first()
    if (await binary.isVisible().catch(() => false)) await binary.click()
    if (await confirm.isEnabled().catch(() => false)) await confirm.click()
    else return false
  }
  const session = page.getByTestId('required-confessional-session')
  const returnHome = session.getByRole('button', { name: 'Return to the House' })
  await expect(returnHome).toBeVisible({ timeout: UI_TIMEOUT })
  await returnHome.click()
  return true
}

async function exerciseSocial(page: Page, personaId: string): Promise<boolean> {
  const toolbar = page.getByRole('toolbar', { name: 'Game actions' })
  const social = toolbar.getByRole('button', { name: /^Social(?: \(\d+\))?$/ })
  if (!(await social.isVisible().catch(() => false)) || !(await social.isEnabled())) return false
  await social.click()
  const dialog = page.getByRole('dialog', { name: 'Social Phase' })
  await expect(dialog).toBeVisible({ timeout: UI_TIMEOUT })
  const tutorial = page.getByTestId('reality-social-tutorial-prompt')
  if (await tutorial.isVisible().catch(() => false)) {
    await tutorial.getByRole('button', { name: 'Skip' }).click()
  }
  const player = dialog.locator('[aria-label="Player roster"]').getByRole('button').first()
  if (!(await player.isVisible().catch(() => false))) return false
  await player.click()
  const preferred =
    personaId === 'villain'
      ? /Argue|Gossip|Expose/i
      : personaId === 'resource-hoarder'
        ? /Ask|Observe|Info/i
        : /Compliment|Check in|Chat/i
  const action = dialog
    .locator('[aria-label="Action grid"]')
    .getByRole('button', { name: preferred })
    .first()
  const fallback = dialog.locator('[aria-label="Action grid"]').getByRole('button').first()
  const candidate = (await action.isVisible().catch(() => false)) ? action : fallback
  if (!(await candidate.isVisible().catch(() => false))) return false
  if (!(await candidate.isEnabled().catch(() => false))) {
    await dialog.getByRole('button', { name: 'Close social panel' }).click()
    return false
  }
  await candidate.click()
  const execute = dialog.getByRole('button', { name: 'Execute' })
  if (!(await execute.isEnabled({ timeout: UI_TIMEOUT }).catch(() => false))) {
    await dialog.getByRole('button', { name: 'Close social panel' }).click()
    return false
  }
  if (personaId === 'exploit-breaker') await execute.dblclick()
  else await execute.click()
  await dialog.getByRole('button', { name: 'Close social panel' }).click()
  return true
}

async function exitMinigame(page: Page): Promise<boolean> {
  const menu = page.getByRole('button', { name: 'Open minigame menu' })
  if (!(await menu.isVisible().catch(() => false))) return false
  await menu.click()
  await page.getByRole('menuitem', { name: /Leave competition/i }).click()
  await page.getByRole('button', { name: 'Exit with 0' }).click()
  const continueButton = page.getByRole('button', { name: /Continue.*▶|Close results/i }).first()
  await expect(continueButton).toBeVisible({ timeout: UI_TIMEOUT })
  await continueButton.click()
  return true
}

async function handleVisibleCompetition(
  page: Page,
  config: SimulationRunConfig,
  random: SeededRandom
): Promise<{ handled: boolean; gameKey?: string }> {
  const state = await readAppState(page)
  const pending = state.challenge.pending
  const host = pending
    ? page.getByRole('dialog', { name: new RegExp(`${pending.game.title} minigame`, 'i') })
    : page.getByRole('dialog', { name: /minigame/i }).last()
  if (!(await host.isVisible().catch(() => false))) return { handled: false }
  const dialogLabel = await host.getAttribute('aria-label')
  const dialogGame = getAllGames().find(
    (game) => dialogLabel?.toLowerCase() === `${game.title} minigame`.toLowerCase()
  )
  const gameKey = pending?.game.key ?? dialogGame?.key
  if (!gameKey) return { handled: true }
  const result = await playVisibleMinigame(page, gameKey, config.competitionSkill, random)
  if (!result.completed && config.competitionSkill === 'thrower') await exitMinigame(page)
  // A visible modal owns the interaction surface even during a short
  // transition where the current driver has no button to press. Never let the
  // shared phase-advance action click behind an active minigame.
  return { handled: true, gameKey }
}

function canAdvance(): SimulationAction {
  return {
    id: 'advance',
    label: 'advance visible phase',
    module: 'phase',
    async perform(target) {
      const advance = target.getByRole('button', { name: 'Advance to next phase' })
      await expect(advance).toBeVisible({ timeout: UI_TIMEOUT })
      await expect(advance).toBeEnabled()
      await advance.click()
    },
  }
}

export async function runSeasonSimulation(
  page: Page,
  testInfo: TestInfo,
  config: SimulationRunConfig
): Promise<SeasonAuditor> {
  assertMinigameDriversCoverRegistry()
  const startedAtMs = Date.now()
  const context: SimulationContext = { page, testInfo, config, startedAtMs }
  const coverage = new CoverageLedger(config.objectives, config.mode, config.entitlement === 'vip')
  const auditor = new SeasonAuditor(context, coverage)
  const random = new SeededRandom(config.seeds.actor)
  const persona = getPersona(config.personaId)
  const adapter = getModeAdapter(config.mode)

  await page.goto('./')
  await waitForHome(page)
  await createFreshProfile(page, `Sim ${config.personaId} ${config.seeds.actor}`)
  await adapter.launch(page)
  await auditor.record('launch season', 'home')
  coverage.verify(
    'fresh-day-one',
    'Profile creation and mode selection were completed through the UI.'
  )

  let terminal = 'action-budget-reached'
  for (let step = 0; step < config.maxActions; step += 1) {
    const state = await readAppState(page)
    const day =
      state.game.modeSpecific?.kind === 'survival'
        ? state.game.modeSpecific.currentDay
        : state.game.week
    if (step === 0 || step % 3 === 0) {
      await auditor.checkpoint(`before-action-${step}`, state)
    }
    if (await adapter.isTerminal(page)) {
      terminal = (await adapter.describeTerminal(page)) ?? 'terminal'
      break
    }
    if (day > config.maxDays) {
      terminal = `day-budget-${config.maxDays}`
      break
    }
    if (await closePhaseInformation(page)) {
      await auditor.record('close phase information', 'presentation', undefined, state)
      continue
    }
    const competition = await handleVisibleCompetition(page, config, random)
    if (competition.handled) {
      await auditor.record('play visible competition', 'minigame', competition.gameKey, state)
      coverage.verify(
        `minigame:${competition.gameKey}`,
        'Visible primary input was sent through the MinigameHost.'
      )
      continue
    }
    if (await resolveConfessional(page)) {
      await auditor.record(
        'resolve required confessional decision',
        'confessional',
        undefined,
        state
      )
      coverage.verify(
        'loh-and-nomination',
        'Required ceremony decision was confirmed in the Confessional.'
      )
      coverage.verify(
        'safety-and-vote',
        'Required ceremony decision was confirmed in the Confessional.'
      )
      continue
    }
    if (state.game.phase === 'social_1' || state.game.phase === 'social_2') {
      if (await exerciseSocial(page, persona.id)) {
        await auditor.record('perform social action', 'social', undefined, state)
        coverage.verify('social-action', 'A visible social action was selected and executed.')
        continue
      }
    }
    const actions: SimulationAction[] = [canAdvance()]
    const chosen = choosePersonaAction(persona, actions, random)
    await chosen.perform(page)
    await auditor.record(chosen.label, chosen.module, undefined, state)
  }

  await auditor.checkpoint('final')
  if (process.env.SEASON_SIM_CAPTURE_FINAL === '1') {
    await page
      .screenshot({
        path: testInfo.outputPath(`${config.id}-final.png`),
        fullPage: true,
        timeout: 10_000,
      })
      .catch(() => undefined)
  }
  await auditor.attachReport(config.id, terminal)
  return auditor
}

export function defaultSimulationConfig(
  overrides: Partial<SimulationRunConfig> = {}
): SimulationRunConfig {
  const mode = overrides.mode ?? optionalMode() ?? 'classic'
  const personaId = overrides.personaId ?? process.env.SEASON_SIM_PERSONA ?? 'strategic-operator'
  return {
    id: 'classic-strategic-smoke',
    mode,
    entitlement:
      overrides.entitlement ??
      optionalEnum('SEASON_SIM_ENTITLEMENT', ['normal', 'vip'] as const) ??
      'normal',
    personaId,
    seeds: {
      roster: optionalSeed('SEASON_SIM_ROSTER_SEED', 0x4f1bbcdc),
      season: optionalSeed('SEASON_SIM_SEASON_SEED', 0x6d2b79f5),
      actor: optionalSeed('SEASON_SIM_ACTOR_SEED', 0x7a11ce42),
    },
    viewport: 'iphone-17',
    objectives: objectivesForMode(mode),
    // This PR-sized smoke validates fresh setup and the first visible phases.
    // Longer UI journeys opt into a larger budget through their run config.
    maxActions: optionalPositiveInt('SEASON_SIM_MAX_ACTIONS') ?? 4,
    maxDays: optionalPositiveInt('SEASON_SIM_MAX_DAYS') ?? 1,
    competitionSkill:
      optionalEnum('SEASON_SIM_COMPETITION_SKILL', ['competent', 'mediocre', 'thrower'] as const) ??
      'thrower',
    ...overrides,
  }
}
