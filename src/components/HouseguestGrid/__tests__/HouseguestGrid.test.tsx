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

function rect({
  top = 0,
  left = 0,
  width = 0,
  height = 0,
}: {
  top?: number
  left?: number
  width?: number
  height?: number
}) {
  return {
    x: left,
    y: top,
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect
}

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

  it('renders a 16-player grid and reserves vertical space up to the floating dock', () => {
    vi.stubGlobal('innerHeight', 812)

    const headerEl = document.createElement('div')
    headerEl.className = 'test-tv-zone'
    document.body.appendChild(headerEl)

    const dockEl = document.createElement('div')
    dockEl.className = 'test-dock'
    document.body.appendChild(dockEl)

    const footerEl = document.createElement('nav')
    footerEl.className = 'test-nav'
    document.body.appendChild(footerEl)

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('test-tv-zone')) return rect({ top: 12, height: 308 })
        if (this.classList.contains('test-dock')) return rect({ top: 624, height: 76 })
        if (this.classList.contains('test-nav')) return rect({ top: 734, height: 78 })
        if (this.getAttribute('aria-labelledby') === 'houseguests-heading') {
          return rect({ top: 338, height: 260 })
        }
        if (this.getAttribute('role') === 'list') {
          return rect({ top: 372, height: 226 })
        }
        return rect({})
      })

    expect(rectSpy).toBeDefined()

    const houseguests: Houseguest[] = Array.from({ length: 16 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))

    const { container } = renderGrid(
      <HouseguestGrid
        houseguests={houseguests}
        gridSize={16}
        occupancyLabel="16/16"
        headerSelector=".test-tv-zone"
        footerSelector=".test-nav"
        overlaySelector=".test-dock"
      />
    )

    const section = container.querySelector('section')
    const list = screen.getByRole('list')

    expect(section?.style.getPropertyValue('--grid-available-height')).toBe('248px')
    expect(within(list).getAllByRole('listitem')).toHaveLength(16)
  })

  it('tracks the visual viewport when mobile browser chrome changes the available height', () => {
    vi.stubGlobal('innerHeight', 900)
    vi.stubGlobal('visualViewport', {
      height: 620,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    const headerEl = document.createElement('div')
    headerEl.className = 'test-tv-zone'
    document.body.appendChild(headerEl)

    const dockEl = document.createElement('div')
    dockEl.className = 'test-dock'
    document.body.appendChild(dockEl)

    const footerEl = document.createElement('nav')
    footerEl.className = 'test-nav'
    document.body.appendChild(footerEl)

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.classList.contains('test-tv-zone')) return rect({ top: 12, height: 308 })
      if (this.classList.contains('test-dock')) return rect({ top: 560, height: 76 })
      if (this.classList.contains('test-nav')) return rect({ top: 830, height: 78 })
      if (this.getAttribute('aria-labelledby') === 'houseguests-heading') {
        return rect({ top: 338, height: 260 })
      }
      if (this.getAttribute('role') === 'list') {
        return rect({ top: 372, height: 226 })
      }
      return rect({})
    })

    const houseguests: Houseguest[] = Array.from({ length: 16 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))

    const { container } = renderGrid(
      <HouseguestGrid
        houseguests={houseguests}
        gridSize={16}
        occupancyLabel="16/16"
        headerSelector=".test-tv-zone"
        footerSelector=".test-nav"
        overlaySelector=".test-dock"
      />
    )

    expect(
      (container.firstElementChild as HTMLElement | null)?.style.getPropertyValue(
        '--grid-available-height'
      )
    ).toBe('220px')
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
    expect(returnedTile.querySelector('[style*="--eviction-mark-mask"]')).toBeNull()
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
