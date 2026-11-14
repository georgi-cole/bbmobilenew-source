import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  applyLaunchRotation: vi.fn(),
  registerPlugin: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: mocks.getPlatform },
  registerPlugin: mocks.registerPlugin.mockReturnValue({
    applyLaunchRotation: mocks.applyLaunchRotation,
  }),
}))

import {
  applyStoryIconRotation,
  resetStoryIconRotationForNextActivation,
} from '../../src/services/storyIconRotation'

let fakeNow = 2_000_000

describe('paused foreground story icon rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fakeNow += 10_000
    vi.setSystemTime(fakeNow)
    mocks.getPlatform.mockClear()
    mocks.applyLaunchRotation.mockClear()
    resetStoryIconRotationForNextActivation()
    mocks.getPlatform.mockReturnValue('android')
    mocks.applyLaunchRotation.mockResolvedValue({ stage: 2 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing in a browser build', async () => {
    mocks.getPlatform.mockReturnValue('web')

    await expect(applyStoryIconRotation(true)).resolves.toBeNull()
    expect(mocks.applyLaunchRotation).not.toHaveBeenCalled()
  })

  it('keeps the iOS icon unchanged across launches and foreground activations', async () => {
    mocks.getPlatform.mockReturnValue('ios')

    await expect(applyStoryIconRotation(true)).resolves.toBeNull()
    resetStoryIconRotationForNextActivation()
    vi.advanceTimersByTime(10_000)
    await expect(applyStoryIconRotation(false)).resolves.toBeNull()
    expect(mocks.applyLaunchRotation).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'leaves Android aliases unchanged with remote switch %s',
    async (enabled) => {
      await expect(applyStoryIconRotation(enabled)).resolves.toBeNull()
      expect(mocks.applyLaunchRotation).not.toHaveBeenCalled()
    }
  )

  it('keeps the existing alias through repeated launches and foreground activations', async () => {
    for (const enabled of [true, false, true, true]) {
      await expect(applyStoryIconRotation(enabled)).resolves.toBeNull()
      resetStoryIconRotationForNextActivation()
      vi.advanceTimersByTime(10_000)
    }
    expect(mocks.applyLaunchRotation).not.toHaveBeenCalled()
  })

  it('does not register a native launcher bridge during module initialization', () => {
    expect(mocks.registerPlugin).not.toHaveBeenCalled()
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
