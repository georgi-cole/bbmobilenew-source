import { expect, type Page } from '@playwright/test'

/** Open the current Changing Room flow through the controls a player sees. */
export async function openProfileCreationForm(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Profile', exact: true })
    .click()
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Choose this look', exact: true }).click()
  const reveal = page.getByRole('dialog', { name: /^Look \d+$/ })
  const continueButton = reveal.getByRole('button', { name: 'Continue', exact: true })
  await expect(continueButton).toBeVisible({ timeout: 15_000 })
  await continueButton.click()
  await expect(page.getByLabel('Display Name')).toBeVisible()
}
