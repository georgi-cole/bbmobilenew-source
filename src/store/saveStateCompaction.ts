import type { SocialState } from '../social/types'

/**
 * Persistence-only retention limits. Runtime state can remain richer; snapshots
 * deliberately omit verbose diagnostics and old inbox history that are not
 * required to resume gameplay.
 */
export const PERSISTED_SOCIAL_LIMITS = {
  sessionLogs: 80,
  actionHistory: 240,
  incomingInteractionLogs: 80,
  resolvedIncomingInteractions: 60,
  realityTrace: 80,
} as const

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
    .map(({ candidates: _candidates, ...entry }) => entry)

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
