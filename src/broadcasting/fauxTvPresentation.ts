import type { Phase, PresentationEventClaim, TvEvent } from '../types'

/** Quiet moments on the channel still belong to the show, not its machinery. */
const PHASE_BROADCAST_COPY: Record<Phase, string> = {
  season_start: 'New faces. Hidden agendas. One watchful Eye. Welcome to the Hub.',
  week_start: "A new day in the Hub. Yesterday's promises are about to be tested.",
  loh_comp_announcement: 'Power is up for grabs. The Hub is watching.',
  loh_comp: 'The battle for power is on. Who will take control?',
  loh_results: 'Power has a new holder. Every alliance is doing the maths.',
  democracia_vote: 'The Hub has a choice to make. Who deserves the power?',
  democracia_results: 'The ballots are in. A new balance of power takes shape.',
  social_1: 'Whispers travel fast in the Hub. Choose who hears yours.',
  nominations: 'Promises meet power. Who will end up on the block?',
  nomination_results: 'The names are out. Now the fight to stay begins.',
  pre_veto_public_save: 'The audience holds a lifeline. Who will they pull from danger?',
  pos_comp_announcement: 'One more chance to change the block. Safety is on the line.',
  pos_comp: 'Safety is within reach. Who will take their fate into their own hands?',
  pos_results: 'Safety has a new holder. The block is holding its breath.',
  pos_ceremony: 'One Safety decision. A room full of consequences.',
  pos_ceremony_results: 'Safety has spoken. Every seat on the block comes at a price.',
  social_2: 'The vote is getting closer. Every conversation could change a mind.',
  live_vote: 'The promises are over. Now the votes will tell the story.',
  eviction_results: 'The verdict is in. One journey is about to change forever.',
  week_end: 'The day is over. In the Hub, the consequences never sleep.',
  final4_eviction: 'Four remain. One decision stands between them and the final three.',
  final3: 'Three finalists. One last battle for a place in the finale.',
  final3_comp1: 'The final battle begins. Who will claim the first advantage?',
  final3_comp1_minigame: 'The final battle begins. Who will claim the first advantage?',
  final3_comp2: 'One more chance to reach the final showdown.',
  final3_comp2_minigame: 'One more chance to reach the final showdown.',
  final3_comp3: 'The last power of the season is on the line.',
  final3_comp3_minigame: 'The last power of the season is on the line.',
  final3_decision: 'One final choice. Who gets a seat in the finale?',
  jury_announcement: 'The finalists have made their case. The verdict draws closer.',
  jury_cinematic: 'The season comes full circle. Every choice has led to this.',
  jury: 'Two finalists. One title. The Big Eye is watching.',
}

export function getPhaseBroadcastCopy(phase: Phase): string {
  return PHASE_BROADCAST_COPY[phase]
}

/** Keep committed outcomes in history, but release them to the audience with the film. */
export function isUnrevealedVoteOutcome(
  event: TvEvent,
  week: number,
  revealPending: boolean
): boolean {
  if (!revealPending || (typeof event.meta?.week === 'number' && event.meta.week !== week))
    return false
  return (
    event.type === 'vote' ||
    event.meta?.evictionVoteResults === true ||
    event.meta?.phase === 'eviction_results'
  )
}

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
