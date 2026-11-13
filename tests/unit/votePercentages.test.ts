import { describe, expect, it } from 'vitest'
import {
  formatVotePercentage,
  getVotePercentagePrecision,
} from '../../src/utils/votePercentages.mjs'

const labels = (values: number[]) => {
  const precision = getVotePercentagePrecision(values)
  return values.map((value) => formatVotePercentage(value, precision))
}
describe('public vote percentage precision', () => {
  it('uses one decimal for ordinary results', () =>
    expect(labels([32.43128, 67.56872])).toEqual(['32.4%', '67.6%']))
  it('adds a second decimal only when the first hides a difference', () =>
    expect(labels([32.431, 32.439])).toEqual(['32.43%', '32.44%']))
  it('adds further decimals only as needed', () =>
    expect(labels([32.431, 32.432])).toEqual(['32.431%', '32.432%']))
  it('preserves genuine ties at one decimal', () =>
    expect(labels([50, 50])).toEqual(['50.0%', '50.0%']))
  it('keeps a real tie together while distinguishing a close third candidate', () =>
    expect(labels([33.333, 33.333, 33.334])).toEqual(['33.333%', '33.333%', '33.334%']))
  it('does not expose floating-point tails unnecessarily', () =>
    expect(labels([0.1 + 0.2, 99.7])).toEqual(['0.3%', '99.7%']))
})
