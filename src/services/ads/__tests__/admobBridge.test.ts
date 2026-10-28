import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installSafetyFixture } from '../../../safety/__tests__/safetyFixture'
import { setOptionalPlayerFeature } from '../../../safety/playerSafety'
import { resolveAdMobConfig } from '../admobConfig'

const mock = vi.hoisted(() => ({
  native: true,
  handlers: new Map<string, (...args: unknown[]) => void>(),
  initialize: vi.fn(),
  consent: vi.fn(),
  form: vi.fn(),
  prepare: vi.fn(),
  show: vi.fn(),
  remove: vi.fn(),
  privacy: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mock.native,
    getPlatform: () => 'ios',
  },
}))
vi.mock('@capacitor-community/admob', () => ({
  AdMob: {
    initialize: mock.initialize,
    requestConsentInfo: mock.consent,
    showConsentForm: mock.form,
    showPrivacyOptionsForm: mock.privacy,
    prepareRewardVideoAd: mock.prepare,
    prepareInterstitial: mock.prepare,
    showRewardVideoAd: mock.show,
    showInterstitial: mock.show,
    addListener: vi.fn(async (event: string, handler: (...args: unknown[]) => void) => {
      mock.handlers.set(event, handler)
      return {
        remove: async () => {
          mock.handlers.delete(event)
          mock.remove()
        },
      }
    }),
  },
  MaxAdContentRating: { Teen: 'Teen' },
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  RewardAdPluginEvents: { Rewarded: 'earned', Dismissed: 'closed', FailedToShow: 'failed' },
  InterstitialAdPluginEvents: { Dismissed: 'closed', FailedToShow: 'failed' },
}))

describe('native AdMob integration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mock.handlers.clear()
    mock.native = true
    mock.prepare.mockResolvedValue({})
    mock.initialize.mockResolvedValue(undefined)
    mock.show.mockImplementation(() => new Promise(() => {}))
    mock.consent.mockResolvedValue({ canRequestAds: true, status: 'NOT_REQUIRED' })
    mock.privacy.mockResolvedValue(undefined)
    installSafetyFixture(28, ['ads'])
    vi.stubEnv('VITE_ADMOB_MODE', 'test')
  })
  afterEach(() => {
    delete window.GameAds
    vi.unstubAllEnvs()
  })

  async function install() {
    const { installAdMobBridge } = await import('../admobBridge')
    installAdMobBridge()
  }

  it('never installs on web or when advertising is disabled', async () => {
    mock.native = false
    await install()
    expect(window.GameAds).toBeUndefined()
    mock.native = true
    vi.stubEnv('VITE_ADMOB_MODE', 'off')
    await install()
    expect(window.GameAds).toBeUndefined()
    expect(mock.initialize).not.toHaveBeenCalled()
  })

  it('installs without initializing the SDK and requires the adult advertising choice', async () => {
    await install()
    expect(mock.initialize).not.toHaveBeenCalled()
    setOptionalPlayerFeature('ads', false)
    expect(await window.GameAds!.showRewarded('competition_retry')).toBe(false)
    expect(mock.initialize).not.toHaveBeenCalled()
  })

  it('does not treat dismissal as a reward and releases the native slot', async () => {
    await install()
    const result = window.GameAds!.showRewarded('competition_retry')
    await vi.waitFor(() => expect(mock.show).toHaveBeenCalledOnce())
    expect(await window.GameAds!.showRewarded('social_energy_recharge')).toBe(false)
    mock.handlers.get('closed')!()
    expect(await result).toBe(false)
    expect(mock.remove).toHaveBeenCalledTimes(3)
    expect(mock.handlers.size).toBe(0)
  })

  it('requires the SDK earned event and waits for dismissal before allowing another ad', async () => {
    await install()
    const result = window.GameAds!.showRewarded('competition_retry')
    await vi.waitFor(() => expect(mock.show).toHaveBeenCalledOnce())
    mock.handlers.get('earned')!()
    expect(await window.GameAds!.showInterstitial('live_vote_auto')).toBe(false)
    mock.handlers.get('closed')!()
    expect(await result).toBe(true)
    expect(mock.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ adId: 'ca-app-pub-3940256099942544/1712485313', isTesting: true })
    )
  })

  it('cancels a loaded ad when the local advertising choice is withdrawn', async () => {
    mock.prepare.mockImplementationOnce(async () => {
      setOptionalPlayerFeature('ads', false)
    })
    await install()
    expect(await window.GameAds!.showRewarded('competition_retry')).toBe(false)
    expect(mock.show).not.toHaveBeenCalled()
  })

  it('rechecks eligibility after loading so a new No Ads purchase suppresses a pending break', async () => {
    let eligible = true
    const { installAdMobBridge } = await import('../admobBridge')
    installAdMobBridge(() => eligible)
    mock.prepare.mockImplementationOnce(async () => {
      eligible = false
    })
    expect(await window.GameAds!.showInterstitial('live_vote_auto')).toBe(false)
    expect(mock.show).not.toHaveBeenCalled()
  })

  it('does not present an old run’s pending ad after changing seasons', async () => {
    const { installAdMobBridge, invalidateAdMobRequests } = await import('../admobBridge')
    installAdMobBridge()
    mock.prepare.mockImplementationOnce(async () => {
      invalidateAdMobRequests()
    })
    expect(await window.GameAds!.showRewarded('competition_retry')).toBe(false)
    expect(mock.show).not.toHaveBeenCalled()
  })

  it('requests UMP permission before initializing a live SDK', async () => {
    vi.stubEnv('VITE_ADMOB_MODE', 'live')
    vi.stubEnv('VITE_ADMOB_INTERSTITIAL_ID', 'ca-app-pub-9243398419153145/1852027238')
    vi.stubEnv('VITE_ADMOB_REWARDED_ID', 'ca-app-pub-9243398419153145/2733864063')
    mock.consent.mockResolvedValue({
      canRequestAds: false,
      status: 'REQUIRED',
      isConsentFormAvailable: true,
    })
    mock.form.mockResolvedValue({ canRequestAds: false })
    await install()
    expect(await window.GameAds!.showRewarded('competition_retry')).toBe(false)
    expect(mock.consent).toHaveBeenCalledOnce()
    expect(mock.form).toHaveBeenCalledOnce()
    expect(mock.initialize).not.toHaveBeenCalled()
    expect(mock.prepare).not.toHaveBeenCalled()
  })

  it('uses demo units in test mode even when live IDs exist, and rejects incomplete live config', () => {
    expect(resolveAdMobConfig('ios', { VITE_ADMOB_MODE: 'live' })).toBeNull()
    expect(
      resolveAdMobConfig('android', {
        VITE_ADMOB_MODE: 'test',
        VITE_ADMOB_REWARDED_ID: 'a-live-id',
      })?.rewardedId
    ).toBe('ca-app-pub-3940256099942544/5224354917')
  })

  it('opens Google privacy choices after local opt-out without initializing advertising', async () => {
    vi.stubEnv('VITE_ADMOB_MODE', 'live')
    vi.stubEnv('VITE_ADMOB_INTERSTITIAL_ID', 'ca-app-pub-9243398419153145/1852027238')
    vi.stubEnv('VITE_ADMOB_REWARDED_ID', 'ca-app-pub-9243398419153145/2733864063')
    setOptionalPlayerFeature('ads', false)
    const { openAdMobPrivacyOptions } = await import('../admobBridge')
    await openAdMobPrivacyOptions()
    expect(mock.consent).toHaveBeenCalledOnce()
    expect(mock.privacy).toHaveBeenCalledOnce()
    expect(mock.initialize).not.toHaveBeenCalled()
  })
})
