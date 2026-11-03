import { strategicPreferencesEnabled } from './strategicPolicy'
import type { AiGameIdentity } from '../ai/aiGameIdentity'
import type { RealitySocialEvent } from './reality/types'
import type { StrategicPlanningRead } from './strategicPlanningContext'
import { getSocialExperienceRead, getSocialMotivePreferences } from './socialDecisionPreferences'
import { getSocialPersonality } from './socialPersonalityBank'
import type { SocialActionLogEntry, SocialMemoryMap } from './types'

const CONFLICT = new Set(['confront', 'public_callout', 'startFight'])
const CLASSIC_ONLY = new Set([
  'pitch_target',
  'suggest_replacement',
  'ask_hold_safety',
  'warn_about_danger',
  'ask_why_nominated',
  'ask_loh_target',
  'rally_votes_against',
  'nominate',
  'vote_rally',
])
const HARM = new Set(['betray', 'plant_lie', 'startFight', 'public_callout', 'confront'])

export interface StrategicSocialInput {
  actorId: string
  targetId: string
  actionId: string
  identity?: AiGameIdentity
  planning?: StrategicPlanningRead
  enabled?: boolean
  week: number
  recentActions?: readonly SocialActionLogEntry[]
  memory?: SocialMemoryMap
  events?: readonly RealitySocialEvent[]
}

/** Bounded preferences over already-eligible candidates, never an execution gate
 * for human actions or a forecast of actual public votes. Evidence is filtered
 * by observer before it can support a grievance or public credibility read. */
export function strategicSocialAdjustment(input: StrategicSocialInput) {
  const rules = input.planning?.rules
  if (input.enabled !== undefined && rules?.format === 'vox' && CLASSIC_ONLY.has(input.actionId))
    return { multiplier: 0, reason: 'NO_SUCH_POWER' }
  if (
    !input.enabled ||
    !strategicPreferencesEnabled() ||
    !rules ||
    !['classic', 'vox'].includes(rules.format)
  )
    return { multiplier: 1, reason: 'LEGACY_PREFERENCES' }
  const experience = getSocialExperienceRead(input.actorId, input.targetId, {
    recentActions: input.recentActions as SocialActionLogEntry[] | undefined,
    socialMemory: input.memory,
    week: input.week,
  })
  const known = (input.events ?? [])
    .slice(-64)
    .filter(
      (event) =>
        event.actorId === input.targetId &&
        event.day <= input.week &&
        event.day >= input.week - 3 &&
        event.outcome !== 'FAILURE' &&
        event.outcome !== 'IGNORED' &&
        (event.participantIds.includes(input.actorId) ||
          event.witnessIds.includes(input.actorId) ||
          event.visibility === 'HOUSE_PUBLIC' ||
          event.visibility === 'CEREMONY_PUBLIC')
    )
  const seen = known.filter(
    (event) =>
      HARM.has(event.actionId ?? '') || event.allianceCommitmentSnapshot?.status === 'BROKEN'
  )
  const nominationPressure =
    rules.format === 'classic' &&
    known.some(
      (event) =>
        event.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
        event.targetIds.includes(input.actorId) &&
        !event.tags.includes(`automatic_nominee:${input.actorId}`)
    )
  const personalHarm = seen.some((event) => event.targetIds.includes(input.actorId))
  const witnessedPublicHarm = seen.some(
    (event) =>
      (event.visibility === 'HOUSE_PUBLIC' || event.visibility === 'CEREMONY_PUBLIC') &&
      (['betray', 'plant_lie', 'startFight'].includes(event.actionId ?? '') ||
        event.allianceCommitmentSnapshot?.status === 'BROKEN')
  )
  const pressure = Math.max(experience.grievance, experience.humiliation, experience.betrayal)
  const motives = getSocialMotivePreferences(input.actorId, input.identity)
  const personality = getSocialPersonality(input.actorId)
  const targetHoldsPower =
    rules.powers.lohIds.includes(input.targetId) || rules.powers.safetyHolderId === input.targetId
  const survivalRisk = input.planning!.actor.nominated && targetHoldsPower
  let multiplier = 1,
    reason = 'INDIVIDUAL_PREFERENCES'
  if (CONFLICT.has(input.actionId)) {
    if (
      !personalHarm &&
      seen.length === 0 &&
      !witnessedPublicHarm &&
      !nominationPressure &&
      pressure < 0.12
    )
      return { multiplier: 0, reason: 'NO_GROUNDED_GRIEVANCE' }
    if (rules.format === 'classic' && survivalRisk) {
      multiplier *=
        0.55 + personality.assertiveness * 0.5 + motives.revenge * 0.25 - motives.fear * 0.18
      reason = 'POWER_AND_PERSONAL_GRIEVANCE'
    }
    if (rules.format === 'vox') {
      const focus = input.identity?.audienceFocus ?? 0.5
      multiplier *=
        input.actionId === 'startFight'
          ? 0.85 + personality.emotionalReactivity * 0.3 - focus * 0.18
          : input.actionId === 'public_callout'
            ? witnessedPublicHarm
              ? 1.1 + focus * 0.35
              : 0.65
            : 1.05 + personality.assertiveness * 0.2
      reason = witnessedPublicHarm
        ? 'WITNESSED_PUBLIC_CONDUCT'
        : 'PERSONAL_BOUNDARY_WITH_UNCERTAIN_PUBLIC_READ'
    }
  } else if (['compliment', 'reassure', 'whisper'].includes(input.actionId) && survivalRisk) {
    multiplier *= 1 + motives.fear * (rules.format === 'classic' ? 0.55 : 0.25)
    reason = 'DIPLOMACY_UNDER_CURRENT_PRESSURE'
  } else if (input.actionId === 'protect' || input.actionId === 'ride_or_die') {
    multiplier *= 1 + motives.loyalty * 0.18
    reason = 'PERSONAL_LOYALTY'
  }
  if (!Number.isFinite(multiplier)) return { multiplier: 1, reason: 'INVALID_PREFERENCE_FALLBACK' }
  return { multiplier: Math.max(0.2, Math.min(1.8, multiplier)), reason }
}
