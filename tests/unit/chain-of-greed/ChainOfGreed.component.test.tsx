import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChainOfGreed from '../../../src/components/ChainOfGreed/ChainOfGreed'
import {
  CHAIN_TURN_PIPELINE_DURATIONS,
  rankFinalPlayersByScore,
  type ChainOfGreedPlayerState,
} from '../../../src/components/ChainOfGreed/chainOfGreedLogic'

const TURN_PIPELINE_MS = Object.values(CHAIN_TURN_PIPELINE_DURATIONS).reduce(
  (total, value) => total + value,
  0
)
const ROUND_INTRO_MS = 1_500

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 75, previousPR: null },
  { id: 'mira', name: 'Mira', isHuman: false, precomputedScore: 71, previousPR: null },
  { id: 'alex', name: 'Alex', isHuman: false, precomputedScore: 69, previousPR: null },
  { id: 'nina', name: 'Nina', isHuman: false, precomputedScore: 67, previousPR: null },
  { id: 'sasha', name: 'Sasha', isHuman: false, precomputedScore: 65, previousPR: null },
  { id: 'eli', name: 'Eli', isHuman: false, precomputedScore: 64, previousPR: null },
  { id: 'lena', name: 'Lena', isHuman: false, precomputedScore: 62, previousPR: null },
  { id: 'jules', name: 'Jules', isHuman: false, precomputedScore: 60, previousPR: null },
]

function renderSharedGame(testParticipants = participants, seed = 42) {
  const view = render(
    <ChainOfGreed participants={testParticipants} seed={seed} onFinish={() => {}} />
  )
  fireEvent.click(screen.getByRole('button', { name: /Shared Chain/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Start Shared Chain' }))
  return view
}

describe('ChainOfGreed component', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('presents one concise round intro with a clear start action', () => {
    vi.useFakeTimers()
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'How will you play the chain?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Solo Rush/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Shared Chain/ }))

    expect(screen.getByText(/Take turns calling Higher, Equal, or Lower/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Shared Chain' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Chain of Greed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Shared Chain' }))
    expect(screen.getByRole('button', { name: 'Start round' })).toBeInTheDocument()
    expect(screen.getByTestId('chain-shared-round-timer').getAttribute('aria-label')).toMatch(
      /^[1-9]\d* seconds remaining in the round$/
    )
    expect(screen.getByText(/contestants? faces? the vote after this round/i)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Build the chain.' })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS - 1)
    })
    expect(screen.getByRole('dialog', { name: 'Build the chain.' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Higher' })).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument()
    expect(screen.getByTestId('chain-shared-round-timer')).toHaveAttribute(
      'aria-label',
      '79 seconds remaining in the round'
    )
    expect(screen.queryByRole('dialog', { name: 'Build the chain.' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lower' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Equal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bank' })).toBeInTheDocument()
    const header = screen.getByRole('banner')
    expect(within(header).queryByText('8 left')).not.toBeInTheDocument()
    expect(within(header).getByTestId('chain-prize-pool')).toHaveTextContent('0 prize pool')
    expect(within(header).queryByTestId('chain-header-status')).not.toBeInTheDocument()
    expect(within(header).queryByTestId('chain-header-timer')).not.toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Speed up AI playback' })).toBeInTheDocument()
    expect(screen.queryByText(/Choose your move/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Bank is safe, but the first correct guess starts the value/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/First correct call starts the climb/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('chain-ladder-stage')).toBeInTheDocument()
    expect(screen.queryByTestId('chain-score-strip')).not.toBeInTheDocument()
    expect(screen.queryByTestId('chain-outcome-slot')).not.toBeInTheDocument()
    expect(screen.queryByTestId('chain-action-cue')).not.toBeInTheDocument()
    expect(screen.queryByTestId('chain-event-log')).not.toBeInTheDocument()
    expect(screen.getByTestId('chain-broadcast-board')).toBeInTheDocument()
    const participantPanel = screen.getByTestId('chain-participant-panel')
    expect(participantPanel).toHaveTextContent(/You/i)
    expect(participantPanel).toHaveTextContent(/Choose move/i)
    expect(screen.queryByTestId('chain-inline-watch-controls')).not.toBeInTheDocument()
    const participantLog = screen.getByTestId('chain-participant-log')
    expect(participantLog).toHaveTextContent(/Live feed/i)
    expect(participantLog).not.toHaveAttribute('open')
    fireEvent.click(within(participantLog).getByText('Log'))
    expect(participantLog).toHaveAttribute('open')
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Step 0\/8/i)
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Next 50/i)
    expect(screen.getByTestId('chain-inline-status')).not.toHaveTextContent(/Pot/i)
    const sharedTimer = screen.getByTestId('chain-shared-round-timer')
    const currentPot = screen.getByTestId('chain-shared-current-pot')
    expect(
      screen.getByTestId('chain-inline-status').compareDocumentPosition(sharedTimer) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      sharedTimer.compareDocumentPosition(currentPot) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /View full ladder/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open chain ladder board' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current chain ladder')).toBeInTheDocument()
    const ladderStage = screen.getByTestId('chain-ladder-stage')
    const higherButton = screen.getByRole('button', { name: 'Higher' })
    const playerRail = screen.getByTestId('chain-player-rail')
    expect(playerRail).toBeInTheDocument()
    expect(
      ladderStage.compareDocumentPosition(higherButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      higherButton.compareDocumentPosition(playerRail) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByTestId('chain-current-anchor')).toBeInTheDocument()
    expect(screen.queryByText(/Current pot 0/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Open help' })).toHaveLength(1)
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0)
    expect(screen.getByTestId('chain-ladder-stage')).not.toHaveTextContent(/Next\s+Next/i)
    expect(screen.queryByText(/Step 0\/8 • Pot 0 • Next 50/i)).not.toBeInTheDocument()
  })

  it('starts Solo Rush with a one-minute timer and an empty personal bank', () => {
    vi.useFakeTimers()
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Solo Rush/ }))
    expect(screen.getByText(/Build your bank in one minute/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Solo Rush' }))

    expect(screen.getByTestId('chain-solo-round-timer')).toHaveAttribute(
      'aria-label',
      '60 seconds remaining'
    )
    expect(
      within(screen.getByRole('banner')).queryByTestId('chain-header-timer')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent('SOLO RUSH')
    expect(screen.getByRole('banner')).toHaveTextContent('ROUND 1/4')
    expect(screen.getByRole('banner')).toHaveTextContent(/SOLO RUSH · ROUND 1\/4/)
    expect(screen.getByRole('banner')).not.toHaveTextContent('Your Bank 0')
    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pawn Round Bank/ })).not.toBeInTheDocument()
    const soloPanel = screen.getByTestId('chain-participant-panel')
    expect(soloPanel).toHaveTextContent('Pot 0')
    expect(soloPanel).not.toHaveTextContent('Round Bank')
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Step 0\/8/i)
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/At risk/i)
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Next 50/i)
    expect(
      screen
        .getByTestId('chain-inline-status')
        .compareDocumentPosition(screen.getByTestId('chain-solo-round-timer')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      screen
        .getByTestId('chain-solo-round-timer')
        .compareDocumentPosition(screen.getByTestId('chain-solo-current-pot')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByTestId('chain-risk-readout')).toHaveTextContent(/Higher\s+\d+%/)
    expect(screen.getByTestId('chain-risk-readout')).not.toHaveTextContent(
      /Number shoe|cards still in the shoe/i
    )
    expect(
      within(screen.getByTestId('chain-participant-panel')).getByTestId('chain-bank-action')
    ).toBeInTheDocument()
    expect(screen.queryByText(/cards left/i)).not.toBeInTheDocument()
    expect(screen.getAllByTestId('chain-risk-readout')).toHaveLength(1)
    expect(screen.getByTestId('chain-risk-readout')).toHaveTextContent(/Higher\s+\d+%/)
    expect(screen.getByTestId('chain-inline-status')).toBeInTheDocument()
    expect(screen.queryByTestId('chain-player-rail')).not.toBeInTheDocument()
  })

  it('closes the player profile from the standard X icon control', async () => {
    renderSharedGame()

    fireEvent.click(screen.getByTestId('chain-player-mira'))

    const profile = screen.getByRole('dialog', { name: 'Mira round profile' })
    const closeButton = within(profile).getByRole('button', { name: 'Close player profile' })
    expect(closeButton).toHaveTextContent('×')

    fireEvent.click(closeButton)

    await waitFor(() => expect(profile).toHaveStyle({ opacity: '0' }))
  })

  it('resolves rival Solo Rush rounds together and shows the full ranking when your minute ends', () => {
    vi.useFakeTimers()
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Solo Rush/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Solo Rush' }))

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    const ranking = screen.getByTestId('chain-solo-ranking')
    expect(ranking).toHaveTextContent('Round Bank ranking')
    expect(ranking).toHaveTextContent('You')
    expect(ranking).toHaveTextContent('Mira')
    expect(ranking.querySelectorAll('.chain-of-greed__solo-ranking-row')).toHaveLength(8)
    expect(screen.getByText(/Tied banks: fewer correct guesses ranks lower/i)).toBeInTheDocument()
  })

  it('allows the player to dismiss the round intro by tapping outside its card', () => {
    vi.useFakeTimers()
    renderSharedGame()

    const introOverlay = screen.getByTestId('chain-round-intro')
    fireEvent.pointerDown(introOverlay)

    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lower' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bank' })).toBeDisabled()
  })

  it('opens an observed round profile from the contestant rail', () => {
    renderSharedGame()
    fireEvent.click(screen.getByRole('button', { name: 'Start round' }))
    fireEvent.click(screen.getByRole('button', { name: "Review Mira's round performance" }))

    const profile = screen.getByRole('dialog', { name: 'Mira round profile' })
    expect(profile).toHaveTextContent('Correct / misses')
    expect(profile).toHaveTextContent('Banked / decisions')
    expect(profile).toHaveTextContent('Safety recovered')
    expect(profile).toHaveTextContent('Match earned')
  })

  it('offers a compact playback speed button and can pause the live AI turn', async () => {
    const aiFirstParticipants = [participants[1], participants[0], ...participants.slice(2)]
    renderSharedGame(aiFirstParticipants)
    expect(screen.queryByRole('button', { name: 'Speed up AI playback' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start round' }))

    const speedButton = await screen.findByRole('button', { name: 'Speed up AI playback' })

    expect(speedButton).toBeInTheDocument()
    fireEvent.click(speedButton)
    expect(screen.getByRole('button', { name: 'Slow down AI playback' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pause watch' }))
    expect(await screen.findByRole('button', { name: 'Resume watch' })).toBeInTheDocument()
    expect(screen.getByTestId('chain-participant-panel')).toHaveTextContent(
      /Mira is reading the board/i
    )
    const watchControls = screen.getByTestId('chain-inline-watch-controls')
    expect(within(watchControls).queryByRole('button', { name: 'Story' })).not.toBeInTheDocument()
    expect(within(watchControls).queryByRole('button', { name: 'Quick' })).not.toBeInTheDocument()
  })

  it('keeps shared play going beyond the old move cap until the round timer ends', () => {
    vi.useFakeTimers()
    renderSharedGame()

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Higher' }))

    act(() => {
      vi.advanceTimersByTime(participants.length * (TURN_PIPELINE_MS + 250))
    })

    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lower' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bank' })).toBeInTheDocument()
    expect(screen.queryByText(/is reading the board/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Higher' }))
    act(() => {
      vi.advanceTimersByTime(participants.length * (TURN_PIPELINE_MS + 250))
    })

    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Higher' }))
    act(() => {
      vi.advanceTimersByTime(TURN_PIPELINE_MS + 250)
    })
    expect(screen.queryByText('Round 1 Summary')).not.toBeInTheDocument()
    expect(screen.getByTestId('chain-shared-round-timer')).not.toHaveTextContent('0:00')
  })

  it('keeps voting and results in one modal and starts the next round immediately', () => {
    vi.useFakeTimers()
    renderSharedGame()

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS + 80_000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Vote' }))

    const voteModal = screen.getByTestId('chain-vote-flow-modal')
    expect(voteModal).toHaveTextContent('Choose who should leave')
    expect(voteModal).not.toHaveTextContent('Who had the roughest round, or lost your trust?')
    expect(within(voteModal).getByTestId('chain-round-standout')).toHaveTextContent(
      'Strongest this round'
    )
    expect(within(voteModal).getByRole('button', { name: 'Review round turns' })).toHaveClass(
      'chain-of-greed__vote-history-toggle'
    )
    fireEvent.click(within(voteModal).getByRole('button', { name: 'Reveal votes' }))

    expect(screen.getByTestId('chain-vote-flow-modal')).toBe(voteModal)
    expect(voteModal).toHaveTextContent('Vote Reveal')

    for (let voteIndex = 0; voteIndex < participants.length + 2; voteIndex += 1) {
      act(() => {
        vi.advanceTimersByTime(400)
      })
    }

    expect(voteModal).toHaveTextContent('Vote Result')
    expect(within(voteModal).getByRole('button', { name: 'View ballots' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(
      within(voteModal).queryByRole('button', { name: 'Hide ballots' })
    ).not.toBeInTheDocument()
    expect(voteModal.querySelector('.chain-of-greed__vote-results')).toBeNull()

    fireEvent.click(within(voteModal).getByRole('button', { name: 'Continue to Round 2' }))
    expect(screen.getByTestId('chain-shared-round-timer').getAttribute('aria-label')).toMatch(
      /^[1-9]\d* seconds remaining in the round$/
    )
    expect(screen.queryByRole('dialog', { name: 'Build the chain.' })).not.toBeInTheDocument()
  })

  it('shows a reusable help overlay with the bank, equal-number, and LOH final rules', () => {
    renderSharedGame(participants, 7)

    fireEvent.click(screen.getByRole('button', { name: /open help/i }))

    expect(screen.getByText(/Bank secures the active pot/i)).toBeInTheDocument()
    expect(screen.getByText(/A matching Equal call is correct/i)).toBeInTheDocument()
    expect(screen.getByText(/up to five shared-chain rounds/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        /highest final score wins and receives the entire shared prize pool as Influence/i
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/Every remaining player gets 30 seconds/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close Help' }))
    expect(screen.queryByText(/Bank secures the active pot/i)).not.toBeInTheDocument()
  })

  it('expands the full ladder sheet from the compact preview card', async () => {
    renderSharedGame(participants, 5)

    fireEvent.pointerDown(screen.getByTestId('chain-round-intro'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open chain ladder board' }))
    expect(screen.getByText('Chain rewards')).toBeInTheDocument()
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0)
  })

  it('falls back to initials instead of rendering raw profile image text', () => {
    vi.useFakeTimers()
    const imageTextParticipants = [
      {
        ...participants[0],
        name: 'Ate Three',
        avatar: 'profile photo:photo-d34feb7a-7c42-4864-a8e2-23fa285c69af-1783205172715',
      },
      ...participants.slice(1),
    ]

    renderSharedGame(imageTextParticipants)

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS)
    })

    expect(screen.queryByText(/profile photo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/photo-d34/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('chain-participant-panel')).toHaveTextContent(/AT/i)
  })

  it('breaks final score ties by fewer mistakes, then fewer banks', () => {
    const makePlayer = (id: string, finalWrongGuesses: number, finalBanks: number) =>
      ({
        ...participants[0],
        id,
        name: id.toUpperCase(),
        avatar: id,
        isHuman: false,
        isEliminated: false,
        safetyAvailable: true,
        totalContribution: 0,
        roundContribution: 0,
        totalBanked: 0,
        roundBanked: 0,
        totalRecovered: 0,
        roundRecovered: 0,
        roundLost: 0,
        roundCorrectGuesses: 0,
        roundWrongGuesses: 0,
        roundBanks: 0,
        roundBusts: 0,
        totalCorrectGuesses: 0,
        totalWrongGuesses: 0,
        totalBanks: 0,
        totalBusts: 0,
        voteCount: 0,
        semifinalScore: 0,
        finalScore: 500,
        finalWrongGuesses,
        finalCorrectGuesses: 0,
        finalBanks,
        turnsTakenThisRound: 0,
        personality: { aggression: 0.5, caution: 0.5, volatility: 0.5, social: 0.5 },
        lastRoundPerformance: 0,
        latestMoment: null,
      }) as ChainOfGreedPlayerState

    const players = [makePlayer('a', 1, 0), makePlayer('b', 0, 2), makePlayer('c', 0, 1)]
    const ranking = rankFinalPlayersByScore({ a: 500, b: 500, c: 500 }, players, () => 0.5)

    expect(ranking.ordered.map((player) => player.id)).toEqual(['c', 'b', 'a'])
    expect(ranking.tieBreak?.message).toMatch(/Fewer mistakes/i)
  })

  it('keeps banking unavailable until the chain has a pot', () => {
    vi.useFakeTimers()
    renderSharedGame()

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS)
    })

    const bankButton = screen.getByRole('button', { name: 'Bank' })
    expect(bankButton).toBeDisabled()
    expect(bankButton).toHaveAttribute('title', 'Build the chain before banking.')
    expect(screen.getByRole('button', { name: 'Higher' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Equal' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Lower' })).toBeEnabled()
    expect(screen.queryByText(/You banked 0\./i)).not.toBeInTheDocument()
  })
})
