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
    expect(screen.getByText('46')).toBeInTheDocument()
  })

  it('keeps purchased hints re-accessible and charges the progressive hint price', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    fireEvent.click(screen.getByRole('button', { name: /^hint/i }))
    const hints = screen.getByRole('dialog', { name: /^hints$/i })
    fireEvent.click(within(hints).getByRole('button', { name: /reveal hint/i }))

    expect(screen.getByText('45')).toBeInTheDocument()
    expect(within(hints).getByText(/hint 1/i)).toBeInTheDocument()
    expect(within(hints).getByText(/hint 2/i)).toBeInTheDocument()

    expect(within(hints).getByText(/ready to reveal/i)).toBeInTheDocument()

    fireEvent.click(within(hints).getByRole('button', { name: /reveal hint/i }))
    expect(within(hints).getByText(/hint 3/i)).toBeInTheDocument()
    expect(within(hints).getByText(/ready to reveal/i)).toBeInTheDocument()
  })

  it('blocks duplicate word guesses so they cannot consume extra window integrity', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />)

    let dialog = openGuess()
    const input = within(dialog).getByLabelText(/full word guess/i)
    fireEvent.change(input, { target: { value: 'definitely wrong' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    expect(screen.getByText('1/5')).toBeInTheDocument()

    dialog = openGuess()
    const repeated = within(dialog).getByLabelText(/full word guess/i)
    fireEvent.change(repeated, { target: { value: 'definitely wrong' } })

    expect(within(dialog).getByRole('button', { name: /lock verdict/i })).toBeDisabled()
    expect(screen.getByText('1/5')).toBeInTheDocument()
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

  it('shatters the window on the fifth wrong full-word guess and ends the human run', () => {
    const { container } = render(<HangmanChallengeComp participants={participants} seed={42} />)

    const wrongAnswers = [
      'alpha wrong',
      'bravo wrong',
      'charlie wrong',
      'delta wrong',
      'echo wrong',
    ]

    for (const answer of wrongAnswers) {
      const dialog = openGuess()
      const input = within(dialog).getByLabelText(/full word guess/i)
      fireEvent.change(input, { target: { value: answer } })
      fireEvent.submit(input.closest('form') as HTMLFormElement)
    }

    expect(screen.getByText('5/5')).toBeInTheDocument()
    expect(container.querySelector('.verdict-v2__window.is-shattered')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(
      screen.getByRole('dialog', { name: /eliminated from verdict board/i })
    ).toBeInTheDocument()
  })

  it('starts both finalists together and spends final powers on the shared board', () => {
    const finalists = [
      { id: 'a-human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
      { id: 'z-ai', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
    ]
    render(<HangmanChallengeComp participants={finalists} seed={42} />)

    fireEvent.click(screen.getByRole('button', { name: /reveal now/i }))
    expect(screen.getByText('40')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /lock opp/i }))
    expect(screen.getByText(/locked for 5 seconds/i)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText(/race is live/i)).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /buzz/i })).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: /^hint/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /buy letter/i })).toBeNull()
  })

  it('does not let the AI solve the final before the first timed reveal', () => {
    const finalists = [
      { id: 'a-human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
      { id: 'z-ai', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
    ]
    render(<HangmanChallengeComp participants={finalists} seed={42} />)

    act(() => {
      vi.advanceTimersByTime(1200)
    })

    expect(screen.queryByRole('dialog', { name: /final results/i })).toBeNull()
    expect(screen.getByRole('button', { name: /buzz/i })).toBeInTheDocument()
  })

  it('gives the human a reaction window after each reveal before the AI can buzz', () => {
    const finalists = [
      { id: 'a-human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
      { id: 'z-ai', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
    ]
    render(<HangmanChallengeComp participants={finalists} seed={42} />)

    for (let second = 0; second < 5; second += 1) {
      act(() => {
        vi.advanceTimersByTime(1000)
      })
    }

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(screen.queryByRole('dialog', { name: /final results/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /history/i }))
    const history = screen.getByRole('dialog', { name: /attempt history/i })
    expect(within(history).getByText(/board revealed/i)).toBeInTheDocument()
    expect(within(history).queryByText(/buzzed/i)).toBeNull()
  })

  it('locks only a finalist who buzzes incorrectly until the next reveal', () => {
    const finalists = [
      { id: 'a-human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
      { id: 'z-ai', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
    ]
    render(<HangmanChallengeComp participants={finalists} seed={42} />)

    expect(screen.getByText(/race is live/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /buzz/i })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /buzz/i }))
    const dialog = screen.getByRole('dialog', { name: /guess the word/i })
    const input = within(dialog).getByLabelText(/full word guess/i)
    fireEvent.change(input, { target: { value: 'definitely wrong' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    expect(screen.getByText(/you are locked until the next reveal/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /buzz/i })).toBeDisabled()
  })

  it('reports both authoritative winner and last place to the host retry contract', () => {
    const onFinish = vi.fn()
    const finalists = [
      { id: 'a-human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
      { id: 'z-ai', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
    ]
    render(<HangmanChallengeComp participants={finalists} seed={99} onFinish={onFinish} />)

    const answer = pickTournamentWords(99, 0).final.text
    fireEvent.click(screen.getByRole('button', { name: /buzz/i }))
    const dialog = screen.getByRole('dialog', { name: /guess the word/i })
    const input = within(dialog).getByLabelText(/full word guess/i)
    fireEvent.change(input, { target: { value: answer } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    const results = screen.getByRole('dialog', { name: /final results/i })
    fireEvent.click(within(results).getByRole('button', { name: /finish competition/i }))

    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish.mock.calls[0]?.[2]).toMatchObject({
      authoritativeWinnerId: 'a-human',
      authoritativeLastPlaceId: 'z-ai',
    })
  })
})
