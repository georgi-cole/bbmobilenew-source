import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureStore, type Middleware } from '@reduxjs/toolkit'
import {
  clearGamePerformanceSamples,
  getGamePerformanceSnapshot,
  recordGamePerformanceAction,
  recordGamePerformanceMarker,
  recordGameRender,
  gameStoreUpdatePerformanceMiddleware,
  profileGameMiddleware,
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

    for (let index = 0; index < 3_005; index += 1) {
      recordGamePerformanceAction(`test/action-${index}`, index, {})
    }

    const snapshot = getGamePerformanceSnapshot()
    expect(snapshot.totalSamples).toBeGreaterThan(3_000)
    expect(snapshot.samples).toHaveLength(3_000)
    expect(snapshot.metrics.reduxActionP95Ms).toBe(2_857)
    expect(snapshot.samples.at(-1)).toMatchObject({ action: 'test/action-3004' })
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

  it('records jury stages and render costs only while diagnostics are enabled', () => {
    recordGamePerformanceMarker('tribunal-stage', { stage: 'clues' })
    expect(getGamePerformanceSnapshot().juryEvents).toEqual([])
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    expect(startGamePerformanceDiagnostics(true)).toBe(true)

    recordGamePerformanceMarker('tribunal-stage', { stage: 'recap', pendingTimers: 1 })
    recordGameRender('tribunal-finale', 'update', 42, 80, 10, 52)

    expect(getGamePerformanceSnapshot()).toMatchObject({
      juryEvents: [{ name: 'tribunal-stage', detail: { stage: 'recap', pendingTimers: 1 } }],
      samples: [
        {
          kind: 'react-render',
          component: 'tribunal-finale',
          durationMs: 42,
          baseDurationMs: 80,
        },
      ],
    })
  })

  it('separates the core store update from the full dispatch timing', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    expect(startGamePerformanceDiagnostics(true)).toBe(true)
    const store = configureStore({
      reducer: (value = 0, action: { type: string }) =>
        action.type === 'increment' ? value + 1 : value,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(gameStoreUpdatePerformanceMiddleware),
    })

    store.dispatch({ type: 'increment' })

    expect(getGamePerformanceSnapshot().samples).toEqual([
      expect.objectContaining({ kind: 'store-update', action: 'increment' }),
    ])
  })

  it('profiles phase middleware without changing the action or resulting state', () => {
    const originalUrl = window.location.href
    window.history.replaceState({}, '', '?debugPerformance=1')
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    expect(startGamePerformanceDiagnostics(true)).toBe(true)
    const visited: string[] = []
    const middleware: Middleware = () => (next) => (action) => {
      visited.push((action as { type: string }).type)
      return next(action)
    }
    const store = configureStore({
      reducer: (value = 0, action: { type: string }) =>
        action.type === 'game/advance' ? value + 1 : value,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(profileGameMiddleware('example', middleware)),
    })

    store.dispatch({ type: 'game/advance' })

    expect(store.getState()).toBe(1)
    expect(visited).toEqual(['game/advance'])
    expect(getGamePerformanceSnapshot().samples).toEqual([
      expect.objectContaining({
        kind: 'middleware-step',
        action: 'game/advance',
        middleware: 'example',
      }),
    ])
    window.history.replaceState({}, '', originalUrl)
  })
})
