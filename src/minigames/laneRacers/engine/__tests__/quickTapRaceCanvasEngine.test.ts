import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuickTapRaceCanvasEngine } from '../quickTapRaceCanvasEngine'
import type { QuickTapRaceRuntimeState } from '../types'

vi.mock('../renderBackground', () => ({ drawBackground: vi.fn() }))
vi.mock('../renderEffects', () => ({ drawEffects: vi.fn() }))
vi.mock('../renderRacers', () => ({ drawRacers: vi.fn() }))
vi.mock('../renderTrack', () => ({ drawTrack: vi.fn() }))
vi.mock('../renderUi', () => ({ drawUiOverlays: vi.fn() }))

function createCanvas(): HTMLCanvasElement {
  const context = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  }
  return {
    width: 360,
    height: 620,
    getContext: () => context,
  } as unknown as HTMLCanvasElement
}

describe('Lane Racers canvas timing and lifecycle', () => {
  let nextFrameId = 1
  let frames = new Map<number, FrameRequestCallback>()

  afterEach(() => {
    frames.clear()
    vi.restoreAllMocks()
  })

  function installAnimationFrames() {
    nextFrameId = 1
    frames = new Map()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId++
      frames.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
  }

  function createEngine() {
    return new QuickTapRaceCanvasEngine(createCanvas(), {
      seed: 42,
      raceDurationMs: 10_000,
      racers: [{ id: 'human', name: 'Player', isPlayer: true, color: '#fff' }],
      onFinish: vi.fn(),
    })
  }

  it('stops scheduling frames while paused and resumes with a fresh clock origin', () => {
    installAnimationFrames()
    const engine = createEngine()

    engine.start()
    expect(frames.size).toBe(1)

    engine.pause()
    expect(frames.size).toBe(0)

    engine.resume()
    expect(frames.size).toBe(1)
    engine.destroy()
    expect(frames.size).toBe(0)
  })

  it('keeps the race clock accurate across a stalled frame while bounding physics work', () => {
    installAnimationFrames()
    const engine = createEngine()
    const runtime = engine as unknown as {
      state: QuickTapRaceRuntimeState
      lastFrameTime: number
      tick: (timestamp: number) => void
    }
    runtime.state.phase = 'active'
    runtime.lastFrameTime = 100

    runtime.tick(1_100)

    expect(runtime.state.elapsedMs).toBe(1_000)
    expect(runtime.state.simulationElapsedMs).toBe(50)
    engine.destroy()
  })

  it('does not schedule another frame after the engine is completed', () => {
    installAnimationFrames()
    const engine = createEngine()
    const runtime = engine as unknown as {
      state: QuickTapRaceRuntimeState
      lastFrameTime: number
      tick: (timestamp: number) => void
    }
    runtime.state.phase = 'completed'
    runtime.lastFrameTime = 100
    engine.start()
    const [frameId, callback] = [...frames.entries()][0]
    frames.delete(frameId)

    callback(116)

    expect(frames.size).toBe(0)
    engine.destroy()
  })
})
