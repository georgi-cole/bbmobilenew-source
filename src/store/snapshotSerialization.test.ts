import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareSnapshotJson, takePreparedSnapshotJson } from './snapshotSerialization'
import {
  saveRunSnapshot,
  loadSavedRunProfile,
  type SavedSeasonSnapshot,
} from './saveStatePersistence'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage?: (event: MessageEvent) => void
  onerror?: () => void
  onmessageerror?: () => void
  messages: Array<{ id: number; snapshot: object }> = []
  terminate = vi.fn()
  constructor() {
    TestWorker.instances.push(this)
  }
  postMessage(message: { id: number; snapshot: object }) {
    this.messages.push(message)
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  TestWorker.instances = []
})
describe('background snapshot serialization', () => {
  it('persists and resumes the worker result without stringifying the campaign again', async () => {
    vi.stubGlobal('Worker', TestWorker)
    const snapshot = {
      version: 1,
      profileId: 'worker-profile',
      savedAt: new Date().toISOString(),
      game: {
        mode: 'classic',
        week: 8,
        status: 'active',
        runId: 'worker-run',
        gameId: 'worker-run',
        players: [],
      },
      social: {},
      finale: {},
    } as unknown as SavedSeasonSnapshot
    const json = JSON.stringify(snapshot),
      done = prepareSnapshotJson(snapshot),
      worker = TestWorker.instances[0]
    worker.onmessage?.({ data: { id: worker.messages[0].id, json } } as MessageEvent)
    await done
    const stringify = vi.spyOn(JSON, 'stringify')
    try {
      expect(saveRunSnapshot('worker-profile', snapshot)).toBe(true)
      expect(stringify.mock.calls.some(([value]) => value === snapshot)).toBe(false)
      expect(loadSavedRunProfile('worker-profile').runs.classic?.game.week).toBe(8)
    } finally {
      stringify.mockRestore()
    }
  })
  it('takes the prepared JSON once and releases the idle worker', async () => {
    vi.stubGlobal('Worker', TestWorker)
    const snapshot = { version: 1, game: { day: 8 }, social: { text: '🎭' } }
    const done = prepareSnapshotJson(snapshot),
      worker = TestWorker.instances[0]
    const { id } = worker.messages[0]
    worker.onmessage?.({ data: { id, json: JSON.stringify(snapshot) } } as MessageEvent)
    await done
    expect(takePreparedSnapshotJson(snapshot)).toBe(JSON.stringify(snapshot))
    expect(takePreparedSnapshotJson(snapshot)).toBeUndefined()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it('bounds queued work and releases every request after a failure or timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Worker', TestWorker)
    const jobs = Array.from({ length: 8 }, () => prepareSnapshotJson({ game: { day: 30 } }))
    expect(TestWorker.instances[0].messages).toHaveLength(4)
    await vi.advanceTimersByTimeAsync(5000)
    await Promise.all(jobs)
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    const next = prepareSnapshotJson({})
    TestWorker.instances[1].onerror?.()
    await next
    expect(TestWorker.instances[1].terminate).toHaveBeenCalledOnce()
  })
})
