import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAppDistribution } from './appDistribution'

const bridge = vi.hoisted(() => ({
  platform: vi.fn<() => string>(),
  native: vi.fn<() => boolean>(),
  distribution: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: bridge.platform, isNativePlatform: bridge.native },
  registerPlugin: () => ({ getDistribution: bridge.distribution }),
}))

afterEach(() => vi.resetAllMocks())

describe('analytics distribution classification', () => {
  it('keeps browsers distinct from native store activity', async () => {
    bridge.platform.mockReturnValue('web')
    bridge.native.mockReturnValue(false)
    const result = await readAppDistribution('production')
    expect(result.platform).toBe('web')
    expect(result.fields).toMatchObject({
      distribution_channel: 'web',
      traffic_class: 'unclassified',
    })
    expect(bridge.distribution).not.toHaveBeenCalled()
  })

  it.each([
    ['ios', 'production', 'testflight', 'test'],
    ['ios', 'production', 'app_store', 'production'],
    ['android', 'qa', 'google_play', 'test'],
    ['android', 'production', 'google_play', 'production'],
    ['android', 'production', 'sideloaded', 'unclassified'],
  ] as const)('classifies %s, %s, %s as %s', async (platform, environment, channel, traffic) => {
    bridge.platform.mockReturnValue(platform)
    bridge.native.mockReturnValue(true)
    bridge.distribution.mockResolvedValue({
      channel,
      source: 'native',
      version: '1.0.2',
      build: '23',
    })
    const result = await readAppDistribution(environment)
    expect(result).toMatchObject({
      platform,
      appVersion: '1.0.2',
      appBuild: '23',
      fields: { distribution_channel: channel, traffic_class: traffic },
    })
  })

  it('keeps a failed native lookup out of production counts', async () => {
    bridge.platform.mockReturnValue('ios')
    bridge.native.mockReturnValue(true)
    bridge.distribution.mockRejectedValue(new Error('StoreKit unavailable'))
    expect((await readAppDistribution('production')).fields).toMatchObject({
      distribution_channel: 'unknown',
      traffic_class: 'unclassified',
      is_test_install: null,
    })
  })
})
