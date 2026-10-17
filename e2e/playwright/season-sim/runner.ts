import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

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
  type SeasonPerformanceCheckpoint,
  type SimulationAction,
  type SimulationContext,
  type SimulationRunConfig,
} from './types'

const UI_TIMEOUT = 30_000

interface BrowserPerformanceSnapshot {
  samples: Array<{ kind: string; durationMs?: number }>
  metrics: SeasonPerformanceCheckpoint['metrics']
}

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

async function clearBrowserPerformanceSamples(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as Window & {
      __bbGamePerformance?: { clear: () => void }
    }
    host.__bbGamePerformance?.clear()
  })
}

async function recordBrowserPerformanceCheckpoint(
  page: Page,
  auditor: SeasonAuditor,
  name: SeasonPerformanceCheckpoint['name'],
  state: Awaited<ReturnType<typeof readAppState>>
): Promise<void> {
  const snapshot = await page.evaluate(() => {
    const host = window as Window & {
      __bbGamePerformance?: { snapshot: () => BrowserPerformanceSnapshot }
    }
    return host.__bbGamePerformance?.snapshot() ?? null
  })
  if (!snapshot) throw new Error('Opt-in game performance diagnostics did not start.')

  const frameGaps = snapshot.samples.filter((sample) => sample.kind === 'frame-gap')
  const inputResponses = snapshot.samples.filter((sample) => sample.kind === 'input-response')
  const reduxActions = snapshot.samples.filter((sample) => sample.kind === 'redux-action')
  const frameDurations = frameGaps
    .map((sample) => sample.durationMs)
    .filter((duration): duration is number => typeof duration === 'number')
  const { game } = state
  auditor.recordPerformanceCheckpoint({
    name,
    day: game.modeSpecific?.kind === 'survival' ? game.modeSpecific.currentDay : game.week,
    week: game.week,
    phase: game.phase,
    activePlayerCount: game.players.filter((player) => player.status === 'active').length,
    historyCount: game.history?.length ?? 0,
    tvFeedCount: game.tvFeed?.length ?? 0,
    sampleCounts: {
      frameGaps: frameGaps.length,
      inputResponses: inputResponses.length,
      reduxActions: reduxActions.length,
    },
    metrics: snapshot.metrics,
    longestFrameGapMs: frameDurations.length > 0 ? Math.max(...frameDurations) : null,
    frameGapsOver100Ms: frameDurations.filter((duration) => duration > 100).length,
  })
}

async function measureDebugInputCheckpoint(
  page: Page,
  auditor: SeasonAuditor,
  debugPanel: Locator,
  name: SeasonPerformanceCheckpoint['name']
): Promise<void> {
  await clearBrowserPerformanceSamples(page)
  await debugPanel.getByRole('button', { name: 'Clear Stuck Flags', exact: true }).click()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
      })
  )
  await recordBrowserPerformanceCheckpoint(page, auditor, name, await readAppState(page))
}

async function prepareLateSeasonPerformanceState(
  page: Page,
  auditor: SeasonAuditor
): Promise<void> {
  await closePhaseInformation(page)
  const debugToggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(debugToggle).toBeVisible({ timeout: UI_TIMEOUT })
  await debugToggle.click()
  const debugPanel = page.getByRole('complementary', { name: 'Debug Panel' })
  await expect(debugPanel).toBeVisible({ timeout: UI_TIMEOUT })
  await debugPanel.getByRole('button', { name: 'Disable Weekends (debug)', exact: true }).click()
  await debugPanel.getByRole('button', { name: 'Advance Phase', exact: true }).click()
  await expect
    .poll(() => readAppState(page).then((state) => `${state.game.week}:${state.game.phase}`), {
      message: 'the seeded debug advance should enter day 1',
      timeout: UI_TIMEOUT,
    })
    .toBe('1:week_start')
  await closePhaseInformation(page)
  // Exercise the same visible Redux update at the early and late checkpoints.
  await measureDebugInputCheckpoint(page, auditor, debugPanel, 'early')

  const phaseRow = debugPanel.locator('.dbg-row').filter({ hasText: 'Set Phase' })
  const lohRow = debugPanel.locator('.dbg-row').filter({ hasText: 'Force LOH' })
  const simulateCycle = debugPanel.getByRole('button', {
    name: 'Simulate Elimination Cycle',
    exact: true,
  })

  // Seeded cycles preserve real reducer history while skipping animation-heavy
  // play. Force an AI LOH so the debug cycle does not stop for human nominations.
  for (let week = 1; week < 8; week += 1) {
    const cycleState = await readAppState(page)
    const aiLoh = cycleState.game.players.find(
      (player) => player.status === 'active' && !player.isUser
    )
    if (!aiLoh) throw new Error(`No active AI player is available for the day-${week} debug cycle.`)
    await phaseRow.locator('select').selectOption('nominations')
    await phaseRow.getByRole('button', { name: 'Set', exact: true }).click()
    await lohRow.locator('select').selectOption(aiLoh.id)
    await lohRow.getByRole('button', { name: 'Set', exact: true }).click()
    await simulateCycle.click()
    const postCycleState = await readAppState(page)
    if (postCycleState.game.week !== week + 1 || postCycleState.game.phase !== 'week_start') {
      // Some seeded twists require a ceremony choice the debug resolver cannot
      // make. Close only the accelerated setup cycle, then continue at next day.
      await debugPanel.getByRole('button', { name: 'Clear Stuck Flags', exact: true }).click()
      await debugPanel.getByRole('button', { name: 'Advance Day (debug)', exact: true }).click()
    }
    await expect
      .poll(() => readAppState(page).then((state) => `${state.game.week}:${state.game.phase}`), {
        message: `the deterministic elimination cycle should reach day ${week + 1}`,
        timeout: UI_TIMEOUT,
      })
      .toBe(`${week + 1}:week_start`)
    await closePhaseInformation(page)
  }

  const lateState = await readAppState(page)
  if (lateState.game.week !== 8 || lateState.game.phase !== 'week_start') {
    throw new Error('Seeded debug cycles did not prepare a day-8 performance state.')
  }
  await measureDebugInputCheckpoint(page, auditor, debugPanel, 'late')
  await closeDebugPanelIfOpen(page)
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
  await page.getByLabel('Age').fill('28')
  await page.getByLabel('Sex (Reality storylines)').selectOption('Male')
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
    name: /Confirm nominations|Confirm power decision|Confirm replacement|Confirm|Seal deciding vote|Confirm eliminations/,
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
  const returnHome = session.getByRole('button', { name: 'Return to the Hub' })
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
  if (await action.isVisible().catch(() => false)) await action.click()
  else if (await fallback.isVisible().catch(() => false)) await fallback.click()
  else return false
  const execute = dialog.getByRole('button', { name: 'Execute' })
  await expect(execute).toBeEnabled({ timeout: UI_TIMEOUT })
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

  await page.goto(config.performanceBenchmark ? './?debugPerformance=1' : './')
  await waitForHome(page)
  await createFreshProfile(page, `Sim ${config.personaId} ${config.seeds.actor}`)
  await adapter.launch(page)
  await auditor.record('launch season', 'home')
  coverage.verify(
    'fresh-day-one',
    'Profile creation and mode selection were completed through the UI.'
  )

  if (config.performanceBenchmark) {
    if (config.mode !== 'classic') {
      throw new Error('The early/late progression benchmark requires Classic mode.')
    }
    await prepareLateSeasonPerformanceState(page, auditor)
    const state = await readAppState(page)
    await auditor.checkpoint('performance-late-checkpoint', state)
    await auditor.attachReport(config.id, 'early-late-performance-checkpoints-captured')
    return auditor
  }

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
  if (config.captureFinalScreenshot !== false) {
    await page.screenshot({ path: testInfo.outputPath(`${config.id}-final.png`), fullPage: true })
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
