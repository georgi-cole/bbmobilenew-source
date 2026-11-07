import type { Page } from '@playwright/test'

/** Exercise Survival's ad recovery only in a test that explicitly calls this helper. */
export async function continueSurvivalAfterElimination(page: Page): Promise<boolean> {
  const ended = page.getByRole('dialog', { name: 'Surveyeval run ended' })
  if (!(await ended.isVisible().catch(() => false))) return false

  const anotherChance = ended.getByRole('button', {
    name: 'Watch ad for another chance',
    exact: true,
  })
  if (!(await anotherChance.isVisible().catch(() => false))) return false

  await anotherChance.click({ timeout: 3_000 })
  const recovery = page.getByRole('dialog', { name: 'System recovery available' })
  await recovery.waitFor({ state: 'visible', timeout: 15_000 })
  await recovery.getByRole('button', { name: 'Watch ad · Reassemble', exact: true }).click({
    timeout: 3_000,
  })
  await recovery.waitFor({ state: 'hidden', timeout: 30_000 })
  await ended.waitFor({ state: 'hidden', timeout: 30_000 })
  return true
}

/** Linked Cupid exits can overlap while the previous cinematic unmounts. */
export async function skipEliminationAnimation(page: Page): Promise<boolean> {
  const activeModal = page.locator('[role="dialog"][aria-modal="true"]').filter({ visible: true })
  const evictionModal = page
    .locator('[data-presentation-root="eviction-spotlight"][role="dialog"][aria-modal="true"]')
    .filter({ visible: true })
  const [activeModalCount, evictionModalCount] = await Promise.all([
    activeModal.count().catch(() => 0),
    evictionModal.count().catch(() => 0),
  ])
  // The dev skip control lives inside the eviction presentation's own modal.
  // Keep blocking unrelated dialogs, but allow the journey to use that control.
  if (activeModalCount > evictionModalCount) return false

  const skip = page
    .getByRole('button', { name: 'Skip elimination animation (dev only)' })
    .filter({ visible: true })
    .last()
  if (!(await skip.isVisible().catch(() => false)) || !(await skip.isEnabled())) return false

  const selectedButton = await skip.elementHandle()
  if (!selectedButton) return false
  try {
    await selectedButton.click({ noWaitAfter: true, timeout: 5_000 })
    await selectedButton.waitForElementState('hidden', { timeout: 30_000 })
  } finally {
    await selectedButton.dispose()
  }
  return true
}
