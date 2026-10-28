import { getSocialPersonality } from './socialPersonalityBank'
import type { AiGameIdentity } from '../ai/aiGameIdentity'
import type { SocialActionLogEntry, SocialMemoryMap } from './types'

export interface SocialMotivePreferences {
  loyalty: number
  ambition: number
  fear: number
  affection: number
  revenge: number
}

export interface SocialExperienceRead {
  help: number
  grievance: number
  humiliation: number
  betrayal: number
}

const HARMFUL_ACTIONS = new Set([
  'betray',
  'break_alliance',
  'break_bromance',
  'confront',
  'expose_secret',
  'nominate',
  'plant_lie',
  'public_callout',
  'rumor',
  'startFight',
  'stir_rivalry',
])

const HUMILIATING_ACTIONS = new Set([
  'expose_secret',
  'plant_lie',
  'public_callout',
  'rumor',
  'startFight',
])

const INDIRECT_HARMFUL_ACTIONS = new Set(['expose_secret', 'plant_lie', 'rumor'])
const DIRECT_HUMILIATING_ACTIONS = new Set(['confront', 'public_callout', 'startFight'])

const SUPPORTIVE_ACTIONS = new Set([
  'ally',
  'protect',
  'reassure',
  'ride_or_die',
  'share_personal_story',
])

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

export function getSocialMotivePreferences(
  actorId: string,
  identity?: AiGameIdentity
): SocialMotivePreferences {
  const personality = getSocialPersonality(actorId)
  const base = {
    loyalty: personality.loyalty,
    ambition: personality.strategicCalculation * 0.65 + personality.assertiveness * 0.35,
    fear: (1 - personality.riskTolerance) * 0.65 + (1 - personality.assertiveness) * 0.35,
    affection: personality.warmth,
    revenge: personality.emotionalReactivity * 0.65 + (1 - personality.forgiveness) * 0.35,
  }
  if (!identity) {
    return {
      loyalty: clampUnit(base.loyalty),
      ambition: clampUnit(base.ambition),
      fear: clampUnit(base.fear),
      affection: clampUnit(base.affection),
      revenge: clampUnit(base.revenge),
    }
  }

  const archetypePrior: Record<keyof SocialMotivePreferences, number> = {
    loyalty: 0.5,
    ambition: 0.5,
    fear: 0.45,
    affection: 0.45,
    revenge: 0.45,
  }
  switch (identity.archetype) {
    case 'loyal_anchor':
    case 'romantic_loyalist':
      archetypePrior.loyalty = 0.92
      archetypePrior.ambition = 0.38
      archetypePrior.affection = 0.82
      archetypePrior.revenge = 0.3
      break
    case 'social_butterfly':
    case 'jury_artisan':
    case 'audience_darling':
      archetypePrior.loyalty = 0.72
      archetypePrior.affection = 0.88
      archetypePrior.fear = 0.38
      break
    case 'strategic_operator':
    case 'puppet_master':
    case 'media_strategist':
      archetypePrior.loyalty = 0.38
      archetypePrior.ambition = 0.9
      archetypePrior.fear = 0.32
      archetypePrior.affection = 0.42
      break
    case 'aggressive_competitor':
    case 'clutch_competitor':
      archetypePrior.ambition = 0.82
      archetypePrior.fear = 0.34
      archetypePrior.revenge = 0.55
      break
    case 'double_agent':
      archetypePrior.loyalty = 0.28
      archetypePrior.ambition = 0.82
      archetypePrior.revenge = 0.58
      break
    case 'chaos_agent':
      archetypePrior.loyalty = 0.25
      archetypePrior.ambition = 0.62
      archetypePrior.fear = 0.24
      archetypePrior.revenge = 0.82
      break
    case 'lone_wolf':
      archetypePrior.loyalty = 0.3
      archetypePrior.ambition = 0.68
      archetypePrior.affection = 0.32
      archetypePrior.fear = 0.4
      break
    case 'opportunist':
    case 'active_floater':
    case 'underdog_survivor':
    case 'audience_chameleon':
    case 'public_pleaser':
      archetypePrior.ambition = 0.64
      archetypePrior.fear = 0.52
      archetypePrior.affection = 0.58
      break
    case 'endurance_specialist':
    case 'physical_specialist':
    case 'puzzle_specialist':
    case 'adaptive_generalist':
      archetypePrior.ambition = 0.7
      archetypePrior.fear = 0.38
      break
    case 'risk_taker':
      archetypePrior.ambition = 0.72
      archetypePrior.fear = 0.18
      archetypePrior.revenge = 0.62
      break
    case 'pressure_choker':
      archetypePrior.ambition = 0.48
      archetypePrior.fear = 0.84
      archetypePrior.revenge = 0.42
      break
    case 'antihero':
      archetypePrior.loyalty = 0.42
      archetypePrior.ambition = 0.66
      archetypePrior.revenge = 0.68
      break
  }

  archetypePrior.ambition = clampUnit(
    archetypePrior.ambition * 0.7 + identity.competitionDrive * 0.3
  )
  if (identity.temperament === 'impulsive') {
    archetypePrior.revenge = clampUnit(archetypePrior.revenge + identity.emotionalVolatility * 0.2)
  } else if (identity.temperament === 'emotional') {
    archetypePrior.revenge = clampUnit(archetypePrior.revenge + identity.emotionalVolatility * 0.12)
    archetypePrior.affection = clampUnit(archetypePrior.affection + 0.06)
  } else if (identity.temperament === 'paranoid') {
    archetypePrior.fear = clampUnit(archetypePrior.fear + 0.2)
  } else if (identity.temperament === 'calm') {
    archetypePrior.revenge = clampUnit(archetypePrior.revenge * 0.7)
  }

  const identityWeight = 0.38
  return {
    loyalty: clampUnit(
      base.loyalty * (1 - identityWeight) + archetypePrior.loyalty * identityWeight
    ),
    ambition: clampUnit(
      base.ambition * (1 - identityWeight) + archetypePrior.ambition * identityWeight
    ),
    fear: clampUnit(base.fear * (1 - identityWeight) + archetypePrior.fear * identityWeight),
    affection: clampUnit(
      base.affection * (1 - identityWeight) + archetypePrior.affection * identityWeight
    ),
    revenge: clampUnit(
      base.revenge * (1 - identityWeight) + archetypePrior.revenge * identityWeight
    ),
  }
}

function eventAgeWeight(eventWeek: number | undefined, currentWeek: number | undefined): number {
  if (eventWeek === undefined || currentWeek === undefined) return 1
  const age = Math.max(0, currentWeek - eventWeek)
  if (age === 0) return 1
  if (age === 1) return 0.55
  if (age === 2) return 0.25
  return 0
}

const experienceEvents = new WeakMap<
  readonly SocialActionLogEntry[],
  Map<string, SocialActionLogEntry[]>
>()

function eventsByActor(
  events: readonly SocialActionLogEntry[],
  actorId: string
): readonly SocialActionLogEntry[] {
  if (!Object.isFrozen(events)) return events
  // Store snapshots are immutable. Mutable callers (including import/migration tools)
  // must never reuse an index after mutating their input.
  let index = Object.isFrozen(events) ? experienceEvents.get(events) : undefined
  if (!index) {
    index = new Map()
    for (const event of events) {
      const entries = index.get(event.actorId)
      if (entries) entries.push(event)
      else index.set(event.actorId, [event])
    }
    if (Object.isFrozen(events)) experienceEvents.set(events, index)
  }
  return index.get(actorId) ?? []
}

/** Reads only events the actor directly experienced or heard about themselves. */
export function getSocialExperienceRead(
  actorId: string,
  targetId: string,
  input: {
    recentActions?: readonly SocialActionLogEntry[]
    socialMemory?: SocialMemoryMap
    week?: number
  }
): SocialExperienceRead {
  const read: SocialExperienceRead = { help: 0, grievance: 0, humiliation: 0, betrayal: 0 }

  for (const event of eventsByActor(input.recentActions ?? [], targetId)) {
    const directTarget = event.targetId === actorId || event.targetIds?.includes(actorId) === true
    const namedAsSubject = event.subjectId === actorId
    if (event.actorId !== targetId || (!directTarget && !namedAsSubject)) continue

    const ageWeight = eventAgeWeight(event.week, input.week)
    if (ageWeight === 0) continue
    const actionId = event.actionId
    const personallyTargeted =
      namedAsSubject || (directTarget && !INDIRECT_HARMFUL_ACTIONS.has(actionId))
    if (SUPPORTIVE_ACTIONS.has(actionId) && event.outcome === 'success') {
      read.help += ageWeight
    }
    if (personallyTargeted && (HARMFUL_ACTIONS.has(actionId) || event.delta <= -4)) {
      read.grievance +=
        ageWeight * (actionId === 'betray' || actionId === 'break_alliance' ? 1 : 0.65)
    }
    if (
      HUMILIATING_ACTIONS.has(actionId) &&
      (namedAsSubject || (directTarget && DIRECT_HUMILIATING_ACTIONS.has(actionId)))
    ) {
      read.humiliation += ageWeight * (event.outcome === 'success' ? 1 : 0.45)
    }
    if (personallyTargeted && (actionId === 'betray' || actionId === 'break_alliance')) {
      read.betrayal += ageWeight
    }
  }

  const memory = input.socialMemory?.[actorId]?.[targetId]
  if (memory) {
    read.help += (Math.max(0, memory.gratitude) / 10) * 0.55
    read.help += (Math.max(0, memory.trustMomentum) / 6) * 0.3
    read.grievance += (Math.max(0, memory.resentment) / 10) * 0.65
    read.grievance += (Math.max(0, memory.neglect) / 10) * 0.25
    for (const event of memory.recentEvents) {
      const weight = eventAgeWeight(event.week, input.week)
      if (event.type.startsWith('accepted_') || event.type.startsWith('appreciated_')) {
        read.help += weight * 0.25
      }
      if (
        event.type.startsWith('rebuffed_') ||
        event.type.startsWith('declined_') ||
        event.type.startsWith('ignored_')
      ) {
        read.grievance += weight * 0.25
      }
    }
  }

  read.help = clampUnit(read.help)
  read.grievance = clampUnit(read.grievance)
  read.humiliation = clampUnit(read.humiliation)
  read.betrayal = clampUnit(read.betrayal)
  return read
}
