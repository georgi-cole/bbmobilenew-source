import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, hydrateGame } from '../../store/gameSlice'
import type { AppDispatch, RootState } from '../../store/store'
import { getReunionActionCosts, performReunionSocialAction } from '../reunionSocialActions'

function setup(energy = 3) {
  const game = createInitialGameState({ seed: 741 })
  const guest = game.players.find((player) => !player.isUser)!
  guest.status = 'jury'
  game.weekendInterlude = {
    active: true,
    finaleWeekend: true,
    afterDay: 14,
    weekendDay: 2,
    episode: 'season_so_far',
    stage: 'finale_reunion_social',
    wallet: { energy, influence: 200, info: 100 },
  }
  const store = configureStore({ reducer: { game: gameReducer }, preloadedState: { game } })
  const perform = (actionId: string) =>
    performReunionSocialAction(guest.id, actionId)(
      store.dispatch as AppDispatch,
      store.getState as () => RootState
    )
  return { store, perform }
}

describe('final weekend reunion action prices', () => {
  it('charges one for a compliment and two for clearing the air, from the weekend wallet', () => {
    const { store, perform } = setup()
    expect(getReunionActionCosts('compliment')?.energy).toBe(1)
    expect(getReunionActionCosts('apologize')?.energy).toBe(2)
    expect(perform('compliment')).toBe(true)
    expect(store.getState().game.weekendInterlude?.wallet.energy).toBe(2)
    expect(perform('apologize')).toBe(true)
    expect(store.getState().game.weekendInterlude?.wallet).toEqual({
      energy: 0,
      influence: 200,
      info: 100,
    })
  })

  it('rejects an unaffordable action and actions after guests depart without spending', () => {
    const { store, perform } = setup(1)
    expect(perform('apologize')).toBe(false)
    expect(store.getState().game.weekendInterlude?.wallet.energy).toBe(1)
    const game = store.getState().game
    store.dispatch(
      hydrateGame({
        ...game,
        weekendInterlude: { ...game.weekendInterlude!, reunionDeparted: true },
      })
    )
    expect(perform('compliment')).toBe(false)
    expect(store.getState().game.weekendInterlude?.wallet.energy).toBe(1)
  })
})
