import type { Page } from '@playwright/test'

/** Surveyeval makes required decisions on the main screen, outside the Confessional. */
export async function resolveSurvivalDecision(page: Page): Promise<boolean> {
  const binary = page.locator('.tv-binary-modal')
  if (await binary.isVisible().catch(() => false)) {
    await binary.getByRole('button', { name: /No.*keep|No.*leave/ }).click({ timeout: 3000 })
    await binary.locator('.tv-binary-modal__btn-confirm').click({ timeout: 3000 })
    await binary.waitFor({ state: 'hidden', timeout: 15000 })
    return true
  }
  const nominations = page.locator('.tv-ms-modal')
  if (await nominations.isVisible().catch(() => false)) {
    const confirm = nominations.getByRole('button', { name: 'Confirm Nominees', exact: true })
    for (let count = 0; count < 3 && !(await confirm.isEnabled()); count += 1) {
      await nominations
        .locator('button[aria-pressed="false"]:not([disabled])')
        .first()
        .click({ timeout: 3000 })
    }
    await confirm.click({ timeout: 3000 })
    await nominations.waitFor({ state: 'hidden', timeout: 15000 })
    return true
  }
  const decision = page.locator('.tv-decision-modal')
  if (await decision.isVisible().catch(() => false)) {
    await decision.locator('.tv-decision-modal__option').first().click({ timeout: 3000 })
    await decision.locator('.tv-decision-modal__btn-confirm').click({ timeout: 3000 })
    await decision.waitFor({ state: 'hidden', timeout: 15000 })
    return true
  }
  return false
}
