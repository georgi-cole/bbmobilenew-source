import type { MiddlewareAPI } from '@reduxjs/toolkit'
import type { AppDispatch, RootState } from '../store/store'
import { addTvEvent } from '../store/gameSlice'
import { updateApproval } from '../publicOpinion/publicOpinionSlice'
import { createIncomingInteraction } from './incomingInteractionFactory'
import { isIncomingInteractionActionable } from './socialRuntimeConfig'
import {
  applyRealityRelationshipDelta,
  pushIncomingInteraction,
  recordSocialParticipation,
} from './socialSlice'
import {
  normalizeSocialParticipation,
  participationForDay,
  participationQuietStreak,
  backingTarget,
  visibilityTarget,
  PARTICIPATION_LIMITS,
  type ParticipationEffect,
} from './socialParticipation'

const active = (status: string) => !['evicted', 'jury'].includes(status)
const round = (value: number) => Math.round(value * 10) / 10
const approach = (previous: number, target: number) =>
  target < previous ? target : Math.min(target, previous + PARTICIPATION_LIMITS.recoveryPerDay)

/** The assessment runs once at a day boundary and persists only its own bounded contribution. */
export function processSocialParticipationDay(
  api: Pick<MiddlewareAPI, 'dispatch' | 'getState'>,
  snapshot: RootState
): void {
  const { game, social } = snapshot
  if (
    game.mode === 'survival' ||
    game.weekendInterlude?.active ||
    game.week < 1 ||
    game.awaitingTieBreak ||
    game.awaitingHumanVote
  )
    return
  const ledger = normalizeSocialParticipation(social.participation)
  const day = game.week
  if (ledger.processedDays.includes(day)) return
  const dispatch = api.dispatch as AppDispatch
  const getState = api.getState as () => RootState
  const players = game.players.filter((player) => active(player.status))
  for (const player of players) {
    const record = participationForDay(snapshot, player.id, day)
    // Day End and weekend conversations can happen after that day's first
    // assessment. Refresh only days we actually observed, preserving evidence
    // already retained if the general history has since been compacted.
    const observed = (ledger.recordsByActor[player.id] ?? []).map((previous) => {
      if (previous.day < day - 2 || previous.day >= day) return previous
      const latest = participationForDay(snapshot, player.id, previous.day)
      return {
        ...previous,
        credits: Math.max(previous.credits, latest.credits),
        contacts: [...new Set([...previous.contacts, ...latest.contacts])],
        visible: previous.visible || latest.visible,
        competitionWin: previous.competitionWin || latest.competitionWin,
      }
    })
    ledger.recordsByActor[player.id] = [...observed.filter((entry) => entry.day !== day), record]
      .sort((a, b) => a.day - b.day)
      .slice(-8)
  }
  for (const player of players) {
    if (player.id === game.pendingEviction?.evicteeId) continue
    const records = ledger.recordsByActor[player.id]
    const today = records.find((record) => record.day === day)!
    const quietStreak = participationQuietStreak(records, day)
    const previous: ParticipationEffect = ledger.effectsByActor[player.id] ?? {
      quietStreak: 0,
      backingByObserver: {},
      publicAdjustment: 0,
    }
    const effect: ParticipationEffect = {
      ...previous,
      quietStreak,
      backingByObserver: { ...previous.backingByObserver },
    }
    const target = backingTarget(day, quietStreak)
    const recentContacts = new Set(
      records.filter((record) => record.day >= day - 2).flatMap((record) => record.contacts)
    )
    const indebtedObservers = new Set(
      Object.entries(previous.backingByObserver)
        .filter(([, backing]) => backing.trust < 0 || backing.respect < 0)
        .map(([id]) => id)
    )
    let availableSlots = Math.max(0, PARTICIPATION_LIMITS.observers - indebtedObservers.size)
    const observers = players
      .filter((observer) => {
        if (observer.id === player.id || recentContacts.has(observer.id)) return false
        const seenDays = (ledger.recordsByActor[observer.id] ?? []).filter(
          (record) => record.day >= day - 2 && record.day <= day
        )
        if (seenDays.length < 3) return false
        const edge = social.reality.relationships[observer.id]?.[player.id]
        // A loyal bond is a viable quiet strategy, not evidence of neglect.
        return (edge?.trust ?? 0) < 35 && (edge?.loyalty ?? 0) < 40
      })
      .sort(
        (a, b) =>
          Number(Boolean(previous.backingByObserver[b.id])) -
            Number(Boolean(previous.backingByObserver[a.id])) ||
          (social.reality.relationships[a.id]?.[player.id]?.trust ?? 0) -
            (social.reality.relationships[b.id]?.[player.id]?.trust ?? 0) ||
          a.id.localeCompare(b.id)
      )
      .slice(0, PARTICIPATION_LIMITS.observers)
    const selected = new Set(
      target < 0
        ? observers
            .filter((observer) => {
              if (indebtedObservers.has(observer.id)) return true
              if (availableSlots <= 0) return false
              availableSlots--
              return true
            })
            .map((observer) => observer.id)
        : []
    )
    const meaningfulContacts = new Set(
      records
        .filter(
          (record) =>
            record.day >= day - 2 && record.credits >= PARTICIPATION_LIMITS.meaningfulCredits
        )
        .flatMap((record) => record.contacts)
    )
    for (const observerId of new Set([...Object.keys(previous.backingByObserver), ...selected])) {
      const prior = previous.backingByObserver[observerId] ?? { trust: 0, respect: 0 }
      const observerActive = players.some((observer) => observer.id === observerId)
      if (!observerActive && !today.visible) continue
      const canRecover = today.visible || meaningfulContacts.has(observerId)
      const trustTarget = selected.has(observerId) ? target : 0
      const respectTarget = selected.has(observerId) && !today.competitionWin ? target / 2 : 0
      const desiredTrust =
        trustTarget > prior.trust && !canRecover ? prior.trust : approach(prior.trust, trustTarget)
      const desiredRespect =
        respectTarget > prior.respect && !canRecover
          ? prior.respect
          : approach(prior.respect, respectTarget)
      const delta = {
        trust: round(desiredTrust - prior.trust),
        respect: round(desiredRespect - prior.respect),
      }
      if (!delta.trust && !delta.respect) continue
      const before = getState().social.reality.relationships[observerId]?.[player.id]
      const oldTrust = before?.trust ?? 0
      const oldRespect = before?.respect ?? 0
      dispatch(
        applyRealityRelationshipDelta({
          sourceId: observerId,
          targetId: player.id,
          day,
          phase: game.phase,
          eventId: `social-participation:${day}:${observerId}:${player.id}`,
          meaningful: false,
          deltas: { ...delta, familiarity: before?.familiarity ? 0 : 1 },
        })
      )
      const after = getState().social.reality.relationships[observerId]?.[player.id]
      effect.backingByObserver[observerId] = {
        trust: delta.trust > 0 ? desiredTrust : round(prior.trust + (after?.trust ?? 0) - oldTrust),
        respect:
          delta.respect > 0
            ? desiredRespect
            : round(prior.respect + (after?.respect ?? 0) - oldRespect),
      }
    }
    const publicEnabled = game.publicModeEnabled === true || game.voxPopuli?.status === 'active'
    const profile = getState().publicOpinion?.profiles[player.id]
    const publicTarget = publicEnabled
      ? visibilityTarget(day, quietStreak, today.visible, previous.publicAdjustment)
      : 0
    const publicDelta = round(publicTarget - previous.publicAdjustment)
    if (profile && publicDelta) {
      const before = profile.approval
      dispatch(
        updateApproval({
          playerId: player.id,
          delta: publicDelta,
          week: day,
          reason: publicDelta < 0 ? 'social_presence_quiet' : 'social_presence_recovery',
          eventType: 'social_presence',
          addToFeed: publicEnabled,
        })
      )
      const actual = round(
        (getState().publicOpinion.profiles[player.id]?.approval ?? before) - before
      )
      // At the floor, a clipped loss creates no recovery credit. At the ceiling,
      // consume recovery credit even if it cannot add points: never bank a free boost.
      effect.publicAdjustment =
        publicDelta > 0 ? publicTarget : round(previous.publicAdjustment + actual)
    }
    ledger.effectsByActor[player.id] = effect
  }

  const human = players.find(
    (player) => player.isUser && player.id !== game.pendingEviction?.evicteeId
  )
  if (
    human &&
    day > PARTICIPATION_LIMITS.graceDays &&
    (ledger.effectsByActor[human.id]?.quietStreak ?? 0) >= PARTICIPATION_LIMITS.quietDays &&
    day - (ledger.lastInvitationDay ?? -10) >= 3
  ) {
    const pending = social.incomingInteractions.filter(
      (entry) => !entry.resolved && isIncomingInteractionActionable(entry)
    )
    const source = players
      .filter(
        (player) =>
          !player.isUser &&
          player.id !== game.pendingEviction?.evicteeId &&
          !pending.some((entry) => entry.fromId === player.id)
      )
      .filter((player) => (social.relationships[player.id]?.[human.id]?.affinity ?? 0) >= 0)
      .sort(
        (a, b) =>
          (social.relationships[b.id]?.[human.id]?.affinity ?? 0) -
            (social.relationships[a.id]?.[human.id]?.affinity ?? 0) || a.id.localeCompare(b.id)
      )[0]
    if (source && pending.length < 4) {
      dispatch(
        pushIncomingInteraction(
          createIncomingInteraction({
            id: `social-engagement:${day}:${human.id}`,
            fromId: source.id,
            type: 'check_in',
            text: "We've barely compared notes lately. Want to talk about where we stand before the next power round? You don't need to promise a vote, and it's fine to keep playing quietly.",
            week: day,
            phase: game.phase,
            mode: game.dramaSocialMode ? 'drama' : 'normal',
            responsePolicy: 'optional',
            payload: {
              scenarioKey: 'social_engagement_check_in',
              source: 'social_participation',
              dedupeGroup: 'social_engagement_check_in',
            },
          })
        )
      )
      dispatch(
        addTvEvent({
          text: `${source.name} wants to compare notes. A brief reply in Incoming can reopen the conversation without promising a vote.`,
          type: 'social',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: {
            forceOnTv: true,
            broadcastLevel: 'minor',
            broadcastOrder: 50,
            socialInvitation: true,
            week: day,
          },
        })
      )
      ledger.lastInvitationDay = day
    }
  }
  ledger.processedDays = [...ledger.processedDays, day].slice(-64)
  dispatch(recordSocialParticipation(ledger))
}
