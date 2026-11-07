import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { skipEliminationAnimation } from './eliminationAnimation'

test('elimination skip does not click through an active modal', async () => {
  const count = async () => 1
  const noEvictionModal = async () => 0
  const locator = (selector: string) => ({
    filter: () => ({
      count: selector.startsWith('[data-presentation-root="eviction-spotlight"]')
        ? noEvictionModal
        : count,
    }),
  })
  const page = {
    getByRole: (_role: string, options?: { name?: string }) =>
      options?.name === 'Surveyeval run ended'
        ? { isVisible: async () => false }
        : { filter: () => ({ last: () => ({ isVisible: async () => true }) }) },
    locator,
  } as unknown as Page

  await expect(skipEliminationAnimation(page)).resolves.toBe(false)
})
