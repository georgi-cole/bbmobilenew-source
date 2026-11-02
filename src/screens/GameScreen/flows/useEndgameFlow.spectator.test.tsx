import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  hydrateGame,
  prepareClassicFinalThreeTest,
  selectF3Part1PredictedWinnerId,
  selectF3Part2PredictedWinnerId,
  selectF3Part3PredictedWinnerId,
} from '../../../store/gameSlice'
import { useAppSelector } from '../../../store/hooks'
import { store as baseline, type RootState } from '../../../store/store'
import type { GameState } from '../../../types'
import { useEndgameFlow } from './useEndgameFlow'
import type { FinalThreeCompetitionPart } from './finalThreeSpectatorFlow'

type Mode = 'classic' | 'vox_populi'
type Viewer = 'outside' | 'bench' | 'loser' | 'competitor'

function makeGame(part: FinalThreeCompetitionPart, mode: Mode, viewer: Viewer = 'outside') {
  const initial = createInitialGameState({ seed: 811, seasonArchives: [] })
  const game = structuredClone(gameReducer(initial, prepareClassicFinalThreeTest()))
  const human = game.players.find((player) => player.isUser)!
  const opponents = game.players.filter((player) => !player.isUser).slice(0, 3)
  game.players = [human, ...opponents]
  const active = viewer === 'outside' ? opponents : [human, ...opponents.slice(0, 2)]
  game.players.forEach((player) => {
    player.status = active.includes(player) ? 'active' : 'jury'
  })
  const part1Winner =
    viewer === 'bench' || (viewer === 'competitor' && part === 3) ? human : opponents[0]
  const part2Winner = opponents[1]
  game.gameId = 'spectator-test-run'
  game.phase = part === 1 ? 'final3' : part === 2 ? 'final3_comp2' : 'final3_comp3'
  game.week = 10
  game.f3Part1WinnerId = part === 1 ? null : part1Winner.id
  game.f3Part2WinnerId = part === 3 ? part2Winner.id : null
  game.voxPopuli!.status = mode === 'vox_populi' ? 'active' : 'inactive'
  game.finalThree = {
    mode,
    stage: part === 1 ? 'part1' : part === 2 ? 'part2' : 'part3',
    openingSeen: true,
    blockRevealSeen: true,
    spectatorFinalPowerRevealSeen: false,
    participantIds: active.map((player) => player.id),
    part1:
      part === 1
        ? null
        : { participantIds: active.map((player) => player.id), winnerId: part1Winner.id, seed: 7 },
    part2:
      part === 3
        ? {
            participantIds: active
              .filter((player) => player.id !== part1Winner.id)
              .map((player) => player.id),
            winnerId: part2Winner.id,
            seed: 8,
          }
        : null,
    part3: null,
    finalPowerHolderId: null,
    nomineeIds: [],
    evicteeId: null,
  }
  return game
}

function mountFlow(game: GameState, enabled = true, reactEnabled = true) {
  const fixture = structuredClone(baseline.getState())
  const initial = {
    ...fixture,
    game,
    settings: {
      ...fixture.settings,
      gameUX: { ...fixture.settings.gameUX, spectatorMode: enabled },
    },
  }
  const actions: UnknownAction[] = []
  const recordActions: Middleware = () => (next) => (action) => {
    actions.push(action as UnknownAction)
    return next(action)
  }
  const store = configureStore({
    reducer: (state: RootState = initial, action) => ({
      ...state,
      game:
        action.type === 'test/replaceGame'
          ? (action.payload as GameState)
          : gameReducer(state.game, action),
    }),
    middleware: (get) =>
      get({ serializableCheck: false, immutableCheck: false }).concat(recordActions),
  })
  const hook = renderHook(
    () => {
      const current = useAppSelector((state) => state.game)
      return useEndgameFlow({
        game: current,
        humanPlayer: current.players.find((player) => player.isUser),
        alivePlayers: current.players.filter(
          (player) => player.status !== 'evicted' && player.status !== 'jury'
        ),
        humanIsPosHolder: false,
        spectatorReactEnabled: reactEnabled,
        spectatorMode: enabled,
        dispatch: store.dispatch,
      })
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    }
  )
  return { ...hook, store, actions }
}

function roundState(flow: ReturnType<typeof useEndgameFlow>, part: FinalThreeCompetitionPart) {
  return part === 1
    ? {
        active: flow.spectatorF3Part1Active,
        competitors: flow.spectatorF3Part1CompetitorIds,
        done: flow.handleSpectatorF3Part1Done,
      }
    : part === 2
      ? {
          active: flow.spectatorF3Part2Active,
          competitors: flow.spectatorF3Part2CompetitorIds,
          done: flow.handleSpectatorF3Part2Done,
        }
      : {
          active: flow.spectatorF3Active,
          competitors: flow.spectatorF3CompetitorIds,
          done: flow.handleSpectatorF3Done,
        }
}

const predict = {
  1: selectF3Part1PredictedWinnerId,
  2: selectF3Part2PredictedWinnerId,
  3: selectF3Part3PredictedWinnerId,
}
const cases = (['classic', 'vox_populi'] as const).flatMap((mode) =>
  ([1, 2, 3] as const).map((part) => ({ mode, part }))
)

describe('Final Three spectator broadcast integration', () => {
  it.each(cases)(
    'commits the same $mode Part $part winner once after playback',
    ({ mode, part }) => {
      const game = makeGame(part, mode)
      game.tvFeed.push({
        id: 'existing-message',
        text: 'Keep this unrelated message.',
        type: 'game',
        timestamp: 1,
        meta: { week: game.week, major: 'final3_part1_result' },
      })
      const { result, store, actions } = mountFlow(game)
      const expected = predict[part](store.getState())
      const round = roundState(result.current, part)
      expect(round.active).toBe(true)
      expect(round.competitors).toContain(expected)
      expect(round.competitors).not.toContain(game.players.find((player) => player.isUser)!.id)
      expect(store.getState().game.phase).toBe(game.phase)
      expect(actions.filter((action) => action.type === 'game/advance')).toHaveLength(0)

      act(() => {
        round.done()
        round.done()
      })

      const committed = store.getState().game
      const outcome =
        part === 1
          ? committed.finalThree?.part1
          : part === 2
            ? committed.finalThree?.part2
            : committed.finalThree?.part3
      expect(outcome?.winnerId).toBe(expected)
      expect(committed.phase).toBe(
        part === 1 ? 'final3_comp2' : part === 2 ? 'final3_comp3' : 'final3_decision'
      )
      expect(actions.filter((action) => action.type === 'game/advance')).toHaveLength(
        part === 1 && mode === 'classic' ? 2 : 1
      )
      expect(
        committed.tvFeed.find((event) => event.id === 'existing-message')?.meta?.broadcastConsumed
      ).not.toBe(true)
      const resultMajor =
        mode === 'vox_populi'
          ? 'vox_final3_result'
          : part === 1
            ? 'final3_part1_result'
            : part === 2
              ? 'final3_part2_result'
              : null
      if (resultMajor) {
        const represented = committed.tvFeed.filter(
          (event) => event.id !== 'existing-message' && event.meta?.major === resultMajor
        )
        expect(represented.length).toBeGreaterThan(0)
        expect(represented.every((event) => event.meta?.broadcastConsumed === true)).toBe(true)
      }
      if (part === 3) {
        expect(committed.lohId).toBe(expected)
        expect(committed.finalThree?.spectatorFinalPowerRevealSeen).toBe(mode === 'classic')
      }
    }
  )

  it.each(['classic', 'vox_populi'] as const)('lets a $mode Part 1 winner watch Part 2', (mode) => {
    const game = makeGame(2, mode, 'bench')
    const { result, store } = mountFlow(game)
    const humanId = game.players.find((player) => player.isUser)!.id
    expect(result.current.spectatorF3Part2Active).toBe(true)
    expect(result.current.spectatorF3Part2CompetitorIds).not.toContain(humanId)
    act(() => result.current.handleSpectatorF3Part2Done())
    expect(store.getState().game.finalThree?.part1?.winnerId).toBe(humanId)
    expect(result.current.spectatorF3Active).toBe(false)
  })

  it.each(['classic', 'vox_populi'] as const)(
    'lets a $mode active nonqualifier watch Part 3',
    (mode) => {
      const game = makeGame(3, mode, 'loser')
      const { result, store } = mountFlow(game)
      const humanId = game.players.find((player) => player.isUser)!.id
      expect(result.current.spectatorF3Active).toBe(true)
      expect(result.current.spectatorF3CompetitorIds).not.toContain(humanId)
      act(() => result.current.handleSpectatorF3Done())
      expect(store.getState().game.players.find((player) => player.id === humanId)?.status).toBe(
        'nominated'
      )
      expect(store.getState().game.pendingEviction).toBeNull()
    }
  )

  it.each(cases)('preserves the human competition route in $mode Part $part', ({ mode, part }) => {
    const { result, actions } = mountFlow(makeGame(part, mode, 'competitor'))
    expect(roundState(result.current, part).active).toBe(false)
    act(() => roundState(result.current, part).done())
    expect(actions.filter((action) => action.type === 'game/advance')).toHaveLength(0)
  })

  it('resumes the Classic internal Part 1 phase without a second advance', () => {
    const game = makeGame(1, 'classic')
    game.phase = 'final3_comp1'
    game.finalThree!.openingSeen = false
    const { result, store, actions } = mountFlow(game)
    const expected = selectF3Part1PredictedWinnerId(store.getState())
    expect(expected).toBeTruthy()
    expect(result.current.spectatorF3Part1Active).toBe(true)
    act(() => result.current.handleSpectatorF3Part1Done())
    expect(store.getState().game.finalThree?.part1?.winnerId).toBe(expected)
    expect(store.getState().game.phase).toBe('final3_comp2')
    expect(actions.filter((action) => action.type === 'game/advance')).toHaveLength(1)
  })

  it('waits for the Classic block reveal, then starts Part 3 without advancing', () => {
    const game = makeGame(3, 'classic', 'loser')
    const human = game.players.find((player) => player.isUser)!
    human.status = 'nominated'
    game.nomineeIds = [human.id]
    game.finalThree!.blockRevealSeen = false
    const { result, store, actions } = mountFlow(game)
    expect(result.current.finalThreeBlockRevealActive).toBe(true)
    expect(result.current.spectatorF3Active).toBe(false)
    const done = result.current.handleFinalThreeBlockRevealDone
    act(() => {
      done()
      done()
    })
    expect(store.getState().game.phase).toBe('final3_comp3')
    expect(result.current.finalThreeBlockRevealActive).toBe(false)
    expect(result.current.spectatorF3Active).toBe(true)
    expect(actions.filter((action) => action.type === 'game/advance')).toHaveLength(0)
  })

  it.each(cases)('rejects a replaced-run completion in $mode Part $part', ({ mode, part }) => {
    const game = makeGame(part, mode)
    const { result, store } = mountFlow(game)
    const oldDone = roundState(result.current, part).done
    const replacement = { ...game, gameId: 'replacement-with-the-same-cast' }
    act(() => store.dispatch({ type: 'test/replaceGame', payload: replacement }))
    act(oldDone)
    expect(store.getState().game.phase).toBe(game.phase)
    expect(roundState(result.current, part).active).toBe(true)
    act(() => roundState(result.current, part).done())
    expect(store.getState().game.phase).not.toBe(game.phase)
  })

  it.each(['seed', 'season', 'week', 'phase', 'cast', 'mode'] as const)(
    'rejects stale completion when %s changes',
    (change) => {
      const game = makeGame(2, 'classic')
      const { result, store, actions } = mountFlow(game)
      const oldDone = result.current.handleSpectatorF3Part2Done
      const replacement = structuredClone(store.getState().game)
      if (change === 'seed') replacement.seed += 1
      if (change === 'season') replacement.season += 1
      if (change === 'week') replacement.week += 1
      if (change === 'phase') replacement.phase = 'final3_comp2_minigame'
      if (change === 'cast') replacement.players[2].id = 'replacement-competitor'
      if (change === 'mode') replacement.voxPopuli!.status = 'active'
      act(() => store.dispatch({ type: 'test/replaceGame', payload: replacement }))
      act(oldDone)
      expect(actions.filter((action) => action.type === 'game/advance')).toHaveLength(0)
      expect(store.getState().game).toEqual(replacement)
    }
  )

  it.each([
    [false, true],
    [true, false],
  ])('respects spectator settings (enabled=%s, react=%s)', (enabled, reactEnabled) => {
    const { result } = mountFlow(makeGame(2, 'classic'), enabled, reactEnabled)
    expect(result.current.spectatorF3Part2Active).toBe(false)
  })

  it.each(['classic', 'vox_populi'] as const)(
    'starts the %s opening broadcast without committing its competition',
    (mode) => {
      const game = makeGame(1, mode)
      game.finalThree!.openingSeen = false
      const { result, store, actions } = mountFlow(game)
      expect(result.current.finalPowerBattleIntroActive).toBe(true)
      expect(result.current.spectatorF3Part1Active).toBe(false)
      const done = result.current.handleFinalPowerBattleIntroDone
      act(() => {
        done()
        done()
      })
      expect(store.getState().game.phase).toBe('final3')
      expect(result.current.finalPowerBattleIntroActive).toBe(false)
      expect(result.current.spectatorF3Part1Active).toBe(true)
      expect(actions.filter((action) => action.type === 'game/advance')).toHaveLength(0)
    }
  )

  it.each(['classic', 'vox_populi'] as const)(
    'retains the playable human Part 1 launch in %s',
    (mode) => {
      const game = makeGame(1, mode, 'competitor')
      game.finalThree!.openingSeen = false
      const { result, store } = mountFlow(game)
      act(() => result.current.handleFinalPowerBattleIntroDone())
      expect(store.getState().game.phase).toBe('final3_comp1_minigame')
      expect(store.getState().game.minigameContext?.participants).toContain(
        game.players.find((player) => player.isUser)!.id
      )
      expect(result.current.spectatorF3Part1Active).toBe(false)
    }
  )

  it('does not commit before the spectator owner releases its store gate', () => {
    const game = makeGame(2, 'classic')
    game.spectatorActive = {
      competitorIds: game.players.slice(2).map((player) => player.id),
      startedAt: 123,
    }
    const { result, store, actions } = mountFlow(game)
    const done = result.current.handleSpectatorF3Part2Done
    act(done)
    expect(actions.filter((action) => action.type === 'game/advance')).toHaveLength(0)
    act(() => store.dispatch({ type: 'game/closeSpectator' }))
    act(done)
    expect(store.getState().game.phase).toBe('final3_comp3')
  })

  it.each(cases)(
    'restores a saved $mode Part $part without retaining its expired spectator lease',
    ({ mode, part }) => {
      const saved = makeGame(part, mode)
      const expected = predict[part]({ game: saved } as RootState)
      saved.spectatorActive = {
        competitorIds: saved.players.filter((player) => !player.isUser).map((player) => player.id),
        minigameId: part === 3 ? 'downMemoryLane' : 'finalThreeCircuit',
        expectedWinnerId: expected ?? undefined,
        startedAt: 123,
      }
      const restored = gameReducer(createInitialGameState({ seed: 54 }), hydrateGame(saved))
      expect(restored.spectatorActive).toBeNull()
      expect(restored.seed).toBe(saved.seed)
      expect(restored.phase).toBe(saved.phase)
      expect(restored.finalThree).toEqual(saved.finalThree)
      const { result, store } = mountFlow(restored)
      expect(roundState(result.current, part).active).toBe(true)
      act(() => roundState(result.current, part).done())
      const outcome = store.getState().game.finalThree?.[`part${part}`]
      expect(outcome?.winnerId).toBe(expected)
      expect(store.getState().game.phase).not.toBe(saved.phase)
    }
  )

  it('keeps non-Final-Three saved spectator behavior unchanged', () => {
    const saved = makeGame(1, 'classic')
    saved.phase = 'loh_comp'
    saved.spectatorActive = { competitorIds: ['legacy-player'], startedAt: 456 }
    const restored = gameReducer(createInitialGameState({ seed: 54 }), hydrateGame(saved))
    expect(restored.spectatorActive).toEqual(saved.spectatorActive)
  })
})
