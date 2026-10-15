import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Player } from '../../../types'
import type { RootState } from '../../../store/store'
import { advance } from '../../../store/gameSlice'
import { useEndgameFlow } from './useEndgameFlow'

const players = [
  { id: 'human', name: 'You', isUser: true, status: 'loh' },
  { id: 'mimi', name: 'Mimi', status: 'nominated' },
  { id: 'aria', name: 'Aria', status: 'nominated' },
  { id: 'holder', name: 'Holder', status: 'pos' },
] as Player[]

function final4Game(posWinnerId: string) {
  return {
    phase: 'final4_eviction',
    players,
    nomineeIds: ['mimi', 'aria'],
    posWinnerId,
    seed: 42,
  } as RootState['game']
}

describe('Final 4 phase entry', () => {
  it('starts the plea sequence when the POS holder is AI', async () => {
    const dispatch = vi.fn()
    const { result } = renderHook(() =>
      useEndgameFlow({
        game: final4Game('holder'),
        alivePlayers: players,
        humanPlayer: players[0],
        humanIsPosHolder: false,
        spectatorReactEnabled: false,
        spectatorMode: false,
        dispatch: dispatch as never,
      })
    )

    await waitFor(() => expect(result.current.showFinal4Chat).toBe(true))
    expect(result.current.final4PleaLines).toHaveLength(8)
    act(() => result.current.handleFinal4PleaComplete())
    expect(dispatch).toHaveBeenCalledWith(advance())
  })

  it('keeps the human POS decision live after the plea sequence', async () => {
    const dispatch = vi.fn()
    const game = final4Game('human')
    game.awaitingPovDecision = true
    const { result } = renderHook(() =>
      useEndgameFlow({
        game,
        alivePlayers: players,
        humanPlayer: players[0],
        humanIsPosHolder: true,
        spectatorReactEnabled: false,
        spectatorMode: false,
        dispatch: dispatch as never,
      })
    )

    await waitFor(() => expect(result.current.showFinal4Chat).toBe(true))
    expect(result.current.showFinal4PublicVote).toBe(true)
    expect(result.current.final4PleaLines.at(-1)?.text).toContain('in front of everyone')
    expect(dispatch).toHaveBeenCalledWith(advance())
  })

  it('continues from the public vote straight into the eviction announcement', async () => {
    const dispatch = vi.fn()
    const game = final4Game('human')
    game.awaitingPovDecision = true
    const { result, rerender } = renderHook(
      ({ currentGame }) =>
        useEndgameFlow({
          game: currentGame,
          alivePlayers: players,
          humanPlayer: players[0],
          humanIsPosHolder: true,
          spectatorReactEnabled: false,
          spectatorMode: false,
          dispatch: dispatch as never,
        }),
      { initialProps: { currentGame: game } }
    )

    await waitFor(() => expect(result.current.showFinal4PublicVote).toBe(true))
    rerender({
      currentGame: {
        ...game,
        awaitingPovDecision: false,
        pendingEviction: {
          evicteeId: 'mimi',
          evictionMessage: 'The human chose Mimi.',
        },
      },
    })

    await waitFor(() => expect(result.current.showFinal4AnnounceChat).toBe(true))
    expect(result.current.final4AnnounceLines[0]?.text).toContain('Mimi')
  })
})
