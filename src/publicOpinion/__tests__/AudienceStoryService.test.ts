import { describe, expect, it } from 'vitest'
import { computeSocialAudienceStoryReactions } from '../AudienceStoryService'
import type { PlayerPublicProfile } from '../types'
import type { SocialActionLogEntry } from '../../social/types'

function profile(playerId: string, approval: number): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval: approval,
    seasonApprovals: [approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
  }
}

function action(
  actorId: string,
  targetId: string,
  actionId: string,
  week = 3,
  overrides: Partial<SocialActionLogEntry> = {}
): SocialActionLogEntry {
  return {
    actorId,
    targetId,
    actionId,
    outcome: 'success',
    delta: -4,
    cost: 1,
    newEnergy: 5,
    timestamp: Date.now(),
    week,
    source: 'system',
    ...overrides,
  }
}

describe('AudienceStoryService', () => {
  it('penalizes attacking a fan favourite while increasing sympathy for the target', () => {
    const entry = action('aggressor', 'favorite', 'confront')
    const reactions = computeSocialAudienceStoryReactions({
      entry,
      profiles: {
        aggressor: profile('aggressor', 50),
        favorite: profile('favorite', 82),
      },
      actionHistory: [entry],
      week: 3,
    })

    expect(
      reactions.some(
        (reaction) => reaction.playerId === 'aggressor' && reaction.reason === 'fan_favorite_backlash' && reaction.delta < 0
      )
    ).toBe(true)
    expect(
      reactions.some(
        (reaction) => reaction.playerId === 'favorite' && reaction.reason === 'fan_favorite_sympathy' && reaction.delta > 0
      )
    ).toBe(true)
  })

  it('creates an underdog rally when several players repeatedly pile onto the same target', () => {
    const history = [
      action('a', 'target', 'confront', 3, { timestamp: 1 }),
      action('b', 'target', 'public_callout', 3, { timestamp: 2 }),
      action('c', 'target', 'startFight', 3, { timestamp: 3 }),
    ]
    const reactions = computeSocialAudienceStoryReactions({
      entry: history[2],
      profiles: {
        a: profile('a', 50),
        b: profile('b', 50),
        c: profile('c', 50),
        target: profile('target', 58),
      },
      actionHistory: history,
      week: 3,
    })

    expect(
      reactions.some(
        (reaction) => reaction.playerId === 'target' && reaction.reason === 'audience_underdog_rally'
      )
    ).toBe(true)
    expect(
      reactions.some(
        (reaction) => reaction.playerId === 'c' && reaction.reason === 'audience_pile_on_backlash'
      )
    ).toBe(true)
  })

  it('rewards a visible romance beat for either human or AI actors without repeated farming', () => {
    const first = action('a', 'b', 'flirt', 4, { delta: 5, timestamp: 1 })
    const second = action('a', 'b', 'flirt', 4, { delta: 5, timestamp: 2 })
    const third = action('a', 'b', 'flirt', 4, { delta: 5, timestamp: 3 })

    const reactions = computeSocialAudienceStoryReactions({
      entry: third,
      profiles: {
        a: profile('a', 50),
        b: profile('b', 50),
      },
      actionHistory: [first, second, third],
      week: 4,
    })

    expect(reactions.some((reaction) => reaction.reason === 'audience_romance')).toBe(false)
  })
})
