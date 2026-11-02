import { act, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import type { ComponentProps } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import FloatingActionBar from '../../src/components/FloatingActionBar/FloatingActionBar'
import FinalPowerBattleIntro from '../../src/components/FinalPowerBattle/FinalPowerBattleIntro'
import FinalThreeBlockReveal from '../../src/components/FinalPowerBattle/FinalThreeBlockReveal'
import gameReducer, {
  continueWeekendFeature,
  createInitialGameState,
  debugActivateWeekendInterlude,
} from '../../src/store/gameSlice'
import socialReducer from '../../src/social/socialSlice'
import profilesReducer from '../../src/store/profilesSlice'
import challengeReducer from '../../src/store/challengeSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import type { GameState } from '../../src/types'

const reducers = {
  game: gameReducer,
  social: socialReducer,
  profiles: profilesReducer,
  challenge: challengeReducer,
  publicOpinion: publicOpinionReducer,
}

function makeStore(overrides: Partial<GameState> = {}) {
  const initial = configureStore({ reducer: reducers }).getState()
  return configureStore({
    reducer: reducers,
    preloadedState: { ...initial, game: { ...initial.game, ...overrides } },
  })
}

function renderDock(
  store: ReturnType<typeof makeStore>,
  props: ComponentProps<typeof FloatingActionBar>
) {
  render(
    <MemoryRouter initialEntries={['/game']}>
      <Provider store={store}>
        <FloatingActionBar {...props} />
      </Provider>
    </MemoryRouter>
  )
}

describe('Final Three P0 Play ownership', () => {
  it('routes a real Play click to the visible Part 3 reveal despite a stale weekend', () => {
    const initial = createInitialGameState({ seed: 981 })
    const weekend = gameReducer(initial, debugActivateWeekendInterlude('finale')).weekendInterlude
    const store = makeStore({ phase: 'final3_comp3', weekendInterlude: weekend })
    const finalists = store.getState().game.players.slice(0, 3)
    const onComplete = vi.fn()
    const beforeWeekend = structuredClone(store.getState().game.weekendInterlude)

    renderDock(store, {
      finaleOverlayActive: true,
      finalePlayAvailable: true,
      finaleDockOnTop: true,
    })
    render(
      <Provider store={store}>
        <FinalThreeBlockReveal
          blockPlayer={finalists[0]}
          competitors={finalists.slice(1)}
          mode="classic"
          onComplete={onComplete}
        />
      </Provider>
    )
    const play = screen.getByRole('button', { name: 'Play finale scene' })
    expect(play).toBeEnabled()
    act(() => fireEvent.click(play))
    expect(onComplete).toHaveBeenCalledOnce()
    expect(store.getState().game.weekendInterlude).toEqual(beforeWeekend)
    expect(store.getState().game.phase).toBe('final3_comp3')
    act(() => fireEvent.click(play))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('ignores an old unanswered Hub Says prompt while the finale owns Play', () => {
    const initial = createInitialGameState({ seed: 982 })
    let weekendState = gameReducer(initial, debugActivateWeekendInterlude(5))
    weekendState = gameReducer(weekendState, continueWeekendFeature())
    weekendState = gameReducer(weekendState, continueWeekendFeature())
    expect(weekendState.weekendInterlude?.stage).toBe('hub_says')
    const store = makeStore({
      phase: 'final3_comp3',
      weekendInterlude: weekendState.weekendInterlude,
    })
    const beforeWeekend = structuredClone(store.getState().game.weekendInterlude)
    renderDock(store, { finaleOverlayActive: true, finalePlayAvailable: true })
    const listener = vi.fn()
    window.addEventListener('ui:playPressed', listener)
    try {
      const play = screen.getByRole('button', { name: 'Play finale scene' })
      expect(play).toBeEnabled()
      act(() => fireEvent.click(play))
      expect(listener).toHaveBeenCalledOnce()
      expect(store.getState().game.weekendInterlude).toEqual(beforeWeekend)
    } finally {
      window.removeEventListener('ui:playPressed', listener)
    }
  })

  it('disables shared Play while the cinematic spectator broadcast owns the screen', () => {
    const initial = createInitialGameState({ seed: 983 })
    const weekend = gameReducer(initial, debugActivateWeekendInterlude('finale')).weekendInterlude
    const store = makeStore({ phase: 'final3_comp3', weekendInterlude: weekend })
    renderDock(store, { finaleOverlayActive: true, finalePlayAvailable: false })
    expect(screen.getByRole('button', { name: 'Play finale scene' })).toBeDisabled()
  })

  it('lets the five-beat finale intro own Play over a stale weekend', () => {
    const initial = createInitialGameState({ seed: 984 })
    const weekend = gameReducer(initial, debugActivateWeekendInterlude('finale')).weekendInterlude
    const store = makeStore({ phase: 'final3', weekendInterlude: weekend })
    const onComplete = vi.fn()
    const beforeWeekend = structuredClone(store.getState().game.weekendInterlude)
    renderDock(store, { finaleInlinePlayActive: true, finalePlayAvailable: true })
    render(
      <Provider store={store}>
        <FinalPowerBattleIntro
          finalists={store.getState().game.players.slice(0, 3)}
          mode="classic"
          onComplete={onComplete}
        />
      </Provider>
    )
    const play = screen.getByRole('button', { name: 'Play finale scene' })
    for (let index = 0; index < 5; index += 1) {
      act(() => fireEvent.click(play))
    }
    expect(onComplete).toHaveBeenCalledOnce()
    expect(store.getState().game.weekendInterlude).toEqual(beforeWeekend)
  })
})
