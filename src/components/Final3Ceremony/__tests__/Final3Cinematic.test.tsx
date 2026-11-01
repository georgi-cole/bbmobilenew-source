import { configureStore, type Middleware } from '@reduxjs/toolkit'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
  getPresentationOwner,
  PRESENTATION_PRIORITY,
} from '../../../services/presentation/presentationOwnership'
import { ceremonyQueue } from '../../../cinematic/ceremonies/runtime.mjs'
import gameReducer, { createInitialGameState } from '../../../store/gameSlice'
import settingsReducer, {
  DEFAULT_SETTINGS,
  setDisplay,
  setGameUX,
} from '../../../store/settingsSlice'
import vipReducer, { loadVipState } from '../../../store/vipSlice'
import type { GameState, Player } from '../../../types'
import Final3Ceremony from '../Final3Ceremony'
import type { FinalDecisionCheckpoint, FinalDecisionSceneConfig } from '../finalDecisionScene.mjs'

const movie = vi.hoisted(() => ({
  mount: vi.fn(),
  prepare: vi.fn(async () => ({ assets: {} })),
  pause: vi.fn(),
  resume: vi.fn(),
  dispose: vi.fn(),
}))
vi.mock('../finalDecisionAssets', () => ({ prepareFinalDecisionArtwork: movie.prepare }))
vi.mock('../finalDecisionScene.mjs', () => ({
  mountFinalDecision: (root: HTMLElement, config: FinalDecisionSceneConfig) => {
    movie.mount(root, config)
    const button = document.createElement('button')
    button.textContent = 'Scene control'
    root.appendChild(button)
    return {
      pause: movie.pause,
      resume: movie.resume,
      dispose: movie.dispose,
      skip: vi.fn(),
      getState: vi.fn(),
    }
  },
}))
vi.mock('../../../cinematic/ceremonies/exit.jsx', () => ({
  default: ({ evictee, onDone }: { evictee: Player; onDone: () => void }) => (
    <button data-testid="bronze-exit" data-player-id={evictee.id} onClick={onDone}>
      Finish existing bronze exit
    </button>
  ),
}))

interface Options {
  vip?: boolean
  standard?: boolean
  off?: boolean
  reduced?: boolean
  vox?: boolean
  survival?: boolean
  aiHolder?: boolean
}

function fixture(options: Options = {}) {
  const initial = createInitialGameState({ seed: 111 })
  const human = initial.players.find((player) => player.isUser)!
  const others = initial.players.filter((player) => !player.isUser).slice(0, 2)
  const holder = options.aiHolder ? others[0] : human
  const nominees = options.aiHolder ? [human, others[1]] : others
  const game: GameState = {
    ...initial,
    gameId: 'final-decision-integration',
    mode: options.survival ? 'survival' : 'classic',
    phase: 'final3_decision',
    lohId: holder.id,
    nomineeIds: nominees.map((player) => player.id),
    awaitingFinal3Plea: true,
    awaitingFinal3Eviction: false,
    players: initial.players.map((player) => ({
      ...player,
      status: [holder.id, ...nominees.map((nominee) => nominee.id)].includes(player.id)
        ? 'active'
        : 'jury',
      stats:
        player.id === nominees[0].id
          ? { ...player.stats, lohWins: 2, posWins: 0, timesNominated: 0 }
          : player.stats,
    })),
    voxPopuli: options.vox ? { ...initial.voxPopuli!, status: 'active' } : initial.voxPopuli,
    strategicRelationships: {
      [holder.id]: {
        [nominees[0].id]: { affinity: 30, tags: ['alliance'] },
        [nominees[1].id]: { affinity: -30, tags: ['betrayal'] },
      },
    },
    finalThree: {
      mode: 'classic',
      stage: 'ceremony',
      openingSeen: true,
      blockRevealSeen: true,
      spectatorFinalPowerRevealSeen: true,
      participantIds: [holder.id, ...nominees.map((player) => player.id)],
      part1: null,
      part2: null,
      part3: null,
      finalPowerHolderId: holder.id,
      nomineeIds: nominees.map((player) => player.id),
      evicteeId: null,
    },
  }
  const actions: string[] = []
  const recordActions: Middleware = () => (next) => (action) => {
    if (typeof action === 'object' && action && 'type' in action) actions.push(String(action.type))
    return next(action)
  }
  const store = configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, vip: vipReducer },
    preloadedState: {
      game,
      settings: {
        ...DEFAULT_SETTINGS,
        gameUX: {
          ...DEFAULT_SETTINGS.gameUX,
          animations: !options.off,
          animationMode: options.standard ? ('standard' as const) : ('cinematic' as const),
        },
        display: { ...DEFAULT_SETTINGS.display, reduceMotion: Boolean(options.reduced) },
      },
      vip: { ...loadVipState(), isActive: options.vip ?? true, debugUnlocked: false },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(recordActions),
  })
  return { store, holder, nominees, actions }
}

function activeConfig(): FinalDecisionSceneConfig {
  return movie.mount.mock.lastCall![1] as FinalDecisionSceneConfig
}

function reachChoice(config = activeConfig()) {
  act(() => config.onCheckpoint({ stage: 'choose' } as FinalDecisionCheckpoint))
}

function result(config: FinalDecisionSceneConfig, index = 0) {
  return {
    sceneId: config.sceneId,
    holderId: config.fixture.holder.id,
    evicteeId: config.fixture.nominees[index].id,
    keptId: config.fixture.nominees[1 - index].id,
  }
}

async function openMovie(options: Options = {}, strict = false) {
  const data = fixture(options)
  const view = (
    <Provider store={data.store}>
      <Final3Ceremony />
    </Provider>
  )
  const rendered = render(strict ? <StrictMode>{view}</StrictMode> : view)
  await waitFor(() => expect(movie.mount).toHaveBeenCalledTimes(1))
  return { ...data, ...rendered, config: activeConfig() }
}

beforeEach(() => {
  movie.mount.mockClear()
  movie.prepare.mockReset()
  movie.prepare.mockResolvedValue({ assets: {} })
  movie.pause.mockClear()
  movie.resume.mockClear()
  movie.dispose.mockClear()
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.classList.remove('reduce-motion')
  await act(async () => {
    await Promise.resolve()
  })
})

describe('human Final LOH cinematic integration', () => {
  it.each([0, 1])(
    'keeps one scene mounted and defers contestant %s finalization until Final Two Play',
    async (index) => {
      const { store, nominees, actions, config } = await openMovie({}, true)
      expect(config.preview).toBe(false)
      expect(config.fixture.nominees[0].plea).toContain('2 competition wins')
      expect(config.fixture.nominees[1].comparison).toMatch(/betrayal/i)
      expect(screen.queryByRole('dialog', { name: 'The Finale plea chat' })).toBeNull()
      reachChoice(config)
      const outcome = result(config, index)
      act(() => {
        config.onDecision(outcome)
        config.onDecision(result(config, 1 - index))
      })
      expect(movie.mount).toHaveBeenCalledTimes(1)
      expect(store.getState().game.finalThree?.evicteeId).toBeNull()
      expect(
        store.getState().game.players.find((player) => player.id === outcome.evicteeId)?.status
      ).toBe('active')
      act(() => config.onComplete(result(config, 1 - index)))
      expect(screen.queryByTestId('bronze-exit')).toBeNull()
      await act(async () => {
        config.onComplete(outcome)
        config.onComplete(outcome)
      })
      expect(screen.getByTestId('bronze-exit')).toHaveAttribute(
        'data-player-id',
        nominees[index].id
      )
      expect(ceremonyQueue.counts.active).toBe(0)
      expect(getPresentationOwner()).toBeNull()
      expect(store.getState().game.finalThree?.evicteeId).toBeNull()
      fireEvent.click(screen.getByTestId('bronze-exit'))
      expect(screen.getByRole('dialog', { name: 'The Final Two' })).toBeInTheDocument()
      act(() => {
        window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
        window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
      })
      expect(store.getState().game.finalThree?.evicteeId).toBe(nominees[index].id)
      expect(
        store.getState().game.players.find((player) => player.id === nominees[index].id)
          ?.seasonPlacement
      ).toBe(3)
      expect(actions.filter((type) => type === 'game/finalizeFinal3Decision')).toHaveLength(1)
      expect(actions.filter((type) => type === 'game/advance')).toHaveLength(1)
    }
  )

  it('rejects completion without a valid confirmed nominee and ignores callbacks after disposal', async () => {
    const { store, unmount, config } = await openMovie()
    act(() => {
      config.onComplete(result(config))
      config.onDecision({ ...result(config), evicteeId: config.fixture.holder.id })
      config.onComplete(result(config))
    })
    expect(screen.queryByTestId('bronze-exit')).toBeNull()
    expect(store.getState().game.finalThree?.evicteeId).toBeNull()
    unmount()
    act(() => {
      config.onDecision(result(config))
      config.onComplete(result(config))
    })
    expect(movie.dispose).toHaveBeenCalledTimes(1)
    expect(store.getState().game.evictionSplashId).toBeNull()
    expect(store.getState().game.finalThree?.evicteeId).toBeNull()
  })

  it('falls back at the choice stage when settings change and never reinserts the movie', async () => {
    const { store, nominees, config } = await openMovie()
    reachChoice(config)
    act(() => store.dispatch(setGameUX({ animationMode: 'standard' })))
    expect(screen.queryByRole('dialog', { name: 'The Finale plea chat' })).toBeNull()
    expect(
      screen.getByRole('button', { name: new RegExp(nominees[0].name, 'i') })
    ).toBeInTheDocument()
    expect(movie.dispose).toHaveBeenCalledTimes(1)
    act(() => store.dispatch(setGameUX({ animationMode: 'cinematic' })))
    expect(movie.mount).toHaveBeenCalledTimes(1)
    expect(store.getState().game.finalThree?.evicteeId).toBeNull()
  })

  it('retains the confirmed result when reduced motion switches to the native announcement', async () => {
    const { store, config } = await openMovie()
    reachChoice(config)
    act(() => config.onDecision(result(config, 1)))
    act(() => store.dispatch(setDisplay({ reduceMotion: true })))
    expect(
      screen.getByRole('dialog', { name: 'The Finale elimination announcement' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Eliminate .* · Keep/ })).toBeNull()
    expect(movie.dispose).toHaveBeenCalledTimes(1)
    expect(store.getState().game.finalThree?.evicteeId).toBeNull()
  })

  it.each<Options>([
    { vip: false },
    { standard: true },
    { off: true },
    { reduced: true },
    { vox: true },
    { survival: true },
    { aiHolder: true },
  ])('keeps native controls without preparing media for %j', async (options) => {
    const { store } = fixture(options)
    render(
      <Provider store={store}>
        <Final3Ceremony />
      </Provider>
    )
    expect(screen.getByRole('dialog', { name: 'The Finale plea chat' })).toBeInTheDocument()
    await act(async () => {
      await Promise.resolve()
    })
    expect(movie.prepare).not.toHaveBeenCalled()
    expect(movie.mount).not.toHaveBeenCalled()
  })

  it('keeps native controls for motion preferences and short landscape viewports', async () => {
    document.body.classList.add('reduce-motion')
    const { store } = fixture()
    const first = render(
      <Provider store={store}>
        <Final3Ceremony />
      </Provider>
    )
    expect(movie.prepare).not.toHaveBeenCalled()
    first.unmount()
    document.body.classList.remove('reduce-motion')
    const previous = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 })
    render(
      <Provider store={store}>
        <Final3Ceremony />
      </Provider>
    )
    expect(screen.getByRole('dialog', { name: 'The Finale plea chat' })).toBeInTheDocument()
    await act(async () => {
      await Promise.resolve()
    })
    expect(movie.prepare).not.toHaveBeenCalled()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: previous })
  })

  it('returns preparation failure to native pleas without choosing anyone', async () => {
    movie.prepare.mockRejectedValueOnce(new Error('missing cast artwork'))
    const { store } = fixture()
    render(
      <Provider store={store}>
        <Final3Ceremony />
      </Provider>
    )
    await screen.findByRole('dialog', { name: 'The Finale plea chat' })
    expect(movie.mount).not.toHaveBeenCalled()
    expect(store.getState().game.finalThree?.evicteeId).toBeNull()
  })

  it('releases a timed-out preparation back to the native choice flow', async () => {
    vi.useFakeTimers()
    movie.prepare.mockImplementationOnce(() => new Promise(() => {}))
    const { store } = fixture()
    render(
      <Provider store={store}>
        <Final3Ceremony />
      </Provider>
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(movie.prepare).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001)
    })
    expect(screen.getByRole('dialog', { name: 'The Finale plea chat' })).toBeInTheDocument()
    expect(movie.mount).not.toHaveBeenCalled()
    expect(ceremonyQueue.counts.active).toBe(0)
    expect(store.getState().game.finalThree?.evicteeId).toBeNull()
  })

  it('suspends only the presentation pause reason under gameplay ownership and backgrounding', async () => {
    await openMovie()
    let release = () => {}
    act(() => {
      release = acquirePresentationOwnership(
        createPresentationOwnerToken(),
        'test-gameplay',
        PRESENTATION_PRIORITY.gameplay
      )
    })
    expect(movie.pause).toHaveBeenLastCalledWith('presentation')
    expect(screen.queryByRole('dialog', { name: 'Final Power Decision' })).toBeNull()
    await act(async () => {
      release()
      await Promise.resolve()
    })
    expect(movie.resume).toHaveBeenLastCalledWith('presentation')
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    expect(movie.pause).toHaveBeenLastCalledWith('presentation')
    hidden.mockReturnValue(false)
    fireEvent(document, new Event('visibilitychange'))
    expect(movie.resume).toHaveBeenLastCalledWith('presentation')
    expect(movie.mount).toHaveBeenCalledTimes(1)
  })
})
