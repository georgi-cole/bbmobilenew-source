import React, { type ComponentProps } from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, {
  addCustomBroadcast,
  addTvEvent,
  advance,
  consumeBroadcastEvent,
  createInitialGameState,
  hydrateGame,
  resetGame,
  setBroadcastOverride,
  setPhase,
  syncPhaseBroadcasts,
  updateTvEvent,
  updateCustomBroadcast,
} from '../src/store/gameSlice'
import settingsReducer from '../src/store/settingsSlice'
import profilesReducer from '../src/store/profilesSlice'
import challengeReducer from '../src/store/challengeSlice'
import finaleReducer from '../src/store/finaleSlice'
import socialReducer from '../src/social/socialSlice'
import TvZone from '../src/components/ui/TvZone'
import { I18nContext, type I18nContextValue } from '../src/i18n/I18nContext'
import { translate } from '../src/i18n/messages'
import {
  getBroadcastTemplate,
  renderBroadcastTemplate,
} from '../src/broadcasting/broadcastTemplateCatalog'
import { createPresentationEventClaim } from '../src/broadcasting/fauxTvPresentation'
import {
  buildResumeRecapFromGame,
  RESUME_RECAP_MIN_ABSENCE_MS,
} from '../src/broadcasting/programmingDesk'
import { isVisibleInMainLog, isVisibleOnTv } from '../src/services/activityService'
import type { GameState, TvEvent } from '../src/types'

const i18n: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: String,
  formatDate: String,
}

function initialGame(overrides: Partial<GameState> = {}): GameState {
  const base = createInitialGameState({ seed: 927 })
  return {
    ...base,
    phase: 'social_2',
    week: 6,
    mode: 'classic',
    tvFeed: [],
    broadcastQueue: [],
    activeBroadcastEventId: null,
    presentationEventClaims: [],
    lastPlainBroadcastEventId: null,
    broadcastOverrides: {},
    customBroadcasts: [],
    voxPopuli: { ...base.voxPopuli!, status: 'inactive' },
    cupidArrow: { ...base.cupidArrow!, status: 'inactive' },
    ...overrides,
  }
}
function makeStore(overrides: Partial<GameState> = {}) {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
      social: socialReducer,
    },
    preloadedState: { game: initialGame(overrides) },
  })
}
function tvUi(store: ReturnType<typeof makeStore>, props: ComponentProps<typeof TvZone> = {}) {
  return (
    <I18nContext.Provider value={i18n}>
      <Provider store={store}>
        <MemoryRouter>
          <TvZone {...props} />
        </MemoryRouter>
      </Provider>
    </I18nContext.Provider>
  )
}
function show(store: ReturnType<typeof makeStore>, props?: ComponentProps<typeof TvZone>) {
  return render(tvUi(store, props))
}
function nowText() {
  return document.querySelector('.tv-zone__now')?.textContent ?? ''
}
function play() {
  let allowed = false
  act(() => {
    allowed = window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
  })
  return allowed
}
const STREAM = [
  'The holder decides to use Detox.',
  'The original block is cleared.',
  'The replacements are confirmed.',
]
function publishStream(store: ReturnType<typeof makeStore>) {
  act(() => {
    for (const text of STREAM)
      store.dispatch(
        addTvEvent({
          text,
          type: 'game',
          meta: { sequence: 'detox_safety' },
        })
      )
  })
}

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0)
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Faux TV event ownership and relevance', () => {
  it.each(
    (['classic', 'vox', 'cupid', 'survival'] as const).flatMap((campaign) =>
      (['social_2', 'pos_results', 'eviction_results'] as const).map(
        (phase) => [campaign, phase] as const
      )
    )
  )('keeps previous-phase history off live TV in %s / %s', (campaign, phase) => {
    const base = initialGame()
    const store = makeStore({
      phase: 'social_1',
      mode: campaign === 'survival' ? 'survival' : 'classic',
      expansionMode: campaign === 'vox' ? 'voxPopuli' : campaign === 'cupid' ? 'cupidArrow' : null,
      voxPopuli: { ...base.voxPopuli!, status: campaign === 'vox' ? 'active' : 'inactive' },
      cupidArrow: { ...base.cupidArrow!, status: campaign === 'cupid' ? 'active' : 'inactive' },
    })
    store.dispatch(addTvEvent({ text: 'Earlier social news.', type: 'social' }))
    store.dispatch(
      addTvEvent({
        text: 'Earlier major result.',
        type: 'game',
        meta: { major: 'custom_major', forceOnTv: true, announcementTitle: 'Old result' },
      })
    )
    store.dispatch(setPhase(phase))
    show(store)
    const viewport = screen.getByRole('region', { name: 'Live game events display' })
    expect(viewport).not.toHaveTextContent('Earlier social news.')
    expect(viewport).not.toHaveTextContent('Earlier major result.')
    expect(
      screen.queryByRole('dialog', { name: 'Announcement: Old result' })
    ).not.toBeInTheDocument()
    expect(store.getState().game.tvFeed).toHaveLength(2)
  })

  it('acknowledges a burst-created managed shock once, including after returning to the TV', () => {
    const store = makeStore({ phase: 'pos_results' })
    store.dispatch(addTvEvent({ text: 'Before the Safety shock.', type: 'game' }))
    const view = show(store)
    act(() => {
      store.dispatch(
        addTvEvent({
          text: 'A Safety power has activated.',
          type: 'twist',
          meta: { major: 'vip_veto', forceOnTv: true, broadcastLevel: 'critical' },
        })
      )
      store.dispatch(
        addTvEvent({ text: 'The holder must now choose.', type: 'game', meta: { forceOnTv: true } })
      )
    })
    const shock = store.getState().game.tvFeed.find((event) => event.meta?.major === 'vip_veto')!
    fireEvent.click(
      within(screen.getByTestId('shock-intro-overlay')).getByRole('button', { name: 'OK' })
    )
    play()
    expect(
      store.getState().game.tvFeed.find((event) => event.id === shock.id)?.meta?.broadcastConsumed
    ).toBe(true)
    expect(store.getState().game.broadcastQueue).not.toContain(shock.id)
    view.unmount()
    show(store)
    expect(screen.queryByTestId('shock-intro-overlay')).not.toBeInTheDocument()
    expect(nowText()).toBe('The holder must now choose.')
  })
})

describe('durable Detox playback', () => {
  it('blocks Play and reducer advances, then resumes the remaining beats from a saved snapshot', () => {
    vi.useFakeTimers()
    const store = makeStore({ phase: 'pos_ceremony_results' })
    publishStream(store)
    const view = show(store)
    expect(nowText()).toBe(STREAM[0])
    expect(play()).toBe(false)
    act(() => {
      store.dispatch(advance())
    })
    expect(store.getState().game.phase).toBe('pos_ceremony_results')
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(nowText()).toBe(STREAM[1])
    const saved = JSON.parse(JSON.stringify(store.getState().game)) as GameState
    view.unmount()
    const resumed = makeStore()
    resumed.dispatch(hydrateGame(saved))
    show(resumed)
    expect(nowText()).toBe(STREAM[1])
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(nowText()).toBe(STREAM[2])
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(document.querySelector('.tv-zone--detox-stream')).toBeNull()
    expect(
      resumed.getState().game.tvFeed.every((event) => event.meta?.broadcastConsumed === true)
    ).toBe(true)
    expect(play()).toBe(true)
  })

  it('recovers unqueued legacy beats and does not mistake a start claim for completion', () => {
    vi.useFakeTimers()
    const base = initialGame({ phase: 'pos_ceremony_results' })
    const events: TvEvent[] = STREAM.map((text, index) => ({
      id: `legacy-detox-${index}`,
      text,
      type: 'game',
      timestamp: index + 1,
      meta: {
        phase: base.phase,
        week: base.week,
        sequence: 'detox_safety',
        broadcastManaged: true,
        broadcastLevel: 'minor',
      },
    }))
    const store = makeStore({
      ...base,
      tvFeed: [...events].reverse(),
      broadcastQueue: [],
      presentationEventClaims: [createPresentationEventClaim(base.gameId, events[0])],
    })
    show(store)
    expect(nowText()).toBe(STREAM[0])
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(nowText()).toBe(STREAM[1])
  })

  it('cancels the old stream when its phase ends', () => {
    vi.useFakeTimers()
    const store = makeStore({ phase: 'pos_ceremony_results' })
    publishStream(store)
    show(store)
    const firstId = store.getState().game.tvFeed.find((event) => event.text === STREAM[0])!.id
    act(() => {
      store.dispatch(setPhase('social_2'))
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(nowText()).not.toContain('Detox')
    expect(document.querySelector('.tv-zone--detox-stream')).toBeNull()
    expect(
      store.getState().game.tvFeed.find((event) => event.id === firstId)?.meta?.broadcastConsumed
    ).not.toBe(true)
  })

  it('holds its timer while an external announcement covers the stream', () => {
    vi.useFakeTimers()
    const store = makeStore({ phase: 'pos_ceremony_results' })
    publishStream(store)
    const view = show(store, {
      externalAnnouncement: {
        key: 'audit-cover',
        title: 'A foreground announcement',
        subtitle: 'Please read this first.',
        isLive: false,
        autoDismissMs: null,
      },
    })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(
      store.getState().game.tvFeed.every((event) => event.meta?.broadcastConsumed !== true)
    ).toBe(true)
    view.rerender(tvUi(store))
    expect(nowText()).toBe(STREAM[0])
    act(() => {
      vi.advanceTimersByTime(2599)
    })
    expect(nowText()).toBe(STREAM[0])
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(nowText()).toBe(STREAM[1])
  })
})

describe('delivery settings and ambient programming', () => {
  it('applies an unchecked opening card before the first render of a fresh season', () => {
    const store = makeStore()
    store.dispatch(
      addCustomBroadcast({
        id: 'unchecked-opening',
        phase: 'season_start',
        text: 'An unchecked opening.',
        title: 'Unchecked opening',
        type: 'game',
        level: 'critical',
        enabled: true,
        forceOnTv: false,
      })
    )
    store.dispatch(resetGame())
    const opening = store
      .getState()
      .game.tvFeed.find((event) => event.meta?.customBroadcastId === 'unchecked-opening')!
    expect(opening).toBeDefined()
    expect(isVisibleOnTv(opening)).toBe(false)
    show(store)
    expect(
      screen.queryByRole('dialog', { name: 'Announcement: Unchecked opening' })
    ).not.toBeInTheDocument()
  })

  it('shows new ambient weather after an acknowledged foreground line without another Play barrier', () => {
    const store = makeStore()
    store.dispatch(
      addTvEvent({
        text: 'The nominees have made their pitches.',
        type: 'social',
        meta: { forceOnTv: true },
      })
    )
    store.dispatch(consumeBroadcastEvent(store.getState().game.tvFeed[0].id))
    store.dispatch(
      addTvEvent({
        text: '20°C · A calm evening in the Hub.',
        type: 'social',
        channels: ['tv', 'mainLog'],
        meta: {
          weatherBulletin: true,
          editorial: { importance: 'optional', presentationMode: 'ambient' },
        },
      })
    )
    show(store)
    expect(nowText()).toBe('20°C · A calm evening in the Hub.')
    expect(store.getState().game.broadcastQueue).toEqual([])
    expect(play()).toBe(true)
  })

  it('keeps unchecked major cards in history without reaching a fallback announcement', () => {
    const store = makeStore()
    store.dispatch(
      addCustomBroadcast({
        id: 'unchecked',
        key: 'custom.unchecked',
        phase: 'social_2',
        text: 'History-only major card.',
        title: 'Unchecked major',
        type: 'game',
        level: 'major',
        enabled: true,
        forceOnTv: false,
      })
    )
    show(store)
    expect(store.getState().game.broadcastQueue).toEqual([])
    expect(
      screen.queryByRole('dialog', { name: 'Announcement: Unchecked major' })
    ).not.toBeInTheDocument()
    expect(nowText()).not.toContain('History-only')
    expect(
      store.getState().game.tvFeed.some((event) => event.text === 'History-only major card.')
    ).toBe(true)
  })

  it('honors a manager opt-out even when a runtime critical producer requests TV', () => {
    const store = makeStore({ phase: 'pos_results' })
    store.dispatch(setBroadcastOverride({ id: 'shock.vip-veto', changes: { forceOnTv: false } }))
    store.dispatch(
      addTvEvent({
        text: 'A forced Safety announcement.',
        type: 'twist',
        meta: { major: 'vip_veto', forceOnTv: true },
      })
    )
    show(store)
    expect(store.getState().game.broadcastQueue).toEqual([])
    expect(screen.queryByTestId('shock-intro-overlay')).not.toBeInTheDocument()
    expect(isVisibleOnTv(store.getState().game.tvFeed[0])).toBe(false)
  })

  it('routes vote receipts to the log and requires an explicit opt-in to promote them', () => {
    const receipt = {
      text: 'Ali voted to eliminate Ivy.',
      type: 'vote' as const,
      channels: ['mainLog' as const],
    }
    expect(isVisibleInMainLog(receipt)).toBe(true)
    expect(isVisibleOnTv(receipt)).toBe(false)
    expect(isVisibleOnTv({ ...receipt, meta: { forceOnTv: true } })).toBe(true)
    const store = makeStore()
    store.dispatch(addTvEvent(receipt))
    show(store)
    expect(nowText()).not.toContain(receipt.text)
    expect(store.getState().game.tvFeed[0].text).toBe(receipt.text)
  })
})

describe('occurrence identity and live corrections', () => {
  it('does not revive an acknowledged story when a later producer changes its phase or destination', () => {
    let game = initialGame({ phase: 'social_1' })
    game = gameReducer(
      game,
      addTvEvent({
        text: 'A public milestone.',
        type: 'game',
        channels: ['mainLog'],
        meta: { editorial: { storyKey: 'one-milestone' } },
      })
    )
    const original = game.tvFeed[0]
    game = gameReducer(game, consumeBroadcastEvent(original.id))
    game = gameReducer(game, setPhase('social_2'))
    game = gameReducer(
      game,
      addTvEvent({
        text: 'The same milestone, reworded.',
        type: 'game',
        channels: ['tv', 'mainLog'],
        meta: { forceOnTv: true, editorial: { storyKey: 'one-milestone' } },
      })
    )
    expect(game.tvFeed).toHaveLength(1)
    expect(game.tvFeed[0]).toMatchObject({
      id: original.id,
      channels: ['mainLog'],
      meta: { broadcastConsumed: true },
    })
    expect(game.broadcastQueue).toEqual([])
  })

  it('keeps independent same-wording events scoped to their phase and destination', () => {
    let game = initialGame({ phase: 'social_1' })
    game = gameReducer(
      game,
      addTvEvent({
        text: 'The offer was declined.',
        type: 'diary',
        source: 'manual',
        channels: ['dr'],
      })
    )
    const original = game.tvFeed[0]
    game = gameReducer(game, setPhase('social_2'))
    game = gameReducer(
      game,
      addTvEvent({
        text: 'The offer was declined.',
        type: 'game',
        source: 'system',
        channels: ['tv'],
        meta: { forceOnTv: true },
      })
    )
    expect(game.tvFeed).toHaveLength(2)
    expect(game.tvFeed.find((event) => event.id === original.id)).toEqual(original)
    expect(game.broadcastQueue).toContain(game.tvFeed[0].id)
  })

  it('deduplicates a logical story even when its wording changes', () => {
    let game = initialGame()
    for (const text of ['The Safety result has arrived.', 'The Safety result is now official.']) {
      game = gameReducer(
        game,
        addTvEvent({
          text,
          type: 'game',
          meta: { forceOnTv: true, editorial: { storyKey: 'same-safety-result' } },
        })
      )
    }
    expect(game.tvFeed).toHaveLength(1)
    expect(game.broadcastQueue).toHaveLength(1)
  })

  it('preserves card delivery on copy-only updates and removes an explicit opt-out atomically', () => {
    let game = initialGame()
    game = gameReducer(
      game,
      addTvEvent({
        text: 'Original card.',
        type: 'game',
        meta: { major: 'custom_major', broadcastLevel: 'major', forceOnTv: true },
      })
    )
    const original = game.tvFeed[0]
    game = gameReducer(
      game,
      updateTvEvent({ id: original.id, text: 'Corrected card.', type: 'game' })
    )
    expect(game.tvFeed[0]).toMatchObject({
      id: original.id,
      timestamp: original.timestamp,
      meta: { broadcastLevel: 'major', major: 'custom_major', forceOnTv: true },
    })
    expect(game.broadcastQueue).toContain(original.id)
    game = gameReducer(
      game,
      updateTvEvent({ id: original.id, text: 'Corrected card.', type: 'game', forceOnTv: false })
    )
    expect(game.broadcastQueue).not.toContain(original.id)
    expect(isVisibleOnTv(game.tvFeed[0])).toBe(false)
  })

  it('retains corrected live names on refresh and uses them in a later authored template', () => {
    let game = initialGame({ phase: 'loh_results' })
    const template = getBroadcastTemplate('loh.winner')!
    game = gameReducer(
      game,
      addTvEvent({ text: renderBroadcastTemplate(template.text, ['Ali']), type: 'game' })
    )
    const id = game.tvFeed[0].id
    const corrected = renderBroadcastTemplate(template.text, ['Ivy'])
    game = gameReducer(game, updateTvEvent({ id, text: corrected, type: 'game' }))
    game = gameReducer(game, syncPhaseBroadcasts({ phase: 'loh_results' }))
    expect(game.tvFeed.find((event) => event.id === id)?.text).toBe(corrected)
    game = gameReducer(
      game,
      setBroadcastOverride({ id: 'loh.winner', changes: { text: '{winner} wins power today.' } })
    )
    expect(game.tvFeed.find((event) => event.id === id)?.text).toBe('Ivy wins power today.')
  })

  it('keeps a live opt-out through refresh until a new source delivery decision supersedes it', () => {
    let game = initialGame()
    game = gameReducer(
      game,
      addTvEvent({ text: 'One current card.', type: 'game', meta: { forceOnTv: true } })
    )
    const event = game.tvFeed[0]
    const sourceId = event.meta!.broadcastTemplateId as string
    game = gameReducer(game, setBroadcastOverride({ id: sourceId, changes: { forceOnTv: true } }))
    game = gameReducer(
      game,
      updateTvEvent({ id: event.id, text: event.text, type: event.type, forceOnTv: false })
    )
    game = gameReducer(game, syncPhaseBroadcasts({ phase: 'social_2' }))
    expect(game.broadcastQueue).not.toContain(event.id)
    expect(isVisibleOnTv(game.tvFeed.find((item) => item.id === event.id)!)).toBe(false)
    game = gameReducer(game, setBroadcastOverride({ id: sourceId, changes: { forceOnTv: true } }))
    expect(game.broadcastQueue).toContain(event.id)
  })

  it('removes a custom source from the live queue in the same authoring update', () => {
    let game = initialGame()
    const custom = {
      id: 'live-custom',
      phase: 'social_2' as const,
      text: 'One custom message.',
      type: 'game' as const,
      level: 'major' as const,
      forceOnTv: true,
      enabled: true,
    }
    game = gameReducer(game, addCustomBroadcast(custom))
    game = gameReducer(game, syncPhaseBroadcasts({ phase: 'social_2' }))
    const id = game.tvFeed[0].id
    expect(game.broadcastQueue).toContain(id)
    game = gameReducer(game, updateCustomBroadcast({ ...custom, forceOnTv: false }))
    expect(game.broadcastQueue).not.toContain(id)
    expect(isVisibleOnTv(game.tvFeed.find((event) => event.id === id)!)).toBe(false)
  })

  it('preserves emission order when a queue is rebuilt with equal priorities and timestamps', () => {
    vi.useFakeTimers()
    let game = initialGame()
    for (let index = 0; index < 12; index++)
      game = gameReducer(
        game,
        addTvEvent({
          text: `Ordered beat ${index}`,
          type: 'game',
          meta: { forceOnTv: true },
        })
      )
    const order = [...game.broadcastQueue!]
    game = gameReducer(game, syncPhaseBroadcasts({ phase: 'social_2' }))
    expect(game.broadcastQueue).toEqual(order)
  })
})

describe('resume recap rules', () => {
  function recap(game: GameState) {
    return buildResumeRecapFromGame(game, Date.now() - RESUME_RECAP_MIN_ABSENCE_MS - 1)?.text ?? ''
  }
  it('describes Vox immunity without inventing LOH powers', () => {
    const game = initialGame({ phase: 'pos_results' })
    const winner = game.players[0]
    game.lohId = winner.id
    game.voxPopuli = { ...game.voxPopuli!, status: 'active', immunityWinnerId: winner.id }
    expect(recap(game)).toContain(`${winner.name} have immunity.`)
    expect(recap(game)).not.toContain('LOH')
    game.voxPopuli.immunityWinnerId = null
    expect(recap(game)).not.toContain('has immunity')
    expect(recap(game)).not.toContain('LOH')
  })
  it('names both active Cupid co-holders and returns to individual wording after the spell breaks', () => {
    const game = initialGame({ phase: 'pos_results' })
    const [first, second] = game.players
    game.lohId = first.id
    game.posWinnerId = first.id
    game.cupidArrow = {
      ...game.cupidArrow!,
      status: 'active',
      pairs: [{ id: 'pair', memberIds: [first.id, second.id], color: '#f09' }],
    }
    expect(recap(game)).toContain(`${first.name} and ${second.name} hold LOH together.`)
    expect(recap(game)).toContain(`${first.name} and ${second.name} won the Power of Safety.`)
    game.cupidArrow.status = 'broken'
    expect(recap(game)).toContain(`${first.name} hold LOH.`)
    expect(recap(game)).not.toContain('hold LOH together')
  })
})
