import type { SocialState } from '../social/types'
import type { GameState } from '../types'

/**
 * Persistence-only retention limits. Runtime state can remain richer; snapshots
 * deliberately omit verbose diagnostics and old inbox history that are not
 * required to resume gameplay.
 */
export const PERSISTED_GAME_LIMITS = {
  tvFeed: 400,
  history: 250,
} as const

export const PERSISTED_SOCIAL_LIMITS = {
  sessionLogs: 80,
  actionHistory: 240,
  incomingInteractionLogs: 80,
  resolvedIncomingInteractions: 60,
  realityTrace: 80,
} as const


function compactTvFeed(game: GameState): GameState['tvFeed'] {
  if (game.tvFeed.length <= PERSISTED_GAME_LIMITS.tvFeed) return [...game.tvFeed]

  const retainedIds = new Set(
    game.tvFeed.slice(0, PERSISTED_GAME_LIMITS.tvFeed).map((event) => event.id)
  )
  for (const queuedId of game.broadcastQueue ?? []) retainedIds.add(queuedId)
  if (game.lastPlainBroadcastEventId) retainedIds.add(game.lastPlainBroadcastEventId)

  return game.tvFeed.filter((event) => retainedIds.has(event.id))
}

/**
 * Compact presentation/audit history while preserving current broadcast queue
 * targets and all authoritative gameplay state.
 */
export function compactGameStateForPersistence(state: GameState): GameState {
  return {
    ...state,
    tvFeed: compactTvFeed(state),
    history: state.history?.slice(-PERSISTED_GAME_LIMITS.history),
  }
}

function tail<T>(items: readonly T[] | undefined, limit: number): T[] | undefined {
  if (!items) return undefined
  if (items.length <= limit) return [...items]
  return items.slice(-limit)
}

function compactIncomingInteractions(
  interactions: SocialState['incomingInteractions']
): SocialState['incomingInteractions'] {
  const resolved = interactions
    .filter((interaction) => interaction.resolved)
    .sort(
      (left, right) =>
        (left.resolvedAt ?? left.createdAt) - (right.resolvedAt ?? right.createdAt) ||
        left.id.localeCompare(right.id)
    )
    .slice(-PERSISTED_SOCIAL_LIMITS.resolvedIncomingInteractions)
  const retainedResolvedIds = new Set(resolved.map((interaction) => interaction.id))

  return interactions.filter(
    (interaction) => !interaction.resolved || retainedResolvedIds.has(interaction.id)
  )
}

/**
 * Return a compact, immutable persistence projection of SocialState.
 *
 * The deterministic RNG cursor, causal Reality domain, relationships, promises,
 * facts, memories and active interactions are preserved. Verbose debug/history
 * collections are bounded so a long season cannot turn every autosave into a
 * multi-megabyte synchronous JSON write.
 */
export function compactSocialStateForPersistence(state: SocialState): SocialState {
  // Old/partially-migrated saves may temporarily lack newer SocialState fields.
  // Preserve them verbatim rather than turning a save attempt into a crash.
  if (
    !state.realitySimulation ||
    !Array.isArray(state.realitySimulation.trace) ||
    !Array.isArray(state.sessionLogs) ||
    !Array.isArray(state.incomingInteractionLogs) ||
    !Array.isArray(state.incomingInteractions)
  ) {
    return state
  }

  const compactTrace = state.realitySimulation.trace
    .slice(-PERSISTED_SOCIAL_LIMITS.realityTrace)
    .map((entry) => ({ ...entry, candidates: undefined }))

  return {
    ...state,
    sessionLogs: tail(state.sessionLogs, PERSISTED_SOCIAL_LIMITS.sessionLogs) ?? [],
    actionHistory: tail(state.actionHistory, PERSISTED_SOCIAL_LIMITS.actionHistory),
    incomingInteractionLogs:
      tail(state.incomingInteractionLogs, PERSISTED_SOCIAL_LIMITS.incomingInteractionLogs) ?? [],
    incomingInteractions: compactIncomingInteractions(state.incomingInteractions),
    realitySimulation: {
      ...state.realitySimulation,
      trace: compactTrace,
    },
  }
}
