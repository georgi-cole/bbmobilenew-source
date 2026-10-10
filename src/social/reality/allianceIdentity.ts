import type { RealityAlliance, RealityDomainState } from './types'
import type { RelationshipsMap } from '../types'

export const ALLIANCE_LIMITS = { groupsPerMember: 2, groupMembers: 6 } as const

export function isCurrentAlliance(alliance: RealityAlliance): boolean
export function isCurrentAlliance(
  alliance: RealityAlliance | undefined
): alliance is RealityAlliance
export function isCurrentAlliance(alliance: RealityAlliance | undefined): boolean {
  return Boolean(
    alliance &&
    alliance.status !== 'DISSOLVED' &&
    alliance.provenance !== 'SOURCE' &&
    alliance.memberIds.length >= 2
  )
}

export function allianceKind(alliance: RealityAlliance): 'PACT' | 'GROUP' {
  return alliance.kind ?? (alliance.memberIds.length > 2 ? 'GROUP' : 'PACT')
}

export function getCurrentPact(
  state: RealityDomainState,
  left: string,
  right: string
): RealityAlliance | undefined {
  return Object.values(state.alliances).find(
    (entry) =>
      isCurrentAlliance(entry) &&
      allianceKind(entry) === 'PACT' &&
      entry.memberIds.includes(left) &&
      entry.memberIds.includes(right)
  )
}

export function currentAllianceCounts(state: RealityDomainState, actorId: string) {
  const entries = Object.values(state.alliances).filter(
    (entry) => isCurrentAlliance(entry) && entry.memberIds.includes(actorId)
  )
  return {
    groups: entries.filter((entry) => allianceKind(entry) === 'GROUP').length,
    pacts: entries.filter((entry) => allianceKind(entry) === 'PACT').length,
  }
}

/** Authority is stable; social standing and commitment never elect officers. */
export function synchronizeAllianceOfficers(alliance: RealityAlliance): void {
  if (allianceKind(alliance) === 'PACT' || !isCurrentAlliance(alliance)) {
    alliance.leaderId = undefined
    alliance.coLeaderId = undefined
    alliance.leaderIds = []
    return
  }
  if (!alliance.leaderId || !alliance.memberIds.includes(alliance.leaderId)) {
    alliance.leaderId =
      alliance.coLeaderId && alliance.memberIds.includes(alliance.coLeaderId)
        ? alliance.coLeaderId
        : [...alliance.memberIds].sort(
            (left, right) =>
              (alliance.memberJoinSequence?.[left] ?? 0) -
                (alliance.memberJoinSequence?.[right] ?? 0) || left.localeCompare(right)
          )[0]
    alliance.coLeaderId = undefined
    alliance.governanceRevision = (alliance.governanceRevision ?? 0) + 1
  }
  if (
    alliance.coLeaderId === alliance.leaderId ||
    (alliance.coLeaderId && !alliance.memberIds.includes(alliance.coLeaderId))
  )
    alliance.coLeaderId = undefined
  alliance.leaderIds = [alliance.leaderId, alliance.coLeaderId].filter((id): id is string =>
    Boolean(id)
  )
}

export function rememberAllianceRoster(alliance: RealityAlliance): void {
  alliance.rosterKnowledgeByActor ??= {}
  for (const actorId of alliance.memberIds) {
    alliance.rosterKnowledgeByActor[actorId] = {
      memberIds: [...alliance.memberIds],
      rosterRevision: alliance.rosterRevision ?? 0,
      name: alliance.name,
      leaderId: alliance.leaderId,
      coLeaderId: alliance.coLeaderId,
    }
  }
}

export function normalizeAllianceIdentity(
  state: RealityDomainState,
  alliance: RealityAlliance
): void {
  if (!alliance.kind) {
    const wasGroup =
      alliance.memberIds.length > 2 ||
      alliance.founderIds.length > 2 ||
      Object.values(state.reentryProfiles ?? {}).some((profile) =>
        profile.alliances.some(
          (snapshot) => snapshot.allianceId === alliance.id && snapshot.memberIds.length > 2
        )
      ) ||
      state.events.some(
        (event) =>
          event.participantIds.length > 2 &&
          (event.reason?.includes(`:${alliance.id}:`) ||
            event.reason === `recruited_into:${alliance.id}`)
      )
    alliance.kind = wasGroup ? 'GROUP' : 'PACT'
    alliance.provenance ??= 'LEGACY'
  }
  alliance.rosterRevision ??= 0
  alliance.governanceRevision ??= 0
  alliance.memberJoinSequence ??= Object.fromEntries(
    alliance.memberIds.map((id, index) => [id, index])
  )
  if (alliance.kind === 'GROUP' && !alliance.leaderId) {
    alliance.leaderId =
      alliance.leaderIds.find((id) => alliance.memberIds.includes(id)) ??
      alliance.founderIds.find((id) => alliance.memberIds.includes(id))
    alliance.coLeaderId = alliance.leaderIds.find(
      (id) => id !== alliance.leaderId && alliance.memberIds.includes(id)
    )
  }
  synchronizeAllianceOfficers(alliance)
  rememberAllianceRoster(alliance)
}

/** Duplicate pair episodes retain their original history and promise ownership. */
export function normalizeAllianceManagement(state: RealityDomainState, migratePairs = false): void {
  state.allianceManagement ??= {
    version: 1,
    nextRequestSequence: 0,
    requests: {},
    processedCommands: {},
    importedLegacyIds: [],
    aliases: {},
  }
  if (state.allianceManagement.version !== 1)
    throw new Error('Unsupported alliance management save version')
  state.allianceManagement.nextRequestSequence ??= 0
  state.allianceManagement.requests ??= {}
  state.allianceManagement.processedCommands ??= {}
  state.allianceManagement.importedLegacyIds ??= []
  state.allianceManagement.aliases ??= {}
  for (const promise of Object.values(state.promises)) {
    if (!promise.originatingAllianceId && typeof promise.scope.allianceId === 'string')
      promise.originatingAllianceId = promise.scope.allianceId
  }
  for (const entry of Object.values(state.alliances)) normalizeAllianceIdentity(state, entry)
  if (!migratePairs) return
  const pairs = new Map<string, RealityAlliance[]>()
  for (const entry of Object.values(state.alliances)) {
    if (!isCurrentAlliance(entry) || allianceKind(entry) !== 'PACT') continue
    const key = [...entry.memberIds].sort().join('~')
    pairs.set(key, [...(pairs.get(key) ?? []), entry])
  }
  for (const [pair, sources] of pairs) {
    if (sources.length < 2) continue
    const id = `legacy-pair:${pair}`
    const canonical: RealityAlliance = {
      ...sources[0],
      id,
      kind: 'PACT',
      name: undefined,
      provenance: 'UNRESOLVED',
      sourceEpisodeIds: sources.map((source) => source.id).sort(),
      sharedPromiseIds: [],
      memberCommitment: Object.fromEntries(sources[0].memberIds.map((actorId) => [actorId, 0.5])),
      leaderId: undefined,
      coLeaderId: undefined,
      leaderIds: [],
      rosterKnowledgeByActor: {},
      status: 'ACTIVE',
    }
    for (const source of sources) {
      source.sourceOriginalStatus = source.status
      source.status = 'DISSOLVED'
      source.provenance = 'SOURCE'
    }
    state.alliances[id] = canonical
    normalizeAllianceIdentity(state, canonical)
  }
}

/** Old normal-mode saves only recorded pair tags. Keep each pair separate. */
export function importLegacyPairMemberships(
  state: RealityDomainState,
  relationships: RelationshipsMap
): void {
  for (const [left, targets] of Object.entries(relationships)) {
    for (const [right, edge] of Object.entries(targets)) {
      if (
        left >= right ||
        !edge.tags.includes('alliance') ||
        !relationships[right]?.[left]?.tags.includes('alliance')
      )
        continue
      const id = `legacy-tags:${left}~${right}`
      if (state.allianceManagement.importedLegacyIds.includes(id)) continue
      state.allianceManagement.importedLegacyIds.push(id)
      if (
        Object.values(state.alliances).some(
          (entry) => entry.memberIds.includes(left) && entry.memberIds.includes(right)
        )
      )
        continue
      state.alliances[id] = {
        id,
        kind: 'PACT',
        provenance: 'UNRESOLVED',
        sourceEpisodeIds: [id],
        memberIds: [left, right],
        founderIds: [],
        leaderIds: [],
        secrecy: 0.75,
        cohesion: 0.5,
        fractureRisk: 0.2,
        purpose: 'Recorded personal pact',
        currentTargetIds: [],
        fallbackTargetIds: [],
        sharedPromiseIds: [],
        memberCommitment: { [left]: 0.5, [right]: 0.5 },
        memberPerceivedStatus: { [left]: 'REGULAR', [right]: 'REGULAR' },
        memberPlanBeliefs: { [left]: [], [right]: [] },
        operationalRoles: { [left]: [], [right]: [] },
        suspectedByIds: [],
        knownLeakEventIds: [],
        overlapAllianceIds: [],
        status: 'PROBATIONARY',
        genuine: true,
        infiltratorIds: [],
      }
      normalizeAllianceIdentity(state, state.alliances[id])
    }
  }
}
