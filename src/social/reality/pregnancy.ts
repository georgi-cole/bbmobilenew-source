import type { RealityDomainState } from './types'

export type PregnancyAttemptStatus = 'PENDING' | 'NEGATIVE' | 'POSITIVE'
export type HumanPregnancyRoleChoice = 'Male' | 'Female' | 'disabled'

export interface PregnancyStoryState {
  attempts: PregnancyAttempt[]
  /**
   * Carrier id -> conception attempt id.
   *
   * This is intentionally written as soon as conception succeeds, before
   * anybody in the House knows. It is the hidden paternity lock: a later
   * attempt can create social uncertainty but can never overwrite the
   * biological father of an already-conceived pregnancy.
   */
  activePregnancies: Record<string, string>
  /**
   * Optional, season-local role selected only when a human with no stored sex
   * first enters the pregnancy storyline. "disabled" opts out for the season.
   */
  humanRoleChoice?: HumanPregnancyRoleChoice
}

export interface PregnancyAttempt {
  attemptId: string
  initiatorId: string
  partnerId: string
  participantIds: [string, string]
  carrierId: string
  /** Male participant attached to this conception attempt. */
  biologicalFatherId: string
  attemptDay: number
  /**
   * First conclusive in-game test day. Null means the attempt happened too
   * close to Final 3 to produce a result without interrupting finale gameplay.
   */
  resultAvailableDay: number | null
  /**
   * Real elapsed weekend days credited toward the pending result countdown.
   * Weekend interludes do not increment the numbered game day, so this keeps
   * pregnancy timing moving without touching the main competition calendar.
   */
  elapsedWeekendDays?: number
  /** Forecasted first Final 3 day used when the attempt was created. */
  finalThreeDay?: number | null
  /** True only for the attempt that actually locked conception. */
  pregnant: boolean
  resultKnown: boolean
  resultRevealedDay?: number
  positiveChance: number
  roll: number
  accepted: boolean
  announcementEmitted: boolean
  reactionsTriggered: boolean
  status: PregnancyAttemptStatus
  /** Public pregnancy reveal is deliberately later than the private test. */
  pregnancyPublicRevealDay?: number | null
  pregnancyPublicRevealed?: boolean
  /** Distinct men with attempts in the plausible conception window. */
  plausibleFatherIds?: string[]
  /** True after a private paternity test (or an obvious/public reveal). */
  paternityResultKnown?: boolean
  /** Public paternity reveal deadline. */
  paternityRevealDay?: number | null
  paternityPublicRevealed?: boolean
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
  action?: 'TRY_FOR_A_BABY' | 'PREGNANCY_TEST' | 'PREGNANCY_TEST_SELF' | 'PATERNITY_TEST_SELF'
  attemptId?: string
}

export interface PlayerLike {
  id: string
  name?: string
  status: string
  isUser?: boolean
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
  /** Planned first Final 3 day; used to compress the detection window. */
  finalThreeDay?: number | null
}

export interface PregnancyTestResult {
  attempt: PregnancyAttempt | null
  tooEarly: boolean
  availableDay?: number
  changed: boolean
  /** No conclusive result can be shown before Final 3 in this season. */
  conceptualOnly?: boolean
}

export type PregnancyStoryPublicEvent =
  | {
      kind: 'PREGNANCY_PUBLIC'
      attemptId: string
      carrierId: string
      fatherId: string | null
      plausibleFatherIds: string[]
    }
  | {
      kind: 'PATERNITY_PUBLIC'
      attemptId: string
      carrierId: string
      fatherId: string
      plausibleFatherIds: string[]
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

function explicitRole(player: PlayerLike): 'male' | 'female' | null {
  const sex = (player.sex ?? '').trim().toLowerCase()
  if (sex === 'female' || sex === 'woman' || sex.includes('female')) return 'female'
  if (sex === 'male' || sex === 'man' || sex.includes('male')) return 'male'
  return null
}

function roleOf(player: PlayerLike, story?: PregnancyStoryState): 'male' | 'female' | null {
  const explicit = explicitRole(player)
  if (explicit) return explicit
  if (!player.isUser) return null
  if (story?.humanRoleChoice === 'Female') return 'female'
  if (story?.humanRoleChoice === 'Male') return 'male'
  return null
}

export function getPregnancyCarrier(
  actor: PlayerLike,
  target: PlayerLike,
  story?: PregnancyStoryState
): string | null {
  // Adult Reality pregnancy is intentionally restricted to a canonical
  // male/female conception pairing. Unknown data never silently enables both.
  const actorRole = roleOf(actor, story)
  const targetRole = roleOf(target, story)
  if (actorRole === 'male' && targetRole === 'female') return target.id
  if (actorRole === 'female' && targetRole === 'male') return actor.id
  return null
}

function getFatherId(actor: PlayerLike, target: PlayerLike, carrierId: string): string {
  return actor.id === carrierId ? target.id : actor.id
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

export function getLatestCarrierAttempt(
  story: PregnancyStoryState,
  carrierId: string
): PregnancyAttempt | null {
  return (
    [...story.attempts]
      .filter((attempt) => attempt.carrierId === carrierId)
      .sort(
        (left, right) =>
          right.attemptDay - left.attemptDay || right.attemptId.localeCompare(left.attemptId)
      )[0] ?? null
  )
}

export function getActivePregnancyAttempt(
  story: PregnancyStoryState,
  carrierId: string
): PregnancyAttempt | null {
  const attemptId = story.activePregnancies[carrierId]
  return attemptId
    ? (story.attempts.find((attempt) => attempt.attemptId === attemptId) ?? null)
    : null
}

/**
 * Estimate the day on which Final 3 starts from the current live cast.
 * Standard seasons remove one contestant per day; the final reducer remains
 * the authoritative hard boundary and suppresses any late drama if a twist
 * accelerates the schedule.
 */
export function estimateFinalThreeDay(
  currentDay: number,
  activeHousemateCount: number,
  phase?: string
): number {
  const day = finiteDay(currentDay)
  if ((phase ?? '').startsWith('final3')) return day
  return day + Math.max(0, Math.floor(activeHousemateCount) - 3)
}

/**
 * Default detection is Day +5. If that would land on/after Final 3, compress
 * to +4, +3, then +2. Never compress below +2; when even +2 conflicts, the
 * pregnancy remains conceptual for the rest of that season.
 */
export function resolvePregnancyResultDay(
  attemptDay: number,
  finalThreeDay?: number | null
): number | null {
  const day = finiteDay(attemptDay)
  const finaleDay =
    finalThreeDay == null || !Number.isFinite(finalThreeDay) ? null : finiteDay(finalThreeDay)
  for (const offset of [5, 4, 3, 2]) {
    const candidate = day + offset
    if (finaleDay == null || candidate < finaleDay) return candidate
  }
  return null
}

export function getPregnancyEffectiveDay(attempt: PregnancyAttempt, currentDay: number): number {
  return finiteDay(currentDay) + Math.max(0, finiteDay(attempt.elapsedWeekendDays ?? 0))
}

export function isPregnancyResultAvailable(
  attempt: PregnancyAttempt,
  currentDay: number
): boolean {
  return (
    attempt.resultAvailableDay != null &&
    getPregnancyEffectiveDay(attempt, currentDay) >= attempt.resultAvailableDay
  )
}

export function advancePregnancyWeekendDay(story: PregnancyStoryState): PregnancyStoryState {
  let changed = false
  const attempts = story.attempts.map((attempt) => {
    if (attempt.status !== 'PENDING' || attempt.resultAvailableDay == null) return attempt
    changed = true
    return {
      ...attempt,
      elapsedWeekendDays: Math.max(0, finiteDay(attempt.elapsedWeekendDays ?? 0)) + 1,
    }
  })
  return changed ? { ...story, attempts } : story
}

function canPromptForHumanRole(
  actor: PlayerLike,
  target: PlayerLike,
  story: PregnancyStoryState
): boolean {
  return (
    actor.isUser === true &&
    !explicitRole(actor) &&
    story.humanRoleChoice === undefined &&
    roleOf(target, story) !== null
  )
}

function earliestTestDayForAttempt(attempt: PregnancyAttempt): number {
  return attempt.attemptDay + 1
}

export function getPregnancyEligibility(input: PregnancyEligibilityInput): {
  eligible: boolean
  reason: string
  carrierId?: string
  needsHumanRoleChoice?: boolean
} {
  const { actor, target, story, action = 'TRY_FOR_A_BABY' } = input

  if (story.humanRoleChoice === 'disabled' && actor.isUser) {
    return { eligible: false, reason: 'This storyline is disabled for this season.' }
  }

  if (action === 'PREGNANCY_TEST_SELF') {
    if (ageOf(actor) < 18) return { eligible: false, reason: 'This storyline is for adults only.' }
    if (roleOf(actor, story) !== 'female') {
      return { eligible: false, reason: 'Only the pregnancy carrier can take this test.' }
    }
    const latest = getLatestCarrierAttempt(story, actor.id)
    if (!latest) return { eligible: false, reason: 'There is no pregnancy attempt to test.' }
    if (finiteDay(input.currentDay) < earliestTestDayForAttempt(latest)) {
      return { eligible: false, reason: 'The pregnancy test becomes available tomorrow.' }
    }
    return { eligible: true, reason: '', carrierId: actor.id }
  }

  if (action === 'PATERNITY_TEST_SELF') {
    if (roleOf(actor, story) !== 'female') {
      return { eligible: false, reason: 'Only the pregnancy carrier can take this test.' }
    }
    const pregnancy = getActivePregnancyAttempt(story, actor.id)
    if (!pregnancy || !pregnancy.resultKnown || pregnancy.status !== 'POSITIVE') {
      return { eligible: false, reason: 'There is no confirmed pregnancy to test.' }
    }
    const plausible = pregnancy.plausibleFatherIds ?? [pregnancy.biologicalFatherId]
    if (plausible.length <= 1) {
      return { eligible: false, reason: 'Paternity is already clear.' }
    }
    if (!pregnancy.pregnancyPublicRevealed) {
      return { eligible: false, reason: 'Paternity testing opens after the pregnancy is public.' }
    }
    const opens =
      (pregnancy.pregnancyPublicRevealDay ?? pregnancy.resultRevealedDay ?? input.currentDay) + 1
    if (finiteDay(input.currentDay) < opens) {
      return { eligible: false, reason: 'The paternity test becomes available tomorrow.' }
    }
    if (pregnancy.paternityResultKnown) {
      return { eligible: false, reason: 'The paternity result is already known.' }
    }
    return { eligible: true, reason: '', carrierId: actor.id }
  }

  if (actor.id === target.id) return { eligible: false, reason: 'You cannot choose yourself.' }
  if (ageOf(actor) < 18 || ageOf(target) < 18) {
    return { eligible: false, reason: 'Both housemates must be 18 or older.' }
  }

  if (action !== 'PREGNANCY_TEST' && (!isInHouse(actor) || !isInHouse(target))) {
    return { eligible: false, reason: 'Both participants must still be in the House.' }
  }

  const carrierId = getPregnancyCarrier(actor, target, story)
  if (!carrierId) {
    if (action === 'TRY_FOR_A_BABY' && canPromptForHumanRole(actor, target, story)) {
      return {
        eligible: true,
        reason: '',
        needsHumanRoleChoice: true,
      }
    }
    return { eligible: false, reason: 'This pairing cannot begin a pregnancy attempt.' }
  }

  if (action === 'PREGNANCY_TEST') {
    const attempt = input.attemptId
      ? story.attempts.find((entry) => entry.attemptId === input.attemptId)
      : getLatestAttempt(story, actor.id, target.id)
    if (!attempt) return { eligible: false, reason: 'There is no pregnancy attempt to test.' }
    if (target.id !== attempt.carrierId || actor.id === attempt.carrierId) {
      return { eligible: false, reason: 'Select the pregnancy carrier to ask for a test.' }
    }
    if (finiteDay(input.currentDay) < earliestTestDayForAttempt(attempt)) {
      return { eligible: false, reason: 'The pregnancy test becomes available tomorrow.' }
    }
    return { eligible: true, reason: '', carrierId: attempt.carrierId }
  }

  if (!hasActiveRomance(input)) {
    return { eligible: false, reason: 'Try for a Baby requires an active romantic relationship.' }
  }

  const knownPregnancy = getActivePregnancyAttempt(story, carrierId)
  if (knownPregnancy?.resultKnown && knownPregnancy.status === 'POSITIVE') {
    return {
      eligible: false,
      reason: 'A confirmed pregnancy is already active for this carrier.',
    }
  }

  if (getUnresolvedAttempt(story, actor.id, target.id)) {
    return { eligible: false, reason: 'This couple already has an unresolved pregnancy attempt.' }
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

export function hasPublicPregnancyWithOtherPartner(
  story: PregnancyStoryState,
  playerId: string,
  prospectivePartnerId: string
): boolean {
  return Object.values(story.activePregnancies).some((attemptId) => {
    const attempt = story.attempts.find((entry) => entry.attemptId === attemptId)
    if (!attempt?.pregnancyPublicRevealed) return false
    if (attempt.biologicalFatherId === playerId) return attempt.carrierId !== prospectivePartnerId
    if (attempt.carrierId === playerId) return attempt.biologicalFatherId !== prospectivePartnerId
    return false
  })
}

/**
 * Consent is deliberately relationship-heavy without becoming a hard binary.
 * 75 is the normal threshold; below it agreement is uncommon but still
 * possible for impulsive/chaotic personalities. A publicly known pregnancy
 * with somebody else sharply reduces—but never absolutely eliminates—consent.
 */
export function shouldAcceptPregnancyAttempt(input: {
  target: PlayerLike
  relationshipScore: number
  seed: number
  day: number
  proposer?: PlayerLike
  story?: PregnancyStoryState
  prospectivePartnerId?: string
  publicOtherPregnancy?: boolean
}): boolean {
  const identity = input.target.aiGameIdentity
  const temperament = identity?.temperament ?? ''
  const archetype = identity?.archetype ?? ''
  const score = Math.max(-100, Math.min(100, input.relationshipScore))

  let chance =
    score < 60
      ? 0.02
      : score < 75
        ? 0.08
        : score < 85
          ? 0.44 + (score - 75) * 0.02
          : score < 95
            ? 0.68 + (score - 85) * 0.018
            : 0.88 + (score - 95) * 0.012

  if (archetype === 'romantic_loyalist') chance += 0.12
  if (archetype === 'loyal_anchor') chance += 0.08
  if (archetype === 'chaos_agent' || archetype === 'opportunist') chance += 0.06
  if (archetype === 'lone_wolf' || archetype === 'aggressive_competitor') chance -= 0.15
  if (temperament === 'emotional') chance += 0.05
  if (temperament === 'impulsive') chance += 0.08
  if (temperament === 'paranoid' || temperament === 'secretive') chance -= 0.12

  const publicOtherPregnancy =
    input.publicOtherPregnancy === true ||
    Boolean(
      input.story &&
      input.proposer &&
      input.prospectivePartnerId &&
      hasPublicPregnancyWithOtherPartner(input.story, input.proposer.id, input.prospectivePartnerId)
    )

  if (publicOtherPregnancy) {
    const highDrama =
      archetype === 'chaos_agent' || archetype === 'opportunist' || temperament === 'impulsive'
    const loyal = archetype === 'romantic_loyalist' || archetype === 'loyal_anchor'
    chance *= loyal ? 0.05 : highDrama ? 0.45 : 0.18
  }

  chance = Math.max(0.01, Math.min(0.97, chance))
  return (
    rollForAttempt([
      input.seed,
      input.target.id,
      input.proposer?.id ?? 'unknown-proposer',
      input.day,
      publicOtherPregnancy ? 'public-other-pregnancy' : 'clean-slate',
      'consent',
    ]) < chance
  )
}

export function startPregnancyAttempt(
  story: PregnancyStoryState,
  input: PregnancyAttemptStartInput
): { story: PregnancyStoryState; attempt: PregnancyAttempt | null; reason: string } {
  const eligibility = getPregnancyEligibility(input)
  if (!eligibility.eligible || !eligibility.carrierId) {
    return {
      story,
      attempt: null,
      reason: eligibility.needsHumanRoleChoice
        ? 'Choose how this pregnancy storyline applies to you first.'
        : eligibility.reason,
    }
  }

  const accepted = input.accepted !== false
  if (!accepted) {
    return { story, attempt: null, reason: 'They declined the idea of trying for a baby.' }
  }

  const attemptDay = finiteDay(input.currentDay)
  const attemptId =
    input.attemptId ??
    'pregnancy-' +
      attemptDay +
      '-' +
      input.actor.id +
      '-' +
      input.target.id +
      '-' +
      (story.attempts.length + 1)
  const carrier = input.actor.id === eligibility.carrierId ? input.actor : input.target
  const biologicalFatherId = getFatherId(input.actor, input.target, eligibility.carrierId)
  const positiveChance = ageOf(carrier) < 50 ? 0.5 : 0.01
  const roll = rollForAttempt([input.seed, attemptId, input.actor.id, input.target.id, attemptDay])
  const existingConceptionId = story.activePregnancies[eligibility.carrierId]
  const pregnant = !existingConceptionId && roll < positiveChance
  const finalThreeDay = input.finalThreeDay == null ? null : finiteDay(input.finalThreeDay)
  const resultAvailableDay = resolvePregnancyResultDay(attemptDay, finalThreeDay)

  const attempt: PregnancyAttempt = {
    attemptId,
    initiatorId: input.actor.id,
    partnerId: input.target.id,
    participantIds: [input.actor.id, input.target.id],
    carrierId: eligibility.carrierId,
    biologicalFatherId,
    attemptDay,
    resultAvailableDay,
    elapsedWeekendDays: 0,
    finalThreeDay,
    pregnant,
    resultKnown: false,
    positiveChance,
    roll,
    accepted: true,
    announcementEmitted: false,
    reactionsTriggered: false,
    pregnancyPublicRevealed: false,
    paternityResultKnown: false,
    paternityPublicRevealed: false,
    status: 'PENDING',
  }

  const activePregnancies = { ...story.activePregnancies }
  if (pregnant) activePregnancies[attempt.carrierId] = attempt.attemptId

  return {
    story: {
      ...story,
      attempts: [...story.attempts, attempt],
      activePregnancies,
    },
    attempt,
    reason:
      resultAvailableDay == null
        ? 'The attempt was accepted, but it is too close to Final 3 for a conclusive in-season result.'
        : 'The attempt was accepted. Testing opens tomorrow; a conclusive result is expected by Day ' +
          resultAvailableDay +
          '.',
  }
}

function plausibleFathersFor(
  story: PregnancyStoryState,
  pregnancy: PregnancyAttempt,
  revealDay: number
): string[] {
  const lowerBound = Math.max(0, pregnancy.attemptDay - 3)
  return Array.from(
    new Set(
      story.attempts
        .filter(
          (attempt) =>
            attempt.carrierId === pregnancy.carrierId &&
            attempt.attemptDay >= lowerBound &&
            attempt.attemptDay <= revealDay
        )
        .map((attempt) => attempt.biologicalFatherId)
        .filter(Boolean)
    )
  ).sort()
}

function clampPublicRevealDay(
  preferredDay: number,
  earliestDay: number,
  finalThreeDay?: number | null
): number | null {
  const finale =
    finalThreeDay == null || !Number.isFinite(finalThreeDay) ? null : finiteDay(finalThreeDay)
  if (finale == null) return Math.max(earliestDay, preferredDay)
  const latest = finale - 1
  if (latest < earliestDay) return null
  return Math.min(Math.max(earliestDay, preferredDay), latest)
}

export function revealPregnancyTest(
  story: PregnancyStoryState,
  input: { attemptId: string; currentDay: number }
): { story: PregnancyStoryState; result: PregnancyTestResult } {
  const requested = story.attempts.find((entry) => entry.attemptId === input.attemptId)
  if (!requested) return { story, result: { attempt: null, tooEarly: false, changed: false } }

  const locked = getActivePregnancyAttempt(story, requested.carrierId)
  const attempt = locked ?? getLatestCarrierAttempt(story, requested.carrierId) ?? requested
  const day = finiteDay(input.currentDay)
  const effectiveDay = getPregnancyEffectiveDay(attempt, day)

  if (attempt.resultAvailableDay == null && !attempt.resultKnown) {
    return {
      story,
      result: {
        attempt,
        tooEarly: true,
        changed: false,
        conceptualOnly: true,
      },
    }
  }

  if (
    attempt.resultAvailableDay != null &&
    effectiveDay < attempt.resultAvailableDay &&
    !attempt.resultKnown
  ) {
    return {
      story,
      result: {
        attempt,
        tooEarly: true,
        availableDay: Math.max(
          day,
          attempt.resultAvailableDay - Math.max(0, finiteDay(attempt.elapsedWeekendDays ?? 0))
        ),
        changed: false,
      },
    }
  }

  if (attempt.resultKnown) {
    return { story, result: { attempt, tooEarly: false, changed: false } }
  }

  const positive = Boolean(locked && locked.attemptId === attempt.attemptId && attempt.pregnant)
  const plausibleFatherIds = positive
    ? plausibleFathersFor(story, attempt, day)
    : [attempt.biologicalFatherId]
  const pregnancyPublicRevealDay = positive
    ? clampPublicRevealDay(day + 1, day, attempt.finalThreeDay)
    : null
  const paternityRevealDay =
    positive && plausibleFatherIds.length > 1 && pregnancyPublicRevealDay != null
      ? clampPublicRevealDay(
          pregnancyPublicRevealDay + 2,
          pregnancyPublicRevealDay,
          attempt.finalThreeDay
        )
      : pregnancyPublicRevealDay

  const resolved: PregnancyAttempt = {
    ...attempt,
    resultKnown: true,
    resultRevealedDay: day,
    status: positive ? 'POSITIVE' : 'NEGATIVE',
    plausibleFatherIds,
    pregnancyPublicRevealDay,
    paternityRevealDay,
    paternityResultKnown: positive && plausibleFatherIds.length <= 1,
  }

  const nextStory: PregnancyStoryState = {
    ...story,
    attempts: story.attempts.map((entry) =>
      entry.attemptId === resolved.attemptId ? resolved : entry
    ),
  }

  return {
    story: nextStory,
    result: { attempt: resolved, tooEarly: false, changed: true },
  }
}

export function revealPaternityResult(
  story: PregnancyStoryState,
  carrierId: string
): {
  story: PregnancyStoryState
  fatherId: string | null
  attempt: PregnancyAttempt | null
  changed: boolean
} {
  const pregnancy = getActivePregnancyAttempt(story, carrierId)
  if (!pregnancy || !pregnancy.resultKnown || pregnancy.status !== 'POSITIVE') {
    return { story, fatherId: null, attempt: pregnancy, changed: false }
  }
  if (pregnancy.paternityResultKnown) {
    return {
      story,
      fatherId: pregnancy.biologicalFatherId,
      attempt: pregnancy,
      changed: false,
    }
  }
  const updated = { ...pregnancy, paternityResultKnown: true }
  return {
    story: {
      ...story,
      attempts: story.attempts.map((entry) =>
        entry.attemptId === updated.attemptId ? updated : entry
      ),
    },
    fatherId: updated.biologicalFatherId,
    attempt: updated,
    changed: true,
  }
}

/**
 * Convert due private results into house-wide story beats. Callers must not
 * invoke this during Final 3; the game reducer owns that hard boundary.
 */
export function processPregnancyStoryDay(
  story: PregnancyStoryState,
  currentDay: number
): { story: PregnancyStoryState; events: PregnancyStoryPublicEvent[] } {
  const day = finiteDay(currentDay)
  const attempts = story.attempts.map((attempt) => ({ ...attempt }))
  const events: PregnancyStoryPublicEvent[] = []

  for (const attemptId of Object.values(story.activePregnancies)) {
    const index = attempts.findIndex((attempt) => attempt.attemptId === attemptId)
    if (index < 0) continue
    let pregnancy = attempts[index]
    if (!pregnancy.resultKnown || pregnancy.status !== 'POSITIVE') continue

    const plausibleFatherIds = pregnancy.plausibleFatherIds?.length
      ? [...pregnancy.plausibleFatherIds]
      : [pregnancy.biologicalFatherId]
    const ambiguous = plausibleFatherIds.length > 1

    if (
      !pregnancy.pregnancyPublicRevealed &&
      pregnancy.pregnancyPublicRevealDay != null &&
      day >= pregnancy.pregnancyPublicRevealDay
    ) {
      pregnancy = {
        ...pregnancy,
        pregnancyPublicRevealed: true,
        announcementEmitted: true,
        ...(ambiguous
          ? {}
          : {
              paternityResultKnown: true,
              paternityPublicRevealed: true,
            }),
      }
      attempts[index] = pregnancy
      events.push({
        kind: 'PREGNANCY_PUBLIC',
        attemptId: pregnancy.attemptId,
        carrierId: pregnancy.carrierId,
        fatherId: ambiguous ? null : pregnancy.biologicalFatherId,
        plausibleFatherIds,
      })
    }

    if (
      pregnancy.pregnancyPublicRevealed &&
      ambiguous &&
      !pregnancy.paternityPublicRevealed &&
      pregnancy.paternityRevealDay != null &&
      day >= pregnancy.paternityRevealDay
    ) {
      pregnancy = {
        ...pregnancy,
        paternityResultKnown: true,
        paternityPublicRevealed: true,
      }
      attempts[index] = pregnancy
      events.push({
        kind: 'PATERNITY_PUBLIC',
        attemptId: pregnancy.attemptId,
        carrierId: pregnancy.carrierId,
        fatherId: pregnancy.biologicalFatherId,
        plausibleFatherIds,
      })
    }
  }

  return { story: { ...story, attempts }, events }
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
              : { announcementEmitted: true, pregnancyPublicRevealed: true }),
          }
        : attempt
    ),
  }
}

export function normalizePregnancyStoryState(raw: unknown): PregnancyStoryState {
  if (!raw || typeof raw !== 'object') return createInitialPregnancyStoryState()
  const value = raw as Partial<PregnancyStoryState>
  const rawAttempts = Array.isArray(value.attempts)
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

  const attempts = rawAttempts.map((attempt) => {
    const participantIds = Array.isArray(attempt.participantIds)
      ? (attempt.participantIds.slice(0, 2) as [string, string])
      : ([attempt.initiatorId, attempt.partnerId] as [string, string])
    const biologicalFatherId =
      typeof attempt.biologicalFatherId === 'string'
        ? attempt.biologicalFatherId
        : (participantIds.find((id) => id !== attempt.carrierId) ?? attempt.partnerId)
    return {
      ...attempt,
      participantIds,
      biologicalFatherId,
      resultAvailableDay:
        attempt.resultAvailableDay == null || Number.isFinite(attempt.resultAvailableDay)
          ? attempt.resultAvailableDay
          : null,
      elapsedWeekendDays: Math.max(0, finiteDay(attempt.elapsedWeekendDays ?? 0)),
      pregnancyPublicRevealed:
        attempt.pregnancyPublicRevealed ?? attempt.announcementEmitted ?? false,
      paternityResultKnown: attempt.paternityResultKnown ?? false,
      paternityPublicRevealed: attempt.paternityPublicRevealed ?? false,
    } satisfies PregnancyAttempt
  })

  const activePregnancies: Record<string, string> = {}
  if (value.activePregnancies && typeof value.activePregnancies === 'object') {
    for (const [carrierId, attemptId] of Object.entries(value.activePregnancies)) {
      if (typeof carrierId === 'string' && typeof attemptId === 'string') {
        activePregnancies[carrierId] = attemptId
      }
    }
  }

  // Legacy saves did not lock conception until the test was revealed. Recover
  // the earliest successful attempt per carrier so paternity remains stable.
  for (const attempt of [...attempts].sort(
    (left, right) =>
      left.attemptDay - right.attemptDay || left.attemptId.localeCompare(right.attemptId)
  )) {
    if (attempt.pregnant && !activePregnancies[attempt.carrierId]) {
      activePregnancies[attempt.carrierId] = attempt.attemptId
    }
  }

  const humanRoleChoice =
    value.humanRoleChoice === 'Male' ||
    value.humanRoleChoice === 'Female' ||
    value.humanRoleChoice === 'disabled'
      ? value.humanRoleChoice
      : undefined

  return {
    attempts,
    activePregnancies,
    ...(humanRoleChoice ? { humanRoleChoice } : {}),
  }
}
