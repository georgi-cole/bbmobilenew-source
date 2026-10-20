import type { CompetitionSkillProfile } from '../../ai/competition/types'
import type { TiltLabyrinthRunDetails } from '../../features/tiltLabyrinth/tiltLabyrinthSlice'
import { calculateTiltAdjustedTime } from './tiltLabyrinthCollision'

/** Simulates a human-paced run with skill, pauses, mistakes, and fatigue. */
export function simulateTiltLabyrinthAiRun(
  profile: CompetitionSkillProfile,
  routeCells: number,
  rng: () => number
): TiltLabyrinthRunDetails {
  const navigationSkill =
    profile.mental * 0.35 +
    profile.precision * 0.4 +
    profile.nerve * 0.15 +
    profile.consistency * 0.1
  // A cell represents roughly one short, continuous steering segment in this
  // maze. Keep the baseline near measured player traversal speed and reserve
  // meaningful variance for navigation errors and hazards below.
  const movementMs = routeCells * (360 + (100 - navigationSkill) * 1.8)
  const hesitationMs = routeCells * (24 + (100 - profile.mental) * 0.35)
  const mistakes = Math.floor(rng() * 2 + (100 - profile.mental) / 35)
  let mistakeMs = 0
  for (let index = 0; index < mistakes; index += 1) mistakeMs += 8_000 + rng() * 12_000

  const hazardHits = Math.floor(rng() * (1 + (100 - profile.precision) / 18))
  const recoveryMs = hazardHits * (1_000 + rng() * 3_000)
  const fatigueMs = Math.max(0, routeCells - 30) * (18 + (100 - profile.consistency) * 0.25)
  const pauses = Math.floor(rng() * (1 + (100 - profile.nerve) / 60))
  let pauseMs = 0
  for (let index = 0; index < pauses; index += 1) pauseMs += 5_000 + rng() * 10_000

  const startAndGateHesitationMs = 5_000 + rng() * 10_000
  const confusionChance = 0.02 + profile.chokeRisk / 700
  const confusionMs = rng() < confusionChance ? 20_000 + rng() * 70_000 : 0
  const rawTimeMs = Math.max(
    15_000,
    Math.round(
      movementMs +
        hesitationMs +
        mistakeMs +
        recoveryMs +
        fatigueMs +
        pauseMs +
        startAndGateHesitationMs +
        confusionMs
    )
  )

  return {
    rawTimeMs,
    hazardHits,
    adjustedTimeMs: calculateTiltAdjustedTime(rawTimeMs, hazardHits),
  }
}
