import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NumberTriviaResults } from './NumberTriviaResults'
import type { ScoreboardState } from './NumberTrivia'

const base: ScoreboardState = {
  phase: 'qualifier',
  roundNumber: 1,
  answer: 24,
  eliminatedIds: ['ai'],
  finalistIds: ['human'],
  lives: {},
  final: false,
  standings: [
    {
      participantId: 'human',
      participantName: 'You',
      isHuman: true,
      cumulativeScore: 1400,
      lastRoundScore: 1400,
      lastRoundAttempts: 1,
      lastRoundTimeMs: 1000,
      lastRoundGuessed: true,
      eliminatedRound: null,
    },
    {
      participantId: 'ai',
      participantName: 'Nova',
      isHuman: false,
      cumulativeScore: 800,
      lastRoundScore: 800,
      lastRoundAttempts: 3,
      lastRoundTimeMs: 4000,
      lastRoundGuessed: false,
      eliminatedRound: 1,
    },
  ],
}

function show(scoreboard = base) {
  return render(
    <NumberTriviaResults
      scoreboard={scoreboard}
      participants={[]}
      showStandings={false}
      onToggleStandings={vi.fn()}
    />
  )
}

describe('Number Trivia broadcast reveal', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reveals the answer, points, then the eliminated contestant in that order', () => {
    show()
    expect(screen.getByText('The number you needed')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'END OF THE LINE' })).toBeNull()
    act(() => vi.advanceTimersByTime(1100))
    expect(screen.getByText('+1400')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1300))
    expect(screen.getByRole('heading', { name: 'END OF THE LINE' })).toBeInTheDocument()
    expect(screen.getByText('Nova')).toBeInTheDocument()
    expect(screen.getByText('ELIMINATED')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Tournament standings' })).toBeNull()
  })

  it('never rolls the reveal backward after skipping it', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Skip reveal' }))
    act(() => vi.advanceTimersByTime(1100))
    expect(screen.getByRole('heading', { name: 'END OF THE LINE' })).toBeInTheDocument()
    expect(screen.queryByText('+1400')).toBeNull()
  })

  it('keeps all tied qualifiers in the finalist presentation', () => {
    const tied = {
      ...base.standings[0],
      participantId: 'tie',
      participantName: 'Remy',
      isHuman: false,
    }
    show({
      ...base,
      roundNumber: 5,
      eliminatedIds: [],
      finalistIds: ['human', 'ai', 'tie'],
      lives: { human: 3, ai: 3, tie: 3 },
      standings: [...base.standings, tied],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Skip reveal' }))
    expect(screen.getByRole('heading', { name: 'MEET YOUR FINALISTS' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('3 lives remaining')).toHaveLength(3)
    expect(screen.getByText('Remy')).toBeInTheDocument()
  })

  it('shows life loss separately from elimination and crowns the authoritative winner', () => {
    const duel = {
      ...base,
      phase: 'duel' as const,
      roundNumber: 6,
      duelNumber: 1,
      lifeLostId: 'ai',
      eliminatedIds: [],
      lives: { human: 3, ai: 2 },
    }
    const { unmount } = show(duel)
    fireEvent.click(screen.getByRole('button', { name: 'Skip reveal' }))
    expect(screen.getByRole('heading', { name: 'ONE LIFE LOST' })).toBeInTheDocument()
    expect(screen.getByLabelText('2 lives remaining')).toBeInTheDocument()
    expect(screen.queryByText('ELIMINATED')).toBeNull()
    unmount()
    show({ ...duel, final: true, lives: { human: 1, ai: 0 }, eliminatedIds: ['ai'] })
    fireEvent.click(screen.getByRole('button', { name: 'Skip reveal' }))
    expect(screen.getByRole('heading', { name: 'LAST ONE STANDING' })).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.queryByText('Nova')).toBeNull()
  })

  it('shows the verdict immediately for reduced motion and cleans up on exit', () => {
    const matchMedia = window.matchMedia.bind(window)
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      ...matchMedia(query),
      matches: true,
    }))
    const { unmount } = show()
    expect(screen.getByRole('heading', { name: 'END OF THE LINE' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip reveal' })).toBeNull()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
