import { describe, expect, it } from 'vitest'
import type { PlayerPublicProfile, PublicFeedEntry } from '../../publicOpinion/types'
import { buildAudienceInsight, shouldShowAudienceInsightPrompt } from './audienceInsight'

function profile(): PlayerPublicProfile {
  return {
    playerId: 'human',
    approval: 32,
    previousApproval: 35,
    seasonApprovals: [50, 42, 35, 32],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
    audienceBreakdown: {
      charisma: 38,
      gameplay: 44,
      integrity: 14,
      recentChanges: [],
    },
  }
}

describe('Audience Insight rewarded ad', () => {
  it('keeps the disliked trigger and once-per-day prompt policy', () => {
    expect(shouldShowAudienceInsightPrompt(39, null, '2026-09-26')).toBe(true)
    expect(shouldShowAudienceInsightPrompt(40, null, '2026-09-26')).toBe(false)
    expect(shouldShowAudienceInsightPrompt(30, '2026-09-26', '2026-09-26')).toBe(false)
  })

  it('grounds favorite backlash insight in the actual attributed player', () => {
    const feed: PublicFeedEntry[] = [
      {
        id: '1',
        playerId: 'human',
        text: 'reaction',
        delta: -2,
        week: 5,
        timestamp: 1,
        reason: 'fan_favorite_backlash',
        eventType: 'social_story',
        attributedToId: 'ivy',
      },
    ]

    expect(
      buildAudienceInsight({
        profile: profile(),
        feed,
        playerId: 'human',
        playerNames: { ivy: 'Ivy' },
        random: () => 0,
      })
    ).toContain('Ivy')
  })

  it('can surface underdog and relationship signals without changing approval', () => {
    const current = profile()
    const feed: PublicFeedEntry[] = [
      {
        id: '1',
        playerId: 'human',
        text: 'reaction',
        delta: 1,
        week: 5,
        timestamp: 2,
        reason: 'audience_underdog_rally',
      },
      {
        id: '2',
        playerId: 'human',
        text: 'reaction',
        delta: 1,
        week: 5,
        timestamp: 1,
        reason: 'audience_bromance',
        attributedToId: 'jax',
      },
    ]
    const before = current.approval

    const insight = buildAudienceInsight({
      profile: current,
      feed,
      playerId: 'human',
      playerNames: { jax: 'Jax' },
      random: () => 0.99,
    })

    expect(insight).toContain('Jax')
    expect(current.approval).toBe(before)
  })

  it('falls back to the weakest real audience metric when no receipts exist', () => {
    expect(
      buildAudienceInsight({
        profile: profile(),
        feed: [],
        playerId: 'human',
        random: () => 0,
      })
    ).toContain('trust and loyalty')
  })
})
