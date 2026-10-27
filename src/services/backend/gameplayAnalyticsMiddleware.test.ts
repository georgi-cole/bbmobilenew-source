import { describe, expect, it } from 'vitest'
import { shouldTrackSeasonReset } from './gameplayAnalyticsMiddleware'

describe('shouldTrackSeasonReset', () => {
  it('ignores resets that are not an explicit new-season launch', () => {
    expect(shouldTrackSeasonReset(null, true)).toBe(false)
  })

  it('tracks an explicit season launch when a game roster was created', () => {
    expect(shouldTrackSeasonReset('voxPopuli', true)).toBe(true)
  })

  it('ignores an explicit launch that did not create a game roster', () => {
    expect(shouldTrackSeasonReset('classic', false)).toBe(false)
  })
})
