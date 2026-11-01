import { describe, expect, it } from 'vitest'
import { sanitizeAnalyticsEvent } from './analyticsSchema'

describe('sanitizeAnalyticsEvent device and character details', () => {
  it('keeps readable device details while dropping unapproved fields', () => {
    const safe = sanitizeAnalyticsEvent({
      name: 'session_started',
      occurredAt: '2026-10-27T10:00:00.000Z',
      sessionId: 'session-1',
      properties: {
        platform: 'web',
        device_type: 'mobile',
        device_family: 'Android device',
        device_model: 'Pixel 9 Pro',
        operating_system: 'Android',
        browser: 'Chrome',
        full_user_agent: 'not collected',
      },
    })

    expect(safe?.properties).toEqual({
      platform: 'web',
      device_type: 'mobile',
      device_family: 'Android device',
      device_model: 'Pixel 9 Pro',
      operating_system: 'Android',
      browser: 'Chrome',
    })
  })

  it('keeps both the internal look ID and human-readable label', () => {
    const safe = sanitizeAnalyticsEvent({
      name: 'character_selected',
      occurredAt: '2026-10-27T10:00:00.000Z',
      sessionId: 'session-1',
      properties: { character_id: 'pc-004', character_label: 'Look 4' },
    })

    expect(safe?.properties).toEqual({ character_id: 'pc-004', character_label: 'Look 4' })
  })

  it('keeps the selected game mode and its readable label', () => {
    const safe = sanitizeAnalyticsEvent({
      name: 'game_mode_selected',
      occurredAt: '2026-10-27T10:00:00.000Z',
      sessionId: 'session-1',
      properties: { game_mode: 'vox_populi', game_mode_label: 'Vox Populi' },
    })

    expect(safe?.properties).toEqual({ game_mode: 'vox_populi', game_mode_label: 'Vox Populi' })
  })

  it('keeps season identity for cohort outcomes while excluding email and arbitrary payloads', () => {
    for (const name of [
      'tribunal_action',
      'player_eliminated',
      'season_abandoned',
      'season_started',
      'season_completed',
    ]) {
      const safe = sanitizeAnalyticsEvent({
        name,
        occurredAt: '2026-11-01T10:00:00Z',
        sessionId: 'session-1',
        properties: {
          season_index: 4,
          game_id: '11111111-1111-4111-8111-111111111111',
          game_mode: 'classic',
          action_id: 'finale_vote_cast',
          email: 'private@example.test',
          display_name: 'Private Name',
        },
      })
      expect(safe?.properties).toMatchObject({
        season_index: 4,
        game_mode: 'classic',
        game_id: '11111111-1111-4111-8111-111111111111',
      })
      expect(safe?.properties).not.toHaveProperty('email')
      expect(safe?.properties).not.toHaveProperty('display_name')
    }
  })
})
