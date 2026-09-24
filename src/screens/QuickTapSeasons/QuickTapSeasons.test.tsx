import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QuickTapSeasons from './QuickTapSeasons'
import {
  buildSeasonSchedule,
  rerollSeason,
} from '../../experiments/quickTapSeasons/quickTapSeasons'

describe('QuickTapSeasons', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts the 40-second clock after the race begins', () => {
    render(<QuickTapSeasons />)

    fireEvent.click(screen.getByRole('button', { name: 'Start 40s race' }))
    expect(screen.getByText('40.0s')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByText('39.5s')).toBeTruthy()
  })

  it('finishes the race when the 40-second clock expires', () => {
    const onFinish = vi.fn()
    render(<QuickTapSeasons onFinish={onFinish} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start 40s race' }))

    act(() => {
      vi.advanceTimersByTime(40_000)
    })

    expect(screen.getByRole('heading', { name: /won/i })).toBeTruthy()
    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish).toHaveBeenCalledWith(0)
  })

  it('advances the clock from tap input when interval callbacks are delayed', () => {
    render(<QuickTapSeasons />)

    fireEvent.click(screen.getByRole('button', { name: 'Start 40s race' }))
    vi.setSystemTime(new Date('2026-08-25T12:00:00.500Z'))
    fireEvent.pointerDown(screen.getByRole('button', { name: /TAP/ }))

    expect(screen.getByText('39.5s')).toBeTruthy()
  })

  it('gives a mystery-box season a full window before the next automatic change', () => {
    const seed = Array.from({ length: 100 }, (_, index) => index + 1).find((candidate) => {
      const schedule = buildSeasonSchedule(candidate)
      return rerollSeason(candidate, 0, schedule[0].season) !== schedule[1].season
    })
    expect(seed).toBeDefined()

    const { container } = render(<QuickTapSeasons seed={seed} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start 40s race' }))
    act(() => {
      vi.advanceTimersByTime(7_000)
    })

    fireEvent.click(screen.getByRole('button', { name: /change season/i }))
    const seasonLabel = container.querySelector('.qts__hud > div:nth-child(2) strong')?.textContent
    expect(seasonLabel).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(container.querySelector('.qts__hud > div:nth-child(2) strong')?.textContent).toBe(
      seasonLabel
    )
    expect(screen.getByText('32.0s')).toBeTruthy()
  })

  it('keeps the hosted auto-start timer running in Strict Mode', () => {
    render(
      <StrictMode>
        <QuickTapSeasons autoStart />
      </StrictMode>
    )

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByText('40.0s')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByText('39.5s')).toBeTruthy()
  })
})
