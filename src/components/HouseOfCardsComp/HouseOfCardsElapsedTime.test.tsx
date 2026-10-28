import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HouseOfCardsElapsedTime } from './HouseOfCardsElapsedTime'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('catches up after a stall without rendering its parent and cleans up its timer', () => {
  vi.useFakeTimers()
  const parent = vi.fn(() => <HouseOfCardsElapsedTime startedAt={Date.now()} active />)
  const view = render(parent())
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  expect(screen.getByText('1s')).toBeInTheDocument()
  act(() => {
    vi.setSystemTime(Date.now() + 5000)
    vi.advanceTimersByTime(250)
  })
  expect(screen.getByText('6s')).toBeInTheDocument()
  expect(parent).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('pauses hidden scheduling, freezes completed rounds and resets the next round', () => {
  vi.useFakeTimers()
  let hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  const startedAt = Date.now()
  const view = render(<HouseOfCardsElapsedTime startedAt={startedAt} active />)
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.getByText('1s')).toBeInTheDocument()
  act(() => {
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(vi.getTimerCount()).toBe(0)
  act(() => {
    vi.setSystemTime(Date.now() + 5000)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(screen.getByText('6s')).toBeInTheDocument()
  view.rerender(<HouseOfCardsElapsedTime startedAt={startedAt} active={false} />)
  expect(vi.getTimerCount()).toBe(0)
  act(() => {
    vi.advanceTimersByTime(5000)
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(screen.getByText('6s')).toBeInTheDocument()
  view.rerender(<HouseOfCardsElapsedTime startedAt={Date.now()} active={false} />)
  expect(screen.getByText('0s')).toBeInTheDocument()
  view.unmount()
})
