import { act, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { backdoorPresentationMiddleware } from '../../../broadcasting/backdoorPresentationMiddleware'
import { selectPendingAmbushBroadcast } from '../../../broadcasting/fauxTvPresentation'
import { registerAmbush } from '../../../cinematic/ceremonies/runtime.mjs'
import { I18nContext, type I18nContextValue } from '../../../i18n/I18nContext'
import { translate } from '../../../i18n/messages'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
  PRESENTATION_PRIORITY,
} from '../../../services/presentation/presentationOwnership'
import socialReducer from '../../../social/socialSlice'
import challengeReducer from '../../../store/challengeSlice'
import finaleReducer from '../../../store/finaleSlice'
import gameReducer, { addTvEvent, advance, hydrateGame } from '../../../store/gameSlice'
import { withLohNominationPlanning } from '../../../store/lohNominationPlanning'
import profilesReducer from '../../../store/profilesSlice'
import settingsReducer from '../../../store/settingsSlice'
import type { Player } from '../../../types'
import TvZone from '../TvZone'

const i18n: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: (value) => String(value),
  formatDate: (value) => String(value),
}

const replacementText = 'Zed named Ash as the backup nominee.'
const ambushCardName = 'Announcement: AMBUSH'
const ledSelector = '[data-backdoor-spotlight="true"]'
const players: Player[] = [
  { id: 'human', name: 'Player', avatar: '', status: 'active', isUser: true },
  { id: 'zed', name: 'Zed', avatar: '', status: 'loh' },
  { id: 'ash', name: 'Ash', avatar: '', status: 'nominated' },
  { id: 'quinn', name: 'Quinn', avatar: '', status: 'nominated' },
  { id: 'lia', name: 'Lia', avatar: '', status: 'active' },
  { id: 'remy', name: 'Remy', avatar: '', status: 'pos' },
  { id: 'finn', name: 'Finn', avatar: '', status: 'active' },
  { id: 'aria', name: 'Aria', avatar: '', status: 'active' },
]

function ambushStore() {
  const store = configureStore({
    reducer: {
      game: withLohNominationPlanning(gameReducer, () => 0),
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
      settings: settingsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(backdoorPresentationMiddleware),
  })
  const game = store.getState().game
  store.dispatch(
    hydrateGame({
      ...game,
      gameId: crypto.randomUUID(),
      phase: 'pos_ceremony_results',
      status: 'active',
      week: 10,
      lohId: 'zed',
      players,
      posWinnerId: 'remy',
      povSavedId: 'lia',
      nomineeIds: ['quinn', 'ash'],
      replacementNomineeIds: ['ash'],
      tvFeed: [],
      broadcastQueue: [],
      lohNominationPlan: {
        week: 10,
        lohId: 'zed',
        targetId: 'ash',
        backupTargetId: null,
        pawnIds: ['quinn', 'lia'],
        initialNomineeIds: ['quinn', 'lia'],
        strategy: 'backdoor',
        status: 'executed',
        selectionBasis: 'strategy',
        targetScore: 80,
        backdoorChance: 0.5,
        revealPending: true,
      },
    })
  )
  return store
}

function renderTv(store: ReturnType<typeof ambushStore>, blocked: boolean) {
  const screenFor = (ambushPresentationBlocked: boolean) => (
    <I18nContext.Provider value={i18n}>
      <Provider store={store}>
        <MemoryRouter>
          <TvZone ambushPresentationBlocked={ambushPresentationBlocked} />
        </MemoryRouter>
      </Provider>
    </I18nContext.Provider>
  )
  const view = render(screenFor(blocked))
  return (blocked: boolean) => view.rerender(screenFor(blocked))
}

function play(store: ReturnType<typeof ambushStore>) {
  act(() => {
    if (window.dispatchEvent(new Event('ui:playPressed', { cancelable: true })))
      store.dispatch(advance())
  })
}

afterEach(() => vi.useRealTimers())

describe('Ambush Safety results handoff', () => {
  it('shows the replacement first, holds a covered card, accents the Ambush once, and then advances', async () => {
    vi.useFakeTimers()
    const store = ambushStore()
    store.dispatch(
      addTvEvent({
        text: replacementText,
        type: 'game',
        meta: { forceOnTv: true, broadcastLevel: 'minor' },
      })
    )
    const rerender = renderTv(store, true)
    act(() => store.dispatch(advance()))
    const ambush = selectPendingAmbushBroadcast(store.getState().game)!
    expect(store.getState().game.broadcastQueue?.at(-1)).toBe(ambush.id)
    expect(document.querySelector('.tv-zone__now')).toHaveTextContent(replacementText)
    expect(screen.queryByRole('dialog', { name: ambushCardName })).toBeNull()

    play(store)
    play(store)
    expect(store.getState().game.phase).toBe('pos_ceremony_results')
    expect(store.getState().game.activeBroadcastEventId).not.toBe(ambush.id)
    expect(document.querySelector('.tv-zone__now')).toHaveTextContent(replacementText)
    expect(document.querySelector(ledSelector)).toBeNull()

    const release = acquirePresentationOwnership(
      createPresentationOwnerToken(),
      'replacement-film',
      PRESENTATION_PRIORITY.ceremony
    )
    try {
      rerender(false)
      const fallback = document.querySelector('.tv-zone__now')
      expect(fallback).toHaveAttribute('aria-hidden', 'false')
      expect(fallback).toHaveTextContent(replacementText)
      expect(screen.queryByRole('dialog', { name: ambushCardName })).toBeNull()
      play(store)
      expect(selectPendingAmbushBroadcast(store.getState().game)?.id).toBe(ambush.id)
    } finally {
      await act(async () => release())
    }

    expect(screen.getByRole('dialog', { name: ambushCardName })).toHaveTextContent(
      'Ash was the real target all along.'
    )
    expect(store.getState().game.activeBroadcastEventId).toBe(ambush.id)
    await act(async () => vi.advanceTimersByTime(350))
    expect(document.querySelectorAll(ledSelector)).toHaveLength(1)

    play(store)
    expect(store.getState().game.phase).toBe('social_2')
    expect(
      store.getState().game.tvFeed.find(({ id }) => id === ambush.id)?.meta?.broadcastConsumed
    ).toBe(true)
    expect(screen.queryByRole('dialog', { name: ambushCardName })).toBeNull()
    expect(document.querySelector(ledSelector)).toBeNull()
    expect(document.querySelector('.tv-zone__now')).not.toBeEmptyDOMElement()
    expect(document.querySelector('.tv-zone__now')).not.toHaveTextContent('ambush')
  })

  it('restores an unread legacy Ambush in Safety results and leaves later phases clear', () => {
    const store = ambushStore()
    store.dispatch(advance())
    const game = store.getState().game
    const ambush = selectPendingAmbushBroadcast(game)!
    const legacy = {
      ...ambush,
      meta: { ...ambush.meta, broadcastManaged: undefined, broadcastLevel: undefined },
    }
    const savedGame = { ...game, tvFeed: [legacy], broadcastQueue: [] }

    store.dispatch(hydrateGame(savedGame))
    expect(store.getState().game.broadcastQueue).toEqual([ambush.id])
    expect(selectPendingAmbushBroadcast(store.getState().game)?.meta?.broadcastLevel).toBe('major')
    store.dispatch(advance())
    expect(store.getState().game.phase).toBe('pos_ceremony_results')

    store.dispatch(hydrateGame({ ...savedGame, phase: 'social_2' }))
    expect(store.getState().game.broadcastQueue).not.toContain(ambush.id)
    expect(selectPendingAmbushBroadcast(store.getState().game)).toBeUndefined()
  })

  it('offers the VIP handoff once and ignores its callback after the Ambush ends', async () => {
    const store = ambushStore()
    let finishFilm: (() => void) | undefined
    const requestFilm = vi.fn((fallback: () => void) => {
      finishFilm = fallback
      return true
    })
    const unregister = registerAmbush(requestFilm)
    try {
      renderTv(store, false)
      play(store)
      expect(requestFilm).toHaveBeenCalledTimes(1)
      const ambush = selectPendingAmbushBroadcast(store.getState().game)!
      const release = acquirePresentationOwnership(
        createPresentationOwnerToken(),
        'vip-cinematic',
        PRESENTATION_PRIORITY.ceremony
      )
      try {
        await act(async () => undefined)
        expect(screen.queryByRole('dialog', { name: ambushCardName })).toBeNull()
        expect(document.querySelector('.tv-zone__now')).not.toBeEmptyDOMElement()
        play(store)
        expect(selectPendingAmbushBroadcast(store.getState().game)?.id).toBe(ambush.id)
      } finally {
        await act(async () => release())
      }

      act(() => finishFilm?.())
      expect(document.querySelectorAll(ledSelector)).toHaveLength(1)
      play(store)
      act(() => finishFilm?.())
      expect(store.getState().game.phase).toBe('social_2')
      expect(requestFilm).toHaveBeenCalledTimes(1)
      expect(document.querySelector(ledSelector)).toBeNull()
    } finally {
      unregister()
    }
  })
})
