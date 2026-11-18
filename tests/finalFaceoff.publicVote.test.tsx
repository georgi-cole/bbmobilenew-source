import { act } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FinalFaceoff from '../src/components/FinalFaceoff/FinalFaceoff'
import {
  BALLOT_BEAT_MS,
  VOTE_REVEAL_INITIAL_DELAY_MS,
  VOTE_REVEAL_STAGGER_MS,
  winnerHandoffDelayMs,
} from '../src/components/FinalFaceoff/finaleTiming'
import gameReducer from '../src/store/gameSlice'
import finaleReducer, { PUBLIC_JUROR_ID } from '../src/store/finaleSlice'
import settingsReducer from '../src/store/settingsSlice'
import uiReducer from '../src/store/uiSlice'
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice'
import type { Player } from '../src/types'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
  PRESENTATION_PRIORITY,
} from '../src/services/presentation/presentationOwnership'

const { play } = vi.hoisted(() => ({ play: vi.fn() }))
vi.mock('../src/hooks/useSound', () => ({ default: () => ({ play }) }))

vi.mock('../src/components/SeasonRecapCinematic/SeasonRecapCinematic', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      Finish archive
    </button>
  ),
}))

const jurors = ['Casey', 'Drew', 'Ellis', 'Finn', 'Gale']
function openTribunal(
  choices: string[],
  options: { human?: boolean; publicVote?: string; presentation?: 'v1' | 'v2' } = {}
) {
  const game = gameReducer(undefined, { type: '@@INIT' })
  const finale = finaleReducer(undefined, { type: '@@INIT' })
  const players: Player[] = [
    { id: 'f1', name: 'Avery', avatar: '', status: 'active' },
    { id: 'f2', name: 'Blake', avatar: '', status: 'active' },
    ...choices.map((_, index) => ({
      id: `j${index}`,
      name: jurors[index],
      avatar: '',
      status: 'jury' as const,
      isUser: Boolean(options.human && index === 0),
    })),
  ]
  const jurorIds = players.filter((player) => player.status === 'jury').map((player) => player.id)
  const votes = Object.fromEntries(
    jurorIds.flatMap((id, index) => (players[index + 2].isUser ? [] : [[id, choices[index]]]))
  )
  if (options.publicVote) {
    jurorIds.push(PUBLIC_JUROR_ID)
    votes[PUBLIC_JUROR_ID] = options.publicVote
  }
  const store = configureStore({
    reducer: {
      game: gameReducer,
      finale: finaleReducer,
      settings: settingsReducer,
      ui: uiReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: { ...game, season: 3, week: 12, phase: 'jury', seed: 42, players },
      finale: {
        ...finale,
        hasStarted: true,
        isActive: true,
        finalistIds: ['f1', 'f2'],
        jurorIds,
        revealOrder: jurorIds,
        votes,
      },
      settings: settingsReducer(undefined, { type: '@@INIT' }),
      ui: uiReducer(undefined, { type: '@@INIT' }),
      publicOpinion: publicOpinionReducer(undefined, { type: '@@INIT' }),
    },
  })
  render(
    <Provider store={store}>
      <FinalFaceoff presentation={options.presentation ?? 'v1'} />
    </Provider>
  )
  fireEvent.click(screen.getByRole('button', { name: /Begin Tribunal/ }))
  return store
}

function endArchive() {
  fireEvent.click(screen.getByRole('button', { name: 'Finish archive' }))
}

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms))
}

describe('FinalFaceoff ballot presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts the archives immediately and reveals the actual vote on the juror stage afterward', () => {
    const store = openTribunal(['f1'], { publicVote: 'f2' })
    expect(screen.getByRole('button', { name: 'Finish archive' })).toBeTruthy()
    expect(store.getState().ui.musicScene).toBe('season_recap')
    expect(screen.queryByText(/Votes for|Final word/i)).toBeNull()

    endArchive()
    expect(store.getState().ui.musicScene).toBe('jury_voting')
    expect(screen.getByLabelText('Avery: 0 votes')).toBeTruthy()
    expect(screen.queryByText('Ballot 01')).toBeNull()

    advance(VOTE_REVEAL_INITIAL_DELAY_MS)
    expect(screen.getByRole('status').textContent).toBe('Casey voted for Avery.')
    expect(screen.getByLabelText('Avery: 1 votes')).toBeTruthy()

    advance(VOTE_REVEAL_STAGGER_MS)
    expect(screen.queryByText('Ballot 02')).toBeNull()
    const batch = screen.getByRole('region', { name: 'Remaining ballots' })
    expect(within(batch).getByRole('list', { name: 'Remaining votes for Blake' }).textContent).toBe(
      'The Public'
    )
    expect(store.getState().finale.tieBreakReason).toBe('tribunal_majority')
  })

  it('collects a mandatory human ballot before showing the archive', () => {
    const store = openTribunal(['f1', 'f2'], { human: true })
    expect(screen.getByRole('heading', { name: 'Cast your Tribunal vote' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Finish archive' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Skip All/ })).toBeNull()
    expect(store.getState().finale.votes.j0).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Cast Tribunal vote for Blake' }))
    expect(store.getState().finale.votes.j0).toBe('f2')
    expect(screen.getByRole('button', { name: 'Finish archive' })).toBeTruthy()
  })

  it('rolls the remaining votes into the final tally in one beat and hands off once', () => {
    const store = openTribunal(['f1', 'f1', 'f1', 'f2', 'f2'])
    endArchive()
    advance(VOTE_REVEAL_INITIAL_DELAY_MS)
    advance(VOTE_REVEAL_STAGGER_MS)
    expect(screen.getByText('2 / 5 votes revealed')).toBeTruthy()
    expect(screen.queryByText('Remaining ballots')).toBeNull()

    advance(VOTE_REVEAL_STAGGER_MS)
    expect(screen.getByRole('status').textContent).toBe('Ellis voted for Avery.')
    expect(screen.getByLabelText('Avery: 3 votes')).toBeTruthy()
    expect(screen.getByLabelText('Blake: 0 votes')).toBeTruthy()
    expect(screen.queryByText('Remaining ballots')).toBeNull()

    advance(VOTE_REVEAL_STAGGER_MS)
    expect(screen.queryByText('Ballot 04')).toBeNull()
    expect(screen.queryByText('Ballot 03')).toBeNull()
    const batch = screen.getByRole('region', { name: 'Remaining ballots' })
    expect(
      within(within(batch).getByRole('list', { name: 'Remaining votes for Blake' }))
        .getAllByRole('listitem')
        .map((row) => row.textContent)
    ).toEqual(['Finn', 'Gale'])
    expect(screen.getByLabelText('Blake: 2 votes')).toBeTruthy()
    expect(screen.queryByText(/wins The Big Eye/)).toBeNull()
    expect(play.mock.calls.filter(([cue]) => cue === 'ui:tribunal_vote_reveal')).toHaveLength(3)

    advance(winnerHandoffDelayMs(2))
    expect(store.getState().game.seasonFinale?.winnerId).toBe('f1')
    expect(store.getState().finale.isActive).toBe(false)
  })

  it('spotlights the last ballot when it can still change the winner', () => {
    const store = openTribunal(['f1', 'f2', 'f1', 'f2', 'f2'])
    endArchive()
    advance(VOTE_REVEAL_INITIAL_DELAY_MS)
    for (let i = 0; i < 4; i++) advance(VOTE_REVEAL_STAGGER_MS)

    expect(screen.getByText('Ballot 05')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Gale voted for Blake.')
    expect(screen.queryByText('Remaining ballots')).toBeNull()
    expect(screen.getByLabelText('Blake: 3 votes')).toBeTruthy()
    advance(VOTE_REVEAL_STAGGER_MS)
    expect(screen.getByText('Final tally')).toBeTruthy()
    expect(screen.queryByText('Ballot 05')).toBeNull()
    expect(store.getState().finale.winnerId).toBe('f2')
  })

  it('cancels the pending reveal when the viewer skips the votes', () => {
    const store = openTribunal(['f1', 'f2', 'f1'])
    endArchive()
    fireEvent.click(screen.getByRole('button', { name: /Skip All/ }))
    expect(screen.getByText('Final tally')).toBeTruthy()
    expect(screen.getByLabelText('Avery: 2 votes')).toBeTruthy()
    advance(winnerHandoffDelayMs(0))
    expect(play.mock.calls.filter(([cue]) => cue === 'ui:tribunal_vote_reveal')).toHaveLength(0)
    expect(store.getState().game.seasonFinale?.winnerId).toBe('f1')
  })

  it('introduces the majority and counts a Version 2 ballot only when its seal lands', () => {
    openTribunal(['f1', 'f2', 'f1'], { presentation: 'v2' })
    endArchive()
    expect(screen.getByText('The first finalist to reach 2 votes wins')).toBeTruthy()
    expect(
      document.querySelectorAll('.fo-score--introducing .fo-score__portrait img')
    ).toHaveLength(2)
    expect(screen.queryByText('0 / 3 votes revealed')).toBeNull()

    advance(BALLOT_BEAT_MS.rules)
    expect(document.querySelector('.fo-score--introducing')).toBeNull()
    expect(screen.getByText('0 / 3 votes revealed')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Casey voted for…')
    expect(screen.getAllByText('Avery')).toHaveLength(1)

    advance(BALLOT_BEAT_MS.lead)
    expect(screen.getByRole('status').textContent).toBe('Casey voted for Avery.')
    expect(screen.getAllByText('Avery')).toHaveLength(2)
    expect(screen.getByLabelText('Avery: 0 votes')).toBeTruthy()

    advance(BALLOT_BEAT_MS.recipient)
    expect(document.querySelector('.fo-ballot-flight')).toBeTruthy()
    expect(document.querySelector('.fo-score__seals [data-pending]')).toBeTruthy()
    expect(screen.getByLabelText('Avery: 0 votes')).toBeTruthy()

    advance(BALLOT_BEAT_MS.flight)
    expect(screen.getByLabelText('Avery: 1 votes')).toBeTruthy()
    expect(screen.getByText('1 / 3 votes revealed')).toBeTruthy()
    expect(document.querySelector('.fo-ballot-flight')).toBeNull()
    expect(play.mock.calls.filter(([cue]) => cue === 'ui:tribunal_vote_reveal')).toHaveLength(1)
  })

  it('pauses the vote reveal while gameplay owns the presentation', async () => {
    openTribunal(['f1', 'f2', 'f1'], { presentation: 'v2' })
    endArchive()
    advance(BALLOT_BEAT_MS.rules)
    let release = () => {}
    act(() => {
      release = acquirePresentationOwnership(
        createPresentationOwnerToken(),
        'gameplay',
        PRESENTATION_PRIORITY.gameplay
      )
    })
    try {
      advance(10_000)
      expect(play).not.toHaveBeenCalled()
      await act(async () => release())
      expect(screen.getByRole('status').textContent).toBe('Casey voted for…')
      advance(BALLOT_BEAT_MS.lead)
      expect(screen.getByRole('status').textContent).toBe('Casey voted for Avery.')
    } finally {
      release()
    }
  })
})
