// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

type RecorderReport = {
  summary: {
    routeExits: number
    presentationCycles: number
    backgroundTransitions: number
    foregroundTransitions: number
    skippedPresentations: number
    normallyCompletedPresentations: number
  }
  records: Array<{ kind: string; outcome?: string }>
  segments: Array<{ label: string; durationMs: number; frameSamples: number }>
}

type RecorderWindow = Window & {
  __presentationPerf?: {
    start: (label: string) => void
    beginSegment: (label: string) => void
    endSegment: () => void
    stop: () => RecorderReport
    snapshot: () => { activeEventListeners: number }
  }
}

describe('cinematic performance recorder', () => {
  it.each(['skip', 'normal', 'route-exit'] as const)(
    'classifies %s when a credits scene navigates before unmounting',
    async (outcome) => {
      const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://localhost/#/credits',
        pretendToBeVisual: true,
        runScripts: 'outside-only',
      })
      const { document, window } = dom.window
      Object.defineProperty(document, 'getAnimations', { value: () => [] })
      Object.defineProperty(window.performance, 'getEntriesByType', { value: () => [] })
      runInContext(
        readFileSync('scripts/cinematic-performance/recorder.js', 'utf8'),
        dom.getInternalVMContext()
      )
      const recorder = (window as RecorderWindow).__presentationPerf
      try {
        recorder?.start('credits-navigation')
        const root = document.createElement('section')
        root.dataset.presentationRoot = 'credits'
        const track = document.createElement('div')
        track.dataset.presentationRoot = 'nested-track'
        const video = document.createElement('video')
        const skip = document.createElement('button')
        skip.textContent = 'Skip credits'
        track.append(video, skip)
        root.append(track)
        document.body.append(root)
        await new Promise((resolve) => window.setTimeout(resolve, 0))
        if (outcome === 'skip') {
          skip.click()
          video.dispatchEvent(new window.Event('ended'))
        }
        if (outcome === 'normal') {
          video.dispatchEvent(new window.Event('ended'))
          skip.click()
        }
        window.history.pushState({}, '', '#/')
        if (outcome === 'route-exit') {
          video.dispatchEvent(new window.Event('ended'))
          skip.click()
        }
        root.remove()
        await new Promise((resolve) => window.setTimeout(resolve, 0))
        const report = recorder?.stop()
        expect(report?.summary.presentationCycles).toBe(1)
        expect(report?.summary.skippedPresentations).toBe(outcome === 'skip' ? 1 : 0)
        expect(report?.summary.normallyCompletedPresentations).toBe(outcome === 'normal' ? 1 : 0)
        expect(report?.summary.routeExits).toBe(outcome === 'route-exit' ? 1 : 0)
        expect(
          report?.records.find((record) => record.kind === 'presentation-unmounted')?.outcome
        ).toBe(outcome)
      } finally {
        window.close()
      }
    }
  )

  it('records route exits and a background/resume cycle', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
    })
    const { document, window } = dom.window
    Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => [] })
    Object.defineProperty(window.performance, 'getEntriesByType', {
      configurable: true,
      value: () => [],
    })
    const source = readFileSync('scripts/cinematic-performance/recorder.js', 'utf8')
    runInContext(source, dom.getInternalVMContext())

    const recorder = (window as RecorderWindow).__presentationPerf
    expect(recorder).toBeDefined()
    const initialListeners = recorder?.snapshot().activeEventListeners ?? 0
    const listener = () => {}
    const abort = new window.AbortController()
    window.addEventListener('recorder-test', listener, { signal: abort.signal })
    expect(recorder?.snapshot().activeEventListeners).toBe(initialListeners + 1)
    abort.abort()
    expect(recorder?.snapshot().activeEventListeners).toBe(initialListeners)
    window.addEventListener('recorder-test', listener, { once: true })
    window.dispatchEvent(new window.Event('recorder-test'))
    expect(recorder?.snapshot().activeEventListeners).toBe(initialListeners)
    recorder?.start('coverage-test')
    recorder?.beginSegment('gameplay-before')
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    recorder?.endSegment()

    const root = document.createElement('section')
    root.dataset.presentationRoot = 'credits'
    const nestedRoot = document.createElement('div')
    nestedRoot.dataset.presentationRoot = 'credits-overlay'
    root.append(nestedRoot)
    document.body.append(root)
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const previousUrl = window.location.href
    window.history.pushState({}, '', '#/presentation-route-exit')
    root.remove()
    await new Promise((resolve) => window.setTimeout(resolve, 300))

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new window.Event('visibilitychange'))
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new window.Event('visibilitychange'))

    const report = recorder?.stop()
    expect(report?.summary.routeExits).toBe(1)
    expect(report?.summary.presentationCycles).toBe(1)
    expect(report?.summary.backgroundTransitions).toBe(1)
    expect(report?.summary.foregroundTransitions).toBe(1)
    expect(
      report?.records.find((record) => record.kind === 'presentation-unmounted')?.outcome
    ).toBe('route-exit')
    expect(report?.segments).toHaveLength(1)
    expect(report?.segments[0].label).toBe('gameplay-before')
    expect(report?.segments[0].durationMs).toBeGreaterThanOrEqual(40)
    expect(report?.segments[0].frameSamples).toBeGreaterThan(0)

    window.history.replaceState({}, '', previousUrl)
    window.close()
  })
})
