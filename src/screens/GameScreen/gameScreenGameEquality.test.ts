import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../store/gameSlice'
import { gameScreenGameEquality } from './gameScreenGameEquality'

describe('GameScreen game-state equality', () => {
  it('rerenders when a public Final 4 vote is committed', () => {
    const game = createInitialGameState({ seed: 40914 })
    const before = {
      ...game,
      awaitingPovDecision: true,
      pendingEviction: null,
    }
    const after = {
      ...before,
      awaitingPovDecision: false,
      pendingEviction: {
        evicteeId: game.players[0].id,
        evictionMessage: 'The Power of Safety holder has made their choice.',
      },
    }

    expect(gameScreenGameEquality(before, after)).toBe(false)
  })
})
