import * as React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import adsReducer from '../../src/store/adsSlice'
import challengeReducer from '../../src/store/challengeSlice'
import gameReducer from '../../src/store/gameSlice'
import profilesReducer from '../../src/store/profilesSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import GameScreen from '../../src/screens/GameScreen/GameScreen'
import settingsReducer from '../../src/store/settingsSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'
import { createInitialVoxPopuliState } from '../../src/features/twists/voxPopuli'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/store/confessionalDecisionSelectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/store/confessionalDecisionSelectors')>()),
  selectActiveConfessionalDecision: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => {
  return {
    default: function TvZoneMock({
      externalAnnouncement,
      onExternalAnnouncementDismiss,
      audiencePreviewAction,
      audiencePreviewReveal,
    }: {
      externalAnnouncement?: { title?: string; autoDismissMs?: number | null } | null
      onExternalAnnouncementDismiss?: (() => void) | undefined
      audiencePreviewAction?: { disabled: boolean; onClick: () => void } | null
      audiencePreviewReveal?: {
        onComplete: (reason: 'auto' | 'play') => void
      } | null
    }) {
      React.useEffect(() => {
        if (!externalAnnouncement?.autoDismissMs || !onExternalAnnouncementDismiss) {
          return
        }

        const timer = window.setTimeout(() => {
          onExternalAnnouncementDismiss()
        }, externalAnnouncement.autoDismissMs)

        return () => {
          window.clearTimeout(timer)
        }
      }, [externalAnnouncement, onExternalAnnouncementDismiss])

      return (
        <div data-testid="tv-zone">
          {externalAnnouncement?.title ? (
            <p data-testid="tv-zone-announcement">{externalAnnouncement.title}</p>
          ) : null}
          {audiencePreviewAction ? (
            <button
              type="button"
              disabled={audiencePreviewAction.disabled}
              onClick={audiencePreviewAction.onClick}
            >
              Check vote
            </button>
          ) : null}
          {audiencePreviewReveal ? (
            <button type="button" onClick={() => audiencePreviewReveal.onComplete('auto')}>
              Finish audience preview
            </button>
          ) : null}
        </div>
      )
    },
  }
})

function makeStore(gameOverrides: Partial<ReturnType<typeof gameReducer>> = {}) {
  const gameState = gameReducer(undefined, { type: '@@INIT' })

  return configureStore({
    reducer: {
      ads: adsReducer,
      challenge: challengeReducer,
      game: gameReducer,
      profiles: profilesReducer,
      publicOpinion: publicOpinionReducer,
      settings: settingsReducer,
      social: socialReducer,
      ui: uiReducer,
    },
    preloadedState: {
      game: {
        ...gameState,
        status: 'active',
        publicModeEnabled: false,
        ...gameOverrides,
      },
    },
  })
}

function renderGameScreen(store: ReturnType<typeof makeStore>, locationState?: unknown) {
  function LocationProbe() {
    const location = useLocation()
    return <output data-testid="location-probe">{location.pathname}</output>
  }

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: '/game', state: locationState }]}>
        <GameScreen />
        <LocationProbe />
      </MemoryRouter>
    </Provider>
  )
}

describe('GameScreen public meter gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('opens the Store without putting a disabled-mode message on the faux TV', async () => {
    const store = makeStore()
    const initialFeed = store.getState().game.tvFeed
    renderGameScreen(store)

    await act(async () => {})

    const publicMeterButton = screen.getByRole('button', { name: 'Public meter' })

    act(() => {
      publicMeterButton.click()
      publicMeterButton.click()
    })

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/store')
    expect(screen.queryByTestId('tv-zone-announcement')).toBeNull()
    expect(store.getState().game.tvFeed).toEqual(initialFeed)
  })

  it('shows the in-house social gating announcement without adding log entries during live vote', async () => {
    const store = makeStore({ phase: 'live_vote' })
    const initialFeed = store.getState().game.tvFeed
    renderGameScreen(store)

    await act(async () => {})

    act(() => {
      within(screen.getByRole('toolbar', { name: 'Game actions' }))
        .getByRole('button', { name: 'Social' })
        .click()
    })

    expect(screen.getByTestId('tv-zone-announcement')).toHaveTextContent(
      'Players are now being called to the confessional for the elimination. Try again later.'
    )
    expect(store.getState().game.tvFeed).toEqual(initialFeed)

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByTestId('tv-zone-announcement')).toBeNull()
  })

  it('shows the terminal season-over state instead of out-of-house social actions', async () => {
    const baseGameState = gameReducer(undefined, { type: '@@INIT' })
    const store = makeStore({
      players: baseGameState.players.map((player) =>
        player.isUser ? { ...player, status: 'evicted' } : player
      ),
    })
    const initialFeed = store.getState().game.tvFeed
    renderGameScreen(store)

    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Your season is over' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'You were eliminated before the Tribunal began, so you cannot return to the game or cast a finale vote.'
      )
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('toolbar', { name: 'Game actions' })).getByRole('button', {
        name: 'Social',
      })
    ).toHaveAttribute('aria-disabled', 'true')
    expect(store.getState().game.tvFeed).toEqual(initialFeed)
  })

  it('resumes a sealed live-vote ballot after returning from the Confessional', async () => {
    const baseGameState = gameReducer(undefined, { type: '@@INIT' })
    const human = baseGameState.players.find((player) => player.isUser)!
    const nominee = baseGameState.players.find((player) => !player.isUser)!
    const store = makeStore({
      phase: 'live_vote',
      votes: { [human.id]: nominee.id },
      awaitingHumanVote: false,
      awaitingDoubleVoteOffer: false,
      awaitingTieBreak: false,
      awaitingFinal3Eviction: false,
      awaitingVoteDeductionPrompt: false,
      voteResults: null,
    })

    renderGameScreen(store, { resumedFromConfessional: true, returnCue: 'live_vote' })
    await act(async () => {})

    expect(store.getState().game.phase).not.toBe('live_vote')
  })

  it('reveals the optional Vox audience snapshot from the Faux TV and closes it cleanly', async () => {
    const baseGameState = gameReducer(undefined, { type: '@@INIT' })
    const nominees = baseGameState.players.filter((player) => !player.isUser).slice(0, 2)
    const store = makeStore({
      phase: 'nomination_results',
      week: 3,
      nomineeIds: nominees.map((player) => player.id),
      voteResults: null,
      voxPopuli: {
        ...createInitialVoxPopuliState(null),
        status: 'active',
        activatedSeason: baseGameState.season,
        activatedWeek: 1,
      },
    })

    renderGameScreen(store)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Check vote' }))
    expect(screen.getByRole('dialog', { name: 'See How the Vote Is Going?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show Me the Vote' }))

    expect(screen.getByRole('button', { name: 'Finish audience preview' })).toBeInTheDocument()
    expect(store.getState().game.voxPopuli?.audiencePreviewWeek).toBe(3)

    fireEvent.click(screen.getByRole('button', { name: 'Finish audience preview' }))
    expect(screen.queryByRole('button', { name: 'Finish audience preview' })).toBeNull()
  })

  it('keeps Play with the Vox Final Three presentation while its reveal is active', async () => {
    const baseGameState = gameReducer(undefined, { type: '@@INIT' })
    const human = baseGameState.players.find((player) => player.isUser)!
    const nominee = baseGameState.players.find((player) => !player.isUser)!
    const store = makeStore({
      phase: 'final3_decision',
      nomineeIds: [human.id, nominee.id],
      voxPopuli: {
        ...createInitialVoxPopuliState(null),
        status: 'active',
        activatedSeason: baseGameState.season,
        activatedWeek: 1,
        awaitingPublicVote: true,
        publicVoteContext: 'final3',
        finaleStage: 'ready',
      },
    })
    const presentation = document.createElement('div')
    presentation.setAttribute('data-vox-final-three-presentation', 'true')
    document.body.appendChild(presentation)

    try {
      renderGameScreen(store)
      await act(async () => {})

      const alreadyCancelled = new Event('ui:playPressed', { cancelable: true })
      alreadyCancelled.preventDefault()
      window.dispatchEvent(alreadyCancelled)
      expect(alreadyCancelled.defaultPrevented).toBe(true)
      expect(store.getState().game.voxPopuli?.awaitingPublicVote).toBe(true)

      const ownedByPresentation = new Event('ui:playPressed', { cancelable: true })
      window.dispatchEvent(ownedByPresentation)
      expect(ownedByPresentation.defaultPrevented).toBe(true)
    } finally {
      presentation.remove()
    }
  })
})
