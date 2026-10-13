import type { RealityFact } from './reality/types'

export interface IntelligenceEligibilityPlayer {
  id: string
  status: string
  firstEvictedAtWeek?: number
}

function isAvailable(player: IntelligenceEligibilityPlayer | undefined): boolean {
  return Boolean(player && player.status !== 'evicted' && player.status !== 'jury')
}

/** Returns the player IDs whose participation makes a fact current. */
export function getRealityFactParticipantIds(fact: RealityFact): string[] {
  const ids = new Set([...fact.participantIds, ...fact.subjectIds])
  // Most object IDs are alliance IDs or other metadata. Targeting facts use
  // objectId for the person the plan concerns.
  if (fact.propositionType === 'TARGETING' && fact.objectId) ids.add(fact.objectId)
  return [...ids]
}

export function getUnavailableRealityFactParticipantIds(
  fact: RealityFact,
  players: readonly IntelligenceEligibilityPlayer[]
): string[] {
  return createIntelligenceEligibility(players).getUnavailableFactParticipants(fact)
}

export function isRealityFactEligibleForCurrentUse(
  fact: RealityFact,
  players: readonly IntelligenceEligibilityPlayer[]
): boolean {
  return createIntelligenceEligibility(players).isFactEligible(fact)
}

export function arePlayersEligibleForCurrentUse(
  playerIds: readonly string[],
  players: readonly IntelligenceEligibilityPlayer[]
): boolean {
  return createIntelligenceEligibility(players).arePlayersEligible(playerIds)
}

/** Create one reusable roster lookup for filtering a batch of intel. */
export function createIntelligenceEligibility(players: readonly IntelligenceEligibilityPlayer[]) {
  const byId = new Map(players.map((player) => [player.id, player]))
  const getUnavailableFactParticipants = (fact: RealityFact) =>
    getRealityFactParticipantIds(fact).filter((id) => !isAvailable(byId.get(id)))

  return {
    getUnavailableFactParticipants,
    arePlayersEligible: (playerIds: readonly string[]) =>
      playerIds.every((id) => isAvailable(byId.get(id))),
    isFactEligible: (fact: RealityFact) => {
      const participantIds = getRealityFactParticipantIds(fact)
      if (participantIds.length === 0 || getUnavailableFactParticipants(fact).length > 0) {
        return false
      }

      // Facts from before a Battle Back return stay historical instead of
      // resurfacing as fresh gossip. New facts about the active returner qualify.
      return participantIds.every((id) => {
        const firstEvictedAtWeek = byId.get(id)?.firstEvictedAtWeek
        return firstEvictedAtWeek === undefined || fact.day > firstEvictedAtWeek
      })
    },
  }
}
