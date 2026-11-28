import type { RealityDomainState } from './types'

export const CAMPAIGN_VOTE_PROMISE = 'campaign_vote'
export type CampaignVoteTargets = Record<string, string[]>

/** Project private, current commitments for the ballot generator only. */
export function collectCampaignVoteTargets(
  reality: RealityDomainState | undefined,
  day: number
): CampaignVoteTargets {
  const targets: CampaignVoteTargets = {}
  for (const promise of Object.values(reality?.promises ?? {})) {
    const target = promise.scope.targetId
    if (
      promise.kind === CAMPAIGN_VOTE_PROMISE &&
      promise.status === 'ACTIVE' &&
      promise.deadline?.day === day &&
      typeof target === 'string'
    ) {
      const voterTargets = (targets[promise.promisorId] ??= [])
      if (!voterTargets.includes(target)) voterTargets.push(target)
    }
  }
  return targets
}
