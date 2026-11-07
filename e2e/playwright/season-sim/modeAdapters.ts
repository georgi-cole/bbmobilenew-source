import { expect, type Page } from '@playwright/test'

import { readAppState } from '../support/test'
import type { SeasonSimulationMode } from './types'
import type { RootState } from '../../../src/store/store'
import { dismissShockAcknowledgement } from './shockAcknowledgement'

const MODE_LAUNCH_TIMEOUT = 30_000

export interface ModeAdapter {
  readonly mode: SeasonSimulationMode
  launch(page: Page): Promise<void>
  isTerminal(page: Page, state?: RootState, continueToSeasonComplete?: boolean): Promise<boolean>
  describeTerminal(
    page: Page,
    state?: RootState,
    continueToSeasonComplete?: boolean
  ): Promise<string | null>
}

async function isSeasonCompleteUiVisible(page: Page): Promise<boolean> {
  return page
    .getByRole('heading', { name: 'Season Complete', exact: true })
    .isVisible()
    .catch(() => false)
}

async function isHumanEliminatedUiVisible(page: Page): Promise<boolean> {
  return page
    .getByRole('heading', { name: 'Your season is over', exact: true })
    .isVisible()
    .catch(() => false)
}

function humanExitStatus(state: Awaited<ReturnType<typeof readAppState>>): string | null {
  const human = state.game.players.find((player) => player.isUser)
  return human && (human.status === 'evicted' || human.status === 'jury') ? human.status : null
}

function supportsSpectatorContinuation(mode: SeasonSimulationMode): boolean {
  return mode === 'voxPopuli' || mode === 'cupidArrow'
}

async function openPlayMenu(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  await expect(page.getByRole('navigation', { name: 'Play menu' })).toBeVisible()
}

function finiteAdapter(
  mode: Exclude<SeasonSimulationMode, 'survival'>,
  label: string
): ModeAdapter {
  return {
    mode,
    async launch(page) {
      await openPlayMenu(page)
      await page
        .getByRole('navigation', { name: 'Play menu' })
        .getByRole('button', { name: label, exact: true })
        .click()
      if (mode !== 'classic') {
        await page
          .getByTestId('shock-intro-overlay')
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => undefined)
        await dismissShockAcknowledgement(page)
      }
      const contestantHeading = page.getByRole('heading', { name: 'Choose your contestant' })
      if (await contestantHeading.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Start Season', exact: true }).click()
      } else {
        await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
          timeout: MODE_LAUNCH_TIMEOUT,
        })
        const state = await readAppState(page)
        const loadedRequestedMode =
          mode === 'classic'
            ? state.game.mode === 'classic' && state.game.expansionMode == null
            : state.game.expansionMode === mode
        expect(loadedRequestedMode, `the active game should match ${mode}`).toBe(true)
        return
      }
      await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
        timeout: MODE_LAUNCH_TIMEOUT,
      })
    },
    async isTerminal(page, suppliedState, continueToSeasonComplete = false) {
      const state = suppliedState ?? (await readAppState(page))
      const human = state.game.players.find((player) => player.isUser)
      const canContinueAsSpectator =
        supportsSpectatorContinuation(mode) &&
        continueToSeasonComplete &&
        human?.status === 'evicted'
      const humanCannotContinue =
        !continueToSeasonComplete ||
        (!supportsSpectatorContinuation(mode) && human?.status === 'evicted')
      const terminalByState =
        (humanCannotContinue && humanExitStatus(state) !== null) ||
        (state.game.status != null && state.game.status !== 'active' && !canContinueAsSpectator) ||
        state.game.seasonFinale?.phase === 'seasonComplete'
      if (suppliedState) return terminalByState
      const eliminatedUiTerminal =
        !continueToSeasonComplete ||
        (!supportsSpectatorContinuation(mode) && human?.status === 'evicted')
      return (
        (await isSeasonCompleteUiVisible(page)) ||
        (eliminatedUiTerminal && (await isHumanEliminatedUiVisible(page))) ||
        terminalByState
      )
    },
    async describeTerminal(page, suppliedState, continueToSeasonComplete = false) {
      const state = suppliedState ?? (await readAppState(page))
      const exitStatus = humanExitStatus(state)
      const humanCannotContinue =
        !continueToSeasonComplete ||
        (!supportsSpectatorContinuation(mode) &&
          state.game.players.find((player) => player.isUser)?.status === 'evicted')
      if (exitStatus && humanCannotContinue) return `human-out-of-game-${exitStatus}`
      if (await isSeasonCompleteUiVisible(page)) return 'season-complete-modal'
      if (humanCannotContinue && (await isHumanEliminatedUiVisible(page))) return 'human-eliminated'
      if (state.game.seasonFinale?.phase === 'seasonComplete') return 'season-complete'
      return state.game.status != null && state.game.status !== 'active'
        ? `run-${state.game.status}`
        : null
    },
  }
}

const survivalAdapter: ModeAdapter = {
  mode: 'survival',
  async launch(page) {
    await openPlayMenu(page)
    await page
      .getByRole('navigation', { name: 'Play menu' })
      .getByRole('button', { name: 'Surveyeval', exact: true })
      .click()
    const rules = page.getByRole('dialog', { name: 'How Surveyeval Works' })
    if (await rules.isVisible().catch(() => false)) {
      const continueButton = rules.getByRole('button', { name: 'Enter Surveyeval' }).last()
      await expect(continueButton).toBeVisible()
      await continueButton.click()
    }
    await expect(page.getByRole('heading', { name: 'Choose your contestant' })).toBeVisible()
    await page.getByRole('button', { name: 'Start Season', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
      timeout: MODE_LAUNCH_TIMEOUT,
    })
  },
  async isTerminal(page, suppliedState) {
    const state = suppliedState ?? (await readAppState(page))
    return state.game.mode === 'survival' && state.game.status !== 'active'
  },
  async describeTerminal(page, suppliedState) {
    const state = suppliedState ?? (await readAppState(page))
    return state.game.status !== 'active' ? `surveyeval-${state.game.status}` : null
  },
}

export function getModeAdapter(mode: SeasonSimulationMode): ModeAdapter {
  if (mode === 'survival') return survivalAdapter
  if (mode === 'voxPopuli') return finiteAdapter(mode, 'Vox Populi')
  if (mode === 'cupidArrow') return finiteAdapter(mode, "Cupid's Arrow")
  return finiteAdapter(mode, 'Classic')
}
