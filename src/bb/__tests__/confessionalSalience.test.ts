import { afterEach, describe, expect, it } from 'vitest'
import {
  buildBigEyeWorldSnapshot,
  getSalientConfessionalObservation,
} from '../confessionalSalience'
import { setRemoteConfessionalConfig } from '../confessionalRuntimeConfig'

const baseWorld = {
  week: 4,
  phase: 'pre_nomination',
  playerStatus: 'active',
  leaderName: 'Jordan',
  nomineeNames: [] as string[],
  safetyWinnerName: null as string | null,
  remainingHousemates: ['Alex', 'Jordan', 'Maya', 'Sam', 'Kian', 'Lia', 'Ruben'],
  closestRelationships: [{ name: 'Maya', affinity: 80, tags: ['ally'] }],
  recentPublicEvents: [] as string[],
}

afterEach(() => {
  setRemoteConfessionalConfig(null)
})

describe('Confessional salience', () => {
  it('prioritizes a new nomination over lower-value changes', () => {
    const previous = buildBigEyeWorldSnapshot(baseWorld)
    const current = {
      ...baseWorld,
      week: 5,
      leaderName: 'Alex',
      nomineeNames: ['Alex', 'Sam'],
      closestRelationships: [{ name: 'Kian', affinity: 84, tags: ['ally'] }],
    }

    const observation = getSalientConfessionalObservation({
      previous,
      current,
      playerName: 'Alex',
    })

    expect(observation?.event).toBe('newly_nominated')
    expect(observation?.text).toMatch(/block/)
  })

  it('recognizes a public return-to-game event', () => {
    const previous = buildBigEyeWorldSnapshot(baseWorld)
    const observation = getSalientConfessionalObservation({
      previous,
      current: {
        ...baseWorld,
        week: 6,
        recentPublicEvents: ['Alex has returned to the game after Back 2 the Game.'],
      },
      playerName: 'Alex',
    })

    expect(observation?.event).toBe('returned')
  })

  it('uses a remotely updated observation template without code changes', () => {
    setRemoteConfessionalConfig({
      salience: {
        templates: { became_leader: ['{player}, the chair looks different when you hold power.'] },
      },
    })
    const previous = buildBigEyeWorldSnapshot(baseWorld)
    const observation = getSalientConfessionalObservation({
      previous,
      current: { ...baseWorld, leaderName: 'Alex' },
      playerName: 'Alex',
    })

    expect(observation?.text).toBe('Alex, the chair looks different when you hold power.')
  })
})
