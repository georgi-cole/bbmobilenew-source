import { fireEvent, within } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountFinalDecision, type FinalDecisionController } from '../finalDecisionScene.mjs'

const mounted: Array<{ root: HTMLElement; controller: FinalDecisionController }> = []
function mount(reducedMotion = true) {
  const root = document.createElement('div')
  root.id = 'final-decision-scene'
  document.body.appendChild(root)
  const onDecision = vi.fn()
  const onComplete = vi.fn()
  const controller = mountFinalDecision(root, {
    sceneId: 'controller-test',
    preview: false,
    reducedMotion,
    fixture: {
      holder: { id: 'human', name: 'Season holder' },
      nominees: [
        {
          id: 'aria',
          name: 'Aria',
          assetKey: 'nominee-a',
          plea: 'Give me one last chance.',
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
    onCheckpoint: vi.fn(),
  })
  mounted.push({ root, controller })
  return { root, controller, onDecision, onComplete, view: within(root) }
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
      const kept = name === 'Aria' ? 'Dex' : 'Aria'
      const confirm = view.getByRole('button', {
        name: `Confirm: eliminate ${name} and keep ${kept}`,
      })
      fireEvent.click(confirm)
      fireEvent.click(confirm)
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
      expect(root.querySelector('.fd-layer-tools')).toBeNull()
      expect(view.queryByRole('button', { name: /Replay/ })).toBeNull()
    }
  )

  it('preserves user pause when ownership resumes, then continues the remaining timer', () => {
    const { controller, view } = mount()
    fireEvent.click(view.getByRole('button', { name: 'Begin the ceremony' }))
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
    vi.advanceTimersByTime(6999)
    expect(onComplete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(onDecision.mock.calls[0][0])
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
