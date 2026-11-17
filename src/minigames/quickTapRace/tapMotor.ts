import { mulberry32 } from '../../store/rng'
import type { CompetitionSkillProfile } from '../../ai/competition/types'

export interface TapMotor {
  fingers: 1 | 2 | 3
  tapsPerFingerPerSecond: number
  fatigueLoss: number
  jitter: number
}
/** These describe legal input patterns, not population percentiles. */
export const TAP_REFERENCE_MOTORS: Record<string, TapMotor> = {
  oneFinger: { fingers: 1, tapsPerFingerPerSecond: 6, fatigueLoss: 0.08, jitter: 0.08 },
  twoFinger: { fingers: 2, tapsPerFingerPerSecond: 6, fatigueLoss: 0.06, jitter: 0.08 },
  threeFinger: { fingers: 3, tapsPerFingerPerSecond: 6, fatigueLoss: 0.04, jitter: 0.08 },
  practiced: { fingers: 3, tapsPerFingerPerSecond: 7, fatigueLoss: 0.025, jitter: 0.05 },
}
function hash(value: string): number {
  let n = 0x811c9dc5
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619)
  return n >>> 0
}
/** Input style varies across contestants independently of the human's result. */
export function tapMotorForProfile(
  seed: number,
  playerId: string,
  profile: Partial<CompetitionSkillProfile> = {}
): TapMotor {
  const style = mulberry32(hash(`${playerId}:fingers`))() * 100
  const fingers = style < 20 ? 1 : style < 60 ? 2 : 3
  const random = mulberry32((seed ^ hash(`${playerId}:motor`)) >>> 0)
  const skill = Math.max(0, Math.min(1, (profile.physical ?? 50) / 100))
  const consistency = Math.max(0, Math.min(1, (profile.consistency ?? 50) / 100))
  return {
    fingers,
    tapsPerFingerPerSecond: (4.1 + skill * 3 + random() * 0.6) * (0.97 + random() * 0.06),
    fatigueLoss: 0.025 + (1 - consistency) * 0.08,
    jitter: 0.06 + (1 - consistency) * 0.12,
  }
}
export function tapMotorIntervalMs(
  motor: TapMotor,
  elapsedInRoundMs: number,
  roundMs: number,
  random: () => number
): number {
  const rate = motor.fingers * motor.tapsPerFingerPerSecond
  if (!Number.isFinite(rate) || rate <= 0)
    throw new Error('Tap motor requires a positive finite cadence')
  const fatigue = 1 + Math.max(0, Math.min(1, elapsedInRoundMs / roundMs)) * motor.fatigueLoss
  return Math.max(10, (1000 / rate) * fatigue * (1 + (random() - 0.5) * 2 * motor.jitter))
}
