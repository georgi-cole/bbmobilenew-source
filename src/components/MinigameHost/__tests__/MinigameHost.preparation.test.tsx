import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameRegistryEntry } from '../../../minigames/registry'
import MinigameHost from '../MinigameHost'

const mocks = vi.hoisted(() => ({ preload: vi.fn(), play: vi.fn(), stop: vi.fn() }))
vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: { play: mocks.play, stop: mocks.stop },
}))
vi.mock('../../../minigames/reactComponents', () => ({
  default: { TiltedLedge: () => <div data-testid="prepared-game">Game</div> },
  preloadReactMinigame: mocks.preload,
}))
vi.mock('../../../i18n/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const game: GameRegistryEntry = {
  key: 'preparation-test',
  title: 'Test Game',
  description: 'Test',
  instructions: [],
  metricKind: 'points',
  metricLabel: 'Points',
  timeLimitMs: 0,
  authoritative: false,
  scoringAdapter: 'raw',
  implementation: 'react',
  reactComponentKey: 'TiltedLedge',
  legacy: false,
  weight: 1,
  category: 'arcade',
  retired: false,
}

describe('minigame preparation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.preload.mockReset()
    mocks.play.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the selected runtime before starting the countdown or its sound', async () => {
    let finishPreparation!: () => void
    mocks.preload.mockReturnValue(
      new Promise<void>((resolve) => {
        finishPreparation = resolve
      })
    )
    render(<MinigameHost game={game} skipRules onDone={vi.fn()} />)
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('Preparing Test Game…')).toBeVisible()
    expect(screen.queryByTestId('prepared-game')).toBeNull()
    expect(mocks.play).not.toHaveBeenCalled()
    await act(async () => {
      finishPreparation()
    })
    expect(screen.getByText('3')).toBeVisible()
    for (let i = 0; i < 3; i++)
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByTestId('prepared-game')).toBeVisible()
  })

  it('lets the player retry a failed preparation before timed play starts', async () => {
    mocks.preload.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(undefined)
    render(<MinigameHost game={game} skipRules skipCountdown onDone={vi.fn()} />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByTestId('prepared-game')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByTestId('prepared-game')).toBeVisible()
    expect(mocks.preload).toHaveBeenCalledTimes(2)
  })
})
