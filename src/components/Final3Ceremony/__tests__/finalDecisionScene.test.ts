import { fireEvent, within } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountFinalDecision, type FinalDecisionController } from '../finalDecisionScene.mjs'

const mounted: Array<{ root: HTMLElement; controller: FinalDecisionController }> = []
function mount(
  reducedMotion = true,
  initiallyPaused = false,
  firstPlea = 'Give me one last chance.'
) {
  const root = document.createElement('div')
  root.id = 'final-decision-scene'
  document.body.appendChild(root)
  const onDecision = vi.fn()
  const onComplete = vi.fn()
  const onCue = vi.fn()
  const controller = mountFinalDecision(root, {
    sceneId: 'controller-test',
    preview: false,
    reducedMotion,
    initiallyPaused,
    fixture: {
      holder: { id: 'human', name: 'Season holder' },
      nominees: [
        {
          id: 'aria',
          name: 'Aria',
          assetKey: 'nominee-a',
          plea: firstPlea,
          comparison: 'An alliance was part of your season.',
        },
        {
          id: 'dex',
          name: 'Dex',
          assetKey: 'nominee-b',
          plea: 'Let my story continue.',
          comparison: 'Trust was broken during the season.',
        },
      ],
    },
    assets: {},
    monitor: {
      aspectRatio: 1923 / 818,
      screen: { x: 0.071, y: 0.165, width: 0.858, height: 0.642 },
    },
    onDecision,
    onComplete,
    onCue,
    onCheckpoint: vi.fn(),
  })
  mounted.push({ root, controller })
  return { root, controller, onDecision, onComplete, onCue, view: within(root) }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  mounted.splice(0).forEach(({ root, controller }) => {
    controller.dispose()
    root.remove()
  })
  vi.useRealTimers()
})

describe('final decision presentation contract', () => {
  it('starts the ceremony automatically without duplicate playback UI or floating name tags', () => {
    const { controller, view, root, onCue } = mount()
    expect(controller.getState().stage).toBe('establish')
    expect(view.queryByRole('button', { name: /Begin|Pause|Resume|Skip/i })).toBeNull()
    expect(root.querySelector('.fd-nameplates')).toBeNull()
    expect(onCue).toHaveBeenCalledWith({ cue: 'decision:begin', sceneId: 'controller-test' })
    expect(onCue.mock.calls.filter(([event]) => event.cue === 'decision:begin')).toHaveLength(1)
    vi.advanceTimersByTime(500)
    expect(controller.getState().stage).toBe('plea-a')
  })

  it('waits for presentation ownership before advancing an automatically started scene', () => {
    const { controller } = mount(true, true)
    vi.advanceTimersByTime(10_000)
    expect(controller.getState()).toMatchObject({
      stage: 'establish',
      pauseReasons: ['presentation'],
    })
    controller.resume('presentation')
    vi.advanceTimersByTime(500)
    expect(controller.getState().stage).toBe('plea-a')
  })

  it('shows a complete production plea on one screen and advances to the next speaker', () => {
    const plea =
      "I know there's no perfect argument for this choice. I kept showing up for this game, and I want one last chance to prove I belong beside you."
    const { controller, view, root, onDecision } = mount(true, false, plea)
    vi.advanceTimersByTime(500)
    expect(root.querySelector('.fd-broadcast-caption')?.textContent).toBe(plea)
    expect(view.queryByRole('button', { name: /Next part|^Next$/ })).toBeNull()
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toBe('Aria: ' + plea)
    fireEvent.click(view.getByRole('button', { name: 'Hear Dex' }))
    expect(controller.getState().stage).toBe('plea-b')
    expect(root.querySelector('.fd-broadcast-caption')?.textContent).toBe('Let my story continue.')
    expect(view.getByRole('button', { name: 'Make your decision' })).toBeDefined()
    expect(onDecision).not.toHaveBeenCalled()
  })

  it('keeps an unusually long speech intact instead of silently truncating or paging it', () => {
    const plea = 'I want the chance to finish the story we started together. '.repeat(12).trim()
    const { root, view } = mount(true, false, plea)
    vi.advanceTimersByTime(500)
    expect(root.querySelectorAll('.fd-broadcast-caption')).toHaveLength(1)
    expect(root.querySelector('.fd-broadcast-caption')?.textContent).toBe(plea)
    expect(view.queryByRole('button', { name: /Next part|^Next$/ })).toBeNull()
    expect(view.getByRole('button', { name: 'Hear Dex' })).toBeDefined()
  })

  it('skips to an explicit choice without inventing an outcome', () => {
    const { controller, view, onDecision, onComplete } = mount()
    controller.skip()
    expect(controller.getState().stage).toBe('choose')
    controller.skip()
    vi.advanceTimersByTime(100_000)
    expect(onDecision).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'Choose to eliminate Aria' }))
    controller.skip()
    vi.advanceTimersByTime(100_000)
    expect(controller.getState().stage).toBe('confirm')
    expect(onDecision).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'Change choice' }))
    expect(controller.getState().selectedId).toBeNull()
  })

  it.each(['Aria', 'Dex'])(
    'confirms %s once and preserves the same result when skipped',
    (name) => {
      const { controller, view, onDecision, onComplete, root } = mount()
      controller.skip()
      fireEvent.click(view.getByRole('button', { name: `Choose to eliminate ${name}` }))
      expect(root.querySelector('.scene')?.getAttribute('data-isolated')).toBe('false')
      const kept = name === 'Aria' ? 'Dex' : 'Aria'
      const confirm = view.getByRole('button', {
        name: `Confirm: eliminate ${name} and keep ${kept}`,
      })
      fireEvent.click(confirm)
      fireEvent.click(confirm)
      expect(controller.getState().isolatedPlayerId).toBe(name.toLowerCase())
      expect(root.querySelector('.scene')?.getAttribute('data-isolated')).toBe('true')
      expect(
        root.querySelector('.fd-actor[data-result="leave"]')?.getAttribute('data-player-id')
      ).toBe(name.toLowerCase())
      expect(onDecision).toHaveBeenCalledTimes(1)
      expect(onDecision).toHaveBeenCalledWith({
        sceneId: 'controller-test',
        holderId: 'human',
        evicteeId: name.toLowerCase(),
        keptId: kept.toLowerCase(),
      })
      controller.skip()
      expect(controller.getState().stage).toBe('announcement')
      controller.skip()
      controller.skip()
      vi.advanceTimersByTime(100_000)
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith(onDecision.mock.calls[0][0])
      expect(controller.getState().isolatedPlayerId).toBe(name.toLowerCase())
      expect(root.querySelector('.fd-monitor-content')?.textContent).toContain(name)
      expect(root.querySelector('.fd-monitor-content')?.textContent).not.toContain(kept)
      expect(root.querySelector('.fd-layer-tools')).toBeNull()
      expect(view.queryByRole('button', { name: /Replay/ })).toBeNull()
    }
  )

  it('preserves user pause when ownership resumes, then continues the remaining timer', () => {
    const { controller } = mount()
    vi.advanceTimersByTime(200)
    controller.pause('user')
    controller.pause('presentation')
    controller.resume('presentation')
    vi.advanceTimersByTime(10_000)
    expect(controller.getState()).toMatchObject({ stage: 'establish', pauseReasons: ['user'] })
    controller.resume('user')
    vi.advanceTimersByTime(299)
    expect(controller.getState().stage).toBe('establish')
    vi.advanceTimersByTime(1)
    expect(controller.getState().stage).toBe('plea-a')
  })

  it('cancels announcement timers on disposal without reporting scene completion', () => {
    const { controller, view, onDecision, onComplete } = mount()
    controller.skip()
    fireEvent.click(view.getByRole('button', { name: 'Choose to eliminate Dex' }))
    fireEvent.click(view.getByRole('button', { name: 'Confirm: eliminate Dex and keep Aria' }))
    expect(onDecision).toHaveBeenCalledTimes(1)
    controller.dispose()
    controller.skip()
    vi.advanceTimersByTime(100_000)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('naturally announces the same confirmed result before completing exactly once', () => {
    const { controller, view, onDecision, onComplete } = mount(false)
    controller.skip()
    fireEvent.click(view.getByRole('button', { name: 'Choose to eliminate Aria' }))
    fireEvent.click(view.getByRole('button', { name: 'Confirm: eliminate Aria and keep Dex' }))
    vi.advanceTimersByTime(5999)
    expect(onComplete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(onDecision.mock.calls[0][0])
  })

  it('keeps the red-light hold paused and does not complete until all pause reasons clear', () => {
    const { controller, view, onComplete, root } = mount(false)
    controller.skip()
    fireEvent.click(view.getByRole('button', { name: 'Choose to eliminate Dex' }))
    fireEvent.click(view.getByRole('button', { name: 'Confirm: eliminate Dex and keep Aria' }))
    vi.advanceTimersByTime(3200)
    expect(controller.getState().stage).toBe('announcement')
    controller.pause('user')
    controller.pause('presentation')
    controller.resume('presentation')
    vi.advanceTimersByTime(30_000)
    expect(onComplete).not.toHaveBeenCalled()
    expect(root.querySelector('.scene')?.getAttribute('data-isolated-player')).toBe('dex')
    controller.resume('user')
    vi.advanceTimersByTime(2799)
    expect(onComplete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('owns ambient motion through pause, resume and disposal', () => {
    const nativeAnimations: Array<{
      playState: string
      pause: ReturnType<typeof vi.fn>
      play: ReturnType<typeof vi.fn>
      cancel: ReturnType<typeof vi.fn>
    }> = []
    const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
    const originalGetAnimations = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'getAnimations'
    )
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: vi.fn(() => {
        const animation = {
          playState: 'running',
          pause: vi.fn(function () {
            animation.playState = 'paused'
          }),
          play: vi.fn(function () {
            animation.playState = 'running'
          }),
          cancel: vi.fn(function () {
            animation.playState = 'idle'
          }),
        }
        nativeAnimations.push(animation)
        return animation
      }),
    })
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value: () => nativeAnimations.filter((a) => a.playState !== 'idle'),
    })
    try {
      const { controller } = mount(false)
      expect(nativeAnimations.length).toBeGreaterThan(10)
      controller.pause('presentation')
      expect(nativeAnimations.every((a) => a.playState === 'paused')).toBe(true)
      controller.resume('presentation')
      expect(nativeAnimations.every((a) => a.playState === 'running')).toBe(true)
      controller.dispose()
      expect(nativeAnimations.every((a) => a.playState === 'idle')).toBe(true)
      const reduced = mount(true)
      const count = nativeAnimations.length
      reduced.controller.skip()
      expect(nativeAnimations).toHaveLength(count)
    } finally {
      if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate)
      else Reflect.deleteProperty(Element.prototype, 'animate')
      if (originalGetAnimations)
        Object.defineProperty(Element.prototype, 'getAnimations', originalGetAnimations)
      else Reflect.deleteProperty(Element.prototype, 'getAnimations')
    }
  })

  it('offers the supplied finalist comparisons without making or changing a choice', () => {
    const { controller, view, onDecision } = mount()
    controller.skip()
    fireEvent.click(view.getByRole('button', { name: 'Review finalist comparisons' }))
    expect(controller.getState().stage).toBe('choose')
    expect(view.getByText('An alliance was part of your season.')).toBeVisible()
    expect(view.queryByRole('button', { name: 'Choose to eliminate Aria' })).toBeNull()
    controller.skip()
    fireEvent.click(view.getByRole('button', { name: 'Review Dex' }))
    expect(view.getByText('Trust was broken during the season.')).toBeVisible()
    fireEvent.click(view.getByRole('button', { name: 'Return to decision' }))
    expect(view.getByRole('button', { name: 'Choose to eliminate Aria' })).toBeVisible()
    expect(controller.getState().selectedId).toBeNull()
    expect(onDecision).not.toHaveBeenCalled()
  })
})
