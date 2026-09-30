import type { RealityDomainState } from './types'

export type PregnancyAttemptStatus = 'PENDING' | 'NEGATIVE' | 'POSITIVE'

export interface PregnancyStoryState {
  attempts: PregnancyAttempt[]
  /** Carrier id -> attempt id. A carrier can have only one active pregnancy. */
  activePregnancies: Record<string, string>
}

export interface PregnancyAttempt {
  attemptId: string
  initiatorId: string
  partnerId: string
  participantIds: [string, string]
  carrierId: string
  attemptDay: number
  resultAvailableDay: number
  /** The outcome is recorded at attempt time and never re-rolled. */
  pregnant: boolean
  resultKnown: boolean
  resultRevealedDay?: number
  positiveChance: number
  roll: number
  accepted: boolean
  announcementEmitted: boolean
  reactionsTriggered: boolean
  status: PregnancyAttemptStatus
}

export interface PregnancyEligibilityInput {
  actor: PlayerLike
  target: PlayerLike
  currentDay: number
  story: PregnancyStoryState
  /** Canonical Reality romance state, when available. */
  reality?: RealityDomainState
  /** Compatibility hook for callers that already resolved the story arc. */
  romanceActive?: boolean
  relationshipScore?: number
  action?: 'TRY_FOR_A_BABY' | 'PREGNANCY_TEST'
  attemptId?: string
}

export interface PlayerLike {
  id: string
  name?: string
  status: string
  age?: number
  sex?: string
  reproductiveProfile?: {
    canBecomePregnant?: boolean
    canCausePregnancy?: boolean
  }
  aiGameIdentity?: { archetype?: string; temperament?: string }
}

export interface PregnancyAttemptStartInput extends PregnancyEligibilityInput {
  seed: number
  accepted?: boolean
  attemptId?: string
}

export interface PregnancyTestResult {
  attempt: PregnancyAttempt | null
  tooEarly: boolean
  availableDay?: number
  changed: boolean
}

export function createInitialPregnancyStoryState(): PregnancyStoryState {
  return { attempts: [], activePregnancies: {} }
}

function finiteDay(day: number): number {
  return Number.isFinite(day) ? Math.max(0, Math.floor(day)) : 0
}

function isInHouse(player: PlayerLike | undefined): boolean {
  return Boolean(player && player.status !== 'evicted' && player.status !== 'jury')
}

function ageOf(player: PlayerLike): number {
  return Number.isFinite(player.age) ? Number(player.age) : 0
}

export function getPregnancyCarrier(actor: PlayerLike, target: PlayerLike): string | null {
  // Reality's 18+ storyline is intentionally restricted to a male/female
  // pairing.  Do not infer reproductive roles from an absent/legacy profile:
  // unknown sex must not make both contestants eligible by default.
  const role = (player: PlayerLike): 'male' | 'female' | null => {
    const sex = (player.sex ?? '').trim().toLowerCase()
    if (sex === 'female' || sex === 'woman' || sex.includes('female')) return 'female'
    if (sex === 'male' || sex === 'man' || sex.includes('male')) return 'male'
    return null
  }
  const actorRole = role(actor)
  const targetRole = role(target)
  if (actorRole === 'male' && targetRole === 'female') return target.id
  if (actorRole === 'female' && targetRole === 'male') return actor.id
  return null
}

function hasActiveRomance(input: PregnancyEligibilityInput): boolean {
  if (input.romanceActive === true) return true
  if (!input.reality) return false
  return Object.values(input.reality.romances ?? {}).some(
    (romance) =>
      ['MUTUAL', 'ACTIVE', 'STRAINED'].includes(romance.status) &&
      romance.participantIds.includes(input.actor.id) &&
      romance.participantIds.includes(input.target.id)
  )
}

function sameCouple(attempt: PregnancyAttempt, actorId: string, targetId: string): boolean {
  return attempt.participantIds.includes(actorId) && attempt.participantIds.includes(targetId)
}

export function getUnresolvedAttempt(
  story: PregnancyStoryState,
  actorId: string,
  targetId: string
): PregnancyAttempt | null {
  return (
    story.attempts.find(
      (attempt) => attempt.status === 'PENDING' && sameCouple(attempt, actorId, targetId)
    ) ?? null
  )
}

export function getLatestAttempt(
  story: PregnancyStoryState,
  actorId: string,
  targetId: string
): PregnancyAttempt | null {
  return (
    [...story.attempts]
      .filter((attempt) => sameCouple(attempt, actorId, targetId))
      .sort(
        (left, right) =>
          right.attemptDay - left.attemptDay || right.attemptId.localeCompare(left.attemptId)
      )[0] ?? null
  )
}

export function getPregnancyEligibility(input: PregnancyEligibilityInput): {
  eligible: boolean
  reason: string
  carrierId?: string
} {
  const { actor, target, story, action = 'TRY_FOR_A_BABY' } = input
  if (actor.id === target.id) return { eligible: false, reason: 'You cannot choose yourself.' }
  if (ageOf(actor) < 18 || ageOf(target) < 18) {
    return { eligible: false, reason: 'Both housemates must be 18 or older.' }
  }
  if (action !== 'PREGNANCY_TEST' && (!isInHouse(actor) || !isInHouse(target))) {
    return { eligible: false, reason: 'Both participants must still be in the House.' }
  }
  const carrierId = getPregnancyCarrier(actor, target)
  if (!carrierId) {
    return { eligible: false, reason: 'This pairing cannot begin a pregnancy attempt.' }
  }
  if (action === 'PREGNANCY_TEST') {
    const attempt = input.attemptId
      ? story.attempts.find((entry) => entry.attemptId === input.attemptId)
      : getLatestAttempt(story, actor.id, target.id)
    if (!attempt) return { eligible: false, reason: 'There is no pregnancy attempt to test.' }
    return { eligible: true, reason: '', carrierId: attempt.carrierId }
  }
  if (!hasActiveRomance(input)) {
    return { eligible: false, reason: 'Try for a Baby requires an active romantic relationship.' }
  }
  if (story.activePregnancies[carrierId]) {
    return {
      eligible: false,
      reason: 'An active pregnancy is already attached to this relationship.',
    }
  }
  if (getUnresolvedAttempt(story, actor.id, target.id)) {
    return { eligible: false, reason: 'The current pregnancy attempt is not ready yet.' }
  }
  return { eligible: true, reason: '', carrierId }
}

function hashSeed(parts: readonly unknown[]): number {
  let hash = 0x811c9dc5
  for (const part of parts.join('|')) {
    hash ^= part.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function rollForAttempt(parts: readonly unknown[]): number {
  let value = hashSeed(parts)
  value = (Math.imul(value ^ (value >>> 16), 0x45d9f3b) + 0x9e3779b9) >>> 0
  return value / 0x1_0000_0000
}

/** Return true when the target AI consents to the attempt. */
export function shouldAcceptPregnancyAttempt(input: {
  target: PlayerLike
  relationshipScore: number
  seed: number
  day: number
}): boolean {
  const identity = input.target.aiGameIdentity
  const temperament = identity?.temperament
  const archetype = identity?.archetype
  let chance = 0.5 + Math.max(-0.25, Math.min(0.25, input.relationshipScore / 200))
  if (archetype === 'romantic_loyalist' || archetype === 'loyal_anchor') chance += 0.2
  if (archetype === 'lone_wolf' || archetype === 'aggressive_competitor') chance -= 0.15
  if (temperament === 'emotional' || temperament === 'impulsive') chance += 0.08
  if (temperament === 'paranoid' || temperament === 'secretive') chance -= 0.12
  return (
    rollForAttempt([input.seed, input.target.id, input.day, 'consent']) <
    Math.max(0.05, Math.min(0.95, chance))
  )
}

export function startPregnancyAttempt(
  story: PregnancyStoryState,
  input: PregnancyAttemptStartInput
): { story: PregnancyStoryState; attempt: PregnancyAttempt | null; reason: string } {
  const eligibility = getPregnancyEligibility(input)
  if (!eligibility.eligible || !eligibility.carrierId) {
    return { story, attempt: null, reason: eligibility.reason }
  }
  const accepted = input.accepted !== false
  if (!accepted)
    return { story, attempt: null, reason: 'They declined the idea of trying for a baby.' }
  const attemptDay = finiteDay(input.currentDay)
  const attemptId =
    input.attemptId ??
    `pregnancy-${attemptDay}-${input.actor.id}-${input.target.id}-${story.attempts.length + 1}`
  const carrier = input.actor.id === eligibility.carrierId ? input.actor : input.target
  // Deliberately counterintuitive design rule: the carrier's age, not the
  // relationship score, determines the chance of pregnancy.
  const positiveChance = ageOf(carrier) < 50 ? 0.5 : 0.01
  const roll = rollForAttempt([input.seed, attemptId, input.actor.id, input.target.id, attemptDay])
  const attempt: PregnancyAttempt = {
    attemptId,
    initiatorId: input.actor.id,
    partnerId: input.target.id,
    participantIds: [input.actor.id, input.target.id],
    carrierId: eligibility.carrierId,
    attemptDay,
    resultAvailableDay: attemptDay + 5,
    pregnant: roll < positiveChance,
    resultKnown: false,
    positiveChance,
    roll,
    accepted: true,
    announcementEmitted: false,
    reactionsTriggered: false,
    status: 'PENDING',
  }
  return {
    story: { ...story, attempts: [...story.attempts, attempt] },
    attempt,
    reason: 'The attempt was accepted and the result will be available in five days.',
  }
}

export function revealPregnancyTest(
  story: PregnancyStoryState,
  input: { attemptId: string; currentDay: number }
): { story: PregnancyStoryState; result: PregnancyTestResult } {
  const attempt = story.attempts.find((entry) => entry.attemptId === input.attemptId)
  if (!attempt) return { story, result: { attempt: null, tooEarly: false, changed: false } }
  if (finiteDay(input.currentDay) < attempt.resultAvailableDay && !attempt.resultKnown) {
    return {
      story,
      result: { attempt, tooEarly: true, availableDay: attempt.resultAvailableDay, changed: false },
    }
  }
  if (attempt.resultKnown) return { story, result: { attempt, tooEarly: false, changed: false } }
  const resolved: PregnancyAttempt = {
    ...attempt,
    resultKnown: true,
    resultRevealedDay: finiteDay(input.currentDay),
    status: attempt.pregnant ? 'POSITIVE' : 'NEGATIVE',
  }
  const activePregnancies = { ...story.activePregnancies }
  if (resolved.pregnant) activePregnancies[resolved.carrierId] = resolved.attemptId
  const nextStory = {
    ...story,
    attempts: story.attempts.map((entry) =>
      entry.attemptId === resolved.attemptId ? resolved : entry
    ),
    activePregnancies,
  }
  return { story: nextStory, result: { attempt: resolved, tooEarly: false, changed: true } }
}

export function markPregnancyReactions(
  story: PregnancyStoryState,
  attemptId: string,
  kind: 'reactions' | 'announcement'
): PregnancyStoryState {
  return {
    ...story,
    attempts: story.attempts.map((attempt) =>
      attempt.attemptId === attemptId
        ? {
            ...attempt,
            ...(kind === 'reactions'
              ? { reactionsTriggered: true }
              : { announcementEmitted: true }),
          }
        : attempt
    ),
  }
}

export function normalizePregnancyStoryState(raw: unknown): PregnancyStoryState {
  if (!raw || typeof raw !== 'object') return createInitialPregnancyStoryState()
  const value = raw as Partial<PregnancyStoryState>
  const attempts = Array.isArray(value.attempts)
    ? value.attempts.filter((entry): entry is PregnancyAttempt => {
        if (!entry || typeof entry !== 'object') return false
        const candidate = entry as Partial<PregnancyAttempt>
        return (
          typeof candidate.attemptId === 'string' &&
          typeof candidate.initiatorId === 'string' &&
          typeof candidate.partnerId === 'string' &&
          typeof candidate.carrierId === 'string'
        )
      })
    : []
  const activePregnancies =
    value.activePregnancies && typeof value.activePregnancies === 'object'
      ? Object.fromEntries(
          Object.entries(value.activePregnancies).filter(
            ([carrierId, attemptId]) =>
              typeof carrierId === 'string' && typeof attemptId === 'string'
          )
        )
      : {}
  return { attempts, activePregnancies }
}
