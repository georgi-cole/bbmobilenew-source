import { describe, expect, it } from 'vitest'
import {
  SECRET_MISSION_EASTER_EGGS,
  getSecretMissionEasterEggByIntent,
} from '../secretMissionEasterEggs'

describe('secret mission authored Easter eggs', () => {
  it('keeps the complete five-intent registry wired to unique discoveries', () => {
    const intents = [
      'realness',
      'winner_prediction',
      'help_request',
      'love_confession',
      'game_request',
    ] as const

    expect(SECRET_MISSION_EASTER_EGGS).toHaveLength(5)
    expect(new Set(SECRET_MISSION_EASTER_EGGS.map((egg) => egg.id)).size).toBe(5)
    for (const intent of intents) {
      const egg = getSecretMissionEasterEggByIntent(intent)
      expect(egg).not.toBeNull()
      expect(egg?.intent).toBe(intent)
    }
  })
})
