import { describe, expect, it, vi } from 'vitest'
import { readDeviceAnalyticsContext, type DeviceNavigator } from './deviceContext'

describe('readDeviceAnalyticsContext', () => {
  it('records mobile device and model hints when the browser provides them', async () => {
    const deviceNavigator: DeviceNavigator = {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) Chrome/131.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      userAgentData: {
        brands: [{ brand: 'Google Chrome', version: '131' }],
        mobile: true,
        platform: 'Android',
        getHighEntropyValues: vi.fn().mockResolvedValue({
          model: 'Pixel 9 Pro',
          formFactors: ['Mobile'],
        }),
      },
    }

    await expect(readDeviceAnalyticsContext(deviceNavigator)).resolves.toEqual({
      device_type: 'mobile',
      device_family: 'Android device',
      operating_system: 'Android',
      browser: 'Chrome',
      device_model: 'Pixel 9 Pro',
    })
  })

  it('identifies iPad Safari as a tablet without inventing an exact model', async () => {
    const deviceNavigator: DeviceNavigator = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }

    await expect(readDeviceAnalyticsContext(deviceNavigator)).resolves.toEqual({
      device_type: 'tablet',
      device_family: 'iPad',
      operating_system: 'iPadOS',
      browser: 'Safari',
    })
  })

  it('keeps coarse browser details when high-entropy hints are unavailable', async () => {
    const deviceNavigator: DeviceNavigator = {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
      platform: 'iPhone',
      userAgentData: {
        getHighEntropyValues: vi.fn().mockRejectedValue(new Error('Hints unavailable')),
      },
    }

    await expect(readDeviceAnalyticsContext(deviceNavigator)).resolves.toEqual({
      device_type: 'mobile',
      device_family: 'iPhone',
      operating_system: 'iOS',
      browser: 'Safari',
    })
  })
})
