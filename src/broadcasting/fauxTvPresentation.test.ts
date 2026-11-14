import { describe, expect, it } from 'vitest'
import type { TvEvent } from '../types'
import {
  addPresentationEventClaim,
  createPresentationEventClaim,
  hasPresentationEventClaim,
  pinBroadcastQueueHead,
  selectCompetitionStarting,
  selectCurrentBroadcastEvents,
  selectFauxTvFrame,
} from './fauxTvPresentation'

function event(id: string, phase: string, week: number, text = id): TvEvent {
  return {
    id,
    text,
    type: 'twist',
    timestamp: 1,
    meta: { phase, week, forceOnTv: true },
  }
}

describe('Faux TV presentation selection', () => {
  it('keeps an already active unread consequence ahead of a higher-priority arrival', () => {
    const pending = ['winner-result', 'aftershock']

    expect(pinBroadcastQueueHead(pending, 'aftershock')).toEqual(['aftershock', 'winner-result'])
  })

  it('rejects a stale unconsumed event from a prior phase and week', () => {
    const stale = event('ambush-week-4', 'pos_ceremony_results', 4)
    const current = event('live-vote-week-5', 'live_vote', 5)

    expect(
      selectCurrentBroadcastEvents([stale.id, current.id], [stale, current], 'live_vote', 5).map(
        ({ id }) => id
      )
    ).toEqual([current.id])
  })

  it('ignores consumed and non-renderable entries without consuming them', () => {
    const consumed = event('consumed', 'social_1', 2)
    consumed.meta = { ...consumed.meta, broadcastConsumed: true }
    const hidden = event('hidden', 'social_1', 2)
    const visible = event('visible', 'social_1', 2)
    const selected = selectCurrentBroadcastEvents(
      [consumed.id, hidden.id, visible.id],
      [consumed, hidden, visible],
      'social_1',
      2,
      null,
      (candidate) => candidate.id !== hidden.id
    )

    expect(selected.map(({ id }) => id)).toEqual([visible.id])
    expect(hidden.meta?.broadcastConsumed).toBeUndefined()
  })

  it('always returns current nonempty copy unless a foreground owner covers the viewport', () => {
    expect(
      selectFauxTvFrame({
        foregroundOwnerVisible: false,
        eventText: '   ',
        stateFallback: 'Current phase: Live Vote.',
      })
    ).toEqual({ visible: true, text: 'Current phase: Live Vote.' })
    expect(
      selectFauxTvFrame({
        foregroundOwnerVisible: true,
        eventText: 'Old result',
        stateFallback: 'Current phase: Live Vote.',
      })
    ).toEqual({ visible: false, text: null })
  })

  it('claims one-shot media once for a game, run, and event identity', () => {
    const shock = event('shock-1', 'week_start', 3)
    shock.meta = { ...shock.meta, runId: 'shock-run-9' }
    const claim = createPresentationEventClaim('game-1', shock)
    const once = addPresentationEventClaim([], claim)

    expect(hasPresentationEventClaim(once, claim)).toBe(true)
    expect(addPresentationEventClaim(once, claim)).toEqual(once)
    expect(hasPresentationEventClaim(once, { ...claim, gameId: 'game-2' })).toBe(false)
    expect(hasPresentationEventClaim(once, { ...claim, runId: 'shock-run-10' })).toBe(false)
    expect(hasPresentationEventClaim(once, { ...claim, eventId: 'shock-2' })).toBe(false)
  })

  it('synchronously identifies eligible LOH/POS handoffs while preserving skip routes', () => {
    const handoff = {
      phase: 'loh_comp' as const,
      hasPendingChallenge: false,
      humanIsOutgoingHoh: false,
      pendingWinnerCeremony: false,
      democraciaOverridesLoh: false,
      participantCount: 4,
    }

    expect(selectCompetitionStarting(handoff)).toBe(true)
    expect(selectCompetitionStarting({ ...handoff, hasPendingChallenge: true })).toBe(false)
    expect(selectCompetitionStarting({ ...handoff, humanIsOutgoingHoh: true })).toBe(false)
    expect(selectCompetitionStarting({ ...handoff, participantCount: 0 })).toBe(false)
    expect(selectCompetitionStarting({ ...handoff, phase: 'social_1' })).toBe(false)
  })
})
