import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { declarePlayerAge, setOptionalPlayerFeature } from '../playerSafety'
import { optionalPlayerFetch } from '../optionalRequest'
import { installSafetyFixture } from './safetyFixture'
import { resolveTheme } from '../../utils/backgroundTheme'
import {
  configureProductTelemetry,
  readBufferedProductEvents,
  trackProductEvent,
} from '../../services/liveOps/productTelemetry'
import { getBigEyeVipStatus } from '../../services/bigEyeVip'
import { listDiaryWeeks } from '../../services/diaryWeek'
import { submitEnduranceResult } from '../../services/challenges'

describe('optional service data boundaries', () => {
  beforeEach(() => {
    installSafetyFixture()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it.each([undefined, 11, 15, 17])('sends no optional request for player age %s', async (age) => {
    if (age !== undefined) declarePlayerAge(age)
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(
      optionalPlayerFetch('onlineServices', 'https://example.test/diary')
    ).rejects.toThrow()
    await expect(getBigEyeVipStatus('private-season')).rejects.toThrow()
    await expect(listDiaryWeeks('private-season')).rejects.toThrow()
    await expect(
      submitEnduranceResult({ challengeId: 'private-id', elapsed_seconds: 10 })
    ).rejects.toThrow()
    configureProductTelemetry({
      enabled: true,
      samplePercentage: 100,
      endpointUrl: 'https://example.test/measure',
    })
    trackProductEvent('screen_view', { route: '#/game' })
    expect(readBufferedProductEvents()).toEqual([])
    expect(localStorage.getItem('bbmobilenew:vip-installation-id:v1')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires an adult opt-in even when a remote endpoint is configured', async () => {
    declarePlayerAge(28)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: true }))
    await expect(
      optionalPlayerFetch('onlineServices', 'https://example.test/diary')
    ).rejects.toThrow()
    setOptionalPlayerFeature('onlineServices', true)
    await expect(
      optionalPlayerFetch('onlineServices', 'https://example.test/diary')
    ).resolves.toBeInstanceOf(Response)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('aborts a pending request when permission is revoked', async () => {
    installSafetyFixture(28, ['onlineServices'])
    let signal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal ?? undefined
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
    )
    const pending = expect(
      optionalPlayerFetch('onlineServices', 'https://example.test/diary')
    ).rejects.toThrow(/Aborted/)
    setOptionalPlayerFeature('onlineServices', false)
    await pending
    expect(signal?.aborted).toBe(true)
  })

  it('does not request device location for unknown or teen players', async () => {
    const getCurrentPosition = vi.fn()
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await resolveTheme()
    declarePlayerAge(15)
    await resolveTheme()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechecks permission after the device resolves location and before sending coordinates', async () => {
    installSafetyFixture(28, ['location'])
    let callback: PositionCallback | undefined
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) => {
          callback = success
        },
      },
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const pending = resolveTheme()
    await vi.waitFor(() => expect(callback).toBeDefined())
    setOptionalPlayerFeature('location', false)
    callback!({ coords: { latitude: 42, longitude: 23 } } as GeolocationPosition)
    await pending
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('removes buffered analytics after withdrawal and sends no more events', () => {
    installSafetyFixture(28, ['analytics'])
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => true) })
    configureProductTelemetry({
      enabled: true,
      samplePercentage: 100,
      endpointUrl: 'https://example.test/measure',
    })
    trackProductEvent('screen_view', { route: '#/game' })
    expect(navigator.sendBeacon).toHaveBeenCalledOnce()
    expect(readBufferedProductEvents()).toHaveLength(1)
    setOptionalPlayerFeature('analytics', false)
    expect(readBufferedProductEvents()).toEqual([])
    trackProductEvent('screen_view', { route: '#/profile' })
    expect(navigator.sendBeacon).toHaveBeenCalledOnce()
  })
})
