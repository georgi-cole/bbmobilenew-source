import { describe, expect, it } from 'vitest'
import { getGame, getPoolByFilter } from '../../src/minigames/registry'
import reactComponents from '../../src/minigames/reactComponents'

describe('removed minigames', () => {
  it('removes Lane Racers from both active and retired game catalogs', () => {
    expect(getGame('laneRacers')).toBeUndefined()
    for (const retired of [true, false])
      expect(getPoolByFilter({ retired }).some((game) => game.key === 'laneRacers')).toBe(false)
  })
  it('does not expose an obsolete lazy component', () => {
    expect('LaneRacers' in reactComponents).toBe(false)
  })
})
