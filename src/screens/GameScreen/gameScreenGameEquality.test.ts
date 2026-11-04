import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  completeFinalThreeOpening,
  completeFinalThreeBlockReveal,
  prepareClassicFinalThreeTest,
} from '../../store/gameSlice'
import { gameScreenGameEquality } from './gameScreenGameEquality'

describe('GameScreen game-state equality', () => {
  it('notices opening acknowledgement when phase and roster stay unchanged', () => {
    const before = gameReducer(
      createInitialGameState({ seed: 811 }),
      prepareClassicFinalThreeTest()
    )
    const after = gameReducer(before, completeFinalThreeOpening())
    expect(after.phase).toBe(before.phase)
    expect(after.players).toBe(before.players)
    expect(after.finalThree?.openingSeen).toBe(true)
    expect(gameScreenGameEquality(before, after)).toBe(false)
  })
  it('notices Part 3 setup completion before a spectator round changes phase', () => {
    const initial = gameReducer(
      createInitialGameState({ seed: 811 }),
      prepareClassicFinalThreeTest()
    )
    const before = { ...initial, phase: 'final3_comp3' as const }
    const after = gameReducer(before, completeFinalThreeBlockReveal())
    expect(after.phase).toBe(before.phase)
    expect(after.finalThree?.blockRevealSeen).toBe(true)
    expect(gameScreenGameEquality(before, after)).toBe(false)
  })
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

  it('rerenders when Democracia voting state changes', () => {
    const game = createInitialGameState({ seed: 40914 })
    const before = {
      ...game,
      democracia: {
        ...game.democracia!,
        awaitingHumanVote: true,
        votesByVoterId: {},
      },
    }
    const after = {
      ...before,
      democracia: {
        ...before.democracia,
        awaitingHumanVote: false,
        votesByVoterId: { [game.players[0].id]: game.players[1].id },
      },
    }

    expect(gameScreenGameEquality(before, after)).toBe(false)
  })
})
