import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RootState } from '../../../src/store/store'
import { getModeAdapter } from './modeAdapters'

test('Cupid continues as a spectator after the player is eliminated', async () => {
  const state = {
    game: {
      players: [{ isUser: true, status: 'evicted' }],
      status: 'active',
    },
  } as unknown as RootState

  await expect(getModeAdapter('cupidArrow').isTerminal({} as Page, state, true)).resolves.toBe(
    false
  )
  await expect(getModeAdapter('cupidArrow').isTerminal({} as Page, state)).resolves.toBe(true)
})
