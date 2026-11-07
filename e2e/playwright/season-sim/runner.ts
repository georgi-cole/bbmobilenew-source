import { resolveSurvivalDecision } from './survivalDecisions'
import { errors, expect, type Locator, type Page, type TestInfo } from '@playwright/test'

import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  readAppState,
} from '../support/test'
import { CoverageLedger, objectivesForMode } from './coverage'
import { isActiveGamePlayerStatus, SeasonAuditor } from './auditor'
import { getModeAdapter } from './modeAdapters'
import { assertMinigameDriversCoverRegistry, playVisibleMinigame } from './minigames'
import { choosePersonaAction, getPersona } from './personas'
import { SeededRandom } from './seededRandom'
import { dismissShockAcknowledgement } from './shockAcknowledgement'
import { skipEliminationAnimation } from './eliminationAnimation'
import { seedsForRepeat } from './seeds'
import { attachJuryDiagnostics } from './juryDiagnostics'
import {
  assertRestoredCheckpoint,
  captureSeasonCheckpoint,
  checkpointPath,
  restoreSeasonCheckpoint,
} from './checkpoints'
import { getAllGames } from '../../../src/minigames/registry'
import { allianceRequestDecisionActors } from '../../../src/social/reality/allianceManagement'
import { selectActiveConfessionalDecision } from '../../../src/store/confessionalDecisionSelectors'
import type { RootState } from '../../../src/store/store'
import { measureSavedSeasonSnapshot } from './persistenceMetrics'
import {
  SEASON_SIMULATION_MODES,
  type ProgressionPerformanceCheckpoint,
  type SeasonPerformanceCheckpoint,
  type SaveResumePerformanceCheckpoint,
  type SimulationAction,
  type SimulationContext,
  type SimulationRunConfig,
} from './types'

const UI_TIMEOUT = 30_000

async function withSimulationDeadline<T>(
  label: string,
  work: Promise<T>,
  timeoutMs = UI_TIMEOUT
): Promise<T> {
  let guard: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        guard = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms.`)), timeoutMs)
      }),
    ])
  } finally {
    if (guard) clearTimeout(guard)
  }
}

interface BrowserPerformanceSnapshot {
  samples: Array<{
    kind: string
    durationMs?: number
    action?: string
    component?: string
  }>
  metrics: SeasonPerformanceCheckpoint['metrics']
  save: SaveResumePerformanceCheckpoint['persistence']
  juryEvents: Array<{
    atMs: number
    name: string
    detail: Record<string, string | number | boolean | null>
  }>
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null
}

async function movePointerOutsideViewport(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  if (!viewport) {
    await page.mouse.move(-10, -10)
    return
  }
  // TV announcements fill the viewport and pause their auto-dismiss timer on
  // hover. Moving to an in-viewport corner still hovers the overlay, so leave
  // the viewport itself before waiting for a ceremony to continue.
  await page.mouse.move(viewport.width + 10, viewport.height + 10)
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

async function recordProgressionPerformanceCheckpoint(
  page: Page,
  auditor: SeasonAuditor,
  state: RootState,
  config: SimulationRunConfig,
  day: number
): Promise<void> {
  // The run snapshot is debounced for four seconds. Let that real save finish
  // so this checkpoint reports the late-game payload, not the prior day's.
  await page.waitForTimeout(4_100)
  const performance = await page.evaluate(() => {
    const host = window as Window & {
      __bbGamePerformance?: { snapshot: () => BrowserPerformanceSnapshot }
    }
    return host.__bbGamePerformance?.snapshot() ?? null
  })
  if (!performance) throw new Error('Opt-in game performance diagnostics did not start.')

  const frameGaps = performance.samples.filter((sample) => sample.kind === 'frame-gap')
  const inputResponses = performance.samples.filter((sample) => sample.kind === 'input-response')
  const reduxActions = performance.samples.filter((sample) => sample.kind === 'redux-action')
  const frameDurations = frameGaps
    .map((sample) => sample.durationMs)
    .filter((duration): duration is number => typeof duration === 'number')
  const longTaskDurations = performance.samples
    .filter((sample) => sample.kind === 'long-task')
    .map((sample) => sample.durationMs)
    .filter((duration): duration is number => typeof duration === 'number')
  const renderSamples = performance.samples.filter(
    (sample) => sample.kind === 'react-render' && sample.component && sample.durationMs != null
  )
  const renderComponents = [...new Set(renderSamples.map((sample) => sample.component!))]
  const actions = performance.samples
    .filter(
      (sample) => sample.kind === 'redux-action' && sample.action && sample.durationMs != null
    )
    .map((sample) => ({ action: sample.action!, durationMs: sample.durationMs! }))
    .sort((left, right) => right.durationMs - left.durationMs)
  const storeUpdates = performance.samples
    .filter(
      (sample) => sample.kind === 'store-update' && sample.action && sample.durationMs != null
    )
    .map((sample) => ({ action: sample.action!, durationMs: sample.durationMs! }))
    .sort((left, right) => right.durationMs - left.durationMs)
  const middlewareSamples = performance.samples.filter(
    (sample) => sample.kind === 'middleware-step'
  )
  const middlewareNames = [...new Set(middlewareSamples.map((sample) => sample.middleware))]
  const phaseSamples = performance.samples.filter((sample) => sample.kind === 'phase-step')
  const phaseStepNames = [...new Set(phaseSamples.map((sample) => sample.step))]
  const checkpoint: ProgressionPerformanceCheckpoint = {
    mode: config.mode,
    day,
    phase: state.game.phase,
    seed: config.seeds,
    snapshot: measureSavedSeasonSnapshot(state),
    persistence: performance.save,
    sampleCounts: {
      frameGaps: frameGaps.length,
      inputResponses: inputResponses.length,
      reduxActions: reduxActions.length,
    },
    metrics: performance.metrics,
    longestFrameGapMs: frameDurations.length > 0 ? Math.max(...frameDurations) : null,
    frameGapsOver100Ms: frameDurations.filter((duration) => duration > 100).length,
    longTasks: {
      count: longTaskDurations.length,
      p95Ms: p95(longTaskDurations),
      longestMs: longTaskDurations.length > 0 ? Math.max(...longTaskDurations) : null,
    },
    storeUpdateP95Ms: p95(storeUpdates.map(({ durationMs }) => durationMs)),
    middlewareSteps: middlewareNames
      .map((middleware) => {
        const durations = middlewareSamples
          .filter((sample) => sample.middleware === middleware)
          .map((sample) => sample.durationMs)
        return {
          middleware,
          count: durations.length,
          totalMs: durations.reduce((total, duration) => total + duration, 0),
          p95Ms: p95(durations) ?? 0,
          longestMs: Math.max(...durations),
        }
      })
      .sort((left, right) => right.totalMs - left.totalMs),
    phaseSteps: phaseStepNames
      .map((step) => {
        const durations = phaseSamples
          .filter((sample) => sample.step === step)
          .map((sample) => sample.durationMs)
        return {
          step,
          count: durations.length,
          totalMs: durations.reduce((total, duration) => total + duration, 0),
          p95Ms: p95(durations) ?? 0,
          longestMs: Math.max(...durations),
        }
      })
      .sort((left, right) => right.totalMs - left.totalMs),
    renders: renderComponents.map((component) => {
      const durations = renderSamples
        .filter((sample) => sample.component === component)
        .map((sample) => sample.durationMs!)
      return {
        component,
        count: durations.length,
        totalMs: durations.reduce((total, duration) => total + duration, 0),
        p95Ms: p95(durations) ?? 0,
        longestMs: Math.max(...durations),
      }
    }),
    slowestActions: actions.slice(0, 5),
    slowestStoreUpdates: storeUpdates.slice(0, 5),
  }
  await auditor.recordProgressionPerformanceCheckpoint(checkpoint, state)
  await clearBrowserPerformanceSamples(page)
}

async function openDebugPanel(page: Page): Promise<Locator> {
  const toggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(toggle).toBeVisible({ timeout: UI_TIMEOUT })
  if (!(await page.getByRole('complementary', { name: 'Debug Panel' }).isVisible())) {
    await toggle.click()
  }
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  await expect(panel).toBeVisible({ timeout: UI_TIMEOUT })
  return panel
}

async function setDebugPhase(panel: Locator, phase: string): Promise<void> {
  const row = panel.locator('.dbg-row').filter({ hasText: 'Set Phase' })
  await row.locator('select').selectOption(phase)
  await row.getByRole('button', { name: 'Set', exact: true }).click()
}

async function advanceFiniteModeDay(page: Page, panel: Locator, currentDay: number): Promise<void> {
  await setDebugPhase(panel, 'nominations')
  const state = await readAppState(page)
  const aiLoh = state.game.players.find((player) => player.status === 'active' && !player.isUser)
  if (!aiLoh) throw new Error(`No active AI player is available for the day-${currentDay} cycle.`)

  const lohRow = panel.locator('.dbg-row').filter({ hasText: 'Force LOH' })
  await lohRow.locator('select').selectOption(aiLoh.id)
  await lohRow.getByRole('button', { name: 'Set', exact: true }).click()
  await panel.getByRole('button', { name: 'Simulate Elimination Cycle', exact: true }).click()

  let next = await readAppState(page)
  if (next.game.week !== currentDay + 1 || next.game.phase !== 'week_start') {
    // Keep the fallback explicit in the report: some twists deliberately leave
    // a choice for a human that the debug cycle cannot answer.
    await panel.getByRole('button', { name: 'Clear Stuck Flags', exact: true }).click()
    await panel.getByRole('button', { name: 'Advance Day (debug)', exact: true }).click()
    await expect
      .poll(() => readAppState(page).then((value) => `${value.game.week}:${value.game.phase}`), {
        message: `the debug fallback should reach day ${currentDay + 1}`,
        timeout: UI_TIMEOUT,
      })
      .toBe(`${currentDay + 1}:week_start`)
    next = await readAppState(page)
  }

  if (next.game.week !== currentDay + 1 || next.game.phase !== 'week_start') {
    throw new Error(
      `The ${next.game.expansionMode ?? 'classic'} cycle stopped at day ${next.game.week}:${next.game.phase} instead of day ${currentDay + 1}.`
    )
  }
}

async function dismissSurvivalAchievement(page: Page): Promise<boolean> {
  const celebration = page.locator('.survivor-celebration').filter({ visible: true }).first()
  if (!(await celebration.isVisible().catch(() => false))) return false
  await celebration
    .getByRole('button', { name: 'Continue', exact: true })
    .click({ timeout: UI_TIMEOUT })
  await expect(celebration).toBeHidden({ timeout: UI_TIMEOUT })
  return true
}

async function accelerateDaySpan(
  page: Page,
  config: SimulationRunConfig,
  fromDay: number,
  toDay: number
): Promise<void> {
  let panel = await openDebugPanel(page)
  let state = await readAppState(page)
  let currentDay =
    state.game.modeSpecific?.kind === 'survival'
      ? state.game.modeSpecific.currentDay
      : state.game.week

  if (currentDay !== fromDay) {
    throw new Error(`Journey acceleration expected day ${fromDay}, found day ${currentDay}.`)
  }

  while (currentDay < toDay) {
    const terminal =
      config.mode === 'survival'
        ? state.game.status !== 'active' ||
          state.game.players.find((player) => player.isUser)?.status === 'evicted'
        : state.game.seasonFinale?.phase === 'seasonComplete' || state.game.phase === 'jury'
    if (terminal) break

    if (config.mode === 'survival') {
      await panel.getByRole('button', { name: 'Advance Surveyeval Day', exact: true }).click()
      await expect
        .poll(
          () =>
            readAppState(page).then((next) => {
              const nextDay =
                next.game.modeSpecific?.kind === 'survival'
                  ? next.game.modeSpecific.currentDay
                  : null
              return (
                nextDay === currentDay + 1 ||
                next.game.status !== 'active' ||
                next.game.players.find((player) => player.isUser)?.status === 'evicted'
              )
            }),
          {
            message: `Surveyeval should reach day ${currentDay + 1} or end the run`,
            timeout: UI_TIMEOUT,
          }
        )
        .toBe(true)
    } else {
      await advanceFiniteModeDay(page, panel, currentDay)
    }

    state = await readAppState(page)
    currentDay =
      state.game.modeSpecific?.kind === 'survival'
        ? state.game.modeSpecific.currentDay
        : state.game.week
    await closePhaseInformation(page)
    if (
      config.mode === 'survival' &&
      (await page.locator('.survivor-celebration').filter({ visible: true }).count()) > 0
    ) {
      await closeDebugPanelIfOpen(page)
      await dismissSurvivalAchievement(page)
      panel = await openDebugPanel(page)
    }

    if (
      config.mode === 'survival' &&
      state.game.status === 'active' &&
      state.game.modeSpecific?.kind === 'survival' &&
      state.game.modeSpecific.replacementPending
    ) {
      await closeDebugPanelIfOpen(page)
      for (let reveal = 0; reveal < 8; reveal += 1) {
        const before = await readAppState(page)
        const pending =
          before.game.modeSpecific?.kind === 'survival'
            ? before.game.modeSpecific.replacementPending
            : null
        if (!pending) break
        await dismissSurvivalAchievement(page)
        await dismissAnnouncement(page)
        const afterAnnouncement = await readAppState(page)
        const stillPending =
          afterAnnouncement.game.modeSpecific?.kind === 'survival'
            ? afterAnnouncement.game.modeSpecific.replacementPending?.outgoingPlayerSnapshot.id ===
              pending.outgoingPlayerSnapshot.id
            : false
        if (stillPending) {
          const play = page.getByTestId('game-primary-action')
          await expect(play).toBeEnabled({ timeout: UI_TIMEOUT })
          await play.click({ timeout: UI_TIMEOUT })
        }
        await expect
          .poll(
            () =>
              readAppState(page).then((next) => {
                const survivor = next.game.modeSpecific
                return (
                  survivor?.kind === 'survival' &&
                  survivor.replacementPending?.outgoingPlayerSnapshot.id !==
                    pending.outgoingPlayerSnapshot.id &&
                  !survivor.replacementTransition
                )
              }),
            { timeout: UI_TIMEOUT, message: 'the visible Robo replacement should finish' }
          )
          .toBe(true)
      }
      state = await readAppState(page)
      panel = await openDebugPanel(page)
    }

    const humanEvicted = state.game.players.find((player) => player.isUser)?.status === 'evicted'
    if (
      config.mode !== 'survival' &&
      config.continueToSeasonComplete &&
      humanEvicted &&
      (await continueSpectatingAfterElimination(page))
    ) {
      panel = await openDebugPanel(page)
    }
  }

  await closeDebugPanelIfOpen(page)
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
  await page.getByLabel('Player age').fill('28')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByPlaceholder('Enter display name').fill(name)
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

export async function dismissAnnouncement(page: Page): Promise<boolean> {
  const twinShockIntro = page.getByRole('dialog', { name: 'Lia and Ali Twin Shock introduction' })
  if (await twinShockIntro.isVisible().catch(() => false)) {
    await twinShockIntro
      .getByRole('button', { name: 'Skip', exact: true })
      .click({ timeout: 3_000 })
    await expect(twinShockIntro).toBeHidden({ timeout: UI_TIMEOUT })
    return true
  }

  if (await dismissShockAcknowledgement(page)) return true
  if (await dismissShockAcknowledgement(page)) return true

  const announcement = page.getByRole('dialog', { name: /^Announcement:/ })
  if (!(await announcement.isVisible().catch(() => false))) return false
  await movePointerOutsideViewport(page)
  const dismiss = announcement.getByRole('button', { name: /^(?:OK|Continue|Close)$/i }).first()
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click({ timeout: 3_000 })
    return true
  }

  // ShockIntroOverlay presents its TV announcement as a dialog and places the
  // matching OK acknowledgement beside that dialog in the portal. Keep this
  // fallback exact and only use it while an announcement is visible.
  const standaloneAcknowledgement = page
    .getByRole('button', { name: 'OK', exact: true })
    .filter({ visible: true })
    .first()
  if (await standaloneAcknowledgement.isVisible().catch(() => false)) {
    await standaloneAcknowledgement.click({ timeout: 3_000 })
    return true
  }

  // A jury overlay can mount after the presentation check and cover Play.
  // Its own buttons or timers must finish before the TV card can be advanced.
  const juryOverlay = page
    .getByRole('dialog', {
      name: /^(?:The Tribunal Takes Control|Tribunal Finale|Meet the final two)$/,
    })
    .filter({ visible: true })
    .first()
  if (await juryOverlay.isVisible().catch(() => false)) return false

  // Most TV cards have no button inside the announcement. The visible Play
  // control owns their dismissal and broadcasts `ui:playPressed`; searching
  // the whole page for a generic Continue button can hang on unrelated hidden
  // controls and never sends that event.
  const toolbar = page.getByRole('toolbar', { name: 'Game actions' })
  const playThrough = toolbar
    .getByRole('button', { name: /^(?:Advance to next phase|Continue|Finish the day)$/i })
    .filter({ visible: true })
    .first()
  if (!(await playThrough.isVisible().catch(() => false)) || !(await playThrough.isEnabled())) {
    return false
  }
  await playThrough.click({ timeout: 3_000 })
  return true
}

export async function resolveDemocraciaVoteModal(page: Page): Promise<boolean> {
  const dialog = page.getByRole('dialog', { name: /Democracia — Cast Your Vote/ })
  if (!(await dialog.isVisible().catch(() => false))) return false

  const confirm = dialog.getByRole('button', { name: /^Confirm:/ })
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click({ timeout: 3_000 })
    await dialog.waitFor({ state: 'hidden', timeout: UI_TIMEOUT })
    return true
  }

  if ((await dialog.locator('button[aria-pressed="true"]').count()) > 0) return false
  const options = dialog.locator('button[aria-pressed]')
  if ((await options.count()) === 0) return false
  await options.first().click({ timeout: 3_000 })
  return true
}

export async function resolveDayStartShock(page: Page): Promise<boolean> {
  const dialog = page.getByRole('dialog', { name: /^Pack your bags,/ })
  if (!(await dialog.isVisible().catch(() => false))) return false

  const confirm = dialog.getByRole('button', { name: /^Give .+ the boot$/ })
  if (!(await confirm.isVisible().catch(() => false))) return false
  await confirm.click({ timeout: 3_000 })
  await dialog.waitFor({ state: 'hidden', timeout: UI_TIMEOUT })
  return true
}

export async function skipOptionalVoteReveal(page: Page): Promise<boolean> {
  const breakdown = page.getByRole('dialog', { name: 'Vote Breakdown' })
  if (await breakdown.isVisible().catch(() => false)) {
    await breakdown.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 3_000 })
    return true
  }

  const secretBallotsPrompt = page.getByRole('dialog', { name: 'Reveal the Secret Ballots?' })
  if (await secretBallotsPrompt.isVisible().catch(() => false)) {
    await secretBallotsPrompt
      .getByRole('button', { name: 'Keep the Ballots Secret', exact: true })
      .click({ timeout: 3_000 })
    return true
  }

  const prompt = page.getByRole('dialog', { name: 'Peek Behind the Curtain?' })
  if (!(await prompt.isVisible().catch(() => false))) return false
  await prompt.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 3_000 })
  return true
}

export async function chooseAndConfirmSingleChoice(
  decisionSurface: Locator,
  choiceGroupName: RegExp,
  confirmName: string
): Promise<string | null> {
  const choiceGroup = decisionSurface.getByRole('group', { name: choiceGroupName })
  const choices = choiceGroup.getByRole('button')
  const confirm = decisionSurface.getByRole('button', { name: confirmName, exact: true })
  let selectedLabel: string | null = null

  if (!(await confirm.isEnabled().catch(() => false))) {
    for (let index = 0; index < (await choices.count()); index += 1) {
      const choice = choices.nth(index)
      if ((await choice.isVisible().catch(() => false)) && (await choice.isEnabled())) {
        selectedLabel =
          (await choice.getAttribute('aria-label').catch(() => null)) ??
          (await choice.innerText().catch(() => null))
        await choice.click()
        break
      }
    }
  }

  await expect
    .poll(() => confirm.isEnabled(), {
      message: `a choice in "${choiceGroupName.source}" should enable ${confirmName}`,
      timeout: UI_TIMEOUT,
    })
    .toBe(true)
  await confirm.click()
  return selectedLabel
}

async function completeReplacementConfessional(
  page: Page,
  decisionSurface: Locator
): Promise<void> {
  for (let step = 0; step < 2; step += 1) {
    const before = await readAppState(page)
    const specialVeto = before.game.specialVeto
    const isFirstCoupPick = specialVeto?.awaitingCoupReplacement1 === true
    const isSecondCoupPick = specialVeto?.awaitingCoupReplacement2 === true
    if (!isFirstCoupPick && !isSecondCoupPick) {
      if (step === 0) {
        await chooseAndConfirmSingleChoice(
          decisionSurface,
          /^Name (?:the First|the Second|a) Replacement(?: Nominee)?$/,
          'Confirm replacement'
        )
      }
      return
    }

    const selectedLabel = await chooseAndConfirmSingleChoice(
      decisionSurface,
      /^Name (?:the First|the Second|a) Replacement(?: Nominee)?$/,
      'Confirm replacement'
    )
    const after = await readAppState(page)
    const nextSpecialVeto = after.game.specialVeto
    const sameStepStillPending = isFirstCoupPick
      ? nextSpecialVeto?.awaitingCoupReplacement1 === true
      : nextSpecialVeto?.awaitingCoupReplacement2 === true
    if (sameStepStillPending) {
      throw new Error(
        `Detox did not accept replacement choice "${selectedLabel ?? 'unknown'}"; the same pick remains required.`
      )
    }
    if (
      nextSpecialVeto?.awaitingCoupReplacement1 !== true &&
      nextSpecialVeto?.awaitingCoupReplacement2 !== true
    ) {
      return
    }
  }

  throw new Error('Detox still requires a replacement choice after both picks were handled.')
}

async function resolveConfessional(page: Page): Promise<boolean> {
  const requiredResponse = page.getByTestId('twin-shock-required-response')
  if (await requiredResponse.isVisible().catch(() => false)) {
    const answer = page.getByRole('textbox', { name: 'Required response to The Big Eye' })
    const returnHome = page
      .getByRole('button', { name: /^(?:Return to (?:the )?(?:House|Hub)|Go back)$/ })
      .first()
    await answer.fill('I give up')
    await page.getByRole('button', { name: /send message/i }).click()
    await expect(requiredResponse).toBeHidden({ timeout: UI_TIMEOUT })
    await expect(returnHome).toBeVisible({ timeout: UI_TIMEOUT })
    await returnHome.click()
    await movePointerOutsideViewport(page)
    return true
  }

  const panel = page.getByTestId('required-confessional-decision')
  const inlinePanel = page.getByTestId('confessional-decision-options').first()
  const requiredSession = page.getByTestId('required-confessional-session')
  const diaryRoom = page.getByTestId('diary-room-shell')
  const returnHome = page
    .getByRole('button', { name: /^(?:Return to (?:the )?(?:House|Hub)|Go back)$/ })
    .first()
  let decisionSurface = panel

  const findDecisionSurface = async (): Promise<boolean> => {
    if (await panel.isVisible().catch(() => false)) {
      decisionSurface = panel
      return true
    }
    if (await inlinePanel.isVisible().catch(() => false)) {
      decisionSurface = inlinePanel
      return true
    }
    return false
  }

  let panelVisible = await findDecisionSurface()
  let sessionVisible = await requiredSession.isVisible().catch(() => false)
  let diaryRoomVisible = await diaryRoom.isVisible().catch(() => false)

  if (!panelVisible && !sessionVisible && !diaryRoomVisible) {
    const entry = page.getByRole('button', { name: /^Confessional \(\d+\)$/ })
    if (!(await entry.isVisible().catch(() => false)) || !(await entry.isEnabled())) return false
    await entry.click()
    await expect
      .poll(
        async () =>
          (await findDecisionSurface()) ||
          (await requiredSession.isVisible().catch(() => false)) ||
          (await diaryRoom.isVisible().catch(() => false)),
        { timeout: UI_TIMEOUT }
      )
      .toBe(true)
    panelVisible = await findDecisionSurface()
    sessionVisible = await requiredSession.isVisible().catch(() => false)
    diaryRoomVisible = await diaryRoom.isVisible().catch(() => false)
  }

  if (!panelVisible && sessionVisible) {
    if (await returnHome.isVisible().catch(() => false)) {
      await returnHome.click()
      await movePointerOutsideViewport(page)
      return true
    }
    panelVisible = await expect
      .poll(findDecisionSurface, { timeout: UI_TIMEOUT })
      .toBe(true)
      .then(() => true)
      .catch(() => false)
  }

  if (!panelVisible && diaryRoomVisible) {
    const missionOffer = page.getByRole('button', { name: /Accept the mission/i })
    if (await missionOffer.isVisible().catch(() => false)) await missionOffer.click()
    if (await returnHome.isVisible().catch(() => false)) await returnHome.click()
    await movePointerOutsideViewport(page)
    return true
  }
  if (!panelVisible) return false

  const session = page.getByTestId('required-confessional-session')
  const sessionReturnHome = session.getByRole('button', { name: 'Return to the Hub' })
  for (let decisionStep = 0; decisionStep < 8; decisionStep += 1) {
    if (await sessionReturnHome.isVisible().catch(() => false)) break

    if (!(await findDecisionSurface())) {
      await expect
        .poll(
          async () =>
            (await sessionReturnHome.isVisible().catch(() => false)) ||
            (await findDecisionSurface()),
          { timeout: UI_TIMEOUT }
        )
        .toBe(true)
      if (await sessionReturnHome.isVisible().catch(() => false)) break
    }

    const promptBeforeDecision = await decisionSurface.innerText()
    const replacementConfirm = decisionSurface.getByRole('button', {
      name: 'Confirm replacement',
      exact: true,
    })
    if (await replacementConfirm.isVisible().catch(() => false)) {
      await completeReplacementConfessional(page, decisionSurface)
    } else {
      const confirms = decisionSurface.getByRole('button', {
        name: /Confirm nominations|Confirm power decision|Confirm|Seal.*ballot|Seal both votes|Seal deciding vote|Confirm eliminations/,
      })
      const confirm = confirms.first()
      let selectedAnOption = false
      for (
        let guard = 0;
        guard < 10 && !(await confirm.isEnabled().catch(() => false));
        guard += 1
      ) {
        const choice = decisionSurface.getByRole('group').locator('button[aria-pressed="false"]')
        let clicked = false
        for (let index = 0; index < (await choice.count()); index += 1) {
          const candidate = choice.nth(index)
          if ((await candidate.isVisible()) && (await candidate.isEnabled())) {
            await candidate.click()
            selectedAnOption = true
            clicked = true
            break
          }
        }
        if (!clicked) break
      }
      if (await confirm.isEnabled().catch(() => false)) await confirm.click()
      else {
        const binary = decisionSurface
          .getByRole('button', {
            name: /Leave nominations unchanged|Keep nominations|Use.*Safety/i,
          })
          .first()
        if (await binary.isVisible().catch(() => false)) await binary.click()
        if (await confirm.isEnabled().catch(() => false)) await confirm.click()
        else if (!selectedAnOption) return false
      }
    }

    // A single Confessional can contain a chain of required choices (for
    // example, a safety decision followed by Detox replacement picks). Resolve
    // each new screen before trying to leave the session.
    await expect
      .poll(
        async () =>
          (await sessionReturnHome.isVisible().catch(() => false)) ||
          (await decisionSurface.innerText().catch(() => null)) !== promptBeforeDecision,
        { timeout: UI_TIMEOUT }
      )
      .toBe(true)
  }

  await expect(sessionReturnHome).toBeVisible({ timeout: UI_TIMEOUT })
  await sessionReturnHome.click()
  // Vote announcements pause their auto-dismiss timer while hovered. Keep the
  // simulated pointer clear of the overlay so the eviction flow can continue.
  await movePointerOutsideViewport(page)
  return true
}

function pactTargetIds(state: RootState, attemptedPactTargets: ReadonlySet<string>): string[] {
  const human = state.game.players.find((player) => player.isUser)
  if (!human) return []

  const alliances = Object.values(state.social.reality.alliances)
  const requests = Object.values(state.social.reality.allianceManagement.requests)
  const alreadyCommitted = (targetId: string) =>
    alliances.some(
      (alliance) =>
        alliance.kind === 'PACT' &&
        alliance.status !== 'DISSOLVED' &&
        alliance.memberIds.includes(human.id) &&
        alliance.memberIds.includes(targetId)
    ) ||
    requests.some(
      (request) =>
        request.kind === 'PACT' &&
        request.memberIds.includes(human.id) &&
        request.memberIds.includes(targetId) &&
        ['VOTING', 'CONSENT'].includes(request.status)
    )

  const relationshipReads = state.game.strategicRelationships?.[human.id] ?? {}
  return state.game.players
    .filter(
      (player) =>
        !player.isUser &&
        player.status !== 'evicted' &&
        player.status !== 'jury' &&
        !attemptedPactTargets.has(player.id) &&
        !alreadyCommitted(player.id)
    )
    .sort((left, right) => {
      const leftAffinity = relationshipReads[left.id]?.affinity ?? 0
      const rightAffinity = relationshipReads[right.id]?.affinity ?? 0
      const leftWins = (left.stats?.lohWins ?? 0) + (left.stats?.posWins ?? 0)
      const rightWins = (right.stats?.lohWins ?? 0) + (right.stats?.posWins ?? 0)
      return rightAffinity - leftAffinity || leftWins - rightWins || left.id.localeCompare(right.id)
    })
    .map((player) => player.id)
}

async function exercisePactMove(
  page: Page,
  dialog: Locator,
  state: RootState,
  attemptedPactTargets: Set<string>
): Promise<boolean> {
  const human = state.game.players.find((player) => player.isUser)
  if (!human) return false

  const actionableRequest = Object.values(state.social.reality.allianceManagement.requests)
    .filter(
      (request) =>
        request.kind === 'PACT' &&
        allianceRequestDecisionActors(request).includes(human.id) &&
        ['VOTING', 'CONSENT'].includes(request.status)
    )
    .sort((left, right) => left.createdAt.day - right.createdAt.day)[0]
  const targetId = actionableRequest
    ? actionableRequest.memberIds.find((id) => id !== human.id)
    : pactTargetIds(state, attemptedPactTargets)[0]
  const target = state.game.players.find((player) => player.id === targetId)
  if (!target) return false

  const roster = dialog.locator('[aria-label="Player roster"]')
  const targetButton = roster.getByRole('button').filter({ hasText: target.name }).first()
  if (!(await targetButton.isVisible().catch(() => false))) return false

  const contextualTutorial = page.locator('.season-tutorial-prompt')
  if (await contextualTutorial.isVisible().catch(() => false)) {
    const acknowledge = contextualTutorial.getByRole('button', { name: 'Got it', exact: true })
    if (await acknowledge.isVisible().catch(() => false)) {
      await acknowledge.click({ timeout: 3_000 })
    }
  }
  await dialog.getByRole('tab', { name: 'Alliances', exact: true }).click({ timeout: 3_000 })
  const allianceTutorial = page.getByRole('dialog', { name: "You're in an alliance" })
  if (await allianceTutorial.isVisible().catch(() => false)) {
    await allianceTutorial.getByRole('button', { name: 'Got it', exact: true }).click()
  }
  await targetButton.click({ timeout: 3_000 })

  const pactAction = actionableRequest
    ? dialog.getByRole('button', { name: /^(?:Accept|Approve) request/i }).first()
    : dialog.getByRole('button', { name: /Propose Personal Pact/i }).first()
  if (!(await pactAction.isVisible().catch(() => false)) || !(await pactAction.isEnabled())) {
    await dialog
      .getByRole('tab', { name: 'Connect', exact: true })
      .click()
      .catch(() => undefined)
    return false
  }
  await pactAction.click({ timeout: 3_000 })
  const execute = dialog.getByRole('button', { name: 'Execute', exact: true })
  if (!(await execute.isEnabled().catch(() => false))) {
    await dialog
      .getByRole('tab', { name: 'Connect', exact: true })
      .click()
      .catch(() => undefined)
    return false
  }
  await execute.click({ timeout: 3_000 })
  if (!actionableRequest) attemptedPactTargets.add(target.id)
  return true
}

async function exerciseSocial(
  page: Page,
  personaId: string,
  state: RootState,
  attemptedPactTargets: Set<string>
): Promise<boolean> {
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
  if (
    ['social-butterfly', 'strategic-operator', 'resource-spender'].includes(personaId) &&
    (await exercisePactMove(page, dialog, state, attemptedPactTargets))
  ) {
    const allianceTutorial = page.getByRole('dialog', { name: "You're in an alliance" })
    if (await allianceTutorial.isVisible().catch(() => false)) {
      await allianceTutorial
        .getByRole('button', { name: 'Got it', exact: true })
        .click({ timeout: 3_000 })
    }
    await dialog.getByRole('button', { name: 'Close social panel' }).click({ timeout: 3_000 })
    return true
  }
  await dialog
    .getByRole('tab', { name: 'Connect', exact: true })
    .click()
    .catch(() => undefined)
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
  await dialog.getByRole('button', { name: 'Close social panel' }).click({ timeout: 3_000 })
  return true
}

export async function exitVisibleMinigameWithZero(page: Page): Promise<boolean> {
  const menu = page.getByRole('button', { name: 'Open minigame menu' })
  if (!(await menu.isVisible().catch(() => false))) {
    // Some games place their own rules card between the competition briefing
    // and the running minigame. Start only to reveal the utility menu, then
    // immediately leave through the visible zero-score exit controls.
    const gameRules = page.getByRole('dialog', { name: / rules$/i }).last()
    if (!(await gameRules.isVisible().catch(() => false))) return false
    const startCompetition = gameRules.getByRole('button', {
      name: /^Start competition$/i,
      exact: true,
    })
    if (!(await startCompetition.isVisible().catch(() => false))) return false
    await startCompetition.click({ timeout: 3_000 })
    await menu.waitFor({ state: 'visible', timeout: 5_000 })
  }
  await menu.click()
  await page.getByRole('menuitem', { name: /Leave competition/i }).click()
  await page.getByRole('button', { name: 'Exit with 0' }).click()
  const continueButton = page.getByRole('button', { name: /Continue.*▶|Close results/i }).first()
  await continueButton.waitFor({ state: 'visible', timeout: UI_TIMEOUT })
  await continueButton.click()
  return true
}

export async function startVisibleCompetitionBriefing(page: Page): Promise<boolean> {
  const briefing = page.getByRole('dialog', { name: /rules$/i }).last()
  if (!(await briefing.isVisible().catch(() => false))) return false
  const kicker = briefing.getByText('Competition briefing', { exact: true })
  if (!(await kicker.isVisible().catch(() => false))) return false
  const start = briefing.getByRole('button', { name: /^Start\b/i })
  if (!(await start.isVisible().catch(() => false))) return false
  await start.click({ timeout: 3_000 })
  return true
}

async function handleVisibleCompetition(
  page: Page,
  config: SimulationRunConfig,
  random: SeededRandom
): Promise<{ handled: boolean; gameKey?: string; skipped?: boolean }> {
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
  if (config.skipCompetitions && (await exitVisibleMinigameWithZero(page))) {
    return { handled: true, gameKey, skipped: true }
  }
  const result = await playVisibleMinigame(page, gameKey, config.competitionSkill, random)
  if (!result.completed && config.competitionSkill === 'thrower')
    await exitVisibleMinigameWithZero(page)
  // A visible modal owns the interaction surface even during a short
  // transition where the current driver has no button to press. Never let the
  // shared phase-advance action click behind an active minigame.
  return { handled: true, gameKey, skipped: false }
}

async function queueDoubleElimination(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
  if (!(await toggle.isVisible().catch(() => false))) {
    throw new Error(
      'The visible QA controls are not available to queue the Survival double elimination.'
    )
  }
  await toggle.click()
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  await expect(panel).toBeVisible({ timeout: UI_TIMEOUT })
  await panel.getByRole('combobox', { name: 'Force Shock' }).selectOption('doubleEviction')
  await panel.getByRole('button', { name: 'Queue', exact: true }).click()
  await expect
    .poll(() => readAppState(page).then((state) => state.game.pendingForcedShock?.type ?? null), {
      message: 'the visible QA control should queue a double elimination',
      timeout: UI_TIMEOUT,
    })
    .toBe('doubleEviction')
  await closeDebugPanelIfOpen(page)
}

async function resumeSavedSeasonFromHome(
  page: Page,
  config: SimulationRunConfig,
  markProgress: (step: string) => Promise<void>
): Promise<number> {
  await markProgress('open-play-menu')
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  await expect(page.getByRole('navigation', { name: 'Play menu' })).toBeVisible({
    timeout: UI_TIMEOUT,
  })

  const resumeStartedAt = Date.now()
  if (config.mode === 'survival') {
    await page
      .getByRole('navigation', { name: 'Play menu' })
      .getByRole('button', { name: 'Surveyeval', exact: true })
      .click()
    const resumeDialog = page.getByRole('dialog', { name: 'Surveyeval Mode' })
    await expect(resumeDialog).toBeVisible({ timeout: UI_TIMEOUT })
    await resumeDialog.getByRole('button', { name: 'Resume', exact: true }).click()
  } else {
    await markProgress('continue-last-season')
    const continueLast = page
      .getByRole('navigation', { name: 'Play menu' })
      .getByRole('button', { name: 'Continue Last', exact: true })
    await expect(continueLast).toBeEnabled({ timeout: 5_000 })
    await continueLast.click({ timeout: 3_000 })
  }

  await markProgress('verify-resumed-screen')
  await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
    timeout: UI_TIMEOUT,
  })
  return Date.now() - resumeStartedAt
}

async function saveAndResumeFromVisibleHome(
  page: Page,
  config: SimulationRunConfig,
  expectedState: RootState,
  markProgress: (step: string) => Promise<void>
): Promise<{
  timing: SaveResumePerformanceCheckpoint['timing']
  persistence: SaveResumePerformanceCheckpoint['persistence']
}> {
  await markProgress('find-home-control')
  const homeButton = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^home$/i })
  await expect(homeButton).toBeVisible({ timeout: UI_TIMEOUT })
  await homeButton.click()

  await markProgress('confirm-save-and-home')
  const saveDialog = page.getByRole('dialog', { name: 'Save and return home?' })
  await expect(saveDialog).toBeVisible({ timeout: UI_TIMEOUT })
  const saveStartedAt = Date.now()
  await saveDialog.getByRole('button', { name: 'Save & Home', exact: true }).click()
  await waitForHome(page)
  const saveAndHomeMs = Date.now() - saveStartedAt
  const persistence = await page.evaluate(() => {
    const host = window as Window & {
      __bbGamePerformance?: { snapshot: () => BrowserPerformanceSnapshot }
    }
    return host.__bbGamePerformance?.snapshot().save ?? null
  })

  // Reload between saving and continuing so this checks the durable saved run,
  // not only state that remained in the current React session.
  await markProgress('reload-saved-run')
  const reloadStartedAt = Date.now()
  await page.reload()
  await waitForHome(page)
  const reloadToHomeMs = Date.now() - reloadStartedAt
  const resumeToGameMs = await resumeSavedSeasonFromHome(page, config, markProgress)
  const resumedState = await readAppState(page)
  expect(resumedState.game.runId).toBe(expectedState.game.runId)
  const savedRunSlot = (game: RootState['game']) =>
    game.mode === 'survival' ? 'survival' : (game.expansionMode ?? 'classic')
  expect(savedRunSlot(resumedState.game)).toBe(savedRunSlot(expectedState.game))
  expect(resumedState.game.week).toBe(expectedState.game.week)
  expect(resumedState.game.phase).toBe(expectedState.game.phase)
  expect(resumedState.game.history).toEqual(expectedState.game.history)
  expect(resumedState.game.players.map(({ id, status }) => [id, status])).toEqual(
    expectedState.game.players.map(({ id, status }) => [id, status])
  )
  const resumableRealityInteractionIds = (state: RootState) => {
    const linkedToOpenInbox = new Set(
      state.social.incomingInteractions
        .filter((interaction) => !interaction.resolved)
        .map((interaction) => interaction.payload?.realityInteractionId)
        .filter((id): id is string => typeof id === 'string')
    )
    return Object.entries(state.social.reality.interactions)
      .filter(
        ([id, interaction]) =>
          interaction.status === 'PENDING' ||
          interaction.status === 'AWAITING_HUMAN' ||
          linkedToOpenInbox.has(id)
      )
      .map(([id]) => id)
      .sort()
  }
  expect(resumableRealityInteractionIds(resumedState)).toEqual(
    resumableRealityInteractionIds(expectedState)
  )
  return {
    persistence,
    timing: {
      saveAndHomeMs,
      reloadToHomeMs,
      resumeToGameMs,
      reloadAndResumeMs: Date.now() - reloadStartedAt,
    },
  }
}
async function continueSpectatingAfterElimination(page: Page): Promise<boolean> {
  const dialog = page.getByRole('dialog', { name: 'Your season is over' })
  if (!(await dialog.isVisible().catch(() => false))) return false
  const keepWatching = dialog.getByRole('button', { name: 'Keep Spectating', exact: true })
  if (!(await keepWatching.isVisible().catch(() => false))) {
    throw new Error('The mode offered no way to keep watching after the elimination.')
  }
  await keepWatching.click()
  await expect(dialog).toBeHidden({ timeout: UI_TIMEOUT })
  return true
}

/** Choose one visible response when the weekend Hub Says poll asks for a player vote. */
export async function chooseWeekendHubSaysAnswer(page: Page): Promise<boolean> {
  const poll = page.getByRole('group', { name: /^Choose a Hubmate, page [0-9]+ of [0-9]+$/ })
  if (!(await poll.isVisible().catch(() => false))) return false
  if ((await poll.locator('button[aria-pressed="true"]').count()) > 0) return false
  const choices = poll.locator('button[aria-pressed]')
  if ((await choices.count()) === 0) return false
  const choice = choices.first()
  if (!(await choice.isEnabled().catch(() => false))) return false
  await choice.click({ timeout: 3_000 })
  return true
}
/** Advance the visible finale controls without skipping the underlying season decisions. */
export async function advanceFinalePresentation(page: Page): Promise<boolean> {
  const spectator = page.getByRole('dialog', { name: /^Spectator Mode:/ })
  if (await spectator.isVisible().catch(() => false)) {
    const skipToResults = spectator.getByRole('button', { name: 'Skip to Results', exact: true })
    if (await skipToResults.isVisible().catch(() => false)) {
      await skipToResults.click({ timeout: 3_000 })
      return true
    }
  }

  const finalPowerHolder = page.getByRole('dialog', { name: /, Final Power holder$/ })
  if (await finalPowerHolder.isVisible().catch(() => false)) {
    const playFinaleScene = page.getByRole('button', { name: 'Play finale scene', exact: true })
    if (await playFinaleScene.isVisible().catch(() => false)) {
      await playFinaleScene.click({ timeout: 3_000 })
      return true
    }
  }

  const tribunalReveal = page.getByRole('dialog', { name: 'The Tribunal Takes Control' })
  if (await tribunalReveal.isVisible().catch(() => false)) {
    const skipSequence = tribunalReveal.getByRole('button', { name: 'Skip sequence', exact: true })
    if (await skipSequence.isVisible().catch(() => false)) {
      await skipSequence.click({ timeout: 3_000 })
      return true
    }
    const enterVote = tribunalReveal.getByRole('button', {
      name: 'Enter Tribunal Vote',
      exact: true,
    })
    if (await enterVote.isVisible().catch(() => false)) {
      await enterVote.click({ timeout: 3_000 })
      return true
    }
  }

  const final3Chat = page.getByRole('dialog', { name: 'The Finale plea chat' })
  if (await final3Chat.isVisible().catch(() => false)) {
    const skip = final3Chat.getByRole('button', { name: 'Skip to end', exact: true })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: 3_000 })
      return true
    }
    const continueChat = final3Chat.getByRole('button', { name: 'Continue →', exact: true })
    if (await continueChat.isVisible().catch(() => false)) {
      await continueChat.click({ timeout: 3_000 })
      return true
    }
  }

  const final3Announcement = page.getByRole('dialog', {
    name: 'The Finale elimination announcement',
  })
  if (await final3Announcement.isVisible().catch(() => false)) {
    const skip = final3Announcement.getByRole('button', { name: 'Skip to end', exact: true })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: 3_000 })
      return true
    }
    const continueAnnouncement = final3Announcement.getByRole('button', {
      name: 'Continue →',
      exact: true,
    })
    if (await continueAnnouncement.isVisible().catch(() => false)) {
      await continueAnnouncement.click({ timeout: 3_000 })
      return true
    }
  }

  const final4Chat = page.getByRole('dialog', { name: 'Final 4 plea chat' })
  if (await final4Chat.isVisible().catch(() => false)) {
    const voteChoices = final4Chat.getByRole('group', { name: 'Final 4 vote choices' })
    if (await voteChoices.isVisible().catch(() => false)) {
      const vote = voteChoices.getByRole('button', { name: /^Vote to eliminate / }).first()
      if (await vote.isVisible().catch(() => false)) {
        await vote.click({ timeout: 3_000 })
        return true
      }
    }

    const skip = final4Chat.getByRole('button', { name: /^(?:Skip to end|Skip to decision)$/ })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: 3_000 })
      return true
    }
    const continueChat = final4Chat.getByRole('button', { name: 'Continue →', exact: true })
    if (await continueChat.isVisible().catch(() => false)) {
      await continueChat.click({ timeout: 3_000 })
      return true
    }
  }

  const final4Announcement = page.getByRole('dialog', { name: 'Final 4 elimination announcement' })
  if (await final4Announcement.isVisible().catch(() => false)) {
    const skip = final4Announcement.getByRole('button', { name: 'Skip to end', exact: true })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: 3_000 })
      return true
    }
    const continueAnnouncement = final4Announcement.getByRole('button', {
      name: 'Continue →',
      exact: true,
    })
    if (await continueAnnouncement.isVisible().catch(() => false)) {
      await continueAnnouncement.click({ timeout: 3_000 })
      return true
    }
  }

  const finalistShowcase = page.getByRole('dialog', { name: 'Meet the final two' })
  if (await finalistShowcase.isVisible().catch(() => false)) {
    const skip = finalistShowcase.getByRole('button', { name: 'Skip presentation', exact: true })
    if (await skip.isVisible().catch(() => false)) {
      try {
        await skip.click({ timeout: 1_500 })
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error
        const [stillVisible, announcementVisible] = await Promise.all([
          finalistShowcase.isVisible().catch(() => false),
          page
            .getByRole('dialog', { name: /^Announcement:/ })
            .isVisible()
            .catch(() => false),
        ])
        if (stillVisible && !announcementVisible) throw error
      }
      return true
    }
  }

  // Recap and winner surfaces can cover a still-mounted tribunal. Use their
  // visible controls before trying another button underneath them.
  const recapArchive = page.getByRole('dialog', { name: 'Season recap archive' })
  if (await recapArchive.isVisible().catch(() => false)) {
    const skipOpening = recapArchive.getByRole('button', { name: 'Skip opening' })
    if (await skipOpening.isVisible().catch(() => false)) {
      await skipOpening.click({ timeout: 3_000 })
      return true
    }
    const exitRecap = recapArchive.getByRole('button', { name: 'Exit season recap' })
    if (await exitRecap.isVisible().catch(() => false)) {
      await exitRecap.click({ timeout: UI_TIMEOUT })
      return true
    }
    return false
  }

  const winnerReveal = page.getByRole('dialog', { name: /winner reveal$/i })
  if (await winnerReveal.isVisible().catch(() => false)) {
    await winnerReveal
      .getByRole('button', { name: 'Continue', exact: true })
      .click({ timeout: UI_TIMEOUT })
    return true
  }

  const tribunal = page.getByRole('dialog', { name: 'Tribunal Finale' })
  if (await tribunal.isVisible().catch(() => false)) {
    const begin = tribunal.getByRole('button', { name: 'Begin Tribunal ▶', exact: true })
    if (await begin.isVisible().catch(() => false)) {
      await begin.click({ timeout: UI_TIMEOUT })
      return true
    }
    const humanVote = tribunal.getByRole('button', { name: /^Cast Tribunal vote for / }).first()
    if (await humanVote.isVisible().catch(() => false)) {
      await humanVote.click({ timeout: UI_TIMEOUT })
      return true
    }
    const skipAll = tribunal.getByRole('button', { name: /^Skip All/ })
    if ((await skipAll.isVisible().catch(() => false)) && (await skipAll.isEnabled())) {
      await skipAll.click({ timeout: UI_TIMEOUT })
      return true
    }
    const continueTribunal = tribunal.getByRole('button', { name: /^Continue 🎉$/ })
    if (await continueTribunal.isVisible().catch(() => false)) {
      try {
        await continueTribunal.click({ timeout: 3_000 })
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error
        const [state, recapVisible, winnerAnnouncementVisible, continueStillVisible] =
          await Promise.all([
            readAppState(page).catch(() => null),
            page
              .getByRole('dialog', { name: 'Season recap archive' })
              .isVisible()
              .catch(() => false),
            page
              .getByRole('dialog', { name: /^Announcement: .* Won Season/ })
              .isVisible()
              .catch(() => false),
            continueTribunal.isVisible().catch(() => false),
          ])
        if (
          state?.game.seasonFinale?.phase === 'seasonComplete' ||
          recapVisible ||
          winnerAnnouncementVisible ||
          !continueStillVisible
        ) {
          return true
        }
        throw error
      }
      return true
    }
    const recapSkip = tribunal.getByRole('button', { name: /^Skip$/ })
    if (await recapSkip.isVisible().catch(() => false)) {
      await recapSkip.click({ timeout: UI_TIMEOUT })
      return true
    }
    const startingRecap = tribunal.getByRole('button', {
      name: 'Starting recap…',
      exact: true,
    })
    if (await startingRecap.isVisible().catch(() => false)) {
      // The final juror's line has finished, but the recap cinematic waits for
      // its reading hold before replacing this disabled control with Skip.
      // Wait for that visible handoff instead of clicking the covered game bar.
      await page
        .getByRole('dialog', { name: 'Season recap archive' })
        .waitFor({ state: 'visible', timeout: 15_000 })
      return true
    }
  }

  const publicVote = page.getByRole('dialog', {
    name: /(?:Final public season winner vote|Public's Favorite Player overlay)/,
  })
  if (await publicVote.isVisible().catch(() => false)) {
    const lockForecast = publicVote.getByRole('button', { name: 'Lock forecast', exact: true })
    if (
      (await lockForecast.isVisible().catch(() => false)) &&
      (await lockForecast.isEnabled().catch(() => false))
    ) {
      await lockForecast.click({ timeout: UI_TIMEOUT })
      return true
    }
    const fastForward = publicVote.getByRole('button', {
      name: 'Fast forward public favorite vote',
    })
    if ((await fastForward.isVisible().catch(() => false)) && (await fastForward.isEnabled())) {
      await fastForward.click({ timeout: UI_TIMEOUT })
      return true
    }
    const continueVote = publicVote.getByRole('button', { name: 'Continue', exact: true })
    if (await continueVote.isVisible().catch(() => false)) {
      await continueVote.click({ timeout: UI_TIMEOUT })
      return true
    }
  }

  const finaleChat = page.getByRole('dialog', {
    name: /^(?:Winner interview|Public favorite setup|Final goodbye sequence)$/,
  })
  if (await finaleChat.isVisible().catch(() => false)) {
    const skip = finaleChat.getByRole('button', { name: 'Skip to end', exact: true })
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: UI_TIMEOUT })
      return true
    }
    const continueChat = finaleChat.getByRole('button', { name: 'Continue →', exact: true })
    if (await continueChat.isVisible().catch(() => false)) {
      await continueChat.click({ timeout: UI_TIMEOUT })
      return true
    }
  }

  const lightsOut = page.getByRole('dialog', { name: 'Season finale lights out' })
  if (await lightsOut.isVisible().catch(() => false)) {
    await lightsOut.waitFor({ state: 'hidden', timeout: 25_000 })
    return true
  }
  const skipCredits = page.getByRole('button', { name: 'Skip credits', exact: true })
  if (await skipCredits.isVisible().catch(() => false)) {
    await skipCredits.click({ timeout: UI_TIMEOUT })
    return true
  }
  return false
}

function canAdvance(
  isTerminal: () => Promise<boolean>,
  handleSpectatorPrompt?: (target: Page) => Promise<boolean>,
  handlePresentation?: (target: Page) => Promise<boolean>
): SimulationAction {
  return {
    id: 'advance',
    label: 'advance visible phase',
    module: 'phase',
    async perform(target) {
      const advance = target.getByTestId('game-primary-action')
      const advanceVisible = await advance
        .waitFor({ state: 'visible', timeout: 1_500 })
        .then(() => true)
        .catch(() => false)
      // A competition can mount between the phase decision and this click.
      // Return to the main loop so it can handle the newly visible modal.
      if (!advanceVisible) return
      await movePointerOutsideViewport(target)
      const deadline = Date.now() + UI_TIMEOUT - 1_000
      let lastAdvanceClickError: unknown = null
      while (Date.now() < deadline) {
        if (await dismissShockAcknowledgement(target)) return
        if (await dismissSurvivalAchievement(target)) return
        if (handleSpectatorPrompt && (await handleSpectatorPrompt(target))) return
        if (await isTerminal()) return
        const seasonOver = target.getByRole('heading', {
          name: 'Your season is over',
          exact: true,
        })
        if (await seasonOver.isVisible().catch(() => false)) return
        if (await skipEliminationAnimation(target)) continue
        const survivalRunEnded = target.getByRole('dialog', { name: 'Surveyeval run ended' })
        if (await survivalRunEnded.isVisible().catch(() => false)) return
        if (await skipOptionalVoteReveal(target)) continue
        // A finale overlay can mount after the main loop's presentation check
        // and cover Play while this action is already waiting to click it.
        if (handlePresentation && (await handlePresentation(target))) return
        const juryOverlay = target
          .getByRole('dialog', {
            name: /^(?:The Tribunal Takes Control|Tribunal Finale|Meet the final two)$/,
          })
          .filter({ visible: true })
          .first()
        if (await juryOverlay.isVisible().catch(() => false)) {
          await target.waitForTimeout(250)
          continue
        }

        if (await advance.isEnabled().catch(() => false)) {
          try {
            await advance.click({ timeout: 1_200 })
            return
          } catch (error) {
            lastAdvanceClickError = error
            // Optional overlays can mount between the enabled check and click.
            // Recheck them on the next pass instead of waiting forever on a
            // click whose timeout is disabled by the Playwright config.
            await target.waitForTimeout(200)
            continue
          }
        }
        await target.waitForTimeout(250)
      }
      if (await isTerminal()) return
      const detail =
        lastAdvanceClickError instanceof Error
          ? ` Last click issue: ${lastAdvanceClickError.message}`
          : ''
      throw new Error(`Could not advance the visible phase within the UI timeout.${detail}`)
    },
  }
}

export async function runSeasonSimulation(
  page: Page,
  testInfo: TestInfo,
  inputConfig: SimulationRunConfig
): Promise<SeasonAuditor> {
  const batchId = process.env.SEASON_SIM_BATCH_ID
  const config: SimulationRunConfig = batchId
    ? {
        ...inputConfig,
        id: `${inputConfig.mode}-${inputConfig.personaId}-${batchId}-run-${String(testInfo.repeatEachIndex + 1).padStart(3, '0')}`,
        batchId,
        runIndex: testInfo.repeatEachIndex + 1,
        batchRuns: optionalPositiveInt('SEASON_SIM_RUNS') ?? 1,
        viewport:
          process.env.SEASON_SIM_VIEWPORT === 'compact-mobile'
            ? 'compact-mobile'
            : inputConfig.viewport,
        seeds: seedsForRepeat(inputConfig.seeds, testInfo.repeatEachIndex),
        captureFinalScreenshot: false,
        compactEconomyReport: true,
      }
    : inputConfig
  assertMinigameDriversCoverRegistry()
  const startedAtMs = Date.now()
  const context: SimulationContext = { page, testInfo, config, startedAtMs }
  const coverage = new CoverageLedger(config.objectives, config.mode, config.entitlement === 'vip')
  const auditor = new SeasonAuditor(context, coverage)
  const random = new SeededRandom(config.seeds.actor)
  const persona = getPersona(config.personaId)
  const adapter = getModeAdapter(config.mode)
  const exercisedSocialWindows = new Set<string>()
  const handledConfessionalWindows = new Set<string>()
  const attemptedPactTargets = new Set<string>()
  const restoredCheckpoint = config.assistedCheckpoint
    ? await restoreSeasonCheckpoint(page, config.assistedCheckpoint, config.mode, config.seeds)
    : null

  const needsPerformanceDiagnostics =
    config.performanceBenchmark ||
    config.captureSaveResumePerformance ||
    Boolean(config.progressionPerformanceDays?.length) ||
    Boolean(restoredCheckpoint)
  await page.goto(
    needsPerformanceDiagnostics
      ? `./?debugPerformance=1${process.env.SEASON_SIM_PROFILE_PRODUCTION === '1' ? '&profileProduction=1' : ''}`
      : './'
  )
  await waitForHome(page)
  if (config.mode === 'cupidArrow' && config.continueToSeasonComplete) {
    // Enable a dev-only spectator branch so the browser can inspect Cupid's full season.
    await page.evaluate(() => {
      window.sessionStorage.setItem('bb:test:cupid-season-spectator', 'true')
    })
  }
  if (restoredCheckpoint) {
    await resumeSavedSeasonFromHome(page, config, async () => undefined)
    const restoredState = await readAppState(page)
    assertRestoredCheckpoint(restoredState, restoredCheckpoint)
    random.restore(restoredCheckpoint.actorRandomState)
    coverage.assisted(
      'fresh-day-one',
      `Restored a ${restoredCheckpoint.origin} checkpoint at day ${restoredCheckpoint.day}.`
    )
    coverage.assisted('reload-resume', 'Continued from a durable browser checkpoint.')
    await auditor.record('resume saved checkpoint', 'persistence')
  } else {
    await createFreshProfile(page, `Sim ${config.personaId} ${config.seeds.actor}`)
    await adapter.launch(page)
    await auditor.record('launch season', 'home')
    coverage.verify(
      'fresh-day-one',
      'Profile creation and mode selection were completed through the UI.'
    )
  }
  if (config.progressionPerformanceDays?.length) await clearBrowserPerformanceSamples(page)
  if (config.forceDoubleElimination && !restoredCheckpoint) {
    if (config.mode !== 'survival') {
      throw new Error(
        'The forced replacement double-elimination journey is only for Survival mode.'
      )
    }
    await queueDoubleElimination(page)
    await auditor.record('queue Survival double elimination', 'qa-controls')
  }

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
  let didSaveResume = Boolean(restoredCheckpoint)
  let isSpectatingAfterElimination = false
  let didAccelerateJourney = Boolean(restoredCheckpoint) && !config.journeyAcceleration
  const recordedProgressionDays = new Set<number>()
  const recordedCheckpointLabels = new Set<string>()
  let lastJuryProgress = ''
  let juryActionsWithoutProgress = 0
  const checkpointInterval = config.checkpointEveryActions ?? (config.batchId ? 15 : 3)
  for (let step = 0; step < config.maxActions; step += 1) {
    const state = await readAppState(page)
    const day =
      state.game.modeSpecific?.kind === 'survival'
        ? state.game.modeSpecific.currentDay
        : state.game.week
    if (state.game.phase === 'jury' && state.game.seasonFinale == null) {
      const progress = `${day}:${state.finale.revealedCount}:${state.finale.isComplete}:${state.game.seasonFinale?.phase ?? ''}`
      juryActionsWithoutProgress =
        progress === lastJuryProgress ? juryActionsWithoutProgress + 1 : 0
      lastJuryProgress = progress
      if (juryActionsWithoutProgress >= 30) {
        await attachJuryDiagnostics(page, testInfo)
        throw new Error(`The jury did not change state for ${juryActionsWithoutProgress} actions.`)
      }
    } else {
      lastJuryProgress = ''
      juryActionsWithoutProgress = 0
    }
    if (step === 0 || step % checkpointInterval === 0) {
      await auditor.checkpoint(`before-action-${step}`, state)
    }
    await auditor.markProgress(`step-${step}:check-terminal`, state)
    if (await adapter.isTerminal(page, state, config.continueToSeasonComplete)) {
      terminal =
        (await adapter.describeTerminal(page, state, config.continueToSeasonComplete)) ?? 'terminal'
      break
    }
    if (day > config.maxDays) {
      terminal = `day-budget-${config.maxDays}`
      break
    }
    if (config.checkpointCaptureDir) {
      const label =
        (day === 5 && config.mode === 'survival') ||
        ((day === 5 || day === 10) && state.game.phase === 'week_start')
          ? `day-${day}`
          : config.mode !== 'survival' &&
              (state.game.phase === 'final3' || state.game.phase === 'final3_decision')
            ? 'finale'
            : null
      const human = state.game.players.find((player) => player.isUser)
      const resumablePlayer =
        (human != null && isActiveGamePlayerStatus(human.status)) ||
        (config.continueToSeasonComplete === true &&
          ((config.mode === 'voxPopuli' && human?.status === 'evicted') ||
            (config.mode === 'cupidArrow' &&
              (human?.status === 'evicted' || human?.status === 'jury'))))
      if (label && !recordedCheckpointLabels.has(label) && resumablePlayer) {
        const filePath = checkpointPath(config.checkpointCaptureDir, config.mode, label)
        await captureSeasonCheckpoint(
          page,
          filePath,
          state,
          config.mode,
          config.seeds,
          random.snapshot(),
          restoredCheckpoint?.origin ??
            (didAccelerateJourney ? 'qa-accelerated-setup' : 'visible-journey')
        )
        recordedCheckpointLabels.add(label)
        await auditor.record(`capture ${label} saved checkpoint`, 'persistence', filePath, state)
      }
    }
    const progressionCheckpointDue =
      config.progressionPerformanceDays?.includes(day) && !recordedProgressionDays.has(day)
    const hasBlockingDialog = progressionCheckpointDue
      ? await withSimulationDeadline(
          `Day ${day} dialog visibility check`,
          page
            .getByRole('dialog')
            .count()
            .then((count) => count > 0)
            .catch(() => true)
        )
      : false
    const hasVisibleShockIntro = progressionCheckpointDue
      ? await withSimulationDeadline(
          `Day ${day} shock visibility check`,
          page
            .getByTestId('shock-intro-overlay')
            .last()
            .isVisible()
            .catch(() => false)
        )
      : false
    if (progressionCheckpointDue && !hasBlockingDialog && !hasVisibleShockIntro) {
      await auditor.markProgress(`late-game-checkpoint:day-${day}`, state)
      await recordProgressionPerformanceCheckpoint(page, auditor, state, config, day)
      recordedProgressionDays.add(day)
    }
    const humanWasEvicted = state.game.players.find((player) => player.isUser)?.status === 'evicted'
    if (
      config.continueToSeasonComplete &&
      (config.mode === 'voxPopuli' || config.mode === 'cupidArrow') &&
      humanWasEvicted &&
      !isSpectatingAfterElimination
    ) {
      const continuedSpectating = await continueSpectatingAfterElimination(page)
      isSpectatingAfterElimination = true
      if (continuedSpectating) {
        await auditor.record('continue watching after elimination', 'finale', undefined, state)
        continue
      }
    }
    if (
      !didSaveResume &&
      config.saveResumeAtDay != null &&
      day >= config.saveResumeAtDay &&
      state.game.phase === 'week_start'
    ) {
      const snapshot = config.captureSaveResumePerformance
        ? measureSavedSeasonSnapshot(state)
        : null
      const resumed = await saveAndResumeFromVisibleHome(page, config, state, async (step) => {
        await auditor.markProgress('save-resume:' + step, state)
        if (step === 'continue-last-season') {
          await page.screenshot({
            path: testInfo.outputPath('save-resume-play-menu.png'),
            fullPage: true,
          })
        }
      })
      if (snapshot && config.captureSaveResumePerformance) {
        auditor.recordSaveResumePerformanceCheckpoint({
          mode: config.mode,
          day,
          phase: state.game.phase,
          seed: config.seeds,
          snapshot,
          persistence: resumed.persistence,
          timing: resumed.timing,
        })
      }
      didSaveResume = true
      await auditor.record(
        'save, reload, and resume from the visible Home menu',
        'persistence',
        'day-' + day + ':' + state.game.phase
      )
      continue
    }
    if (
      !didAccelerateJourney &&
      config.journeyAcceleration &&
      day >= config.journeyAcceleration.fromDay &&
      day < config.journeyAcceleration.toDay &&
      state.game.phase === 'week_start'
    ) {
      await auditor.markProgress(
        `journey-acceleration:start-day-${day}-to-${config.journeyAcceleration.toDay}`,
        state
      )
      await accelerateDaySpan(page, config, day, config.journeyAcceleration.toDay)
      didAccelerateJourney = true
      await auditor.markProgress(
        `journey-acceleration:reached-day-${config.journeyAcceleration.toDay}`,
        await readAppState(page)
      )
      continue
    }
    if (config.continueToSeasonComplete && state.game.phase === 'jury') {
      await auditor.markProgress(`step-${step}:jury-controls`, state)
    }
    if (
      config.continueToSeasonComplete &&
      (await withSimulationDeadline(`Day ${day} finale controls`, advanceFinalePresentation(page)))
    ) {
      await auditor.record('advance finale presentation', 'finale', undefined, state)
      continue
    }
    if (config.mode === 'survival' && (await dismissSurvivalAchievement(page))) {
      await auditor.record('dismiss Surveyeval achievement', 'presentation', undefined, state)
      continue
    }
    await auditor.markProgress('dismiss-shock-overlay-before-vote-prompt', state)
    if (await dismissShockAcknowledgement(page)) {
      await auditor.record(
        'dismiss shock overlay before vote prompt',
        'presentation',
        undefined,
        state
      )
      continue
    }
    await auditor.markProgress('skip-vote-reveal-before-announcement', state)
    if (await skipOptionalVoteReveal(page)) {
      await auditor.record('skip optional vote reveal ad', 'presentation', undefined, state)
      continue
    }
    await auditor.markProgress('resolve-day-start-shock', state)
    if (await resolveDayStartShock(page)) {
      await auditor.record('confirm Morning shock removal', 'phase', undefined, state)
      continue
    }
    await auditor.markProgress('resolve-democracia-vote', state)
    if (await resolveDemocraciaVoteModal(page)) {
      await auditor.record('cast Democracia vote', 'phase', undefined, state)
      continue
    }
    await auditor.markProgress(`step-${step}:dismiss-announcement`, state)
    if (await dismissAnnouncement(page)) {
      await auditor.record('dismiss announcement', 'presentation', undefined, state)
      continue
    }
    await auditor.markProgress(`step-${step}:close-phase-information`, state)
    if (await closePhaseInformation(page)) {
      await auditor.record('close phase information', 'presentation', undefined, state)
      continue
    }
    await auditor.markProgress(`step-${step}:skip-elimination-animation`, state)
    if (await skipEliminationAnimation(page)) {
      await auditor.record('skip elimination animation', 'presentation', undefined, state)
      continue
    }
    await auditor.markProgress(`step-${step}:skip-vote-reveal`, state)
    if (await skipOptionalVoteReveal(page)) {
      await auditor.record('skip optional vote reveal ad', 'presentation', undefined, state)
      continue
    }
    await auditor.markProgress('answer-weekend-poll', state)
    if (await chooseWeekendHubSaysAnswer(page)) {
      await auditor.record('answer The Hub Says poll', 'social', undefined, state)
      continue
    }
    if (config.mode === 'survival' && (await resolveSurvivalDecision(page))) {
      await auditor.record('resolve on-screen survival decision', 'phase', undefined, state)
      continue
    }
    if (config.skipCompetitions) {
      await auditor.markProgress('start-competition-briefing-for-visible-exit', state)
      if (await startVisibleCompetitionBriefing(page)) {
        await auditor.record(
          'open minigame controls to exit competition',
          'minigame',
          undefined,
          state
        )
        continue
      }
    }
    await auditor.markProgress(`step-${step}:handle-competition`, state)
    const competition = await handleVisibleCompetition(page, config, random)
    if (competition.handled) {
      await auditor.record(
        competition.skipped ? 'exit visible competition' : 'play visible competition',
        'minigame',
        competition.gameKey,
        state
      )
      if (!competition.skipped) {
        coverage.verify(
          `minigame:${competition.gameKey}`,
          'Visible primary input was sent through the MinigameHost.'
        )
      }
      continue
    }
    const confessionalEntry = page.getByRole('button', { name: /^Confessional \(\d+\)$/ }).first()
    const confessionalEntryVisible = await confessionalEntry.isVisible().catch(() => false)
    const confessionalEntryLabel = confessionalEntryVisible
      ? ((await confessionalEntry.getAttribute('aria-label')) ?? 'Confessional')
      : 'direct'
    const confessionalWindowKey = `${day}:${state.game.phase}:${confessionalEntryLabel}`
    const alreadyHandledConfessional = handledConfessionalWindows.has(confessionalWindowKey)
    const confessionalRouteVisible =
      (await page
        .getByTestId('twin-shock-required-response')
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByTestId('required-confessional-session')
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByTestId('diary-room-shell')
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByTestId('required-confessional-decision')
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByTestId('confessional-decision-options')
        .first()
        .isVisible()
        .catch(() => false))
    const requiredConfessionalPending = selectActiveConfessionalDecision(state) !== null

    const shouldResolveConfessional =
      (!alreadyHandledConfessional || requiredConfessionalPending) &&
      (confessionalRouteVisible ||
        (confessionalEntryVisible &&
          (requiredConfessionalPending || !config.skipOptionalConfessionals)))
    if (shouldResolveConfessional) {
      await auditor.markProgress(`step-${step}:resolve-confessional`, state)
      if (await resolveConfessional(page)) {
        handledConfessionalWindows.add(confessionalWindowKey)
        await auditor.record('resolve confessional prompt', 'confessional', undefined, state)
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
    }
    if (state.game.phase === 'social_1' || state.game.phase === 'social_2') {
      const socialWindowKey = `${day}:${state.game.phase}`
      if (!exercisedSocialWindows.has(socialWindowKey)) {
        await auditor.markProgress(`step-${step}:exercise-social`, state)
        if (await exerciseSocial(page, persona.id, state, attemptedPactTargets)) {
          exercisedSocialWindows.add(socialWindowKey)
          await auditor.record('perform social action', 'social', undefined, state)
          coverage.verify('social-action', 'A visible social action was selected and executed.')
          continue
        }
      }
    }
    const actions: SimulationAction[] = [
      canAdvance(
        () => adapter.isTerminal(page, state, config.continueToSeasonComplete),
        async (target) => {
          if (
            !config.continueToSeasonComplete ||
            (config.mode !== 'voxPopuli' && config.mode !== 'cupidArrow') ||
            isSpectatingAfterElimination
          ) {
            return false
          }
          const continued = await continueSpectatingAfterElimination(target)
          if (continued) isSpectatingAfterElimination = true
          return continued
        },
        config.continueToSeasonComplete ? advanceFinalePresentation : undefined
      ),
    ]
    const chosen = choosePersonaAction(persona, actions, random)
    await auditor.markProgress(`step-${step}:perform:${chosen.id}`, state)
    let actionGuard: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        chosen.perform(page),
        new Promise<never>((_, reject) => {
          actionGuard = setTimeout(
            () =>
              reject(
                new Error(`Simulation action "${chosen.id}" did not return within ${UI_TIMEOUT}ms.`)
              ),
            UI_TIMEOUT
          )
        }),
      ])
    } finally {
      if (actionGuard) clearTimeout(actionGuard)
    }
    await auditor.record(chosen.label, chosen.module, undefined, state)
  }

  await auditor.checkpoint('final')
  await attachJuryDiagnostics(page, testInfo)
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
    skipCompetitions: process.env.SEASON_SIM_SKIP_COMPETITIONS === 'true',
    skipOptionalConfessionals: process.env.SEASON_SIM_SKIP_OPTIONAL_CONFESSIONALS === 'true',
    ...overrides,
  }
}
