import { expect, it } from 'vitest'
import { WHEEL_SECTORS, pickSectorIndex } from '../../../features/riskWheel/riskWheelSlice'
import {
  abyssStandings,
  settleHandoffs,
  simulateAbyss,
  spinPlayoff,
  startAbyss,
} from './abyssRules'
import type { Abyss } from './abyssRules'

it('passes debt and gains together and sends only the lowest tied balances to playoffs', () => {
  const state: Abyss = {
    ...startAbyss(['a', 'b', 'c'], 11, 'a'),
    phase: 'handoff',
    roundScores: { a: -20, b: 50, c: 10 },
  }
  const result = settleHandoffs(state, () => 0, 'b')
  expect(result.transfers[0]).toEqual({ from: 'a', to: 'b', amount: -20 })
  expect(Object.values(result.roundScores).reduce((sum, score) => sum + score, 0)).toBe(40)
  expect(result.transfers.every(({ from, to }) => from !== to)).toBe(true)
  const tied = settleHandoffs({ ...state, roundScores: { a: 0, b: 0, c: 0 } }, () => 0, 'c')
  expect(tied.playoff).toEqual(state.active)
  expect(tied.out).toBeUndefined()
})

it('ranks a negative playoff spin below VOID', () => {
  const seed = Array.from({ length: 10_000 }, (_, index) => index).find((seed) => {
    const first = WHEEL_SECTORS[pickSectorIndex(seed, 0)]
    const second = WHEEL_SECTORS[pickSectorIndex(seed, 1)]
    return first.type === 'bankrupt' && (second.value ?? 0) < 0
  })!
  const state: Abyss = {
    ...startAbyss(['a', 'b', 'c'], seed),
    phase: 'playoff',
    playoff: ['a', 'b'],
  }
  const result = spinPlayoff(state)
  expect(result.playoffScores.a).toBe(0)
  expect(result.playoffScores.b).toBeLessThan(0)
  expect(result.out).toBe('b')
})

it.each([2, 5, 8, 16])('settles a %i-player field with unique, seeded placements', (count) => {
  const ids = Array.from({ length: count }, (_, index) => String(index))
  const state = startAbyss(ids, 91)
  const first = simulateAbyss(state, () => 0)
  expect(first).toEqual(simulateAbyss(state, () => 0))
  expect(first.active).toHaveLength(1)
  expect(abyssStandings(first).slice().sort()).toEqual(ids.slice().sort())
})
