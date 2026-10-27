import { expect, type Page } from '@playwright/test'

/** Open the current Changing Room flow through the controls a player sees. */
export async function openProfileCreationForm(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Profile', exact: true })
    .click()
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Choose this look', exact: true }).click()
  const reveal = page.getByRole('dialog')
  await expect(reveal.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  await reveal.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByLabel('Display Name')).toBeVisible()
}
