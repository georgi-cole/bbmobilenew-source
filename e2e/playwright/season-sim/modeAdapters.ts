import { expect, type Page } from '@playwright/test'

import { readAppState } from '../support/test'
import type { SeasonSimulationMode } from './types'

const MODE_LAUNCH_TIMEOUT = 30_000

export interface ModeAdapter {
  readonly mode: SeasonSimulationMode
  launch(page: Page): Promise<void>
  isTerminal(page: Page): Promise<boolean>
  describeTerminal(page: Page): Promise<string | null>
}

async function isSeasonCompleteUiVisible(page: Page): Promise<boolean> {
  return page
    .getByRole('heading', { name: 'Season Complete', exact: true })
    .isVisible()
    .catch(() => false)
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
      await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
        timeout: MODE_LAUNCH_TIMEOUT,
      })
    },
    async isTerminal(page) {
      const state = await readAppState(page)
      return (
        (await isSeasonCompleteUiVisible(page)) ||
        state.game.status !== 'active' ||
        state.game.seasonFinale?.phase === 'seasonComplete'
      )
    },
    async describeTerminal(page) {
      const state = await readAppState(page)
      if (await isSeasonCompleteUiVisible(page)) return 'season-complete-modal'
      if (state.game.seasonFinale?.phase === 'seasonComplete') return 'season-complete'
      return state.game.status !== 'active' ? `run-${state.game.status}` : null
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
    const rules = page.getByRole('dialog', { name: /Surveyeval Mode/i })
    if (await rules.isVisible().catch(() => false)) {
      const continueButton = rules.getByRole('button', { name: /continue|start/i }).last()
      await expect(continueButton).toBeVisible()
      await continueButton.click()
    }
    await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
      timeout: MODE_LAUNCH_TIMEOUT,
    })
  },
  async isTerminal(page) {
    const state = await readAppState(page)
    return state.game.mode === 'survival' && state.game.status !== 'active'
  },
  async describeTerminal(page) {
    const state = await readAppState(page)
    return state.game.status !== 'active' ? `surveyeval-${state.game.status}` : null
  },
}

export function getModeAdapter(mode: SeasonSimulationMode): ModeAdapter {
  if (mode === 'survival') return survivalAdapter
  if (mode === 'voxPopuli') return finiteAdapter(mode, 'Vox Populi')
  if (mode === 'cupidArrow') return finiteAdapter(mode, "Cupid's Arrow")
  return finiteAdapter(mode, 'Classic')
}
