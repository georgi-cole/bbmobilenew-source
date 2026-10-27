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
})
