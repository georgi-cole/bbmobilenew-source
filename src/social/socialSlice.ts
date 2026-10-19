import { isCurrentAlliance } from './reality/allianceIdentity'
import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type {
  IncomingInteraction,
  IncomingInteractionDecisionLogEntry,
  IncomingInteractionResponseType,
  IntelligenceDelivery,
  ScheduledIncomingInteraction,
  SocialActionLogEntry,
  SocialCommitment,
  SocialMemoryEvent,
  SocialPhaseReport,
  SocialState,
} from './types'
import type { RealityDeadline } from './reality/types'
import { SOCIAL_INITIAL_STATE } from './constants'
import { restoreWeekendDebugSnapshot } from '../features/weekend/weekendDebugActions'
import { socialConfig } from './socialConfig'
import {
  appendSocialMemoryEvent,
  applySocialMemoryDelta,
  createSocialMemoryEntry,
  decaySocialMemoryEntry,
  hasSocialMemoryDelta,
  type SocialMemoryDelta,
} from './socialMemory'
import {
  ALLIANCE_TAG,
  enforceRelationshipTagAffinity,
  tagsAfterAllianceDecay,
} from './socialAlliance'
import {
  applyDramaActionEffect as reduceDramaActionEffect,
  applyDramaIncomingResponseEffect as reduceDramaIncomingResponseEffect,
  normalizeDramaSocialNetwork,
  type DramaActionEffectInput,
  type DramaIncomingResponseEffect,
} from './dramaModeEngine'
import type { DramaSocialNetwork } from './types'
import {
  appendPersistentSocialHistory,
  getPersistentSocialHistory,
  type SocialStateWithHistory,
} from './socialHistory'
import { clampSocialResource, migrateSocialState } from './socialStateMigration'
import { getIncomingInteractionResponsePolicy, getSocialRuntimeConfig } from './socialRuntimeConfig'
import {
  appendRealitySimulationTrace,
  createInitialRealitySimulationState,
  normalizeRealitySimulationState,
  type RealitySimulationState,
  type RealitySimulationTrace,
} from './realitySimulation'
import type {
  RealityDebt,
  RealityDomainState,
  RealityFact,
  RealityMemory,
  RealityPromise,
  RealityRelationshipChange,
  RealitySecret,
  RealityThread,
} from './reality'
import { pruneEvictedAiPrivateState as pruneEvictedAiPrivateRealityState } from './reality/evictedAiRetention'
import {
  addRealityFact,
  applyLegacyRelationshipUpdateToReality,
  applyRealityRelationshipChange,
  finalizeRealityVote,
  ensureRealityActors,
  learnRealityFact,
  normalizeRealityDomainState,
  retainResolvedRealityInteractionHistory,
  projectRealityAffinity,
  recordRealityAllianceBetrayal as applyRealityAllianceBetrayal,
  renameRealityAlliance as applyRealityAllianceRename,
  recordRealityCeremonyOutcome,
  reconcileRealityBattleBackReturn as reconcileRealityBattleBackReturnDomain,
  upsertRealityDebt,
  upsertRealityPromise,
  upsertRealitySecret,
  upsertRealityThread,
  type RealityAllianceBetrayalKind,
  type RealityCeremonyInput,
} from './reality'

function clampBank(
  budgets: Record<string, number>,
  kind: 'energy' | 'influence' | 'info'
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(budgets).map(([playerId, value]) => [playerId, clampSocialResource(value, kind)])
  )
}

const REALITY_PROJECTED_TAGS = new Set([
  'alliance',
  'broken_alliance',
  'romance',
  'bromance',
  'rivalry',
  'betrayal',
  'safety_promise',
  'protection',
  'target',
  'suspicious',
  'unreliable',
])
const EXITED_ALLIANCE_EVENT_TYPES = new Set([
  'ALLIANCE_MEMBER_LEFT',
  'ALLIANCE_MEMBER_DEFECTED',
  'ALLIANCE_MEMBER_EXPELLED',
  'ALLIANCE_MEMBER_EVICTED',
])

type RelationshipPairSet = Map<string, Set<string>>

type RealityProjectionIndex = {
  formalAlliances: Map<string, Map<string, { current: boolean; ended: boolean }>>
  exitedSharedAlliances: RelationshipPairSet
  activeRomances: RelationshipPairSet
  betrayals: RelationshipPairSet
  strainedRelationships: RelationshipPairSet
  safetyPromises: RelationshipPairSet
  allianceTargets: RelationshipPairSet
  nemeses: RelationshipPairSet
}

type ProjectedRelationshipPair = { sourceId: string; targetId: string }

type RealityActualVoteInput = {
  actorId: string
  targetId: string
  day: number
  phase: string
  eventId: string
  eligibleTargetIds?: string[]
  revealed?: boolean
  relationshipTagsByTarget?: Record<string, string[]>
  acceptedPromiseTargetIds?: string[]
}

function addRelationshipPair(pairs: RelationshipPairSet, sourceId: string, targetId: string): void {
  let targets = pairs.get(sourceId)
  if (!targets) {
    targets = new Set<string>()
    pairs.set(sourceId, targets)
  }
  targets.add(targetId)
}

function hasRelationshipPair(
  pairs: RelationshipPairSet,
  sourceId: string,
  targetId: string
): boolean {
  return pairs.get(sourceId)?.has(targetId) ?? false
}

function forEachProjectedPairInGroup(
  actorIds: readonly string[],
  projectedPairs: RelationshipPairSet,
  visit: (sourceId: string, targetId: string) => void
): void {
  if (actorIds.length < 2) return
  const participants = new Set(actorIds)
  for (const sourceId of participants) {
    const targets = projectedPairs.get(sourceId)
    if (!targets) continue
    for (const targetId of targets) {
      if (sourceId !== targetId && participants.has(targetId)) visit(sourceId, targetId)
    }
  }
}

function createRealityProjectionIndex(
  reality: RealityDomainState,
  allianceRecords: RealityDomainState['alliances'][string][],
  projectedPairs: RelationshipPairSet
): RealityProjectionIndex {
  const index: RealityProjectionIndex = {
    formalAlliances: new Map(),
    exitedSharedAlliances: new Map(),
    activeRomances: new Map(),
    betrayals: new Map(),
    strainedRelationships: new Map(),
    safetyPromises: new Map(),
    allianceTargets: new Map(),
    nemeses: new Map(),
  }

  for (const alliance of allianceRecords) {
    const current = isCurrentAlliance(alliance)
    const ended = alliance.status === 'FRACTURED' || alliance.status === 'DISSOLVED'
    for (const sourceId of alliance.memberIds) {
      for (const targetId of alliance.memberIds) {
        if (sourceId === targetId || !hasRelationshipPair(projectedPairs, sourceId, targetId))
          continue
        let targets = index.formalAlliances.get(sourceId)
        if (!targets) {
          targets = new Map()
          index.formalAlliances.set(sourceId, targets)
        }
        const pair = targets.get(targetId) ?? { current: false, ended: false }
        pair.current ||= current
        pair.ended ||= ended
        targets.set(targetId, pair)
      }
    }
  }

  for (const alliance of allianceRecords) {
    if (alliance.status !== 'ACTIVE' && alliance.status !== 'PROBATIONARY') continue
    for (const sourceId of alliance.memberIds) {
      for (const targetId of alliance.currentTargetIds) {
        if (hasRelationshipPair(projectedPairs, sourceId, targetId))
          addRelationshipPair(index.allianceTargets, sourceId, targetId)
      }
    }
  }

  for (const event of reality.events) {
    if (EXITED_ALLIANCE_EVENT_TYPES.has(event.type)) {
      forEachProjectedPairInGroup(event.participantIds, projectedPairs, (sourceId, targetId) => {
        if (event.targetIds.includes(sourceId) || event.targetIds.includes(targetId))
          addRelationshipPair(index.exitedSharedAlliances, sourceId, targetId)
      })
    }
    if (
      event.type === 'ALLIANCE_BETRAYAL' ||
      event.actionId === 'betray' ||
      event.tags.some((tag) => tag.toLowerCase() === 'betrayal')
    ) {
      forEachProjectedPairInGroup(event.participantIds, projectedPairs, (sourceId, targetId) => {
        addRelationshipPair(index.betrayals, sourceId, targetId)
      })
    }
  }

  for (const romance of Object.values(reality.romances)) {
    if (romance.status === 'ACTIVE') {
      forEachProjectedPairInGroup(romance.participantIds, projectedPairs, (sourceId, targetId) => {
        addRelationshipPair(index.activeRomances, sourceId, targetId)
      })
    }
  }
  for (const grievance of Object.values(reality.grievances)) {
    if (
      grievance.status !== 'RESOLVED' &&
      grievance.severity >= 65 &&
      hasRelationshipPair(projectedPairs, grievance.holderId, grievance.againstId)
    ) {
      addRelationshipPair(index.strainedRelationships, grievance.holderId, grievance.againstId)
    }
  }
  for (const promise of Object.values(reality.promises)) {
    if (
      promise.status !== 'ACTIVE' ||
      (!promise.kind.toLowerCase().includes('protect') &&
        !promise.kind.toLowerCase().includes('safety'))
    ) {
      continue
    }
    for (const targetId of promise.beneficiaryIds) {
      if (hasRelationshipPair(projectedPairs, promise.promisorId, targetId))
        addRelationshipPair(index.safetyPromises, promise.promisorId, targetId)
    }
  }
  for (const nemesis of Object.values(reality.relationshipAutonomy.nemeses)) {
    if (
      nemesis.status === 'ACTIVE' &&
      hasRelationshipPair(projectedPairs, nemesis.ownerId, nemesis.targetId)
    ) {
      addRelationshipPair(index.nemeses, nemesis.ownerId, nemesis.targetId)
    }
  }

  return index
}

function projectRealityTags(
  reality: RealityDomainState,
  sourceId: string,
  targetId: string,
  existingTags: readonly string[],
  projectionIndex?: RealityProjectionIndex
): string[] {
  const tags = existingTags.filter((tag) => !REALITY_PROJECTED_TAGS.has(tag))
  const edge = reality.relationships[sourceId]?.[targetId]
  const formalPair = projectionIndex?.formalAlliances.get(sourceId)?.get(targetId)
  const formalPairAlliances = projectionIndex
    ? undefined
    : Object.values(reality.alliances).filter(
        (alliance) => alliance.memberIds.includes(sourceId) && alliance.memberIds.includes(targetId)
      )
  const hasLiveFormalAlliance = projectionIndex
    ? (formalPair?.current ?? false)
    : (formalPairAlliances?.some((alliance) => isCurrentAlliance(alliance)) ?? false)
  const exitedSharedAlliance = projectionIndex
    ? hasRelationshipPair(projectionIndex.exitedSharedAlliances, sourceId, targetId)
    : reality.events.some(
        (event) =>
          [
            'ALLIANCE_MEMBER_LEFT',
            'ALLIANCE_MEMBER_DEFECTED',
            'ALLIANCE_MEMBER_EXPELLED',
            'ALLIANCE_MEMBER_EVICTED',
          ].includes(event.type) &&
          event.participantIds.includes(sourceId) &&
          event.participantIds.includes(targetId) &&
          (event.targetIds.includes(sourceId) || event.targetIds.includes(targetId))
      )
  // Normal Mode pacts use the legacy tag. Preserve it only when the Reality
  // domain has no formal history or departure event for this pair.
  if (hasLiveFormalAlliance) {
    tags.push('alliance')
  }
  if (
    !hasLiveFormalAlliance &&
    (exitedSharedAlliance ||
      (projectionIndex
        ? (formalPair?.ended ?? false)
        : (formalPairAlliances?.some(
            (alliance) => alliance.status === 'FRACTURED' || alliance.status === 'DISSOLVED'
          ) ?? false)))
  )
    tags.push('broken_alliance')
  if (
    (projectionIndex
      ? hasRelationshipPair(projectionIndex.activeRomances, sourceId, targetId)
      : Object.values(reality.romances).some(
          (romance) =>
            romance.status === 'ACTIVE' &&
            romance.participantIds.includes(sourceId) &&
            romance.participantIds.includes(targetId)
        )) ||
    edge?.perceivedLabel === 'ROMANCE' ||
    edge?.perceivedLabel === 'POWER_PAIR'
  ) {
    tags.push('romance')
  }
  if (edge?.perceivedLabel === 'RIVAL' || edge?.perceivedLabel === 'ENEMY') tags.push('rivalry')
  if ((edge?.suspicion ?? 0) >= 55) tags.push('suspicious')
  if ((edge?.reliability ?? 0) <= -35) tags.push('unreliable')
  if (
    projectionIndex
      ? hasRelationshipPair(projectionIndex.betrayals, sourceId, targetId)
      : reality.events.some(
          (event) =>
            event.participantIds.includes(sourceId) &&
            event.participantIds.includes(targetId) &&
            (event.type === 'ALLIANCE_BETRAYAL' ||
              event.actionId === 'betray' ||
              event.tags.some((tag) => tag.toLowerCase() === 'betrayal'))
        )
  ) {
    tags.push('betrayal')
  }
  if (
    projectionIndex
      ? hasRelationshipPair(projectionIndex.strainedRelationships, sourceId, targetId)
      : Object.values(reality.grievances).some(
          (grievance) =>
            grievance.holderId === sourceId &&
            grievance.againstId === targetId &&
            grievance.status !== 'RESOLVED' &&
            grievance.severity >= 65
        )
  ) {
    tags.push('strained')
  }
  if (
    projectionIndex
      ? hasRelationshipPair(projectionIndex.safetyPromises, sourceId, targetId)
      : Object.values(reality.promises).some(
          (promise) =>
            promise.status === 'ACTIVE' &&
            promise.promisorId === sourceId &&
            promise.beneficiaryIds.includes(targetId) &&
            (promise.kind.toLowerCase().includes('protect') ||
              promise.kind.toLowerCase().includes('safety'))
        )
  ) {
    tags.push('safety_promise', 'protection')
  }
  if (
    projectionIndex
      ? hasRelationshipPair(projectionIndex.allianceTargets, sourceId, targetId)
      : Object.values(reality.alliances).some(
          (alliance) =>
            (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
            alliance.memberIds.includes(sourceId) &&
            alliance.currentTargetIds.includes(targetId)
        )
  ) {
    tags.push('target')
  }
  if (
    projectionIndex
      ? hasRelationshipPair(projectionIndex.nemeses, sourceId, targetId)
      : Object.values(reality.relationshipAutonomy.nemeses).some(
          (nemesis) =>
            nemesis.status === 'ACTIVE' &&
            nemesis.ownerId === sourceId &&
            nemesis.targetId === targetId
        )
  ) {
    tags.push('target', 'rivalry')
  }
  return [...new Set(tags)].filter(
    (tag) => hasLiveFormalAlliance || !['primary_alliance', 'ride_or_die'].includes(tag)
  )
}

function applyRealityActualVote(state: SocialState, vote: RealityActualVoteInput): void {
  finalizeRealityVote(
    state.reality as RealityDomainState,
    vote.actorId,
    vote.targetId,
    { day: vote.day, phase: vote.phase },
    vote.eventId,
    vote.eligibleTargetIds,
    {
      revealed: vote.revealed,
      relationshipTagsByTarget: vote.relationshipTagsByTarget,
      acceptedPromiseTargetIds: vote.acceptedPromiseTargetIds,
    }
  )
}

function projectRealityEdgeIntoLegacy(
  reality: RealityDomainState,
  relationships: SocialState['relationships'],
  sourceId: string,
  targetId: string,
  projectionIndex?: RealityProjectionIndex
): void {
  const edge = reality.relationships[sourceId]?.[targetId]
  if (sourceId === targetId) return
  relationships[sourceId] ??= {}
  const existing = relationships[sourceId][targetId]
  const affinity = edge ? projectRealityAffinity(edge) : (existing?.affinity ?? 0)
  const projectedTags = projectRealityTags(
    reality,
    sourceId,
    targetId,
    existing?.tags ?? [],
    projectionIndex
  )
  const tagsUnchanged =
    existing !== undefined &&
    existing.tags.length === projectedTags.length &&
    existing.tags.every((tag, index) => tag === projectedTags[index])
  if (existing && Object.is(existing.affinity, affinity) && tagsUnchanged) return
  relationships[sourceId][targetId] = {
    affinity,
    tags: existing && tagsUnchanged ? existing.tags : projectedTags,
  }
}

function projectRealityPairsIntoLegacy(
  reality: RealityDomainState,
  relationships: SocialState['relationships'],
  pairs: readonly ProjectedRelationshipPair[],
  allianceRecords: RealityDomainState['alliances'][string][] = Object.values(reality.alliances)
): void {
  const projectedPairs: RelationshipPairSet = new Map()
  const uniquePairs: ProjectedRelationshipPair[] = []
  for (const { sourceId, targetId } of pairs) {
    if (sourceId === targetId || hasRelationshipPair(projectedPairs, sourceId, targetId)) continue
    addRelationshipPair(projectedPairs, sourceId, targetId)
    uniquePairs.push({ sourceId, targetId })
  }
  if (uniquePairs.length === 0) return

  projectRealityPairSetIntoLegacy(
    reality,
    relationships,
    uniquePairs,
    projectedPairs,
    allianceRecords
  )
}

function projectRealityPairSetIntoLegacy(
  reality: RealityDomainState,
  relationships: SocialState['relationships'],
  pairs: readonly ProjectedRelationshipPair[],
  projectedPairs: RelationshipPairSet,
  allianceRecords: RealityDomainState['alliances'][string][]
): void {
  if (pairs.length === 0) return

  const projectionIndex = createRealityProjectionIndex(reality, allianceRecords, projectedPairs)
  for (const { sourceId, targetId } of pairs) {
    projectRealityEdgeIntoLegacy(reality, relationships, sourceId, targetId, projectionIndex)
  }
}

function projectRealityRelationshipsIntoLegacy(
  reality: RealityDomainState,
  relationships: SocialState['relationships']
): void {
  const allianceRecords = Object.values(reality.alliances)
  const currentAlliances = allianceRecords.filter(isCurrentAlliance)
  const projectedPairs: RelationshipPairSet = new Map()
  const pairs: ProjectedRelationshipPair[] = []
  const addProjectedPair = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    let targets = projectedPairs.get(sourceId)
    if (!targets) {
      targets = new Set<string>()
      projectedPairs.set(sourceId, targets)
    }
    if (targets.has(targetId)) return
    targets.add(targetId)
    pairs.push({ sourceId, targetId })
  }

  // Membership projects independently of affinity and pre-existing relationship edges.
  for (const alliance of currentAlliances) {
    for (const sourceId of alliance.memberIds)
      for (const targetId of alliance.memberIds) addProjectedPair(sourceId, targetId)
  }
  for (const [sourceId, targets] of Object.entries(reality.relationships)) {
    relationships[sourceId] ??= {}
    delete relationships[sourceId][sourceId]
    for (const targetId of Object.keys(targets)) addProjectedPair(sourceId, targetId)
  }

  projectRealityPairSetIntoLegacy(reality, relationships, pairs, projectedPairs, allianceRecords)
}

type WeekSeedRelationshipUpdate = {
  source: string
  target: string
  delta: number
  tags?: string[]
  actionSource?: 'manual' | 'system'
  realityMeaningful?: boolean
}

type WeekSeedAmbientRelationshipUpdate = {
  sourceId: string
  targetId: string
  socialDelta: number
  day: number
  phase?: string
}

type WeekSeedMoodUpdate = {
  actorId: string
  valenceDelta: number
  arousalDelta: number
  stressDelta: number
  socialEnergyDelta: number
}

export type WeekSeedOperation =
  | { kind: 'relationship'; payload: WeekSeedRelationshipUpdate }
  | { kind: 'ambientRelationship'; payload: WeekSeedAmbientRelationshipUpdate }

export type WeekSeedBatch = {
  operations: WeekSeedOperation[]
  moods: WeekSeedMoodUpdate[]
}

const socialSlice = createSlice({
  name: 'social',
  initialState: SOCIAL_INITIAL_STATE,
  reducers: {
    engineReady(state, action: PayloadAction<{ budgets: Record<string, number> }>) {
      state.energyBank = clampBank(action.payload.budgets, 'energy')
    },
    /** Signals the engine has finished a phase; report is written via setLastReport. */
    engineComplete() {},
    setLastReport(state, action: PayloadAction<SocialPhaseReport>) {
      state.lastReport = action.payload
    },
    /** Stores influence weights keyed by actor and decision type. */
    influenceUpdated(
      state,
      action: PayloadAction<{
        actorId: string
        decisionType: string
        weights: Record<string, number>
      }>
    ) {
      const { actorId, decisionType, weights } = action.payload
      if (!state.influenceWeights[actorId]) {
        state.influenceWeights[actorId] = {}
      }
      state.influenceWeights[actorId][decisionType] = weights
    },
    /** Set a player's energy bank value directly. */
    setEnergyBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.energyBank[action.payload.playerId] = clampSocialResource(
        action.payload.value,
        'energy'
      )
    },
    /** Add a delta to a player's energy bank and preserve resource invariants. */
    applyEnergyDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.energyBank[action.payload.playerId] ?? 0
      state.energyBank[action.payload.playerId] = clampSocialResource(
        current + action.payload.delta,
        'energy'
      )
    },
    /** Set a player's influence bank value directly. */
    setInfluenceBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.influenceBank[action.payload.playerId] = clampSocialResource(
        action.payload.value,
        'influence'
      )
    },
    /** Add a delta to a player's influence bank and preserve resource invariants. */
    applyInfluenceDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.influenceBank[action.payload.playerId] ?? 0
      state.influenceBank[action.payload.playerId] = clampSocialResource(
        current + action.payload.delta,
        'influence'
      )
    },
    /** Set a player's info bank value directly. */
    setInfoBankEntry(state, action: PayloadAction<{ playerId: string; value: number }>) {
      state.infoBank[action.payload.playerId] = clampSocialResource(action.payload.value, 'info')
    },
    /** Add a delta to a player's info bank and preserve resource invariants. */
    applyInfoDelta(state, action: PayloadAction<{ playerId: string; delta: number }>) {
      const current = state.infoBank[action.payload.playerId] ?? 0
      state.infoBank[action.payload.playerId] = clampSocialResource(
        current + action.payload.delta,
        'info'
      )
    },
    /** A Secret Mission box grants its three resources as one reducer update. */
    grantSecretMissionResourceCache(state, action: PayloadAction<{ playerId: string }>) {
      const { playerId } = action.payload
      state.energyBank[playerId] = clampSocialResource(
        (state.energyBank[playerId] ?? 0) + 25,
        'energy'
      )
      state.influenceBank[playerId] = clampSocialResource(
        (state.influenceBank[playerId] ?? 0) + 500,
        'influence'
      )
      state.infoBank[playerId] = clampSocialResource((state.infoBank[playerId] ?? 0) + 1000, 'info')
    },
    /**
     * Append to the current panel session and to a bounded persistent history.
     * Closing the panel may clear sessionLogs without erasing AI memory.
     */
    recordSocialAction(state, action: PayloadAction<{ entry: SocialActionLogEntry }>) {
      state.sessionLogs.push(action.payload.entry)
      const sessionLimit = getSocialRuntimeConfig().history.maxActionHistory
      if (state.sessionLogs.length > sessionLimit) {
        state.sessionLogs = state.sessionLogs.slice(-sessionLimit)
      }
      appendPersistentSocialHistory(
        state as unknown as SocialStateWithHistory,
        action.payload.entry
      )
    },
    /**
     * Bind the persisted v3 social RNG to a game seed. Existing saves keep
     * their cursor unless an explicit new-season reset is requested.
     */
    initializeRealitySimulation(state, action: PayloadAction<{ seed: number; force?: boolean }>) {
      if (state.realitySimulation?.rng && !action.payload.force) return
      state.realitySimulation = createInitialRealitySimulationState(action.payload.seed)
    },
    replaceRealitySimulation(state, action: PayloadAction<RealitySimulationState>) {
      state.realitySimulation = normalizeRealitySimulationState(action.payload)
    },
    replaceRealityDomain(state, action: PayloadAction<RealityDomainState>) {
      const domain = normalizeRealityDomainState(action.payload, state.relationships)
      state.reality = domain
      projectRealityRelationshipsIntoLegacy(domain, state.relationships)
    },
    /** Remove operational cognition for AIs who can no longer affect the season. */
    pruneEvictedAiPrivateState(state, action: PayloadAction<string[]>) {
      state.reality = pruneEvictedAiPrivateRealityState(
        state.reality as RealityDomainState,
        action.payload
      )
      const actorIds = new Set(action.payload)
      for (const actorId of actorIds) {
        delete state.energyBank[actorId]
        delete state.influenceBank[actorId]
        delete state.infoBank[actorId]
        delete state.influenceWeights[actorId]
        delete state.socialMemory[actorId]
      }
      for (const targets of Object.values(state.socialMemory)) {
        for (const actorId of actorIds) delete targets[actorId]
      }
    },
    /** Commits an orchestrator-produced domain that already shares unchanged branches. */
    commitRealityDomainUpdate(
      state,
      action: PayloadAction<{
        domain: RealityDomainState
        changedRelationshipPairs?: Array<{ sourceId: string; targetId: string }>
        projectAllRelationships?: boolean
      }>
    ) {
      const { domain, changedRelationshipPairs, projectAllRelationships } = action.payload
      const retainedDomain = retainResolvedRealityInteractionHistory(domain)
      state.reality = retainedDomain
      if (changedRelationshipPairs)
        projectRealityPairsIntoLegacy(retainedDomain, state.relationships, changedRelationshipPairs)
      else if (projectAllRelationships)
        projectRealityRelationshipsIntoLegacy(retainedDomain, state.relationships)
    },
    /**
     * Commit one autonomous Reality outcome in a single reducer pass. The
     * social event is dispatched separately so existing intelligence, drama,
     * and audience middleware continue to observe `recordSocialAction`.
     *
     * Keeping the Reality domain authoritative here also prevents those
     * middleware side-effects from being overwritten by a later whole-domain
     * replacement.
     */
    commitRealityOutcome(
      state,
      action: PayloadAction<{
        domain: RealityDomainState
        simulation: RealitySimulationState
        actorId: string
        energyDelta: number
        changedRelationshipPairs?: Array<{ sourceId: string; targetId: string }>
        influenceDelta?: number
        infoDelta?: number
      }>
    ) {
      const {
        domain,
        simulation,
        actorId,
        energyDelta,
        changedRelationshipPairs,
        influenceDelta = 0,
        infoDelta = 0,
      } = action.payload
      // This action is reserved for outcomes orchestrated from the already
      // normalized in-memory domain. Keep its structural sharing instead of
      // normalizing/copying every collection again. Hydration and migrations
      // still use replaceRealityDomain's full normalization/projection path.
      const retainedDomain = retainResolvedRealityInteractionHistory(domain)
      state.reality = retainedDomain
      if (changedRelationshipPairs) {
        projectRealityPairsIntoLegacy(retainedDomain, state.relationships, changedRelationshipPairs)
      } else {
        projectRealityRelationshipsIntoLegacy(retainedDomain, state.relationships)
      }
      state.realitySimulation = normalizeRealitySimulationState(simulation)
      state.energyBank[actorId] = clampSocialResource(
        (state.energyBank[actorId] ?? 0) + energyDelta,
        'energy'
      )
      if (influenceDelta !== 0) {
        state.influenceBank[actorId] = clampSocialResource(
          (state.influenceBank[actorId] ?? 0) + influenceDelta,
          'influence'
        )
      }
      if (infoDelta !== 0) {
        state.infoBank[actorId] = clampSocialResource(
          (state.infoBank[actorId] ?? 0) + infoDelta,
          'info'
        )
      }
    },
    ensureRealityDomainActors(state, action: PayloadAction<{ actorIds: string[] }>) {
      ensureRealityActors(state.reality as RealityDomainState, action.payload.actorIds)
    },
    applyRealityRelationshipDelta(state, action: PayloadAction<RealityRelationshipChange>) {
      const reality = state.reality as RealityDomainState
      applyRealityRelationshipChange(reality, action.payload)
      projectRealityPairsIntoLegacy(reality, state.relationships, [
        { sourceId: action.payload.sourceId, targetId: action.payload.targetId },
      ])
    },
    applyRealityAmbientMood(state, action: PayloadAction<WeekSeedMoodUpdate>) {
      const { actorId, valenceDelta, arousalDelta, stressDelta, socialEnergyDelta } = action.payload
      ensureRealityActors(state.reality as RealityDomainState, [actorId])
      const contestant = state.reality.contestants[actorId]
      const clamp = (value: number, minimum: number, maximum: number) =>
        Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0))
      contestant.mood.valence = clamp(contestant.mood.valence + valenceDelta, -100, 100)
      contestant.mood.arousal = clamp(contestant.mood.arousal + arousalDelta, -100, 100)
      contestant.stress = clamp(contestant.stress + stressDelta, 0, 100)
      contestant.socialEnergy = clamp(contestant.socialEnergy + socialEnergyDelta, -100, 100)
      if (valenceDelta > 0) {
        contestant.emotions.joy = clamp(contestant.emotions.joy + valenceDelta * 0.6, 0, 100)
      } else if (valenceDelta < 0) {
        contestant.emotions.anger = clamp(
          contestant.emotions.anger + Math.abs(valenceDelta) * 0.35,
          0,
          100
        )
      }
    },
    applyRealityAmbientRelationship(
      state,
      action: PayloadAction<WeekSeedAmbientRelationshipUpdate>
    ) {
      const { sourceId, targetId, socialDelta, day, phase = 'week_start' } = action.payload
      if (sourceId === targetId) return
      ensureRealityActors(state.reality as RealityDomainState, [sourceId, targetId])
      const magnitude = Math.min(3, Math.abs(socialDelta))
      const cooling = socialDelta > 0
      const edge = state.reality.relationships[sourceId]?.[targetId]
      const familiarityDelta = (edge?.lastAmbientFamiliarityDay ?? -1) >= day ? 0 : 1
      const hasUnresolvedGrievance =
        (state.reality.relationships[sourceId]?.[targetId]?.unresolvedGrievanceIds.length ?? 0) > 0
      applyRealityRelationshipChange(state.reality as RealityDomainState, {
        sourceId,
        targetId,
        day,
        phase,
        eventId: `ambient:${day}:${phase}:${sourceId}:${targetId}`,
        meaningful: false,
        deltas: {
          ...(socialDelta === 0
            ? {}
            : cooling
              ? {
                  warmth: magnitude,
                  trust: magnitude * 0.6,
                  resentment: hasUnresolvedGrievance ? 0 : -magnitude * 3,
                  suspicion: hasUnresolvedGrievance ? 0 : -magnitude * 2.5,
                  fear: hasUnresolvedGrievance ? 0 : -magnitude * 1.5,
                  perceivedThreat: -magnitude,
                }
              : {
                  warmth: -magnitude,
                  trust: -magnitude * 0.7,
                  resentment: magnitude * 6,
                  suspicion: magnitude * 4,
                  fear: magnitude * 2,
                  perceivedThreat: magnitude * 2,
                }),
          familiarity: familiarityDelta,
        },
      })
      const updatedEdge = state.reality.relationships[sourceId][targetId]
      updatedEdge.lastAmbientFamiliarityDay = Math.max(
        updatedEdge.lastAmbientFamiliarityDay ?? day,
        day
      )
      projectRealityPairsIntoLegacy(state.reality as RealityDomainState, state.relationships, [
        { sourceId, targetId },
      ])
    },
    /** Apply deterministic week-start relationship and mood changes in one store update. */
    applyWeekSeedBatch(state, action: PayloadAction<WeekSeedBatch>) {
      for (const operation of action.payload.operations) {
        if (operation.kind === 'relationship') {
          socialSlice.caseReducers.updateRelationship(state, {
            type: updateRelationship.type,
            payload: operation.payload,
          })
        } else {
          socialSlice.caseReducers.applyRealityAmbientRelationship(state, {
            type: applyRealityAmbientRelationship.type,
            payload: operation.payload,
          })
        }
      }

      for (const mood of action.payload.moods) {
        socialSlice.caseReducers.applyRealityAmbientMood(state, {
          type: applyRealityAmbientMood.type,
          payload: mood,
        })
      }
    },
    recordRealityFact(state, action: PayloadAction<RealityFact>) {
      addRealityFact(state.reality as RealityDomainState, action.payload)
    },
    recordIntelligenceDelivery(state, action: PayloadAction<IntelligenceDelivery>) {
      if ((state.intelligenceDeliveries ?? []).some((entry) => entry.id === action.payload.id))
        return
      state.intelligenceDeliveries = [
        ...(state.intelligenceDeliveries ?? []),
        action.payload,
      ].slice(-120)
    },
    learnRealityKnowledge(
      state,
      action: PayloadAction<{
        ownerId: string
        factId: string
        memory: RealityMemory
        confidence?: number
      }>
    ) {
      learnRealityFact(state.reality as RealityDomainState, action.payload)
    },
    upsertRealityPromiseRecord(state, action: PayloadAction<RealityPromise>) {
      upsertRealityPromise(state.reality as RealityDomainState, action.payload)
    },
    upsertRealityDebtRecord(state, action: PayloadAction<RealityDebt>) {
      upsertRealityDebt(state.reality as RealityDomainState, action.payload)
    },
    upsertRealitySecretRecord(state, action: PayloadAction<RealitySecret>) {
      upsertRealitySecret(state.reality as RealityDomainState, action.payload)
    },
    upsertRealityThreadRecord(state, action: PayloadAction<RealityThread>) {
      upsertRealityThread(state.reality as RealityDomainState, action.payload)
    },
    recordRealityCeremony(state, action: PayloadAction<RealityCeremonyInput>) {
      recordRealityCeremonyOutcome(state.reality as RealityDomainState, action.payload)
      projectRealityRelationshipsIntoLegacy(
        state.reality as RealityDomainState,
        state.relationships
      )
    },
    reconcileRealityBattleBackReturn(
      state,
      action: PayloadAction<{
        playerId: string
        day: number
        phase: string
        activeActorIds: string[]
      }>
    ) {
      reconcileRealityBattleBackReturnDomain(state.reality as RealityDomainState, {
        playerId: action.payload.playerId,
        at: { day: action.payload.day, phase: action.payload.phase },
        activeActorIds: action.payload.activeActorIds,
      })
      projectRealityRelationshipsIntoLegacy(
        state.reality as RealityDomainState,
        state.relationships
      )
    },
    recordRealityActualVote(state, action: PayloadAction<RealityActualVoteInput>) {
      applyRealityActualVote(state, action.payload)
      projectRealityRelationshipsIntoLegacy(
        state.reality as RealityDomainState,
        state.relationships
      )
    },
    recordRealityActualVotes(state, action: PayloadAction<RealityActualVoteInput[]>) {
      for (const vote of action.payload) applyRealityActualVote(state, vote)
      if (action.payload.length === 0) return
      projectRealityRelationshipsIntoLegacy(
        state.reality as RealityDomainState,
        state.relationships
      )
    },
    recordRealityAllianceBetrayal(
      state,
      action: PayloadAction<{
        actorId: string
        targetId: string
        kind: RealityAllianceBetrayalKind
        day: number
        phase: string
        sourceEventId: string
      }>
    ) {
      applyRealityAllianceBetrayal(state.reality as RealityDomainState, {
        actorId: action.payload.actorId,
        targetId: action.payload.targetId,
        kind: action.payload.kind,
        at: { day: action.payload.day, phase: action.payload.phase },
        sourceEventId: action.payload.sourceEventId,
      })
      projectRealityRelationshipsIntoLegacy(
        state.reality as RealityDomainState,
        state.relationships
      )
    },
    renameRealityAllianceRecord(
      state,
      action: PayloadAction<{
        allianceId: string
        actorId: string
        name: string
        day: number
        phase: string
      }>
    ) {
      const reality = state.reality as RealityDomainState
      const alliance = reality.alliances[action.payload.allianceId]
      if (
        !alliance ||
        alliance.status === 'DISSOLVED' ||
        !alliance.memberIds.includes(action.payload.actorId)
      ) {
        return
      }
      const name = action.payload.name.trim()
      if (name.length < 2) return
      applyRealityAllianceRename(reality, {
        allianceId: action.payload.allianceId,
        actorId: action.payload.actorId,
        name,
        at: { day: action.payload.day, phase: action.payload.phase },
      })
    },
    recordRealitySimulationTrace(
      state,
      action: PayloadAction<Omit<RealitySimulationTrace, 'id' | 'sequence'>>
    ) {
      state.realitySimulation = appendRealitySimulationTrace(
        state.realitySimulation ?? createInitialRealitySimulationState(),
        action.payload
      )
    },
    replaceDramaNetwork(state, action: PayloadAction<DramaSocialNetwork>) {
      state.dramaNetwork = normalizeDramaSocialNetwork(action.payload)
    },
    applyDramaAction(state, action: PayloadAction<DramaActionEffectInput>) {
      state.dramaNetwork = reduceDramaActionEffect(state.dramaNetwork, action.payload)
    },
    applyDramaIncomingResponse(state, action: PayloadAction<DramaIncomingResponseEffect>) {
      state.dramaNetwork = reduceDramaIncomingResponseEffect(state.dramaNetwork, action.payload)
    },
    /** Add a new incoming interaction (newest-first). */
    pushIncomingInteraction(state, action: PayloadAction<IncomingInteraction>) {
      state.incomingInteractions.unshift(action.payload)
    },
    /** Schedule an incoming interaction for a future delivery window. */
    scheduleIncomingInteraction(state, action: PayloadAction<ScheduledIncomingInteraction>) {
      state.scheduledIncomingInteractions.push(action.payload)
    },
    /** Record an incoming interaction decision log entry. */
    recordIncomingInteractionDecision(
      state,
      action: PayloadAction<IncomingInteractionDecisionLogEntry>
    ) {
      const limit = socialConfig.incomingInteractionDebugConfig.maxLogEntries
      if (limit <= 0) {
        return
      }
      state.incomingInteractionLogs.push(action.payload)
      if (limit > 0 && state.incomingInteractionLogs.length > limit) {
        state.incomingInteractionLogs = state.incomingInteractionLogs.slice(-limit)
      }
    },
    /** Clear incoming interaction decision logs. */
    clearIncomingInteractionLogs(state) {
      state.incomingInteractionLogs = []
    },
    /**
     * Deliver scheduled interactions and update delivery counters in one reducer pass.
     * Any scheduled interactions not included in remainingScheduled are removed.
     */
    applyScheduledIncomingInteractionDelivery(
      state,
      action: PayloadAction<{
        deliveries: ScheduledIncomingInteraction[]
        remainingScheduled: ScheduledIncomingInteraction[]
        phase: string
        week: number
      }>
    ) {
      const { deliveries, remainingScheduled, phase, week } = action.payload
      state.scheduledIncomingInteractions = remainingScheduled
      if (deliveries.length > 0) {
        const deliveredInteractions = deliveries.map((entry) => ({
          ...entry.interaction,
          payload: {
            ...(entry.interaction.payload ?? {}),
            deliveredWeek: week,
            deliveredPhase: phase,
          },
        }))
        state.incomingInteractions = [...deliveredInteractions, ...state.incomingInteractions]
      }

      const deliveryState = state.incomingInteractionDelivery
      const samePhase =
        deliveryState.lastDeliveryPhase === phase && deliveryState.lastDeliveryWeek === week
      state.incomingInteractionDelivery = {
        lastDeliveryPhase: phase,
        lastDeliveryWeek: week,
        deliveredThisPhase: (samePhase ? deliveryState.deliveredThisPhase : 0) + deliveries.length,
      }
    },
    /** Mark a specific incoming interaction as read. */
    markIncomingInteractionRead(state, action: PayloadAction<string>) {
      const entry = state.incomingInteractions.find(
        (interaction) => interaction.id === action.payload
      )
      if (entry) {
        entry.read = true
      }
    },
    /** Mark all incoming interactions as read. Retained for save and test compatibility. */
    markAllIncomingInteractionsRead(state) {
      state.incomingInteractions.forEach((interaction) => {
        interaction.read = true
      })
    },
    /** Resolve an interaction with a response. */
    resolveIncomingInteraction(
      state,
      action: PayloadAction<{
        interactionId: string
        resolvedWith: IncomingInteractionResponseType
        resolvedLabel?: string
        outcomeText?: string
        resolvedAt?: number
        resolvedWeek?: number
      }>
    ) {
      const { interactionId, resolvedWith, resolvedLabel, outcomeText, resolvedAt, resolvedWeek } =
        action.payload
      const entry = state.incomingInteractions.find(
        (interaction) => interaction.id === interactionId
      )
      if (!entry || entry.resolved) return
      entry.resolved = true
      entry.read = true
      entry.resolvedAt = resolvedAt ?? Date.now()
      entry.resolvedWeek = resolvedWeek
      entry.resolvedWith = resolvedWith
      entry.resolvedLabel = resolvedLabel
      entry.outcomeText = outcomeText
    },
    /** Save a pact-offer conversation step while keeping the offer unresolved. */
    recordIncomingInteractionFollowUp(
      state,
      action: PayloadAction<{
        interactionId: string
        action: 'ask_plan' | 'need_time'
        outcomeText: string
        deadline?: RealityDeadline
      }>
    ) {
      const { interactionId, action: followUpAction, outcomeText, deadline } = action.payload
      const entry = state.incomingInteractions.find(
        (interaction) => interaction.id === interactionId
      )
      if (!entry || entry.resolved || entry.type !== 'alliance_proposal') return
      if (
        (followUpAction === 'ask_plan' && entry.payload?.pactPlanRequested === true) ||
        (followUpAction === 'need_time' && entry.payload?.pactTimeRequested === true)
      ) {
        return
      }
      entry.read = true
      entry.outcomeText = entry.outcomeText ? `${entry.outcomeText} ${outcomeText}` : outcomeText
      entry.payload = {
        ...entry.payload,
        ...(followUpAction === 'ask_plan' ? { pactPlanRequested: true } : {}),
        ...(followUpAction === 'need_time' ? { pactTimeRequested: true } : {}),
      }
      if (deadline) {
        entry.deadline = deadline
        entry.expiresAtWeek = deadline.day
      }
    },
    /** Convenience helper for dismissing an interaction. */
    dismissIncomingInteraction(
      state,
      action: PayloadAction<{
        interactionId: string
        resolvedAt?: number
        resolvedWeek?: number
      }>
    ) {
      const entry = state.incomingInteractions.find(
        (interaction) => interaction.id === action.payload.interactionId
      )
      if (!entry || entry.resolved) return
      entry.resolved = true
      entry.read = true
      entry.resolvedAt = action.payload.resolvedAt ?? Date.now()
      entry.resolvedWeek = action.payload.resolvedWeek
      entry.resolvedWith = 'dismiss'
    },
    /** Resolve invalidated interactions and remove matching scheduled entries. */
    invalidateIncomingInteractions(
      state,
      action: PayloadAction<{
        interactionIds: string[]
        resolvedAt?: number
        resolvedWeek?: number
        retiredIntelHistory?: Record<
          string,
          { text: string; outcomeText: string; resolvedLabel: string }
        >
      }>
    ) {
      const { interactionIds, resolvedAt, resolvedWeek, retiredIntelHistory } = action.payload
      if (interactionIds.length === 0) return
      const ids = new Set(interactionIds)
      const resolvedTimestamp = resolvedAt ?? Date.now()

      state.incomingInteractions.forEach((interaction) => {
        if (!interaction.resolved && ids.has(interaction.id)) {
          interaction.resolved = true
          interaction.read = true
          interaction.resolvedAt = resolvedTimestamp
          interaction.resolvedWeek = resolvedWeek
          interaction.resolvedWith = 'dismiss'
          const historicalLead = retiredIntelHistory?.[interaction.id]
          if (historicalLead) {
            interaction.text = historicalLead.text
            interaction.outcomeText = historicalLead.outcomeText
            interaction.resolvedLabel = historicalLead.resolvedLabel
          }
        }
      })

      state.scheduledIncomingInteractions = state.scheduledIncomingInteractions.filter(
        (entry) => !ids.has(entry.interaction.id)
      )
    },
    /**
     * Drain all social resources for a player who has been evicted.
     *
     * - Zeroes out energy, influence, and info banks.
     * - Dismisses all unresolved incoming interactions.
     * - Clears all scheduled incoming interactions.
     */
    drainEvictedPlayerSocial(
      state,
      action: PayloadAction<{ playerId: string; week?: number; timestamp?: number }>
    ) {
      const { playerId, week, timestamp } = action.payload
      const now = timestamp ?? Date.now()

      state.energyBank[playerId] = 0
      state.influenceBank[playerId] = 0
      state.infoBank[playerId] = 0

      for (const interaction of state.incomingInteractions) {
        if (!interaction.resolved) {
          interaction.resolved = true
          interaction.read = true
          interaction.resolvedAt = now
          interaction.resolvedWeek = week
          interaction.resolvedWith = 'dismiss'
        }
      }

      state.scheduledIncomingInteractions = []
      state.panelOpen = false
      state.incomingInboxOpen = false
    },
    /** Resolve expired interactions according to their authored response policy. */
    resolveExpiredIncomingInteractionsForWeek(
      state,
      action: PayloadAction<{ week: number; resolvedAt?: number }>
    ) {
      const { week, resolvedAt } = action.payload
      const resolvedTimestamp = resolvedAt ?? Date.now()
      state.incomingInteractions.forEach((interaction) => {
        if (!interaction.resolved && interaction.expiresAtWeek < week) {
          interaction.resolved = true
          interaction.read = true
          interaction.resolvedAt = resolvedTimestamp
          interaction.resolvedWeek = week
          interaction.resolvedWith =
            getIncomingInteractionResponsePolicy(interaction) === 'required' ? 'ignore' : 'dismiss'
          if (interaction.type === 'alliance_proposal') {
            interaction.resolvedLabel = 'Expired'
            interaction.outcomeText =
              'The personal pact offer expired unanswered. No pact was formed.'
          }
        }
      })
    },
    /** Resolve the exact interactions whose day/phase deadlines have passed. */
    resolveIncomingInteractionsByDeadline(
      state,
      action: PayloadAction<{
        interactionIds: string[]
        day: number
        phase: string
        resolvedAt?: number
      }>
    ) {
      const ids = new Set(action.payload.interactionIds)
      const resolvedTimestamp =
        action.payload.resolvedAt ??
        action.payload.day * 1_000_000 + Math.max(0, action.payload.phase.length * 100)
      state.incomingInteractions.forEach((interaction) => {
        if (ids.has(interaction.id) && !interaction.resolved) {
          interaction.resolved = true
          interaction.read = true
          interaction.resolvedAt = resolvedTimestamp
          interaction.resolvedWeek = action.payload.day
          interaction.resolvedWith =
            getIncomingInteractionResponsePolicy(interaction) === 'required' ? 'ignore' : 'dismiss'
          if (interaction.type === 'alliance_proposal') {
            interaction.resolvedLabel = 'Expired'
            interaction.outcomeText =
              'The personal pact offer expired unanswered. No pact was formed.'
          }
        }
      })
    },
    /** Update the affinity (and optionally tags) for a directed relationship. */
    updateRelationship(
      state,
      action: PayloadAction<{
        source: string
        target: string
        delta: number
        tags?: string[]
        /** Origin of the action that produced this relationship change. */
        actionSource?: 'manual' | 'system'
        /** Whether this projection represents a direct, meaningful interaction. */
        realityMeaningful?: boolean
        /**
         * Compatibility-only writes can update the legacy relationship map
         * without feeding the same consequence back into canonical Reality state.
         */
        skipRealityProjection?: boolean
      }>
    ) {
      const { source, target, delta, tags, skipRealityProjection, realityMeaningful } =
        action.payload
      const safeDelta = Number.isFinite(delta) ? delta : 0
      const preserveIncomingAlliance = tags?.includes(ALLIANCE_TAG) ?? false
      if (!state.relationships[source]) {
        state.relationships[source] = {}
      }
      const rel = state.relationships[source][target]
      if (rel) {
        rel.affinity = Math.max(-100, Math.min(100, rel.affinity + safeDelta))
        if (tags) {
          rel.tags = Array.from(new Set([...rel.tags, ...tags]))
        }
        rel.tags = tagsAfterAllianceDecay(rel.tags, rel.affinity, preserveIncomingAlliance)
        if (safeDelta === 0 && tags && tags.length > 0) {
          rel.affinity = enforceRelationshipTagAffinity(rel.affinity, rel.tags)
        }
      } else {
        if (safeDelta === 0 && (!tags || tags.length === 0)) {
          return
        }
        const relationshipTags = tags ?? []
        state.relationships[source][target] = {
          affinity:
            safeDelta === 0
              ? enforceRelationshipTagAffinity(safeDelta, relationshipTags)
              : Math.max(-100, Math.min(100, safeDelta)),
          tags: relationshipTags,
        }
      }
      if (!skipRealityProjection) {
        applyLegacyRelationshipUpdateToReality(
          state.reality as RealityDomainState,
          source,
          target,
          safeDelta,
          tags,
          0,
          'legacy',
          realityMeaningful
        )
      }
    },
    /** Remove temporary relationship labels while preserving the history in affinity. */
    removeRelationshipTags(
      state,
      action: PayloadAction<{ source: string; target: string; tags: string[] }>
    ) {
      const relationship = state.relationships[action.payload.source]?.[action.payload.target]
      if (!relationship) return
      const tagsToRemove = new Set(action.payload.tags)
      relationship.tags = relationship.tags.filter((tag) => !tagsToRemove.has(tag))
    },
    /** Apply delta updates to directed social memory entries. */
    updateSocialMemory(
      state,
      action: PayloadAction<{
        actorId: string
        targetId: string
        deltas?: SocialMemoryDelta
        event?: SocialMemoryEvent
      }>
    ) {
      const { actorId, targetId, deltas, event } = action.payload
      if (!event && !hasSocialMemoryDelta(deltas)) {
        return
      }
      if (!state.socialMemory[actorId]) {
        state.socialMemory[actorId] = {}
      }
      let entry = state.socialMemory[actorId][targetId]
      if (!entry) {
        entry = createSocialMemoryEntry()
        state.socialMemory[actorId][targetId] = entry
      }

      if (deltas) {
        applySocialMemoryDelta(entry, deltas)
      }
      if (event) {
        appendSocialMemoryEvent(entry, event)
      }
    },
    /** Decay all social memory signals toward zero (called at week start). */
    decaySocialMemory(state) {
      Object.values(state.socialMemory).forEach((targets) => {
        Object.values(targets).forEach((entry) => {
          decaySocialMemoryEntry(entry)
        })
      })
    },
    /** Record a promise created by a high-stakes incoming response. */
    addSocialCommitment(state, action: PayloadAction<SocialCommitment>) {
      if (!state.commitments) state.commitments = []
      if (state.commitments.some((entry) => entry.interactionId === action.payload.interactionId))
        return
      state.commitments.unshift(action.payload)
    },
    /** Mark a pending promise as kept, broken, or void. */
    resolveSocialCommitment(
      state,
      action: PayloadAction<{
        commitmentId: string
        status: Exclude<SocialCommitment['status'], 'pending'>
        resolvedAt?: number
        resolvedWeek?: number
        resolutionReason?: string
      }>
    ) {
      const entry = (state.commitments ?? []).find(
        (commitment) => commitment.id === action.payload.commitmentId
      )
      if (!entry || entry.status !== 'pending') return
      entry.status = action.payload.status
      entry.resolvedAt = action.payload.resolvedAt ?? Date.now()
      entry.resolvedWeek = action.payload.resolvedWeek
      entry.resolutionReason = action.payload.resolutionReason
    },
    /** Manually open the social panel (e.g. via the FAB button). */
    openSocialPanel(state) {
      state.panelOpen = true
    },
    /** Manually close the social panel. */
    closeSocialPanel(state) {
      state.panelOpen = false
    },
    /** Open the incoming interactions inbox panel. */
    openIncomingInbox(state) {
      state.incomingInboxOpen = true
    },
    /** Close the incoming interactions inbox panel. */
    closeIncomingInbox(state) {
      state.incomingInboxOpen = false
    },
    /** Clear only panel-session entries; persistent actionHistory is retained. */
    clearSessionLogs(state) {
      state.sessionLogs = []
    },
    /** Snapshot current relationship affinities into weekStartRelSnapshot. */
    snapshotWeekRelationships(state) {
      const snapshot: Record<string, Record<string, number>> = {}
      for (const [actorId, targets] of Object.entries(state.relationships)) {
        snapshot[actorId] = {}
        for (const [targetId, rel] of Object.entries(targets)) {
          snapshot[actorId][targetId] = rel.affinity
        }
      }
      state.weekStartRelSnapshot = snapshot
    },

    /** Restore and migrate a previously saved social state. */
    hydrateSocial(_state, action: PayloadAction<SocialState>) {
      return migrateSocialState(action.payload)
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreWeekendDebugSnapshot, (_state, action) => action.payload.social)
      .addMatcher(
        (action) => action.type === 'game/resetGame',
        () => migrateSocialState({} as SocialState)
      )
  },
})

export const {
  engineReady,
  engineComplete,
  setLastReport,
  influenceUpdated,
  setEnergyBankEntry,
  applyEnergyDelta,
  setInfluenceBankEntry,
  applyInfluenceDelta,
  setInfoBankEntry,
  applyInfoDelta,
  grantSecretMissionResourceCache,
  recordSocialAction,
  initializeRealitySimulation,
  replaceRealitySimulation,
  replaceRealityDomain,
  pruneEvictedAiPrivateState,
  commitRealityDomainUpdate,
  commitRealityOutcome,
  ensureRealityDomainActors,
  applyRealityRelationshipDelta,
  applyRealityAmbientMood,
  applyRealityAmbientRelationship,
  recordRealityFact,
  recordIntelligenceDelivery,
  learnRealityKnowledge,
  upsertRealityPromiseRecord,
  upsertRealityDebtRecord,
  upsertRealitySecretRecord,
  upsertRealityThreadRecord,
  recordRealityCeremony,
  reconcileRealityBattleBackReturn,
  recordRealityActualVote,
  recordRealityActualVotes,
  recordRealityAllianceBetrayal,
  renameRealityAllianceRecord,
  recordRealitySimulationTrace,
  replaceDramaNetwork,
  applyDramaAction,
  applyDramaIncomingResponse,
  pushIncomingInteraction,
  scheduleIncomingInteraction,
  recordIncomingInteractionDecision,
  clearIncomingInteractionLogs,
  applyScheduledIncomingInteractionDelivery,
  markIncomingInteractionRead,
  markAllIncomingInteractionsRead,
  resolveIncomingInteraction,
  recordIncomingInteractionFollowUp,
  dismissIncomingInteraction,
  invalidateIncomingInteractions,
  drainEvictedPlayerSocial,
  resolveExpiredIncomingInteractionsForWeek,
  resolveIncomingInteractionsByDeadline,
  updateRelationship,
  removeRelationshipTags,
  updateSocialMemory,
  decaySocialMemory,
  addSocialCommitment,
  resolveSocialCommitment,
  openSocialPanel,
  closeSocialPanel,
  openIncomingInbox,
  closeIncomingInbox,
  clearSessionLogs,
  snapshotWeekRelationships,
  applyWeekSeedBatch,
  hydrateSocial,
} = socialSlice.actions
export default socialSlice.reducer

// Selectors – typed against a minimal shape to avoid circular imports with store.ts
export const selectSocialBudgets = (state: { social: SocialState }) => state.social?.energyBank
/** Alias for selectSocialBudgets – prefer this name in SocialManeuvers contexts. */
export const selectEnergyBank = (state: { social: SocialState }) => state.social?.energyBank
export const selectInfluenceBank = (state: { social: SocialState }) => state.social?.influenceBank
export const selectInfoBank = (state: { social: SocialState }) => state.social?.infoBank
export const selectRealityDomain = (state: { social: SocialState }) => state.social.reality
export const selectIntelligenceDeliveries = (state: { social: SocialState }) =>
  state.social?.intelligenceDeliveries ?? []
export const selectRealityRelationship = (
  state: { social: SocialState },
  sourceId: string,
  targetId: string
) => state.social.reality.relationships[sourceId]?.[targetId]
export const selectLastSocialReport = (state: { social: SocialState }) =>
  state.social?.lastReport ?? null
export const selectInfluenceWeights = (state: { social: SocialState }) =>
  state.social?.influenceWeights
export const selectSessionLogs = (state: { social: SocialState }) =>
  state.social?.sessionLogs as SocialState['sessionLogs']
export const selectPersistentSocialHistory = (state: { social: SocialState }) =>
  getPersistentSocialHistory(state.social as SocialStateWithHistory)
export const selectRealitySimulation = (state: { social: SocialState }) =>
  state.social?.realitySimulation ?? SOCIAL_INITIAL_STATE.realitySimulation
export const selectSocialPanelOpen = (state: { social: SocialState }) =>
  state.social?.panelOpen ?? false
export const selectSocialMemory = (state: { social: SocialState }) =>
  state.social?.socialMemory ?? {}
export const selectSocialCommitments = (state: { social: SocialState }) =>
  state.social?.commitments ?? []
export const selectDramaNetwork = (state: { social: SocialState }) =>
  state.social?.dramaNetwork ?? SOCIAL_INITIAL_STATE.dramaNetwork
export const selectPendingSocialCommitments = (state: { social: SocialState }) =>
  selectSocialCommitments(state).filter((commitment) => commitment.status === 'pending')
export const selectWeekStartRelSnapshot = (state: { social: SocialState }) =>
  state.social?.weekStartRelSnapshot ?? {}
export const selectIncomingInboxOpen = (state: { social: SocialState }) =>
  state.social?.incomingInboxOpen ?? false
export const selectIncomingInteractions = (state: { social: SocialState }) =>
  state.social?.incomingInteractions ?? []
export const selectIncomingInteractionLogs = (state: { social: SocialState }) =>
  state.social?.incomingInteractionLogs ?? []
export const selectScheduledIncomingInteractions = (state: { social: SocialState }) =>
  state.social?.scheduledIncomingInteractions ?? []
export const selectIncomingInteractionDeliveryState = (state: { social: SocialState }) =>
  state.social?.incomingInteractionDelivery
export const selectUnreadIncomingInteractionCount = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.read).length
export const selectPendingIncomingInteractionCount = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.resolved).length
export const selectActiveIncomingInteractions = (state: { social: SocialState }) =>
  selectIncomingInteractions(state).filter((interaction) => !interaction.resolved)
export const selectScheduledIncomingInteractionCount = (state: { social: SocialState }) =>
  selectScheduledIncomingInteractions(state).length
