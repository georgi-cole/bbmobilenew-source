import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupRouteAnalytics } from './routeAnalytics'
import { trackProductEvent } from '../liveOps/productTelemetry'

vi.mock('../liveOps/productTelemetry', () => ({ trackProductEvent: vi.fn() }))
vi.mock('./gameplayAnalyticsMiddleware', () => ({ setAnalyticsRouteScreen: vi.fn() }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => vi.useRealTimers())

describe('route attribution', () => {
  it('keeps a guest visit separate when the player creates a profile on the same screen', () => {
    let profile: string | null = null
    let changed = () => undefined as void
    const dispose = setupRouteAnalytics({
      getPathname: () => '/game',
      getProfileId: () => profile,
      subscribeRoute: () => () => undefined,
      subscribeProfile: (listener) => {
        changed = listener
        return () => undefined
      },
    })
    expect(trackProductEvent).toHaveBeenCalledWith(
      'screen_view',
      {
        screen_id: 'game',
        screen_group: 'gameplay',
      },
      null
    )
    vi.advanceTimersByTime(2500)
    profile = 'new-profile'
    changed()
    expect(trackProductEvent).toHaveBeenCalledWith(
      'screen_time',
      {
        screen_id: 'game',
        screen_group: 'gameplay',
        duration_seconds: 2,
      },
      null
    )
    expect(trackProductEvent).toHaveBeenLastCalledWith(
      'screen_view',
      {
        screen_id: 'game',
        screen_group: 'gameplay',
      },
      'new-profile'
    )
    dispose()
  })

  it('records guest screen time without requiring an account', () => {
    const dispose = setupRouteAnalytics({
      getPathname: () => '/account',
      getProfileId: () => null,
      subscribeRoute: () => () => undefined,
      subscribeProfile: () => () => undefined,
    })
    vi.advanceTimersByTime(4000)
    dispose()
    expect(trackProductEvent).toHaveBeenCalledWith(
      'screen_time',
      {
        screen_id: 'account',
        screen_group: 'profiles',
        duration_seconds: 4,
      },
      null
    )
  })
})
