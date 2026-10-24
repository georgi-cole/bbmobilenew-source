import { describe, expect, it } from 'vitest'
import {
  BOXED_OUT_LIVES,
  BOXED_OUT_ROUNDS,
  advanceBoxedOut,
  autoFinishBoxedOut,
  createBoxedOutState,
  prizesForRound,
  resolveBoxedOutRound,
  resolveBoxedOutTiebreak,
  standings,
  tiebreakQuestion,
  type BoxId,
  type BoxedOutPlayer,
  type BoxedOutState,
} from '../src/features/boxedOut/rules'

const players: BoxedOutPlayer[] = [
  { id: 'human', name: 'Human', isHuman: true },
  { id: 'a', name: 'A', isHuman: false },
  { id: 'b', name: 'B', isHuman: false },
  { id: 'c', name: 'C', isHuman: false },
]

function withSelections(picks: Record<string, BoxId>): BoxedOutState {
  const state = createBoxedOutState(players, 12345)
  return { ...state, lockedAiPicks: picks }
}

describe('BOXED OUT survival rules', () => {
  it('begins with exactly three lives and three different publicly assigned prizes', () => {
    const state = createBoxedOutState(players, 12345)
    expect(Object.values(state.lives)).toEqual([3, 3, 3, 3])
    expect(new Set(state.rewards).size).toBe(3)
    expect(BOXED_OUT_LIVES).toBe(3)
    expect(BOXED_OUT_ROUNDS).toBe(10)
    expect(prizesForRound(12345, 10).sort((a, b) => a - b)).toEqual([240, 420, 700])
  })

  it('explodes only the uniquely most popular box, awarding other boxes points', () => {
    const state = withSelections({ a: 0, b: 0, c: 1 })
    const done = resolveBoxedOutRound(state, 0)
    expect(done.reveals[0].occupancy).toEqual([3, 1, 0])
    expect(done.reveals[0].exploded).toBe(0)
    expect(done.lives.human).toBe(2)
    expect(done.lives.a).toBe(2)
    expect(done.lives.b).toBe(2)
    expect(done.lives.c).toBe(3)
    expect(done.scores.human).toBe(0)
    expect(done.scores.c).toBe(state.rewards[1])
  })

  it('does not explode when the largest occupancy is tied', () => {
    const state = withSelections({ a: 0, b: 1, c: 1 })
    const done = resolveBoxedOutRound(state, 0)
    expect(done.reveals[0].occupancy).toEqual([2, 2, 0])
    expect(done.reveals[0].exploded).toBeNull()
    expect(done.lives).toEqual(state.lives)
    expect(done.scores.human).toBe(state.rewards[0])
    expect(done.scores.b).toBe(state.rewards[1])
  })

  it('can explode the box of every participant at once', () => {
    const state = withSelections({ a: 2, b: 2, c: 2 })
    const done = resolveBoxedOutRound(state, 2)
    expect(done.reveals[0].exploded).toBe(2)
    expect(Object.values(done.scores)).toEqual([0, 0, 0, 0])
    expect(Object.values(done.lives)).toEqual([2, 2, 2, 2])
  })

  it('ignores duplicate round settlement and invalid human picks', () => {
    const state = withSelections({ a: 0, b: 0, c: 1 })
    expect(resolveBoxedOutRound(state)).toBe(state)
    const once = resolveBoxedOutRound(state, 0)
    expect(resolveBoxedOutRound(once, 0)).toBe(once)
  })

  it('eliminates players at zero, never allows them to participate again', () => {
    const state = withSelections({ a: 0, b: 0, c: 2 })
    const fragile = { ...state, lives: { human: 1, a: 1, b: 1, c: 3 } }
    const after = resolveBoxedOutRound(fragile, 0)
    expect(after.reveals[0].eliminated).toEqual(['human', 'a', 'b'])
    expect(advanceBoxedOut(after).winnerId).toBe('c')
    expect(standings(after)[0]).toBe('c')
  })

  it('uses only last-round participants for a total wipeout', () => {
    const state = withSelections({ a: 1, b: 1, c: 0 })
    const finalRound = {
      ...state,
      round: 10,
      phase: 'select' as const,
      rewards: prizesForRound(state.seed, 10),
      lives: { human: 1, a: 1, b: 0, c: 0 },
      scores: { human: 800, a: 700, b: 2000, c: 1500 },
      eliminatedAt: { b: 8, c: 9 },
      lockedAiPicks: { a: 1 },
    }
    const after = resolveBoxedOutRound(finalRound, 1)
    const verdict = advanceBoxedOut(after)
    expect(after.reveals[0].eliminated).toEqual(['human', 'a'])
    expect(verdict.winnerId).toBe('human')
    expect(verdict.phase).toBe('finished')
  })

  it('requires the closest non-over answer and never selects an over-limit answer', () => {
    const state = withSelections({ a: 0, b: 0, c: 1 })
    const duel = { ...state, phase: 'tiebreak' as const, finalists: ['human', 'a'] }
    const question = tiebreakQuestion(duel)
    const correct = resolveBoxedOutTiebreak(duel, question.answer, 100)
    expect(correct.winnerId).toBe('human')
    const over = resolveBoxedOutTiebreak(duel, question.answer + 1, 100)
    expect(over.winnerId).toBe('a')
  })

  it('produces the same AI choices and end result for the same seed', () => {
    const a = createBoxedOutState(players.filter((p) => !p.isHuman), 999)
    const b = createBoxedOutState(players.filter((p) => !p.isHuman), 999)
    expect(a.lockedAiPicks).toEqual(b.lockedAiPicks)
    expect(autoFinishBoxedOut(a)).toEqual(autoFinishBoxedOut(b))
    expect(autoFinishBoxedOut(a).winnerId).not.toBeNull()
  })

  it('rejects malformed participant sets', () => {
    expect(() => createBoxedOutState([players[0], players[0]], 42)).toThrow()
    expect(() => createBoxedOutState([players[0]], 42)).toThrow()
  })
})
