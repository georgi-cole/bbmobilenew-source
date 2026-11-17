import { mulberry32 } from '../../store/rng'
import type { CompetitionSkillProfile } from '../../ai/competition/types'
import { PressurePlankEngine, type PlankAction, type PlankSnapshot } from './pressurePlankEngine'

export interface PlankController {
  reactionMs: number
  observationNoise: number
  predictionSeconds: number
  deadband: number
  lapseChance: number
  wrongDirectionChance: number
}
/** Engineering fixtures with explicit behaviours; not measured human cohorts. */
export const PLANK_REFERENCE_CONTROLLERS: Record<string, PlankController> = {
  weak: {
    reactionMs: 750,
    observationNoise: 10,
    predictionSeconds: 0.05,
    deadband: 6,
    lapseChance: 0.12,
    wrongDirectionChance: 0.06,
  },
  competent: {
    reactionMs: 330,
    observationNoise: 3,
    predictionSeconds: 0.3,
    deadband: 4,
    lapseChance: 0.035,
    wrongDirectionChance: 0.015,
  },
  strong: {
    reactionMs: 180,
    observationNoise: 1.5,
    predictionSeconds: 0.45,
    deadband: 3,
    lapseChance: 0.015,
    wrongDirectionChance: 0.005,
  },
  practiced: {
    reactionMs: 100,
    observationNoise: 0.5,
    predictionSeconds: 0.6,
    deadband: 2.5,
    lapseChance: 0.005,
    wrongDirectionChance: 0,
  },
}
function hash(text: string): number {
  let n = 0x811c9dc5
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619)
  return n >>> 0
}
const clamp = (n: number) => Math.max(0, Math.min(1, n))
export function plankControllerForProfile(
  playerId: string,
  profile: Partial<CompetitionSkillProfile> = {}
): PlankController {
  const skill = clamp(
    ((profile.precision ?? 50) * 0.45 +
      (profile.mental ?? 50) * 0.2 +
      (profile.nerve ?? 50) * 0.15 +
      (profile.consistency ?? 50) * 0.2) /
      100
  )
  const talent = mulberry32(hash(`${playerId}:balance`))()
  const ability = clamp(skill * 0.45 + talent * 0.55)
  // Interpolate declared action behaviours rather than inventing outcome buckets.
  const anchors = [
    { ability: 0, controller: PLANK_REFERENCE_CONTROLLERS.weak },
    { ability: 0.4, controller: PLANK_REFERENCE_CONTROLLERS.competent },
    { ability: 0.7, controller: PLANK_REFERENCE_CONTROLLERS.strong },
    { ability: 1, controller: PLANK_REFERENCE_CONTROLLERS.practiced },
  ]
  const upperIndex = Math.max(
    1,
    anchors.findIndex((anchor) => anchor.ability >= ability)
  )
  const lower = anchors[upperIndex - 1]
  const upper = anchors[upperIndex]
  const fraction = (ability - lower.ability) / (upper.ability - lower.ability)
  const mix = (trait: keyof PlankController) =>
    lower.controller[trait] + (upper.controller[trait] - lower.controller[trait]) * fraction
  return {
    reactionMs: mix('reactionMs'),
    observationNoise: mix('observationNoise'),
    predictionSeconds: mix('predictionSeconds'),
    deadband: mix('deadband'),
    lapseChance: mix('lapseChance'),
    wrongDirectionChance: mix('wrongDirectionChance'),
  }
}

export function simulatePressurePlankRun(args: {
  seed: number
  playerId: string
  profile?: Partial<CompetitionSkillProfile>
  controller?: PlankController
}): { score: number; actions: PlankAction[]; final: PlankSnapshot; controller: PlankController } {
  const { seed, playerId } = args
  const controller = args.controller ?? plankControllerForProfile(playerId, args.profile)
  const random = mulberry32((seed ^ hash(`${playerId}:decisions`)) >>> 0)
  const engine = new PressurePlankEngine(seed)
  const actions: PlankAction[] = []
  let atMs = 0
  let previousBalance = 0
  let previousAt = 0
  while (engine.snapshot().status === 'active' && atMs < 120_000) {
    const visible = engine.advance(atMs)
    if (visible.status !== 'active') break
    // Only the visible gauge and its observed motion inform the controller.
    // It does not receive hidden drift, RNG state, future surges or an answer score.
    const balance = Math.round(visible.balance) + (random() - 0.5) * 2 * controller.observationNoise
    const velocity =
      atMs > previousAt ? (balance - previousBalance) / ((atMs - previousAt) / 1000) : 0
    previousBalance = balance
    previousAt = atMs
    const prediction = balance + velocity * controller.predictionSeconds
    const delay = Math.max(50, Math.round(controller.reactionMs * (0.8 + random() * 0.4)))
    atMs = Math.min(120_000, atMs + delay)
    if (Math.abs(prediction) > controller.deadband && random() >= controller.lapseChance) {
      let direction: -1 | 1 = prediction > 0 ? -1 : 1
      if (random() < controller.wrongDirectionChance) direction = direction === 1 ? -1 : 1
      const before = engine.snapshot().taps
      const next = engine.tap(direction, atMs)
      if (next.taps > before) actions.push({ atMs, direction })
    } else engine.advance(atMs)
  }
  const final = engine.snapshot()
  return { score: final.elapsedMs / 1000, actions, final, controller }
}
