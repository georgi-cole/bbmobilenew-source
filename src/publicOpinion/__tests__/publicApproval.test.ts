import { describe, expect, it } from 'vitest'
import { getEffectivePublicApproval } from '../publicApproval'
import type { PlayerPublicProfile } from '../types'

const profile: PlayerPublicProfile = {
  playerId: 'carrier',
  approval: 67,
  previousApproval: 64,
  seasonApprovals: [64, 67],
  completedDirectionCount: 0,
  cumulativePositiveDelta: 3,
  temporaryApprovalBoosts: [
    { id: 'pregnancy:one', delta: 6, expiresWeek: 8, reason: 'pregnancy_news' },
  ],
}

describe('temporary audience approval', () => {
  it('applies public pregnancy buzz for its active days without changing the stored rating', () => {
    expect(getEffectivePublicApproval(profile, 7)).toBe(73)
    expect(getEffectivePublicApproval(profile, 8)).toBe(67)
    expect(profile.approval).toBe(67)
    expect(profile.seasonApprovals).toEqual([64, 67])
  })
})
