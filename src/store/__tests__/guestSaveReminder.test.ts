import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, hydrateGame } from '../gameSlice'
import type { TvEvent } from '../../types'

const LEGACY_GUEST_NOTICE =
  "You're playing as a guest, so your progress won't be saved. Go to More → Profile → Create Profile to save it."

function hydrateLegacyReminder(consumed = false) {
  const game = createInitialGameState({ seed: 503 })
  const legacyEvent: TvEvent = {
    id: 'legacy-guest-save-reminder',
    text: LEGACY_GUEST_NOTICE,
    type: 'game',
    timestamp: 1,
    meta: {
      phase: 'loh_comp_announcement',
      week: 1,
      ...(consumed ? { broadcastConsumed: true } : {}),
    },
  }

  return gameReducer(
    game,
    hydrateGame({
      ...game,
      phase: 'loh_comp_announcement',
      tvFeed: [legacyEvent],
      broadcastQueue: [],
    })
  )
}

describe('guest save reminder save migration', () => {
  it('restores an unconsumed legacy reminder as the minor item in the current broadcast queue', () => {
    const state = hydrateLegacyReminder()
    const reminder = state.tvFeed[0]

    expect(reminder.meta?.guestModeSaveWarning).toBe(true)
    expect(reminder.meta?.broadcastLevel).toBe('minor')
    expect(reminder.meta?.broadcastDelivery).toBe('next')
    expect(reminder.text).toBe("You're playing as a guest. Create a profile to save your season.")
    expect(reminder.major).toBeUndefined()
    expect(state.broadcastQueue?.[0]).toBe(reminder.id)
  })

  it('keeps a previously acknowledged legacy reminder out of the live queue', () => {
    const state = hydrateLegacyReminder(true)
    const reminder = state.tvFeed[0]

    expect(reminder.meta?.guestModeSaveWarning).toBe(true)
    expect(reminder.meta?.broadcastConsumed).toBe(true)
    expect(state.broadcastQueue).not.toContain(reminder.id)
  })
})
