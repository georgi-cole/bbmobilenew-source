import { describe, expect, it } from 'vitest'
import gameReducer, { consumeBroadcastEvent, consumeBroadcastEvents } from '../gameSlice'
import type { GameState, TvEvent } from '../../types'

describe('day-boundary broadcast consumption', () => {
  it('preserves every ordered consequence and leaves new-day items queued', () => {
    const tvFeed: TvEvent[] = Array.from({ length: 400 }, (_, i) => ({
      id: `event-${i}`,
      text: `Event ${i}`,
      type: 'game',
      timestamp: i,
      meta: { broadcastLevel: i % 2 ? 'minor' : 'major' },
    }))
    const state: GameState = {
      ...gameReducer(undefined, { type: 'test' }),
      tvFeed,
      broadcastQueue: ['new-day', ...tvFeed.map((event) => event.id)],
    }
    const ids = [...tvFeed.map((event) => event.id), 'missing', 'event-3']
    const individual = ids.reduce((s, id) => gameReducer(s, consumeBroadcastEvent(id)), state)
    const batched = gameReducer(state, consumeBroadcastEvents(ids))
    expect(batched).toEqual(individual)
    expect(batched.broadcastQueue).toEqual(['new-day'])
    expect(batched.lastPlainBroadcastEventId).toBe('event-3')
    expect(batched.players).toBe(state.players)
  })
})
