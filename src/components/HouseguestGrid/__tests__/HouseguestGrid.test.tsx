import { describe, expect, it, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { act, render, screen, within, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import HouseguestGrid, { type Houseguest } from '../HouseguestGrid'
import gameReducer, {
  createInitialGameState,
  beginFinaleReunionSocial,
  beginWeekendTribunalGlimpse,
  debugActivateWeekendInterlude,
  debugEndFinaleReunionPreview,
  debugPrepareFinaleReunionPreview,
  beginWeekendReunionDeparture,
  finishWeekendReunionDeparture,
  openWeekendTribunalStream,
  returnFromWeekendTribunalStream,
} from '../../../store/gameSlice'
import challengeReducer from '../../../store/challengeSlice'
import { buildReplacementRobo, createSurvivorRun } from '../../../modes/survivorRun'
import * as imagePreload from '../../../utils/preload'

function renderGrid(ui: ReactElement) {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
    },
  })

  return render(<Provider store={store}>{ui}</Provider>)
}

describe('HouseguestGrid', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders all 16 players without an unused screen-height measurement', () => {
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    const houseguests: Houseguest[] = Array.from({ length: 16 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))
    renderGrid(<HouseguestGrid houseguests={houseguests} gridSize={16} occupancyLabel="16/16" />)
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(16)
    expect(measure).not.toHaveBeenCalled()
  })

  it('renders the compact small layout when requested', () => {
    const houseguests: Houseguest[] = Array.from({ length: 6 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))

    const { container } = renderGrid(
      <HouseguestGrid houseguests={houseguests} compact placeholderCount={2} />
    )

    expect(container.querySelector('section')?.getAttribute('data-compact-layout')).toBe('small')
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8)
  })

  it('warms the queued replacement once while the outgoing robot stays in its slot', () => {
    const game = createSurvivorRun()
    if (game.modeSpecific?.kind !== 'survival') throw new Error('Expected a Survival run')
    const outgoing = game.players.find((player) => player.isRobo)!
    const incoming = buildReplacementRobo(game, outgoing.survivorSlot)
    const preload = vi
      .spyOn(imagePreload, 'preloadImage')
      .mockResolvedValue({ url: incoming.avatar, status: 'loaded' })
    const store = configureStore({
      reducer: { game: gameReducer, challenge: challengeReducer },
      preloadedState: {
        game: {
          ...game,
          modeSpecific: {
            ...game.modeSpecific,
            replacementPending: {
              mode: 'survival' as const,
              outgoingPlayerSnapshot: outgoing,
              incomingPlayer: incoming,
              slot: outgoing.survivorSlot!,
              queuedAt: Date.now(),
            },
          },
        },
      },
    })
    const houseguests = game.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatarUrl: player.avatar,
    }))
    const tree = (
      <Provider store={store}>
        <HouseguestGrid houseguests={houseguests} />
      </Provider>
    )
    const view = render(tree)

    expect(preload).toHaveBeenCalledExactlyOnceWith(incoming.avatar)
    expect(screen.getByRole('img', { name: outgoing.name })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: incoming.name })).toBeNull()

    view.rerender(
      <Provider store={store}>
        <HouseguestGrid houseguests={[...houseguests]} occupancyLabel="7/8" />
      </Provider>
    )

    expect(preload).toHaveBeenCalledTimes(1)
    expect(document.head.querySelectorAll('link[data-game-image-preload]')).toHaveLength(0)
  })

  it('revives reunion portraits in the main roster without changing their gameplay status', () => {
    const initialGame = createInitialGameState({ seed: 61720 })
    const gameWithEliminatedPlayers = {
      ...initialGame,
      players: initialGame.players.map((player, index) => ({
        ...player,
        status: (index < 3
          ? 'active'
          : index % 2 === 0
            ? 'evicted'
            : 'jury') as typeof player.status,
      })),
    }
    const store = configureStore({
      reducer: {
        game: gameReducer,
        challenge: challengeReducer,
      },
      preloadedState: { game: gameWithEliminatedPlayers },
    })
    const houseguests = gameWithEliminatedPlayers.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatarUrl: player.avatar,
      isEvicted: player.status === 'evicted' || player.status === 'jury',
      statuses: player.status,
    }))
    const { container } = render(
      <Provider store={store}>
        <HouseguestGrid houseguests={houseguests} />
      </Provider>
    )
    const returningPlayer = gameWithEliminatedPlayers.players[3]
    const selector = `[data-player-id="${returningPlayer.id}"] > div`

    expect(container.querySelector(selector)?.className).toContain('evicted')

    act(() => {
      store.dispatch(debugActivateWeekendInterlude('finale'))
      store.dispatch(debugPrepareFinaleReunionPreview())
    })

    const returnedTile = container.querySelector(selector) as HTMLElement
    expect(returnedTile.parentElement).toHaveAttribute('data-reunion-return', 'true')
    expect(returnedTile.className).toContain('reunionReturning')
    expect(returnedTile.className).not.toContain('evicted')
    expect(returnedTile.getAttribute('aria-label')).not.toContain('evicted')
    expect(returnedTile.querySelector('[class*="reunionReturnBurst"]')).not.toBeNull()
    expect(returnedTile.querySelector('[data-eviction-mark]')).toBeNull()
    expect(store.getState().game.players[3].status).toBe(returningPlayer.status)

    act(() => store.dispatch(debugEndFinaleReunionPreview()))

    expect(container.querySelector(selector)?.className).toContain('evicted')
    expect(store.getState().game.players[3].status).toBe(returningPlayer.status)
  })

  it('revives portraits on finale Sunday and restores them at Tribunal opening, including QA weekends', () => {
    const initialGame = createInitialGameState({ seed: 61721 })
    const gameWithEliminatedPlayers = {
      ...initialGame,
      players: initialGame.players.map((player, index) => ({
        ...player,
        status: (index < 3
          ? 'active'
          : index % 2 === 0
            ? 'evicted'
            : 'jury') as typeof player.status,
      })),
    }
    const debugWeekendState = gameReducer(
      gameWithEliminatedPlayers,
      debugActivateWeekendInterlude('finale')
    )
    const liveWeekend = {
      ...debugWeekendState.weekendInterlude!,
      debug: undefined,
      weekendDay: 2 as const,
      stage: 'tribunal_invitation' as const,
      tribunalGlimpse: undefined,
    }
    const liveGameState = {
      ...debugWeekendState,
      weekendInterlude: liveWeekend,
    }
    const store = configureStore({
      reducer: {
        game: gameReducer,
        challenge: challengeReducer,
      },
      preloadedState: { game: liveGameState },
    })
    const houseguests = liveGameState.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatarUrl: player.avatar,
      isEvicted: player.status === 'evicted' || player.status === 'jury',
      statuses: player.status,
    }))
    const { container } = render(
      <Provider store={store}>
        <HouseguestGrid houseguests={houseguests} />
      </Provider>
    )
    const returningPlayer = liveGameState.players[3]
    const selector = `[data-player-id="${returningPlayer.id}"] > div`

    expect(container.querySelector(selector)?.className).toContain('evicted')
    expect(store.getState().game.players[3].status).toBe(returningPlayer.status)

    act(() => store.dispatch(beginFinaleReunionSocial()))
    expect(container.querySelector(selector)?.className).toContain('reunionReturning')
    expect(container.querySelector(selector)?.className).not.toContain('evicted')

    act(() => store.dispatch(beginWeekendTribunalGlimpse()))
    expect(store.getState().game.weekendInterlude?.stage).toBe('finale_sequester_announcement')
    expect(container.querySelector(selector)?.className).not.toContain('reunionReturning')

    act(() => store.dispatch(openWeekendTribunalStream()))
    expect(container.querySelector(selector)?.className).not.toContain('evicted')
    expect(container.querySelector(selector)?.className).not.toContain('reunionReturning')

    act(() => store.dispatch(returnFromWeekendTribunalStream()))
    expect(store.getState().game.weekendInterlude?.stage).toBe('finale_battle_ready')
    expect(container.querySelector(selector)?.className).not.toContain('reunionReturning')
    expect(store.getState().game.players[3].status).toBe(returningPlayer.status)

    act(() => store.dispatch(beginWeekendReunionDeparture()))

    const departingTile = container.querySelector(selector) as HTMLElement
    expect(departingTile.parentElement).not.toHaveAttribute('data-reunion-return')
    expect(departingTile.className).toContain('reunionDeparting')
    expect(departingTile.className).not.toContain('evicted')
    expect(departingTile.querySelector('[class*="reunionDepartureWave"]')).not.toBeNull()
    expect(departingTile.querySelector('[aria-label="Tribunal Member"]')).not.toBeNull()
    expect(store.getState().game.players[3].status).toBe(returningPlayer.status)

    act(() => store.dispatch(finishWeekendReunionDeparture()))

    expect(container.querySelector(selector)?.className).toContain('evicted')
    expect(store.getState().game.weekendInterlude?.tribunalGlimpse?.opened).toBe(true)
    expect(store.getState().game.players[3].status).toBe(returningPlayer.status)
  })
})
