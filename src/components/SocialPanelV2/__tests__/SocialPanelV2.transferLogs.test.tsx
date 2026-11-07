import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, { addTvEvent } from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import socialReducer, { openSocialPanel, recordSocialAction } from '../../../social/socialSlice'
import { initManeuvers } from '../../../social/SocialManeuvers'
import SocialPanelV2 from '../SocialPanelV2'
import type { RootState } from '../../../store/store'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  const base = configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
  })
  const defaultState = base.getState() as RootState
  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
    preloadedState: {
      game: { ...defaultState.game, phase: 'social_1' as RootState['game']['phase'] },
      social: defaultState.social,
      settings: defaultState.settings,
    },
  })
  initManeuvers(store)
  return store
}

function renderPanel(store: ReturnType<typeof makeStore>) {
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <SocialPanelV2 />
      </Provider>
    </MemoryRouter>
  )
}

describe('SocialPanelV2 — closing a session', () => {
  it.each([
    { kind: 'empty', count: 0, human: true },
    { kind: 'one human action', count: 1, human: true },
    { kind: 'several human actions', count: 3, human: true },
    { kind: 'AI actions', count: 2, human: false },
  ])('keeps existing receipts without adding a duplicate summary for $kind', ({ count, human }) => {
    const store = makeStore()
    const players = store.getState().game.players
    const actor = players.find((player) => Boolean(player.isUser) === human)!
    const target = players.find((player) => player.id !== actor.id && !player.isUser)!
    store.dispatch(openSocialPanel())
    for (let index = 0; index < count; index += 1) {
      store.dispatch(
        recordSocialAction({
          entry: {
            actionId: 'compliment',
            actorId: actor.id,
            targetId: target.id,
            cost: 1,
            delta: 2,
            outcome: 'success',
            newEnergy: 4 - index,
            timestamp: index + 1,
          },
        })
      )
      if (human)
        store.dispatch(
          addTvEvent({
            type: 'social',
            text: `You complimented ${target.name} (${index + 1}).`,
            source: 'manual',
            channels: ['mainLog'],
            meta: { suppressTv: true },
          })
        )
    }
    const feed = store.getState().game.tvFeed
    expect(store.getState().social.sessionLogs).toHaveLength(count)
    if (human) expect(feed.filter((event) => event.type === 'social')).toHaveLength(count)

    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    expect(store.getState().social.sessionLogs).toHaveLength(0)
    expect(store.getState().game.tvFeed).toEqual(feed)
    expect(screen.queryByRole('button', { name: 'Close social panel' })).not.toBeInTheDocument()
  })
})
