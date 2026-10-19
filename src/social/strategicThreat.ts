import { visibleRealityEvents } from './reality/events'
import type { RealityDomainState, RealitySocialEvent } from './reality/types'

export interface StrategicThreatRead {
  /** How often the observer has seen this player successfully persuade or lead. */
  persuasion: number
  /** How broad the player's witnessed social network appears to this observer. */
  networkReach: number
  /** Respect earned through publicly visible strategic moves. */
  publicRespect: number
  /** A cautious estimate of support from jurors the observer can read. */
  juryAppeal: number
  /** Bounded score consumed by the game reducer's threat model. */
  score: number
}

export type StrategicThreatSnapshot = Record<string, Record<string, StrategicThreatRead>>

interface ThreatSnapshotPlayer {
  id: string
  status: string
}

const SUCCESS_OUTCOMES = new Set(['SUCCESS', 'PARTIAL'])
const POSITIVE_SOCIAL_TAGS = new Set(['PERSUADE', 'COMMITMENT', 'BOND', 'PROTECT', 'ROMANCE'])
const STRATEGIC_TAGS = new Set(['STRATEGY', 'PERSUADE', 'COMMITMENT', 'VOTE'])

function normalized(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function isAvailable(player: ThreatSnapshotPlayer): boolean {
  return player.status !== 'evicted' && player.status !== 'jury'
}

function isPositiveSocialEvidence(event: RealitySocialEvent): boolean {
  return (
    SUCCESS_OUTCOMES.has(event.outcome) && event.tags.some((tag) => POSITIVE_SOCIAL_TAGS.has(tag))
  )
}

/**
 * Builds an observer-specific read of social endgame threat. Every event is
 * first filtered through Reality's visibility rules; hidden conversations and
 * secret pact membership therefore cannot inform an outsider's read.
 */
export function buildStrategicThreatSnapshot(input: {
  reality?: RealityDomainState
  players: readonly ThreatSnapshotPlayer[]
}): StrategicThreatSnapshot {
  const reality = input.reality
  if (!reality) return {}

  const activePlayers = input.players.filter(isAvailable)
  const jurorIds = input.players
    .filter((player) => player.status === 'jury')
    .map((player) => player.id)
  const snapshot: StrategicThreatSnapshot = {}

  for (const observer of activePlayers) {
    const visibleEvents = visibleRealityEvents(reality, { actorId: observer.id })
    const publicEventIds = new Set(
      visibleEvents.filter((event) => event.publicEligible).map((event) => event.id)
    )
    snapshot[observer.id] = {}

    for (const candidate of activePlayers) {
      if (candidate.id === observer.id) continue

      const candidateEvents = visibleEvents.filter((event) => event.actorId === candidate.id)
      const successfulPersuasion = candidateEvents.filter(
        (event) =>
          event.type === 'SOCIAL_INTERACTION_RESOLVED' &&
          event.tags.includes('PERSUADE') &&
          SUCCESS_OUTCOMES.has(event.outcome)
      )
      const successfulStrategy = candidateEvents.filter(
        (event) =>
          SUCCESS_OUTCOMES.has(event.outcome) &&
          (event.type === 'ALLIANCE_STRATEGY_MEETING' ||
            event.tags.some((tag) => STRATEGIC_TAGS.has(tag)))
      )
      const publicMoves = candidateEvents.filter(
        (event) =>
          event.visibility === 'CEREMONY_PUBLIC' &&
          (event.type === 'CEREMONY_NOMINATIONS_LOCKED' || event.type === 'CEREMONY_SAFETY_USED')
      )

      const successfulPersuasionTargets = new Set(
        successfulPersuasion.flatMap((event) => event.targetIds.filter((id) => id !== candidate.id))
      )
      const knownConnections = new Set<string>()
      for (const event of [...successfulStrategy, ...successfulPersuasion, ...publicMoves]) {
        for (const id of [...event.participantIds, ...event.targetIds]) {
          if (id !== candidate.id) knownConnections.add(id)
        }
        if (event.allianceSnapshot?.memberIds.includes(candidate.id)) {
          for (const id of event.allianceSnapshot.memberIds) {
            if (id !== candidate.id) knownConnections.add(id)
          }
        }
      }

      const persuasion = normalized(
        Math.min(1, successfulPersuasion.length / 4) * 0.65 +
          Math.min(1, successfulPersuasionTargets.size / 4) * 0.35
      )
      const networkReach = normalized(knownConnections.size / 7)
      const perceived = reality.publicPerception[candidate.id]
      const hasKnownPublicReputation = Boolean(
        perceived?.sourceEventIds.some((eventId) => publicEventIds.has(eventId))
      )
      const publicRespect = hasKnownPublicReputation
        ? normalized(
            (Math.max(0, perceived?.strategicRespect ?? 0) +
              Math.max(0, perceived?.likability ?? 0) * 0.35) /
              45
          )
        : 0

      let positiveJurorEvidence = 0
      let negativeJurorEvidence = 0
      if (jurorIds.length > 0) {
        for (const jurorId of jurorIds) {
          const relationshipEvents = visibleEvents.filter(
            (event) =>
              event.participantIds.includes(candidate.id) && event.participantIds.includes(jurorId)
          )
          if (relationshipEvents.some(isPositiveSocialEvidence)) positiveJurorEvidence += 1
          if (
            relationshipEvents.some(
              (event) =>
                event.tags.some((tag) => /BETRAY|CONFLICT|BLINDSIDE/i.test(tag)) ||
                (event.actorId === candidate.id && event.outcome === 'FAILURE')
            )
          ) {
            negativeJurorEvidence += 1
          }
        }
      }
      const juryAppeal =
        jurorIds.length > 0
          ? normalized(
              ((positiveJurorEvidence - negativeJurorEvidence) / jurorIds.length) * 1.5 +
                publicRespect * 0.2
            )
          : 0

      // As the house shrinks, social influence and Tribunal appeal become
      // increasingly decisive. Multiple routes to winning stay competitive.
      const stageMultiplier =
        activePlayers.length <= 3
          ? 1.2
          : activePlayers.length <= 5
            ? 1
            : activePlayers.length <= 8
              ? 0.8
              : 0.6
      const score =
        (persuasion * 3.2 + networkReach * 2 + publicRespect * 2 + juryAppeal * 2.8) *
        stageMultiplier

      snapshot[observer.id][candidate.id] = {
        persuasion,
        networkReach,
        publicRespect,
        juryAppeal,
        score: Math.max(0, Math.min(12, score)),
      }
    }
  }

  return snapshot
}
