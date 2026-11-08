import { expect, type Page } from '@playwright/test'
import type { RootState } from '../../../src/store/store'
import { readAppState } from './test'

export function incomingDockButton(page: Page) {
  return page
    .getByRole('toolbar', { name: 'Game actions' })
    .getByRole('button', { name: /^Incoming requests(?: \(\d+\))?$/ })
}

export async function replyToOptionalIncoming(page: Page, before: RootState) {
  const candidate = before.social.incomingInteractions.find(
    (entry) => !entry.resolved && entry.payload?.responsePolicy === 'optional'
  )
  const button = incomingDockButton(page)
  if (!candidate || !(await button.isVisible()) || !(await button.isEnabled())) return null

  await button.click()
  const inbox = page.getByRole('dialog', { name: 'Incoming interactions' })
  await expect(inbox).toBeVisible()
  const guide = page.getByRole('dialog', { name: 'They came to you' })
  if (await guide.isVisible()) await guide.getByRole('button', { name: 'Got it' }).click()

  const card = inbox.locator('.inbox-item').filter({ hasText: candidate.text }).first()
  const reply = card.locator('button[data-response-type="positive"]').first()
  if (!(await reply.isVisible())) {
    await inbox.getByRole('button', { name: 'Close inbox' }).click()
    return null
  }

  await reply.click()
  const after = await readAppState(page)
  const resolved = after.social.incomingInteractions.find((entry) => entry.id === candidate.id)
  expect(resolved?.resolved).toBe(true)
  await expect(card.getByLabel('Response', { exact: true })).toBeVisible()
  const promiseGuide = page.getByRole('dialog', { name: 'You made a promise' })
  if (await promiseGuide.isVisible()) {
    await promiseGuide.getByRole('button', { name: 'Got it' }).click()
  }
  await inbox.getByRole('button', { name: 'Close inbox' }).click()
  return { candidate, resolved, after }
}
