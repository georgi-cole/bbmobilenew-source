import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  applyLaunchRotation: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: () => ({ applyLaunchRotation: mocks.applyLaunchRotation }),
}))

import {
  applyStoryIconRotation,
  resetStoryIconRotationForNextActivation,
} from '../../src/services/storyIconRotation'

let fakeNow = 2_000_000

describe('story icon rotation bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fakeNow += 10_000
    vi.setSystemTime(fakeNow)
    vi.clearAllMocks()
    resetStoryIconRotationForNextActivation()
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.applyLaunchRotation.mockResolvedValue({ stage: 2 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing in a browser build', async () => {
    mocks.isNativePlatform.mockReturnValue(false)

    await expect(applyStoryIconRotation(true)).resolves.toBeNull()
    expect(mocks.applyLaunchRotation).not.toHaveBeenCalled()
  })

  it('forwards the remote enable switch to the native plugin', async () => {
    await expect(applyStoryIconRotation(false)).resolves.toBe(2)
    expect(mocks.applyLaunchRotation).toHaveBeenCalledWith({ enabled: false })
  })

  it('advances at most once per foreground activation', async () => {
    await applyStoryIconRotation(true)
    await applyStoryIconRotation(true)
    expect(mocks.applyLaunchRotation).toHaveBeenCalledTimes(1)

    resetStoryIconRotationForNextActivation()
    vi.advanceTimersByTime(5000)
    await applyStoryIconRotation(true)
    expect(mocks.applyLaunchRotation).toHaveBeenCalledTimes(2)
  })

  it('keeps the selected eight-image source order and all bundled artwork', () => {
    const progressionDirectory = resolve(process.cwd(), 'store-assets/icon-progression')
    const sequence = JSON.parse(
      readFileSync(resolve(progressionDirectory, 'sequence.json'), 'utf8')
    ) as {
      sourceOrder: number[]
      stages: Array<{ source: number; file: string }>
    }

    expect(sequence.sourceOrder).toEqual([7, 2, 1, 8, 3, 4, 5, 6])
    expect(sequence.stages.map((stage) => stage.source)).toEqual(sequence.sourceOrder)
    expect(sequence.stages).toHaveLength(8)
    expect(
      sequence.stages.every((stage) => existsSync(resolve(progressionDirectory, stage.file)))
    ).toBe(true)
  })
})
