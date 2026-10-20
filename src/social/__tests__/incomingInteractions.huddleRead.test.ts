import { describe, expect, it } from 'vitest'
import { buildAllianceGroupRead, buildAllianceHuddleDecisionOutcome } from '../incomingInteractions'
import type { IncomingInteraction } from '../types'

function interaction(payload: Record<string, unknown>): IncomingInteraction {
  return {
    id: 'huddle-1',
    fromId: 'leader',
    type: 'deal_offer',
    text: 'Alliance huddle',
    payload,
    createdAt: 1,
    createdWeek: 4,
    expiresAtWeek: 5,
    read: false,
    requiresResponse: true,
    resolved: false,
  }
}

const players = [
  { id: 'user', name: 'You', status: 'active', isUser: true },
  { id: 'leader', name: 'Lia', status: 'loh' },
  { id: 'ally-a', name: 'Ava', status: 'active' },
  { id: 'ally-b', name: 'Noah', status: 'active' },
  { id: 'target-a', name: 'Maya', status: 'active' },
  { id: 'target-b', name: 'Kian', status: 'active' },
  { id: 'gone', name: 'Gone', status: 'evicted' },
]

describe('buildAllianceGroupRead', () => {
  it("renders each active alliance member's concrete nomination preference", () => {
    const read = buildAllianceGroupRead(
      interaction({
        allianceGroupHuddle: true,
        allianceStrategyKind: 'NOMINATION',
        allianceGroupMemberIds: ['leader', 'user', 'ally-a', 'ally-b', 'gone'],
        allianceMemberTargetPreferences: {
          leader: 'target-a',
          user: 'target-b',
          'ally-a': 'target-a',
          'ally-b': 'target-b',
          gone: 'target-a',
        },
      }),
      players
    )

    expect(read).toContain('Lia: target Maya')
    expect(read).toContain('Ava: target Maya')
    expect(read).toContain('Noah: target Kian')
    expect(read).not.toContain('You:')
    expect(read).not.toContain('Gone:')
  })

  it('includes the proposed replacement when the huddle is about Safety', () => {
    const read = buildAllianceGroupRead(
      interaction({
        allianceGroupHuddle: true,
        allianceStrategyKind: 'SAFETY',
        allianceGroupMemberIds: ['leader', 'ally-a'],
        allianceMemberTargetPreferences: {
          leader: 'target-a',
          'ally-a': 'target-b',
        },
        allianceMemberFallbackPreferences: {
          leader: 'target-b',
          'ally-a': 'target-a',
        },
      }),
      players
    )

    expect(read).toContain('Lia: save Maya → replacement Kian')
    expect(read).toContain('Ava: save Kian → replacement Maya')
  })

  it('reports a huddle recommendation only when it has member majority support', () => {
    const huddle = interaction({
      allianceGroupHuddle: true,
      allianceStrategyKind: 'NOMINATION',
      allianceGroupMemberIds: ['leader', 'user', 'ally-a'],
      subjectId: 'target-a',
      allianceMemberTargetPreferences: {
        leader: 'target-a',
        'ally-a': 'target-b',
      },
    })

    expect(buildAllianceHuddleDecisionOutcome(huddle, 'neutral', players)).toContain(
      'No target reached a member majority.'
    )
    expect(buildAllianceHuddleDecisionOutcome(huddle, 'accept', players)).toContain(
      'a majority recommendation to target Maya'
    )
    expect(buildAllianceHuddleDecisionOutcome(huddle, 'accept', players)).toContain(
      'the LOH sets the slate'
    )
  })

  it('reports saving and replacement recommendations as separate Safety decisions', () => {
    const huddle = interaction({
      allianceGroupHuddle: true,
      allianceStrategyKind: 'SAFETY',
      allianceGroupMemberIds: ['leader', 'user', 'ally-a'],
      subjectId: 'target-a',
      secondarySubjectId: 'target-b',
      allianceMemberTargetPreferences: {
        leader: 'target-a',
        'ally-a': 'target-a',
      },
      allianceMemberFallbackPreferences: {
        leader: 'target-b',
        'ally-a': 'target-b',
      },
    })

    const outcome = buildAllianceHuddleDecisionOutcome(huddle, 'neutral', players)
    expect(outcome).toContain('a majority recommends saving Maya')
    expect(outcome).toContain('a majority recommends Kian for the replacement seat')
    expect(outcome).toContain('Safety holder makes the final decision')
  })
})
