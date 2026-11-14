import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DepressionShockRosterCinematic from './DepressionShockRosterCinematic'
import { chocolateCompletionMs } from './presentationTargets'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.classList.remove('reduce-motion')
})

it('flies to visible production roster targets and lets their relief finish', () => {
  vi.useFakeTimers()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
    window.setTimeout(() => callback(performance.now()), 0)
  )
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => window.clearTimeout(id))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const top = this.dataset.offscreen ? -200 : 100
    return {
      x: 10,
      y: top,
      top,
      left: 10,
      bottom: top + 50,
      right: 60,
      width: 50,
      height: 50,
      toJSON: () => ({}),
    }
  })
  const done = vi.fn()
  const view = render(
    <>
      <div data-houseguest-roster="true">
        <div data-depression-target="true" />
        <div data-depression-target="true" />
        <div data-depression-target="true" />
        <div data-depression-target="true" data-offscreen="true" />
        <div data-depression-target="false" />
      </div>
      <DepressionShockRosterCinematic kind="chocolate" onComplete={done} />
    </>
  )
  act(() => vi.advanceTimersByTime(0))
  expect(document.querySelectorAll('.depression-cinematic__flight')).toHaveLength(3)
  act(() => vi.advanceTimersByTime(3200))
  expect(done).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(chocolateCompletionMs(3) - 3200))
  expect(done).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(document.body.dataset.depressionCinematic).toBeUndefined()
  expect(document.querySelector('[style*="--depression-target-index"]')).toBeNull()
})

it.each([false, true])('completes an empty roster once (reduced motion=%s)', (reduced) => {
  vi.useFakeTimers()
  if (reduced) document.body.classList.add('reduce-motion')
  const done = vi.fn()
  const view = render(<DepressionShockRosterCinematic kind="chocolate" onComplete={done} />)
  act(() => vi.advanceTimersByTime(reduced ? 200 : chocolateCompletionMs(0)))
  expect(done).toHaveBeenCalledTimes(1)
  view.unmount()
})
