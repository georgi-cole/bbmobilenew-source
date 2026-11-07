import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider, useSelector } from 'react-redux'
import { afterEach, describe, expect, it } from 'vitest'
import gameReducer, {
  activateDayStartShock,
  createInitialGameState,
  selectAlivePlayers,
} from '../../../store/gameSlice'
import { store as baseline, type RootState } from '../../../store/store'
import { createInitialVoxPopuliState } from '../../../features/twists/voxPopuli'
import { gameScreenGameEquality } from '../gameScreenGameEquality'
import { useTwistFlow } from './useTwistFlow'
import { useEndgameFlow } from './useEndgameFlow'

afterEach(cleanup)

function makeFlowStore(game: RootState['game']) {
  const initial: RootState = { ...structuredClone(baseline.getState()), game }
  return configureStore({
    reducer: (state = initial, action) => ({
      ...state,
      game: gameReducer(state.game, action),
    }),
    middleware: (get) => get({ serializableCheck: false, immutableCheck: false }),
  })
}

function mountTwistFlow(game: RootState['game']) {
  const store = makeFlowStore(game)
  const hook = renderHook(
    () => {
      const selectedGame = useSelector((state: RootState) => state.game, gameScreenGameEquality)
      const alivePlayers = useSelector(selectAlivePlayers)
      const publicOpinionProfiles = useSelector((state: RootState) => state.publicOpinion.profiles)
      return useTwistFlow({
        game: selectedGame,
        alivePlayers,
        humanPlayer: selectedGame.players.find((player) => player.isUser),
        publicOpinionProfiles,
        dispatch: store.dispatch,
      })
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    }
  )
  return { ...hook, store }
}

describe('GameScreen twist presentation synchronization', () => {
  it('shows a Vox morning shock immediately and hands confirmation to the eviction flow', () => {
    const game = createInitialGameState({ seed: 933 })
    game.phase = 'loh_results'
    game.voxPopuli = { ...createInitialVoxPopuliState(game.season), status: 'active' }
    const target = game.players.find((player) => !player.isUser)!
    const { result, store } = mountTwistFlow(game)

    act(() => {
      store.dispatch(
        activateDayStartShock({
          targetId: target.id,
          reason: 'Production has called this hubmate out of the Hub.',
          templateId: 'morning-removal',
          triggeredWeek: game.week,
          source: 'random',
        })
      )
    })

    expect(result.current.dayStartShockPlayer?.id).toBe(target.id)
    expect(result.current.dayStartShock?.targetId).toBe(target.id)

    act(() => result.current.handleDayStartShockConfirm())

    expect(result.current.dayStartShock).toBeNull()
    expect(store.getState().game.pendingEviction?.evicteeId).toBe(target.id)
  })

  it('dismisses the combined Twin Shock reveal when its animation completes', () => {
    const game = createInitialGameState({ seed: 934 })
    game.phase = 'loh_results'
    game.twinShock!.pendingRevealAnimation = {
      type: 'combined',
      playerId: 'lia',
      fromName: 'Lia',
      fromAvatar: 'assets/skins/Lia_avatar.webp',
      toName: 'Lia & Ali',
      toAvatar: 'assets/skins/Ali_lia_avatar.webp',
    }
    const { result, store } = mountTwistFlow(game)

    expect(result.current.twinShockReveal?.type).toBe('combined')
    act(() => result.current.handleTwinShockIntroDone())
    expect(result.current.completedTwinShockIntroKey).toBe(result.current.twinShockSequenceKey)

    act(() => result.current.handleTwinShockRevealDone())

    expect(store.getState().game.twinShock?.pendingRevealAnimation).toBeNull()
    expect(result.current.twinShockReveal).toBeNull()
    expect(result.current.twinShockSequenceKey).toBeNull()
  })

  it('hands the Final Three block reveal to the spectator competition without another game update', () => {
    const game = createInitialGameState({ seed: 935 })
    game.players = game.players.slice(0, 3)
    game.phase = 'final3_comp3'
    const human = game.players.find((player) => player.isUser)!
    const competitors = game.players.filter((player) => !player.isUser)
    game.nomineeIds = [human.id]
    game.f3Part1WinnerId = competitors[0].id
    game.f3Part2WinnerId = competitors[1].id
    game.finalThree = null
    const store = makeFlowStore(game)
    const { result } = renderHook(
      () => {
        const selectedGame = useSelector((state: RootState) => state.game, gameScreenGameEquality)
        const alivePlayers = useSelector(selectAlivePlayers)
        return useEndgameFlow({
          game: selectedGame,
          alivePlayers,
          humanPlayer: selectedGame.players.find((player) => player.isUser),
          humanIsPosHolder: false,
          spectatorReactEnabled: true,
          spectatorMode: true,
          dispatch: store.dispatch,
        })
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>{children}</Provider>
        ),
      }
    )

    expect(result.current.finalThreeBlockRevealActive).toBe(true)
    act(() => result.current.handleFinalThreeBlockRevealDone())

    expect(result.current.finalThreeBlockRevealActive).toBe(false)
    expect(result.current.spectatorF3Active).toBe(true)
    expect(result.current.spectatorF3CompetitorIds).toEqual(competitors.map((player) => player.id))
    expect(store.getState().game.phase).toBe('final3_comp3')
  })
})
