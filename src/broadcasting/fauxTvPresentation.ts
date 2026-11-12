import type { Phase, PresentationEventClaim, TvEvent } from '../types'

export function createPresentationEventClaim(
  gameId: string,
  event: TvEvent
): PresentationEventClaim {
  const metaRunId = event.meta?.runId ?? event.meta?.sourceRunId ?? event.meta?.broadcastRunId
  return {
    gameId,
    runId:
      typeof metaRunId === 'string' && metaRunId.length > 0
        ? metaRunId
        : `week:${String(event.meta?.week ?? 'legacy')}|phase:${String(event.meta?.phase ?? 'legacy')}`,
    eventId: event.id,
  }
}

function claimKey(claim: PresentationEventClaim): string {
  return `${claim.gameId}\u0000${claim.runId}\u0000${claim.eventId}`
}

export function hasPresentationEventClaim(
  claims: readonly PresentationEventClaim[] | undefined,
  claim: PresentationEventClaim
): boolean {
  const key = claimKey(claim)
  return claims?.some((savedClaim) => claimKey(savedClaim) === key) ?? false
}

export function addPresentationEventClaim(
  claims: readonly PresentationEventClaim[] | undefined,
  claim: PresentationEventClaim
): PresentationEventClaim[] {
  const current = claims ? [...claims] : []
  return hasPresentationEventClaim(current, claim) ? current : [...current, claim]
}

/** Keep a claimed, unread event ahead of later arrivals until it is consumed. */
export function pinBroadcastQueueHead(queue: readonly string[], activeEventId?: string | null) {
  if (!activeEventId || !queue.includes(activeEventId)) return [...queue]
  return [activeEventId, ...queue.filter((id) => id !== activeEventId)]
}

/** Resolve only pending events whose delivery window exactly matches this phase. */
export function selectCurrentBroadcastEvents(
  queue: readonly string[] | undefined,
  feed: readonly TvEvent[],
  phase: Phase,
  week: number,
  activeEventId?: string | null,
  isRenderable: (event: TvEvent) => boolean = () => true
): TvEvent[] {
  const byId = new Map(feed.map((event) => [event.id, event] as const))
  const ids = pinBroadcastQueueHead(queue ?? [], activeEventId)
  const seen = new Set<string>()
  return ids.flatMap((id) => {
    if (seen.has(id)) return []
    seen.add(id)
    const event = byId.get(id)
    if (
      !event ||
      event.meta?.broadcastConsumed === true ||
      event.meta?.phase !== phase ||
      event.meta?.week !== week ||
      !isRenderable(event)
    ) {
      return []
    }
    return [event]
  })
}

export interface FauxTvFrameInput {
  foregroundOwnerVisible: boolean
  override?: string | null
  eventText?: string | null
  stateFallback: string
}

export interface FauxTvFrame {
  visible: boolean
  text: string | null
}

/** Select an owned foreground frame or nonempty, current-state Faux TV copy. */
export function selectFauxTvFrame(input: FauxTvFrameInput): FauxTvFrame {
  if (input.foregroundOwnerVisible) return { visible: false, text: null }
  const text = [input.override, input.eventText, input.stateFallback].find(
    (copy) => typeof copy === 'string' && copy.trim().length > 0
  )
  return { visible: true, text: text?.trim() ?? null }
}

export function selectCompetitionStarting(input: {
  phase: Phase
  hasPendingChallenge: boolean
  humanIsOutgoingHoh: boolean
  pendingWinnerCeremony: boolean
  democraciaOverridesLoh: boolean
  participantCount: number
}): boolean {
  const competitionPhase = input.phase === 'loh_comp' || input.phase === 'pos_comp'
  return Boolean(
    competitionPhase &&
    !input.hasPendingChallenge &&
    !input.pendingWinnerCeremony &&
    !input.humanIsOutgoingHoh &&
    !input.democraciaOverridesLoh &&
    input.participantCount > 0
  )
}
