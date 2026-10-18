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
import { seedsForRepeat } from './seeds'
import { getAllGames } from '../../../src/minigames/registry'
import { allianceRequestDecisionActors } from '../../../src/social/reality/allianceManagement'
import { selectActiveConfessionalDecision } from '../../../src/store/confessionalDecisionSelectors'
import type { RootState } from '../../../src/store/store'
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

async function dismissAnnouncement(page: Page): Promise<boolean> {
  const announcement = page.getByRole('dialog', { name: /^Announcement:/ })
  if (!(await announcement.isVisible().catch(() => false))) return false
  await movePointerOutsideViewport(page)
  const dismiss = announcement.getByRole('button', { name: /^(?:OK|Continue|Close)$/i }).first()
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click({ timeout: 3_000 })
    return true
  }

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

async function skipEliminationAnimation(page: Page): Promise<boolean> {
  const skip = page.getByRole('button', { name: 'Skip elimination animation (dev only)' })
  if (!(await skip.isVisible().catch(() => false)) || !(await skip.isEnabled())) return false
  await skip.click({ noWaitAfter: true, timeout: 5_000 })
  await expect(skip).toBeHidden({ timeout: UI_TIMEOUT })
  return true
}

async function skipOptionalVoteReveal(page: Page): Promise<boolean> {
  const prompt = page.getByRole('dialog', { name: 'Peek Behind the Curtain?' })
  if (!(await prompt.isVisible().catch(() => false))) return false
  await prompt.getByRole('button', { name: 'Continue', exact: true }).click()
  return true
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

  const confirms = decisionSurface.getByRole('button', {
    name: /Confirm nominations|Confirm power decision|Confirm replacement|Confirm|Seal deciding vote|Confirm eliminations/,
  })
  const confirm = confirms.first()
  let selectedAnOption = false
  for (let guard = 0; guard < 10 && !(await confirm.isEnabled().catch(() => false)); guard += 1) {
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
      .getByRole('button', { name: /Leave nominations unchanged|Keep nominations|Use.*Safety/i })
      .first()
    if (await binary.isVisible().catch(() => false)) await binary.click()
    if (await confirm.isEnabled().catch(() => false)) await confirm.click()
    else if (!selectedAnOption) return false
  }
  const session = page.getByTestId('required-confessional-session')
  const sessionReturnHome = session.getByRole('button', { name: 'Return to the Hub' })
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

  await dialog.getByRole('tab', { name: 'Alliances', exact: true }).click({ timeout: 3_000 })
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
    (await exercisePactMove(dialog, state, attemptedPactTargets))
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
  if (config.skipCompetitions && (await exitMinigame(page))) {
    return { handled: true, gameKey }
  }
  const result = await playVisibleMinigame(page, gameKey, config.competitionSkill, random)
  if (!result.completed && config.competitionSkill === 'thrower') await exitMinigame(page)
  // A visible modal owns the interaction surface even during a short
  // transition where the current driver has no button to press. Never let the
  // shared phase-advance action click behind an active minigame.
  return { handled: true, gameKey }
}

function canAdvance(isTerminal: () => Promise<boolean>): SimulationAction {
  return {
    id: 'advance',
    label: 'advance visible phase',
    module: 'phase',
    async perform(target) {
      const advance = target.getByRole('button', { name: 'Advance to next phase' })
      const advanceVisible = await advance
        .waitFor({ state: 'visible', timeout: 1_500 })
        .then(() => true)
        .catch(() => false)
      // A competition can mount between the phase decision and this click.
      // Return to the main loop so it can handle the newly visible modal.
      if (!advanceVisible) return
      await movePointerOutsideViewport(target)
      const deadline = Date.now() + UI_TIMEOUT
      while (Date.now() < deadline) {
        if (await isTerminal()) return
        if (await skipEliminationAnimation(target)) continue
        if (await skipOptionalVoteReveal(target)) continue
        if (await advance.isEnabled().catch(() => false)) {
          try {
            await advance.click({ timeout: 1_200 })
            return
          } catch {
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
      throw new Error('Could not advance the visible phase within the UI timeout.')
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
  const checkpointInterval = config.batchId ? 15 : 3
  for (let step = 0; step < config.maxActions; step += 1) {
    const state = await readAppState(page)
    const day =
      state.game.modeSpecific?.kind === 'survival'
        ? state.game.modeSpecific.currentDay
        : state.game.week
    if (step === 0 || step % checkpointInterval === 0) {
      await auditor.checkpoint(`before-action-${step}`, state)
    }
    await auditor.markProgress(`step-${step}:check-terminal`, state)
    if (await adapter.isTerminal(page, state)) {
      terminal = (await adapter.describeTerminal(page, state)) ?? 'terminal'
      break
    }
    if (day > config.maxDays) {
      terminal = `day-budget-${config.maxDays}`
      break
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
    await auditor.markProgress(`step-${step}:handle-competition`, state)
    const competition = await handleVisibleCompetition(page, config, random)
    if (competition.handled) {
      await auditor.record('play visible competition', 'minigame', competition.gameKey, state)
      coverage.verify(
        `minigame:${competition.gameKey}`,
        'Visible primary input was sent through the MinigameHost.'
      )
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
    const actions: SimulationAction[] = [canAdvance(() => adapter.isTerminal(page))]
    const chosen = choosePersonaAction(persona, actions, random)
    await auditor.markProgress(`step-${step}:perform:${chosen.id}`, state)
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
    skipCompetitions: process.env.SEASON_SIM_SKIP_COMPETITIONS === 'true',
    skipOptionalConfessionals: process.env.SEASON_SIM_SKIP_OPTIONAL_CONFESSIONALS === 'true',
    ...overrides,
  }
}
