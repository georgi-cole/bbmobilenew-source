import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCreditsVideoEnabled, isTwinShockVideoPilotEnabled } from './featureFlags'

afterEach(() => vi.unstubAllEnvs())

const buildModes = [
  { label: 'development web', dev: true, mode: 'development', target: 'web-dev' },
  { label: 'release web', dev: false, mode: 'release', target: 'release' },
  { label: 'Android release', dev: false, mode: 'android', target: 'release' },
  { label: 'iPhone release', dev: false, mode: 'ios', target: 'release' },
]

describe('cinematic rollout controls', () => {
  it.each(buildModes)(
    'enables Twin Shock by default in $label without a device-test flag',
    ({ dev, mode, target }) => {
      vi.stubEnv('DEV', dev)
      vi.stubEnv('MODE', mode)
      vi.stubEnv('VITE_BUILD_TARGET', target)
      vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_DEVICE_TEST', undefined)
      vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', undefined)
      expect(isTwinShockVideoPilotEnabled()).toBe(true)
    }
  )

  it.each(buildModes)(
    'retains an explicit Twin Shock rollback in $label',
    ({ dev, mode, target }) => {
      vi.stubEnv('DEV', dev)
      vi.stubEnv('MODE', mode)
      vi.stubEnv('VITE_BUILD_TARGET', target)
      vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'false')
      expect(isTwinShockVideoPilotEnabled()).toBe(false)
      vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'true')
      expect(isTwinShockVideoPilotEnabled()).toBe(true)
    }
  )

  it('disables credits independently of Twin Shock', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', undefined)
    vi.stubEnv('VITE_FEATURE_CREDITS_VIDEO', 'false')
    expect(isCreditsVideoEnabled()).toBe(false)
    expect(isTwinShockVideoPilotEnabled()).toBe(true)
  })

  it('disables Twin Shock independently of credits', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'false')
    vi.stubEnv('VITE_FEATURE_CREDITS_VIDEO', undefined)
    expect(isTwinShockVideoPilotEnabled()).toBe(false)
    expect(isCreditsVideoEnabled()).toBe(true)
  })
})
