import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearGamePerformanceSamples,
  getGamePerformanceSnapshot,
  recordGamePerformanceAction,
  startGamePerformanceDiagnostics,
  stopGamePerformanceDiagnostics,
} from '../gamePerformanceDiagnostics'

describe('opt-in game performance diagnostics', () => {
  afterEach(() => {
    stopGamePerformanceDiagnostics()
    clearGamePerformanceSamples()
    vi.restoreAllMocks()
  })

  it('keeps a bounded recent sample window and exposes p95 timings', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    expect(startGamePerformanceDiagnostics(true)).toBe(true)

    for (let index = 0; index < 305; index += 1) {
      recordGamePerformanceAction(`test/action-${index}`, index, {})
    }

    const snapshot = getGamePerformanceSnapshot()
    expect(snapshot.totalSamples).toBeGreaterThan(300)
    expect(snapshot.samples).toHaveLength(300)
    expect(snapshot.metrics.reduxActionP95Ms).toBe(290)
    expect(snapshot.samples.at(-1)).toMatchObject({ action: 'test/action-304' })
  })

  it('does not sample Redux work while the document is hidden', () => {
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    expect(startGamePerformanceDiagnostics(true)).toBe(true)
    recordGamePerformanceAction('test/hidden', 80, {})

    expect(getGamePerformanceSnapshot()).toMatchObject({ hidden: true, totalSamples: 0 })

    if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor)
    else Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })
})
