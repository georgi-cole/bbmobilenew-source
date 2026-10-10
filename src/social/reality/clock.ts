import { INCOMING_INTERACTION_PHASE_ORDER } from '../incomingInteractionPhases'
import type { RealityClock } from './types'

const ALIASES: Record<string, string> = {
  morning: 'week_start',
  loh_comp: 'loh_results',
  pos_ceremony: 'pos_ceremony_results',
  night: 'eviction_results',
}

export function compareSocialClock(left: RealityClock, right: RealityClock): number {
  if (left.day !== right.day) return left.day - right.day
  const index = (phase: string) => {
    const normalized = ALIASES[phase] ?? (phase.startsWith('weekend_day_') ? 'social_2' : phase)
    const found = (INCOMING_INTERACTION_PHASE_ORDER as readonly string[]).indexOf(normalized)
    return found < 0 ? INCOMING_INTERACTION_PHASE_ORDER.length : found
  }
  return (
    index(left.phase) - index(right.phase) ||
    (index(left.phase) === INCOMING_INTERACTION_PHASE_ORDER.length
      ? left.phase.localeCompare(right.phase)
      : 0)
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
