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

  it('starts the plea sequence and prepares a human POS decision', async () => {
    const dispatch = vi.fn()
    const { result } = renderHook(() =>
      useEndgameFlow({
        game: final4Game('human'),
        alivePlayers: players,
        humanPlayer: players[0],
        humanIsPosHolder: true,
        spectatorReactEnabled: false,
        spectatorMode: false,
        dispatch: dispatch as never,
      })
    )

    await waitFor(() => expect(result.current.showFinal4Chat).toBe(true))
    expect(dispatch).toHaveBeenCalledWith(advance())
  })
})
