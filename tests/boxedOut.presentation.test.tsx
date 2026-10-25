import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BoxedOut from '../src/components/BoxedOut/BoxedOut'
import {
  crowdVisible,
  displayedRound,
  roundTimeline,
} from '../src/components/BoxedOut/presentation'
import * as rules from '../src/features/boxedOut/rules'

const audio = vi.hoisted(() => ({
  play: vi.fn(),
  death: vi.fn(),
  safe: vi.fn(),
  winner: vi.fn(),
  turn: vi.fn(),
}))
vi.mock('../src/services/sound/SoundManager', () => ({ SoundManager: { play: audio.play } }))
vi.mock('../src/hooks/useGlassBridgeAudio', () => ({
  useGlassBridgeAudio: () => ({
    playDeath: audio.death,
    playNewTurn: audio.turn,
    playSafeStep: audio.safe,
    playWinner: audio.winner,
  }),
}))

const players = [
  { id: 'human', name: 'You', isHuman: true },
  { id: 'a', name: 'Alpha', isHuman: false },
  { id: 'b', name: 'Beta', isHuman: false },
  { id: 'c', name: 'Gamma', isHuman: false },
]
const participants = players.map((p) => ({ ...p, precomputedScore: 0, previousPR: null }))

function prepareGame(lastLife = false) {
  const initial = rules.createBoxedOutState(players, 424242)
  initial.lockedAiPicks = { a: 0, b: 0, c: 1 }
  if (lastLife) initial.lives.human = 1
  vi.spyOn(rules, 'createBoxedOutState').mockReturnValue(initial)
  render(<BoxedOut seed={424242} participants={participants} onFinish={vi.fn()} />)
  return initial
}

function setup(lastLife = false) {
  const initial = prepareGame(lastLife)
  fireEvent.click(screen.getByRole('button', { name: /^Box A:/ }))
  fireEvent.click(screen.getByRole('button', { name: 'LOCK MY BOX' }))
  advance(3500)
  advance(0)
  return initial
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('Boxed Out event presentation', () => {
  it('flashes the Boxpocalypse title when the final group is eliminated together', () => {
    const finalState = rules.createBoxedOutState(players, 424242)
    finalState.phase = 'finished'
    finalState.lives = { human: 0, a: 0, b: 0, c: 0 }
    finalState.winnerId = 'human'
    finalState.finalists = ['human']
    vi.spyOn(rules, 'createBoxedOutState').mockReturnValue(finalState)
    render(<BoxedOut seed={424242} participants={participants} onFinish={vi.fn()} />)

    advance(0)
    expect(screen.getByText('BOXPOCALYPSE', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('THE LAST BOXES FALL')).toBeInTheDocument()
    advance(1050)
    expect(screen.getByText('Every life is gone.')).toBeInTheDocument()
  })

  it('shows the same elimination flash before a tied last-group score enters sudden death', () => {
    const finalState = rules.createBoxedOutState(players, 424242)
    finalState.phase = 'tiebreak'
    finalState.lives = { human: 0, a: 0, b: 0, c: 0 }
    finalState.finalists = ['human', 'a']
    vi.spyOn(rules, 'createBoxedOutState').mockReturnValue(finalState)
    render(<BoxedOut seed={424242} participants={participants} onFinish={vi.fn()} />)

    advance(0)
    expect(screen.getByText('BOXPOCALYPSE', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    advance(1250)
    expect(screen.queryByText('THE LAST BOXES FALL')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('shows sealed-choice progress and waits for every AI commitment after an early lock', () => {
    prepareGame()
    const progress = screen.getByRole('progressbar', { name: 'Choices sealed' })
    expect(progress).toHaveAttribute('aria-valuenow', '0')
    expect(progress).toHaveAttribute('aria-valuemax', '4')
    fireEvent.click(screen.getByRole('button', { name: /^Box A:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'LOCK MY BOX' }))
    expect(progress).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('main')).toHaveClass('boxed-out--select')
    expect(screen.getByRole('button', { name: /^Box A:/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Box B:/ })).toBeDisabled()
    advance(3500)
    expect(progress).toHaveAttribute('aria-valuenow', '4')
    advance(0)
    expect(screen.getByRole('main')).toHaveClass('boxed-out--reveal')
    expect(screen.queryByRole('progressbar', { name: 'Choices sealed' })).not.toBeInTheDocument()
  })

  it('keeps the human choice open after all AI contestants have committed', () => {
    prepareGame()
    advance(3500)
    expect(screen.getByRole('progressbar', { name: 'Choices sealed' })).toHaveAttribute(
      'aria-valuenow',
      '3'
    )
    expect(screen.getByRole('button', { name: /^Box A:/ })).toBeEnabled()
    expect(screen.getByRole('main')).toHaveClass('boxed-out--select')
  })

  it('brings a selected box forward and returns all boxes when tapped again', () => {
    render(<BoxedOut seed={424242} participants={participants} />)
    const box = screen.getByRole('button', { name: /^Box B:/ })
    fireEvent.click(box)
    expect(box).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('main')).toHaveClass('boxed-out--has-selection')
    expect(screen.getByRole('button', { name: 'LOCK MY BOX' })).toBeInTheDocument()
    fireEvent.click(box)
    expect(box).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('main')).not.toHaveClass('boxed-out--has-selection')
    expect(screen.queryByRole('button', { name: 'LOCK MY BOX' })).not.toBeInTheDocument()
  })

  it('shows standings after the reveal, then hides them again for the next choice', () => {
    setup()
    expect(screen.queryByRole('region', { name: 'Contestant standings' })).not.toBeInTheDocument()
    advance(4350)
    expect(screen.queryByRole('region', { name: 'Contestant standings' })).not.toBeInTheDocument()
    advance(1900)
    expect(screen.getByRole('region', { name: 'Contestant standings' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ROUND 2' }))
    advance(1450)
    expect(screen.queryByRole('region', { name: 'Contestant standings' })).not.toBeInTheDocument()
  })

  it('keeps crowd choices concealed until each box is counted, then reveals danger', () => {
    expect(crowdVisible('sealing', 0)).toBe(false)
    expect(crowdVisible('crowd-a', 0)).toBe(true)
    expect(crowdVisible('crowd-a', 1)).toBe(false)
    expect(crowdVisible('crowd-b', 2)).toBe(false)
    expect([0, 1, 2].every((box) => crowdVisible('danger', box))).toBe(true)
  })

  it('never stages a collapse for a split crowd and skips the ceremony for reduced motion', () => {
    const safeBeats = roundTimeline(false, false).map((step) => step.beat)
    expect(safeBeats).not.toContain('impact')
    expect(safeBeats).not.toContain('danger')
    expect(safeBeats).not.toContain('elimination')
    expect(roundTimeline(true, true, true)).toEqual([{ at: 0, beat: 'settled' }])
  })

  it('applies life and score changes together at the consequence, preserving the resolved rules state', () => {
    const initial = rules.createBoxedOutState(players, 42)
    initial.lockedAiPicks = { a: 0, b: 0, c: 1 }
    const resolved = rules.resolveBoxedOutRound(initial, 0)
    for (const beat of ['sealing', 'crowd-c', 'danger', 'impact'] as const) {
      expect(displayedRound(resolved, beat)).toEqual({
        scores: initial.scores,
        lives: initial.lives,
      })
    }
    expect(displayedRound(resolved, 'consequence')).toEqual({
      scores: resolved.scores,
      lives: resolved.lives,
    })
    expect(resolved.lives.human).toBe(2)
  })

  it('plays the collapse sound on impact and changes the displayed life only when LIFE LOST appears', () => {
    setup()
    expect(screen.getByLabelText('3 of 3 lives remaining')).toBeInTheDocument()
    expect(audio.death).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'ROUND 2' })).not.toBeInTheDocument()
    advance(3350)
    expect(audio.death).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('main')).toHaveAttribute('data-beat', 'impact')
    expect(screen.getByLabelText('3 of 3 lives remaining')).toBeInTheDocument()
    advance(1000)
    expect(screen.getByText('LIFE LOST')).toBeInTheDocument()
    expect(screen.getByLabelText('2 of 3 lives remaining')).toBeInTheDocument()
    advance(1900)
    expect(screen.getByRole('button', { name: 'ROUND 2' })).toBeInTheDocument()
    expect(audio.death).toHaveBeenCalledTimes(1)
  })

  it('shows the last life breaking before the elimination ceremony and OUT badge', () => {
    setup(true)
    advance(3350)
    expect(screen.queryByText('OUT')).not.toBeInTheDocument()
    advance(1000)
    expect(screen.getByText('LIFE LOST')).toBeInTheDocument()
    expect(screen.getByLabelText('0 of 3 lives remaining')).toBeInTheDocument()
    expect(screen.queryByText('OUT')).not.toBeInTheDocument()
    advance(1450)
    expect(screen.getByText('BOXPOCALYPSE', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.queryByText('OUT')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ROUND 2' })).not.toBeInTheDocument()
    advance(1800)
    expect(screen.getByText('OUT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ROUND 2' })).toBeInTheDocument()
  })

  it('covers the board before changing round and starts the choice clock after the handoff', () => {
    setup()
    advance(6250)
    fireEvent.click(screen.getByRole('button', { name: 'ROUND 2' }))
    expect(screen.getByRole('main')).toHaveClass('boxed-out--reveal')
    advance(640)
    expect(screen.getByRole('main')).toHaveClass('boxed-out--select')
    expect(screen.queryByText('15s')).not.toBeInTheDocument()
    advance(810)
    expect(screen.getByText('15s')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Choices sealed' })).toHaveAttribute(
      'aria-valuenow',
      '0'
    )
    expect(screen.getByRole('main')).toHaveTextContent('ROUND 2 / 10')
  })

  it('cancels pending effects and audio when the game is unmounted during suspense', () => {
    setup()
    advance(1000)
    cleanup()
    advance(9000)
    expect(audio.death).not.toHaveBeenCalled()
    expect(audio.safe).not.toHaveBeenCalled()
  })
})
