import { recordAllianceRequestEvent } from './allianceRequestEvents'
import { appendRealityEvent } from './events'
import { compareSocialClock } from './clock'
import {
  allianceKind,
  isCurrentAlliance,
  rememberAllianceRoster,
  synchronizeAllianceOfficers,
} from './allianceIdentity'
import type { RealityAlliance, RealityClock, RealityDomainState } from './types'

function rosterKey(memberIds: readonly string[]): string {
  return [...new Set(memberIds)].sort().join('~')
}

function compareAllianceAge(left: RealityAlliance, right: RealityAlliance): number {
  if (left.createdAt && right.createdAt) {
    const age = compareSocialClock(left.createdAt, right.createdAt)
    if (age !== 0) return age
  } else if (left.createdAt || right.createdAt) {
    return left.createdAt ? -1 : 1
  }
  return left.id.localeCompare(right.id)
}

function closeDuplicate(
  state: RealityDomainState,
  survivor: RealityAlliance,
  duplicate: RealityAlliance,
  at: RealityClock | undefined
): void {
  const memberIds = [...duplicate.memberIds]
  rememberAllianceRoster(duplicate)
  if (at) {
    appendRealityEvent(state, {
      ...at,
      type: 'ALLIANCE_ENDED',
      allianceId: duplicate.id,
      targetIds: [],
      participantIds: memberIds,
      witnessIds: [],
      visibility: 'GROUP_VISIBLE',
      outcome: 'SYSTEM',
      reason: `duplicate_roster:${duplicate.id}:${survivor.id}`,
      tags: ['ALLIANCE', 'MANAGEMENT', 'DUPLICATE_ROSTER'],
      relatedFactIds: [],
      relatedPromiseIds: [...duplicate.sharedPromiseIds],
      relatedThreadIds: [],
      allianceSnapshot: {
        id: duplicate.id,
        kind: 'GROUP',
        ...(duplicate.name ? { name: duplicate.name } : {}),
        memberIds,
        endReason: 'DUPLICATE_ROSTER',
        supersededById: survivor.id,
        ...(survivor.name ? { supersededByName: survivor.name } : {}),
      },
      publicEligible: false,
      juryEligible: true,
    })
  }

  duplicate.status = 'DISSOLVED'
  if (at) duplicate.endedAt = { ...at }
  duplicate.endReason = 'DUPLICATE_ROSTER'
  duplicate.supersededById = survivor.id
  duplicate.memberIds = []
  duplicate.currentTargetIds = []
  duplicate.fallbackTargetIds = []
  duplicate.overlapAllianceIds = []
  duplicate.rosterRevision = (duplicate.rosterRevision ?? 0) + 1
  synchronizeAllianceOfficers(duplicate)

  const survivorName = survivor.name ?? 'the existing alliance'
  for (const request of Object.values(state.allianceManagement.requests)) {
    if (
      request.allianceId !== duplicate.id ||
      (request.status !== 'VOTING' && request.status !== 'CONSENT')
    ) {
      continue
    }
    request.status = 'INVALIDATED'
    request.reason = `${duplicate.name ?? 'The alliance'} closed because its roster now matches ${survivorName}.`
    if (at) {
      request.settledAt = { ...at }
      recordAllianceRequestEvent(state, request, 'ALLIANCE_REQUEST_INVALIDATED', at)
    }
  }
}

/**
 * Close only group alliances whose live member sets have converged. Pacts and
 * intentionally nested groups remain independent. The caller may prefer a
 * group that already had the resulting roster before this transaction.
 */
export function reconcileConvergedAllianceRosters(
  state: RealityDomainState,
  at?: RealityClock,
  preferredSurvivorIds: readonly string[] = []
): RealityAlliance[] {
  const preferred = new Set(preferredSurvivorIds)
  const byRoster = new Map<string, RealityAlliance[]>()
  for (const alliance of Object.values(state.alliances)) {
    if (!isCurrentAlliance(alliance) || allianceKind(alliance) !== 'GROUP') continue
    const key = rosterKey(alliance.memberIds)
    if (!key) continue
    byRoster.set(key, [...(byRoster.get(key) ?? []), alliance])
  }

  const closed: RealityAlliance[] = []
  for (const candidates of byRoster.values()) {
    if (candidates.length < 2) continue
    const ordered = [...candidates].sort((left, right) => {
      const preferredRank = Number(preferred.has(right.id)) - Number(preferred.has(left.id))
      return preferredRank || compareAllianceAge(left, right)
    })
    const survivor = ordered[0]
    for (const duplicate of ordered.slice(1)) {
      closeDuplicate(state, survivor, duplicate, at)
      closed.push(duplicate)
    }
  }
  return closed
}
