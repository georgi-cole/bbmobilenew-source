import type { ReactNode } from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { act, renderHook } from '@testing-library/react'
import { Provider, useSelector } from 'react-redux'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  fastForwardToEviction,
} from '../../../store/gameSlice'
import publicOpinionReducer from '../../../publicOpinion/publicOpinionSlice'
import type { PlayerPublicProfile } from '../../../publicOpinion/types'
import type { AppDispatch, RootState } from '../../../store/store'
import { useTwistFlow } from './useTwistFlow'

function publicProfile(
  playerId: string,
  approval: number,
  previousApproval = approval
): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval,
    seasonApprovals: [approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
  }
}

function makePublicSaveStore() {
  const game = createInitialGameState({ seed: 1, seasonArchives: [] })
  const ids = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']
  Object.assign(game, {
    mode: 'classic',
    phase: 'pre_veto_public_save',
    awaitingPublicSave: true,
    nomineeIds: ids,
    players: ids.map((id, index) => ({
      id,
      name: id.toUpperCase(),
      avatar: '🙂',
      status: 'nominated',
      isUser: index === 0,
    })),
    cupidArrow: {
      ...game.cupidArrow,
      status: 'active',
      pairs: [ids.slice(0, 2), ids.slice(2, 4), ids.slice(4, 6)].map((memberIds, index) => ({
        id: `pair-${index}`,
        memberIds,
        color: '#ff5d8f',
      })),
    },
  })
  const profiles = {
    a1: publicProfile('a1', 60, 0),
    a2: publicProfile('a2', 60, 100),
    b1: publicProfile('b1', 66),
    b2: publicProfile('b2', 66),
    c1: publicProfile('c1', 10),
    c2: publicProfile('c2', 10),
  }
  const publicOpinion = { ...publicOpinionReducer(undefined, { type: '@@INIT' }), profiles }
  return configureStore({
    reducer: { game: gameReducer, publicOpinion: publicOpinionReducer },
    preloadedState: { game, publicOpinion },
    middleware: (get) => get({ serializableCheck: false, immutableCheck: false }),
  })
}

describe('Cupid Public Save handoff', () => {
  it('uses the winning pair total for the reveal, announcement and committed save', () => {
    const store = makePublicSaveStore()
    const { result } = renderHook(
      () => {
        const game = useSelector((state: ReturnType<typeof store.getState>) => state.game)
        return useTwistFlow({
          game,
          alivePlayers: game.players,
          humanPlayer: game.players[0],
          publicOpinionProfiles: store.getState().publicOpinion.profiles,
          dispatch: store.dispatch as AppDispatch,
        })
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>{children}</Provider>
        ),
      }
    )
    expect(result.current.publicSaveWinnerId).toBe('b1')
    const shares = result.current.publicSaveApprovals
    const winningPairShare = shares.b1 + shares.b2
    expect(winningPairShare).toBeGreaterThan(shares.a1 + shares.a2)
    act(() => result.current.handlePublicSaveDone())
    expect(result.current.pendingPublicSaveResult).toEqual({
      savedId: 'b1',
      supportPercent: winningPairShare,
    })
    expect(result.current.publicSaveResultAnnouncement?.subtitle).toContain(
      `with ${Math.round(winningPairShare)}%`
    )
    act(() => result.current.handlePublicSaveResultDismiss())
    expect(store.getState().game.nomineeIds).toEqual(['a1', 'a2', 'c1', 'c2'])
    expect(
      store
        .getState()
        .game.players.filter((player) => ['b1', 'b2'].includes(player.id))
        .every((player) => player.status === 'active')
    ).toBe(true)
    expect(store.getState().game.phase).toBe('pos_comp_announcement')
  })

  it('uses the same pair result when the presentation is skipped', () => {
    const store = makePublicSaveStore()
    let savedState: ReturnType<typeof store.getState>['game'] | undefined
    const unsubscribe = store.subscribe(() => {
      if (!savedState && store.getState().game.publicSavedNomineeId)
        savedState = store.getState().game
    })
    const step = fastForwardToEviction()
    step(store.dispatch as AppDispatch, store.getState as () => RootState)
    unsubscribe()
    expect(savedState?.publicSavedNomineeId).toBe('b1')
    expect(savedState?.nomineeIds).toEqual(['a1', 'a2', 'c1', 'c2'])
  })
})
