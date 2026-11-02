import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureProductTelemetry,
  readBufferedProductEvents,
  trackProductEvent,
  subscribeProductEvents,
} from '../../src/services/liveOps/productTelemetry'

describe('product telemetry', () => {
  beforeEach(() => sessionStorage.clear())

  it('buffers sampled privacy-safe product events without requiring a collector', () => {
    configureProductTelemetry({ enabled: true, samplePercentage: 100 })
    trackProductEvent('game_phase_view', { phase: 'social_1', week: 2 })

    expect(readBufferedProductEvents()).toEqual([
      expect.objectContaining({
        name: 'game_phase_view',
        properties: { phase: 'social_1', week: 2 },
      }),
    ])
  })

  it('does not collect events when operations telemetry is disabled', () => {
    configureProductTelemetry({ enabled: false, samplePercentage: 100 })
    trackProductEvent('screen_view', { route: '#/game' })
    expect(readBufferedProductEvents()).toEqual([])
  })

  it('preserves explicit guest attribution separately from an unspecified profile', () => {
    const observer = vi.fn()
    const unsubscribe = subscribeProductEvents(observer)
    trackProductEvent('screen_view', { screen_id: 'game' }, null)
    trackProductEvent('screen_view', { screen_id: 'game' })
    expect(observer.mock.calls[0][1]).toBeNull()
    expect(observer.mock.calls[1][1]).toBeUndefined()
    unsubscribe()
  })
})
