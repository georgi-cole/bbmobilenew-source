import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLAYER_SAFETY_KEY,
  acknowledgeGuardianPlayPermission,
  ageBandForAge,
  canPlayWithSafety,
  canUseAdultServices,
  canUseOptionalFeature,
  declarePlayerAge,
  getPlayerSafety,
  reconcileProfileAge,
  setOptionalPlayerFeature,
  subscribePlayerSafety,
  withdrawGuardianPlayPermission,
} from '../playerSafety'
import { requestVerifiedParentalConsent } from '../parentalConsent'
import { installSafetyFixture } from './safetyFixture'

describe('player admission policy', () => {
  beforeEach(() => {
    installSafetyFixture()
    vi.stubEnv('VITE_GAME_MINIMUM_AGE', '13')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it.each([undefined, 'invalid', '18'])(
    'defaults an unreviewed or adult release to 18+ (%s)',
    (minimum) => {
      vi.stubEnv('VITE_GAME_MINIMUM_AGE', minimum)
      declarePlayerAge(17)
      acknowledgeGuardianPlayPermission()
      expect(canPlayWithSafety()).toBe(false)
    }
  )

  it('respects a reviewed 16+ minimum regardless of parental permission', () => {
    vi.stubEnv('VITE_GAME_MINIMUM_AGE', '16')
    declarePlayerAge(15)
    acknowledgeGuardianPlayPermission()
    expect(canPlayWithSafety()).toBe(false)
    installSafetyFixture(16)
    acknowledgeGuardianPlayPermission()
    expect(canPlayWithSafety()).toBe(true)
  })

  it.each([
    [0, 'under13'],
    [12, 'under13'],
    [13, '13to15'],
    [15, '13to15'],
    [16, '16to17'],
    [17, '16to17'],
    [18, 'adult'],
    [120, 'adult'],
  ])('classifies age %s as %s', (age, band) => expect(ageBandForAge(age)).toBe(band))
  it.each(['', ' ', 'unknown', -1, 121, 13.5, null, undefined, {}, true])(
    'rejects invalid age %s',
    (age) => expect(declarePlayerAge(age)).toBe(false)
  )

  it('gives unknown players no admission or optional services', () => {
    expect(canPlayWithSafety()).toBe(false)
    expect(canUseAdultServices()).toBe(false)
    expect(canUseOptionalFeature('location')).toBe(false)
  })

  it('never upgrades an under-13 declaration through a checkbox, older age, or record deletion', async () => {
    declarePlayerAge(11)
    acknowledgeGuardianPlayPermission()
    declarePlayerAge(28)
    expect(canPlayWithSafety()).toBe(false)
    expect(getPlayerSafety()?.ageBand).toBe('under13')
    localStorage.removeItem(PLAYER_SAFETY_KEY)
    expect(canPlayWithSafety()).toBe(false)
    await expect(requestVerifiedParentalConsent()).rejects.toThrow(/not available/)
    expect(canPlayWithSafety()).toBe(false)
  })

  it('retains the child restriction after a new module loads persisted state', async () => {
    declarePlayerAge(12)
    vi.resetModules()
    const reloaded = await import('../playerSafety')
    reloaded.declarePlayerAge(30)
    expect(reloaded.canPlayWithSafety()).toBe(false)
  })

  it('ignores invented local verification approvals', () => {
    localStorage.setItem(
      PLAYER_SAFETY_KEY,
      JSON.stringify({
        version: 1,
        ageBand: 'under13',
        guardianPlayPermission: true,
        verified: true,
        parentalConsent: 'verified',
        optionalFeatures: { location: true, ads: true },
      })
    )
    expect(canPlayWithSafety()).toBe(false)
    expect(canUseOptionalFeature('location')).toBe(false)
  })

  it('permits teen local play only after household permission and denies optional processing', () => {
    declarePlayerAge(15)
    expect(canPlayWithSafety()).toBe(false)
    acknowledgeGuardianPlayPermission()
    expect(canPlayWithSafety()).toBe(true)
    for (const feature of ['location', 'analytics', 'onlineServices', 'ads'] as const) {
      setOptionalPlayerFeature(feature, true)
      expect(canUseOptionalFeature(feature)).toBe(false)
    }
    declarePlayerAge(25)
    expect(canUseAdultServices()).toBe(false)
    withdrawGuardianPlayPermission()
    expect(canPlayWithSafety()).toBe(false)
  })

  it('requires separate optional choices for adults and revokes them when a lower profile age is found', () => {
    declarePlayerAge(18)
    expect(canPlayWithSafety()).toBe(true)
    expect(canUseOptionalFeature('location')).toBe(false)
    setOptionalPlayerFeature('location', true)
    expect(canUseOptionalFeature('location')).toBe(true)
    expect(canUseOptionalFeature('analytics')).toBe(false)
    reconcileProfileAge('12-14')
    expect(canPlayWithSafety()).toBe(false)
    expect(canUseOptionalFeature('location')).toBe(false)
  })

  it('does not infer admission from a legacy adult or missing profile age', () => {
    reconcileProfileAge('mid-20s')
    reconcileProfileAge(undefined)
    expect(canPlayWithSafety()).toBe(false)
    reconcileProfileAge('0')
    expect(getPlayerSafety()?.ageBand).toBe('under13')
  })

  it('rejects corrupt and unsupported records', () => {
    localStorage.setItem(PLAYER_SAFETY_KEY, '{invalid')
    expect(canPlayWithSafety()).toBe(false)
    localStorage.setItem(PLAYER_SAFETY_KEY, JSON.stringify({ version: 2, ageBand: 'adult' }))
    expect(canPlayWithSafety()).toBe(false)
  })

  it('revokes adult admission if its stored record becomes unreadable', () => {
    declarePlayerAge(28)
    localStorage.setItem(PLAYER_SAFETY_KEY, '{invalid')
    expect(canPlayWithSafety()).toBe(false)
  })

  it('fails closed on adult storage failures but retains an in-memory child lock', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(declarePlayerAge(30)).toBe(false)
    expect(canPlayWithSafety()).toBe(false)
    declarePlayerAge(11)
    expect(canPlayWithSafety()).toBe(false)
    expect(getPlayerSafety()?.ageBand).toBe('under13')
    vi.restoreAllMocks()
  })

  it('notifies active tabs and respects a lower age declared elsewhere', () => {
    declarePlayerAge(30)
    const listener = vi.fn()
    const unsubscribe = subscribePlayerSafety(listener)
    localStorage.setItem(PLAYER_SAFETY_KEY, JSON.stringify({ version: 1, ageBand: 'under13' }))
    window.dispatchEvent(new StorageEvent('storage', { key: PLAYER_SAFETY_KEY }))
    expect(listener).toHaveBeenCalledOnce()
    expect(canPlayWithSafety()).toBe(false)
    unsubscribe()
  })
})
