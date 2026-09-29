import { fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HangmanChallengeComp from '../HangmanChallengeComp'
import { buildEliminationPlan, pickTournamentWords } from '../hangmanChallengeEngine'

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'ai-1', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'ai-2', name: 'Specter', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'ai-3', name: 'Oracle', isHuman: false, precomputedScore: 0, previousPR: null },
]

function openGuess() {
  fireEvent.click(screen.getByRole('button', { name: /guess word/i }))
  return screen.getByRole('dialog', { name: /guess the word/i })
}

describe('HangmanChallengeComp V2', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a viewport-first board with only the three primary gameplay actions', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    expect(screen.getByLabelText(/solution board/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reveal/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^hint/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guess word/i })).toBeInTheDocument()
    expect(screen.queryByText(/mystery box/i)).toBeNull()
    expect(screen.queryByLabelText(/letter keyboard/i)).toBeNull()
    expect(document.querySelector('.verdict-v2')).toBeTruthy()
  })

  it('spends four Eyeoleans to reveal exactly one vowel position', () => {
    const { container } = render(<HangmanChallengeComp participants={participants} seed={42} />)

    expect(container.querySelectorAll('.verdict-v2__tile.is-revealed')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /^reveal/i }))
    const revealDialog = screen.getByRole('dialog', { name: /reveal a letter/i })
    fireEvent.click(within(revealDialog).getByRole('button', { name: /vowel/i }))

    expect(container.querySelectorAll('.verdict-v2__tile.is-revealed')).toHaveLength(1)
    expect(screen.getByText('96')).toBeInTheDocument()
  })

  it('keeps purchased hints re-accessible and charges the progressive hint price', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    fireEvent.click(screen.getByRole('button', { name: /^hint/i }))
    let hints = screen.getByRole('dialog', { name: /^hints$/i })
    fireEvent.click(within(hints).getByRole('button', { name: /reveal hint/i }))

    expect(screen.getByText('95')).toBeInTheDocument()
    expect(within(hints).getByText(/hint 1/i)).toBeInTheDocument()
    expect(within(hints).getByText(/hint 2/i)).toBeInTheDocument()

    fireEvent.click(within(hints).getByRole('button', { name: /close hints/i }))
    fireEvent.click(screen.getByRole('button', { name: /^hint/i }))
    hints = screen.getByRole('dialog', { name: /^hints$/i })

    expect(within(hints).getByText(/hint 1/i)).toBeInTheDocument()
    expect(within(hints).getByText(/ready to reveal/i)).toBeInTheDocument()
  })

  it('blocks duplicate word guesses so they cannot consume extra window integrity', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    let dialog = openGuess()
    const input = within(dialog).getByLabelText(/full word guess/i)
    fireEvent.change(input, { target: { value: 'definitely wrong' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    expect(screen.getByText('1/10')).toBeInTheDocument()

    dialog = openGuess()
    const repeated = within(dialog).getByLabelText(/full word guess/i)
    fireEvent.change(repeated, { target: { value: 'definitely wrong' } })

    expect(within(dialog).getByRole('button', { name: /lock verdict/i })).toBeDisabled()
    expect(screen.getByText('1/10')).toBeInTheDocument()
  })

  it('solves by full-word guess and produces a transparent score breakdown', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)
    const rounds = buildEliminationPlan(participants.length)
    const answer = pickTournamentWords(42, rounds.length).qualifying[0].text

    const dialog = openGuess()
    const input = within(dialog).getByLabelText(/full word guess/i)
    fireEvent.change(input, { target: { value: answer } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    expect(screen.getByRole('dialog', { name: /round breakdown/i })).toBeInTheDocument()
    expect(screen.getByText(/board cleared/i)).toBeInTheDocument()
    expect(screen.getByText(/wallet/i)).toBeInTheDocument()
    expect(screen.getByText(/no-hint bonus/i)).toBeInTheDocument()
  })

  it('shatters the window on the tenth wrong full-word guess and ends the human run', () => {
    const { container } = render(<HangmanChallengeComp participants={participants} seed={42} />)

    for (let index = 0; index < 10; index += 1) {
      const dialog = openGuess()
      const input = within(dialog).getByLabelText(/full word guess/i)
      fireEvent.change(input, { target: { value: 'wrong answer ' + index } })
      fireEvent.submit(input.closest('form') as HTMLFormElement)
    }

    expect(screen.getByText('10/10')).toBeInTheDocument()
    expect(container.querySelector('.verdict-v2__window.is-shattered')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(screen.getByRole('dialog', { name: /eliminated from verdict board/i })).toBeInTheDocument()
  })

  it('uses the cumulative leader choice and keeps the turn after a successful final reveal', () => {
    const finalists = [
      { id: 'a-human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
      { id: 'z-ai', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
    ]
    render(<HangmanChallengeComp participants={finalists} seed={42} />)

    const choice = screen.getByRole('dialog', { name: /choose final order/i })
    fireEvent.click(within(choice).getByRole('button', { name: /start first/i }))

    fireEvent.click(screen.getByRole('button', { name: /^reveal/i }))
    const revealDialog = screen.getByRole('dialog', { name: /reveal a letter/i })
    fireEvent.click(within(revealDialog).getByRole('button', { name: /vowel/i }))

    expect(screen.getByRole('button', { name: /guess word/i })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /^hint/i }))
    const hints = screen.getByRole('dialog', { name: /^hints$/i })
    fireEvent.click(within(hints).getByRole('button', { name: /reveal hint/i }))

    expect(screen.getByRole('button', { name: /guess word/i })).toBeDisabled()
  })
})
