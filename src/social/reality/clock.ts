import { INCOMING_INTERACTION_PHASE_ORDER } from '../incomingInteractionPhases'
import type { RealityClock } from './types'

const ALIASES: Record<string, string> = {
  morning: 'week_start',
  night: 'eviction_results',
}

// Keep delivery checkpoints sparse without losing the order of playable phases between them.
const INTERVENING_PHASES: Record<string, readonly string[]> = {
  week_start: ['season_start'],
  loh_results: ['loh_comp_announcement', 'loh_comp', 'democracia_vote'],
  social_1: ['democracia_results'],
  pos_results: ['pre_veto_public_save', 'pos_comp_announcement', 'pos_comp'],
  pos_ceremony_results: ['pos_ceremony'],
  final3_comp1: ['week_end', 'final4_eviction', 'final3'],
  final3_comp2: ['final3_comp1_minigame'],
  final3_comp3: ['final3_comp2_minigame'],
  final3_decision: ['final3_comp3_minigame'],
}
const CLOCK_PHASES = [
  ...INCOMING_INTERACTION_PHASE_ORDER.flatMap((phase) => [
    ...(INTERVENING_PHASES[phase] ?? []),
    phase,
  ]),
  'jury_announcement',
  'jury_cinematic',
  'jury',
]

/** Weekend activities share regular social rules and keep their own history clock. */
export function getSocialRulesPhase(phase: string): string {
  return phase.startsWith('weekend_day_') ? 'social_2' : phase
}

export function compareSocialClock(left: RealityClock, right: RealityClock): number {
  if (left.day !== right.day) return left.day - right.day
  const index = (phase: string) => {
    const normalized = ALIASES[phase] ?? getSocialRulesPhase(phase)
    const found = CLOCK_PHASES.indexOf(normalized)
    return found < 0 ? CLOCK_PHASES.length : found
  }
  return (
    index(left.phase) - index(right.phase) ||
    (index(left.phase) === CLOCK_PHASES.length ? left.phase.localeCompare(right.phase) : 0)
  )
}

/** Each stage receives a complete subsequent social response window. */
export function nextAllianceDeadline(at: RealityClock): RealityClock {
  if (compareSocialClock(at, { day: at.day, phase: 'social_1' }) < 0)
    return { day: at.day, phase: 'social_1' }
  if (compareSocialClock(at, { day: at.day, phase: 'social_2' }) < 0)
    return { day: at.day, phase: 'social_2' }
  return { day: at.day + 1, phase: 'social_1' }
}
