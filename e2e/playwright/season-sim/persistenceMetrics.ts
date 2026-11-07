import type { RootState } from '../../../src/store/store'
import type { SaveResumePerformanceCheckpoint } from './types'

const SAVE_TIMESTAMP = '2026-11-04T00:00:00.000Z'
const GAME_HISTORY_LIMIT = 250
const TV_FEED_LIMIT = 400
const SESSION_LOG_LIMIT = 80
const ACTION_HISTORY_LIMIT = 240
const INCOMING_LOG_LIMIT = 80
const RESOLVED_INCOMING_LIMIT = 60
const REALITY_RESOLVED_INTERACTIONS_LIMIT = 40
const REALITY_TRACE_LIMIT = 80

function estimateJsonBytes(value: unknown): number {
  const serialized = JSON.stringify(value)
  return serialized ? serialized.length * 2 : 0
}

function countRecord(value: unknown): number {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0
}

function compactTvFeed(game: RootState['game']): RootState['game']['tvFeed'] {
  if (game.tvFeed.length <= TV_FEED_LIMIT) return [...game.tvFeed]
  const retainedIds = new Set(game.tvFeed.slice(0, TV_FEED_LIMIT).map(({ id }) => id))
  for (const queuedId of game.broadcastQueue ?? []) retainedIds.add(queuedId)
  if (game.lastPlainBroadcastEventId) retainedIds.add(game.lastPlainBroadcastEventId)
  return game.tvFeed.filter(({ id }) => retainedIds.has(id))
}

function compactGame(game: RootState['game']): RootState['game'] {
  const campaign = { ...game }
  delete campaign.seasonArchives
  delete campaign.broadcastOverrides
  delete campaign.customBroadcasts
  return {
    ...campaign,
    mode: game.mode ?? 'classic',
    lastPlayedAt: Date.parse(SAVE_TIMESTAMP),
    saveVersion: game.saveVersion ?? 2,
    tvFeed: compactTvFeed(game),
    history: game.history?.slice(-GAME_HISTORY_LIMIT),
  }
}

function compactSocial(social: RootState['social']): RootState['social'] {
  const resolved = social.incomingInteractions
    .filter((interaction) => interaction.resolved)
    .sort(
      (left, right) =>
        (left.resolvedAt ?? left.createdAt) - (right.resolvedAt ?? right.createdAt) ||
        left.id.localeCompare(right.id)
    )
    .slice(-RESOLVED_INCOMING_LIMIT)
  const retainedResolvedIds = new Set(resolved.map(({ id }) => id))
  const realityInteractions = social.reality.interactions
  const activeRealityInteractions = Object.entries(realityInteractions).filter(
    ([, interaction]) => interaction.status === 'PENDING' || interaction.status === 'AWAITING_HUMAN'
  )
  const protectedRealityInteractionIds = new Set(
    social.incomingInteractions
      .filter((interaction) => !interaction.resolved)
      .map((interaction) => interaction.payload?.realityInteractionId)
      .filter((id): id is string => typeof id === 'string')
  )
  const resolvedRealityInteractions = Object.entries(realityInteractions)
    .filter(
      ([, interaction]) =>
        interaction.status !== 'PENDING' && interaction.status !== 'AWAITING_HUMAN'
    )
    .sort(
      ([leftId, left], [rightId, right]) =>
        left.createdSequence - right.createdSequence || leftId.localeCompare(rightId)
    )
  const retainedRealityInteractions = new Map(activeRealityInteractions)
  for (const [id, interaction] of resolvedRealityInteractions) {
    if (protectedRealityInteractionIds.has(id)) retainedRealityInteractions.set(id, interaction)
  }
  for (const [id, interaction] of resolvedRealityInteractions.slice(
    -REALITY_RESOLVED_INTERACTIONS_LIMIT
  )) {
    retainedRealityInteractions.set(id, interaction)
  }

  return {
    ...social,
    sessionLogs: social.sessionLogs.slice(-SESSION_LOG_LIMIT),
    actionHistory: social.actionHistory?.slice(-ACTION_HISTORY_LIMIT),
    incomingInteractionLogs: social.incomingInteractionLogs.slice(-INCOMING_LOG_LIMIT),
    incomingInteractions: social.incomingInteractions.filter(
      (interaction) => !interaction.resolved || retainedResolvedIds.has(interaction.id)
    ),
    realitySimulation: {
      ...social.realitySimulation,
      trace: social.realitySimulation.trace
        .slice(-REALITY_TRACE_LIMIT)
        .map((entry) => ({ ...entry, candidates: undefined })),
    },
    reality: {
      ...social.reality,
      interactions: Object.fromEntries(retainedRealityInteractions),
    },
  }
}

export function measureSavedSeasonSnapshot(
  state: RootState
): SaveResumePerformanceCheckpoint['snapshot'] {
  // Mirror the save projection using only test-side code, so collecting metrics
  // does not pull browser-only JSON imports into Playwright's Node process.
  const snapshot = {
    version: 1,
    profileId: state.profiles.activeProfileId ?? 'save-resume-performance',
    savedAt: SAVE_TIMESTAMP,
    game: compactGame(state.game),
    finale: state.finale,
    social: compactSocial(state.social),
    publicOpinion: state.publicOpinion,
    challenge: state.challenge,
  }
  const reality = snapshot.social.reality
  const memoryCount = Object.values(reality.memoriesByOwner).reduce(
    (total, memories) => total + memories.length,
    0
  )
  const beliefCount = Object.values(reality.beliefsByOwner).reduce(
    (total, beliefs) => total + Object.keys(beliefs).length,
    0
  )
  const logs = {
    sessionLogs: snapshot.social.sessionLogs,
    actionHistory: snapshot.social.actionHistory,
    incomingInteractionLogs: snapshot.social.incomingInteractionLogs,
    incomingInteractions: snapshot.social.incomingInteractions,
    realityTrace: snapshot.social.realitySimulation.trace,
  }

  return {
    totalBytes: estimateJsonBytes(snapshot),
    sections: {
      game: estimateJsonBytes(snapshot.game),
      social: estimateJsonBytes(snapshot.social),
      socialCompatibilityRelationships: estimateJsonBytes(snapshot.social.relationships),
      socialReality: estimateJsonBytes(reality),
      realityRelationships: estimateJsonBytes(reality.relationships),
      realityMemories: estimateJsonBytes(reality.memoriesByOwner),
      realityBeliefs: estimateJsonBytes(reality.beliefsByOwner),
      realityFacts: estimateJsonBytes(reality.facts),
      realityPromises: estimateJsonBytes(reality.promises),
      realityInteractions: estimateJsonBytes(reality.interactions),
      realityEvents: estimateJsonBytes(reality.events),
      realityAlliances: estimateJsonBytes(reality.alliances),
      realityOther: estimateJsonBytes({
        debts: reality.debts,
        secrets: reality.secrets,
        grievances: reality.grievances,
        threads: reality.threads,
        allianceManagement: reality.allianceManagement,
        romances: reality.romances,
        contestants: reality.contestants,
        cooldowns: reality.cooldowns,
        voteIntents: reality.voteIntents,
        facadeAgreements: reality.facadeAgreements,
        publicPerception: reality.publicPerception,
        juryEvaluations: reality.juryEvaluations,
        reentryProfiles: reality.reentryProfiles,
        relationshipAutonomy: reality.relationshipAutonomy,
      }),
      socialLogs: estimateJsonBytes(logs),
      finale: estimateJsonBytes(snapshot.finale),
      challenge: estimateJsonBytes(snapshot.challenge),
      publicOpinion: estimateJsonBytes(snapshot.publicOpinion),
    },
    counts: {
      players: snapshot.game.players.length,
      gameHistory: snapshot.game.history?.length ?? 0,
      tvFeed: snapshot.game.tvFeed.length,
      relationships: Object.values(reality.relationships).reduce(
        (total, targets) => total + Object.keys(targets).length,
        0
      ),
      memories: memoryCount,
      beliefs: beliefCount,
      facts: countRecord(reality.facts),
      promises: countRecord(reality.promises),
      interactions: countRecord(reality.interactions),
      realityEvents: reality.events.length,
      alliances: countRecord(reality.alliances),
      socialLogEntries: Object.values(logs).reduce(
        (total, items) => total + (items?.length ?? 0),
        0
      ),
      activeRealityInteractions: Object.values(reality.interactions).filter(
        ({ status }) => status === 'PENDING' || status === 'AWAITING_HUMAN'
      ).length,
      resolvedRealityInteractions: Object.values(reality.interactions).filter(
        ({ status }) => status !== 'PENDING' && status !== 'AWAITING_HUMAN'
      ).length,
    },
  }
}
