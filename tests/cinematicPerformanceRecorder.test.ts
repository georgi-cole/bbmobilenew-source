// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

type RecorderReport = {
  summary: {
    routeExits: number
    backgroundTransitions: number
    foregroundTransitions: number
  }
  records: Array<{ kind: string; outcome?: string }>
}

type RecorderWindow = Window & {
  __presentationPerf?: {
    start: (label: string) => void
    stop: () => RecorderReport
  }
}

describe('cinematic performance recorder', () => {
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
    recorder?.start('coverage-test')

    const root = document.createElement('section')
    root.dataset.presentationRoot = 'credits'
    const nestedRoot = document.createElement('div')
    nestedRoot.dataset.presentationRoot = 'credits-overlay'
    root.append(nestedRoot)
    document.body.append(root)
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const previousUrl = window.location.href
    window.history.pushState({}, '', '/presentation-route-exit')
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

    window.history.replaceState({}, '', previousUrl)
    window.close()
  })
})
