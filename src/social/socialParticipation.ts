import type { GameState } from '../types'
import type { SocialState, SocialActionLogEntry } from './types'

export interface ParticipationDay {
  day: number
  credits: number
  contacts: string[]
  visible: boolean
  competitionWin: boolean
}

export interface ParticipationEffect {
  quietStreak: number
  backingByObserver: Record<string, { trust: number; respect: number }>
  publicAdjustment: number
}

export interface SocialParticipationState {
  version: 1
  processedDays: number[]
  recordsByActor: Record<string, ParticipationDay[]>
  effectsByActor: Record<string, ParticipationEffect>
  lastInvitationDay?: number
}

export interface ParticipationContext {
  game: GameState
  social: SocialState
}

export const PARTICIPATION_LIMITS = {
  graceDays: 3,
  quietDays: 3,
  meaningfulCredits: 2,
  trustLoss: 6,
  respectLoss: 3,
  publicLoss: 4,
  recoveryPerDay: 2,
  observers: 2,
} as const

const ROUTINE = new Set([
  'compliment',
  'reassure',
  'whisper',
  'group_chat',
  'flirt',
  'build_quiet_bond',
  'share_personal_story',
  'ask_player_opinion',
  'ask_nomination_advice',
])
const SUBSTANTIVE = new Set([
  'proposeAlliance',
  'alliance_found',
  'alliance_admit',
  'protect',
  'pitch_target',
  'suggest_replacement',
  'ask_use_safety',
  'ask_safety_plan',
  'ask_hold_safety',
  'ask_loh_target',
  'rally_votes_against',
  'vote_rally',
  'share_intel',
  'trade_secrets',
  'warn_about_player',
  'warn_about_danger',
  'apologize',
  'repair_bond',
  'clear_the_air',
  'consult_alliance',
  'negotiate_facade',
  'ride_or_die',
  'public_callout',
  'confront',
  'set_boundary',
  'private_flirt',
  'late_night_talk',
  'go_public',
])
const PUBLIC = new Set(['HOUSE_PUBLIC', 'CEREMONY_PUBLIC'])

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const finite = (value: unknown, min: number, max: number) =>
  Math.max(min, Math.min(max, typeof value === 'number' && Number.isFinite(value) ? value : 0))

export function normalizeSocialParticipation(raw?: unknown): SocialParticipationState {
  const input = object(raw)
  const recordsByActor: SocialParticipationState['recordsByActor'] = {}
  for (const [id, records] of Object.entries(object(input.recordsByActor))) {
    if (!Array.isArray(records)) continue
    const valid = records
      .map(object)
      .filter((record) => Number.isInteger(record.day) && Number(record.day) > 0)
      .map((record) => ({
        day: Number(record.day),
        credits: finite(record.credits, 0, 2),
        contacts: Array.isArray(record.contacts)
          ? [
              ...new Set(record.contacts.filter((id): id is string => typeof id === 'string')),
            ].slice(0, 20)
          : [],
        visible: record.visible === true,
        competitionWin: record.competitionWin === true,
      }))
    recordsByActor[id] = [...new Map(valid.map((record) => [record.day, record])).values()]
      .sort((a, b) => a.day - b.day)
      .slice(-8)
  }
  const effectsByActor: SocialParticipationState['effectsByActor'] = {}
  for (const [id, rawEffect] of Object.entries(object(input.effectsByActor))) {
    const effect = object(rawEffect)
    effectsByActor[id] = {
      quietStreak: finite(effect.quietStreak, 0, 8),
      publicAdjustment: finite(effect.publicAdjustment, -4, 0),
      backingByObserver: Object.fromEntries(
        Object.entries(object(effect.backingByObserver)).map(([observer, rawBacking]) => {
          const backing = object(rawBacking)
          return [
            observer,
            { trust: finite(backing.trust, -6, 0), respect: finite(backing.respect, -3, 0) },
          ]
        })
      ),
    }
  }
  return {
    version: 1,
    recordsByActor,
    effectsByActor,
    processedDays: Array.isArray(input.processedDays)
      ? [
          ...new Set(
            input.processedDays.filter(
              (day): day is number => Number.isInteger(day) && Number(day) > 0
            )
          ),
        ]
          .sort((a, b) => a - b)
          .slice(-64)
      : [],
    ...(typeof input.lastInvitationDay === 'number' && Number.isFinite(input.lastInvitationDay)
      ? { lastInvitationDay: input.lastInvitationDay }
      : {}),
  }
}

function actionCredit(entry: SocialActionLogEntry): number {
  if (SUBSTANTIVE.has(entry.actionId)) return 2
  if (ROUTINE.has(entry.actionId)) return 1
  return 0
}

/** Real actions and replies, not opening the panel, spending money or passive story copy. */
export function participationForDay(
  state: ParticipationContext,
  actorId: string,
  day: number
): ParticipationDay {
  const contacts = new Set<string>()
  const evidence = new Map<string, number>()
  let visible = false
  const activeIds = new Set(state.game.players.map((player) => player.id))
  const add = (key: string, credits: number, others: readonly string[]) => {
    if (!credits) return
    evidence.set(key, Math.max(credits, evidence.get(key) ?? 0))
    for (const id of others) if (id !== actorId && activeIds.has(id)) contacts.add(id)
  }
  for (const entry of state.social.actionHistory ?? state.social.sessionLogs ?? []) {
    if (entry.actorId !== actorId || entry.week !== day) continue
    const credit = actionCredit(entry)
    const targets = entry.targetIds?.length ? entry.targetIds : [entry.targetId]
    add(
      `${entry.actionId}:${[...targets].sort().join(',')}:${entry.subjectId ?? ''}`,
      credit,
      targets
    )
    if (credit && PUBLIC.has(entry.visibility ?? '')) visible = true
  }
  const humanId = state.game.players.find((player) => player.isUser)?.id
  for (const interaction of state.social.incomingInteractions ?? []) {
    const scenario = String(interaction.payload?.scenarioKey ?? '')
    if (
      actorId === humanId &&
      interaction.resolutionOrigin === 'player' &&
      interaction.resolvedWeek === day &&
      interaction.resolved &&
      !['ignore', 'dismiss'].includes(interaction.resolvedWith ?? 'ignore')
    ) {
      const substantive =
        interaction.requiresResponse ||
        scenario === 'social_engagement_check_in' ||
        scenario.startsWith('relationship_')
      add(`reply:${interaction.fromId}:${scenario || interaction.type}`, substantive ? 2 : 1, [
        interaction.fromId,
      ])
    }
    if (
      actorId !== humanId &&
      interaction.fromId === actorId &&
      interaction.createdWeek === day &&
      interaction.resolutionOrigin !== 'invalidation'
    ) {
      const origin = String(interaction.payload?.originActionId ?? '')
      const credit =
        SUBSTANTIVE.has(origin) || interaction.requiresResponse ? 2 : ROUTINE.has(origin) ? 1 : 0
      add(`${origin || scenario}:${humanId}`, credit, humanId ? [humanId] : [])
    }
  }
  for (const promise of state.social.commitments ?? []) {
    if (promise.promisorId === actorId && promise.status === 'kept' && promise.resolvedWeek === day)
      add(`kept:${promise.id}`, 2, [promise.beneficiaryId])
  }
  for (const promise of Object.values(state.social.reality.promises)) {
    if (
      promise.promisorId === actorId &&
      promise.status === 'KEPT' &&
      promise.resolvedAt?.day === day
    )
      add(`kept:${promise.id}`, 2, promise.beneficiaryIds)
  }
  for (const event of state.social.reality.events) {
    if (
      event.day === day &&
      event.actorId === actorId &&
      ['ALLIANCE_REQUEST_CONSENT', 'ALLIANCE_REQUEST_VOTE', 'ALLIANCE_REQUEST_SUBMITTED'].includes(
        event.type
      )
    )
      add(`alliance:${event.allianceRequestId ?? event.id}`, 2, event.participantIds)
    if (
      event.day === day &&
      event.actorId === actorId &&
      event.publicEligible &&
      PUBLIC.has(event.visibility) &&
      !['FAILURE', 'IGNORED'].includes(event.outcome)
    )
      visible = true
  }
  const competitionWin =
    state.game.week === day && (state.game.lohId === actorId || state.game.posWinnerId === actorId)
  return {
    day,
    credits: Math.min(
      2,
      [...evidence.values()].reduce((sum, value) => sum + value, 0)
    ),
    contacts: [...contacts],
    visible: visible || competitionWin,
    competitionWin,
  }
}

export function participationQuietStreak(
  records: readonly ParticipationDay[],
  day: number
): number {
  const byDay = new Map(records.map((record) => [record.day, record]))
  let streak = 0
  for (let current = day; current > 0 && streak < 8; current--) {
    const record = byDay.get(current)
    // Unknown legacy history is not evidence of ignoring the module.
    if (!record || record.credits >= PARTICIPATION_LIMITS.meaningfulCredits) break
    streak++
  }
  return streak
}

export function backingTarget(day: number, quietStreak: number): number {
  if (day < 5 || quietStreak < PARTICIPATION_LIMITS.quietDays) return 0
  return -Math.min(PARTICIPATION_LIMITS.trustLoss, day - 4, quietStreak - 2)
}

export function visibilityTarget(
  day: number,
  quietStreak: number,
  visible: boolean,
  previous: number
): number {
  if (visible) return Math.min(0, previous + PARTICIPATION_LIMITS.recoveryPerDay)
  if (day < 5 || quietStreak < PARTICIPATION_LIMITS.quietDays) return previous
  return -Math.min(PARTICIPATION_LIMITS.publicLoss, day - 4, quietStreak - 2)
}
