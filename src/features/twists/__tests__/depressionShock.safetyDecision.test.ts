import { describe, expect, it, vi } from 'vitest'
import type { Dispatch, UnknownAction } from '@reduxjs/toolkit'
import { createInitialGameState } from '../../../store/gameSlice'
import { depressionShockMiddleware } from '../depressionShockMiddleware'

vi.mock('../depressionShock', async (original) => ({
  ...(await original<typeof import('../depressionShock')>()),
  isDepressionShockActive: () => true,
  shouldDepressionShockTriggerSurpriseDecision: () => true,
  consumeDepressionShockFightRoll: () => false,
}))

describe('Depression Shock Safety commentary', () => {
  it.each([true, false])(
    'distorts strategy only when the holder is not nominated (%s)',
    (nominated) => {
      const game = createInitialGameState({ seed: 44 })
      const holder = game.players.find((p) => !p.isUser)!
      const nominee = game.players.find((p) => p.id !== holder.id)!
      game.phase = 'pos_ceremony_results'
      game.posWinnerId = holder.id
      game.nomineeIds = nominated ? [holder.id, nominee.id] : [nominee.id]
      let state = { game }
      const dispatched = vi.fn((action: UnknownAction) => action)
      const dispatch: Dispatch = <T extends UnknownAction>(action: T) => {
        dispatched(action)
        return action
      }
      const next = vi.fn((action: unknown) => {
        if ((action as UnknownAction).type === 'game/advance')
          state = { game: { ...game, nomineeIds: [] } }
        return action
      })
      const invoke = depressionShockMiddleware({ dispatch, getState: () => state })(next)
      const relationships = { [holder.id]: { [nominee.id]: { affinity: 50, tags: [] } } }
      invoke({ type: 'game/syncStrategicRelationships', payload: relationships })
      const passed = next.mock.calls[0][0] as { payload: typeof relationships }
      expect(passed.payload[holder.id][nominee.id].affinity).toBe(nominated ? 50 : -50)
      invoke({ type: 'game/advance' })
      if (nominated) expect(dispatched).not.toHaveBeenCalled()
      else
        expect(dispatched).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'game/addTvEvent',
            payload: expect.objectContaining({
              text: expect.stringContaining('erratic Safety choice'),
            }),
          })
        )
    }
  )
})
