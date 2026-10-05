import type { CircuitStageScores } from './finalThreeCircuitLogic'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function hashStringU32(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function centeredHumanNoise(random: () => number): number {
  // Three samples create a bell-ish distribution without allowing every AI run
  // to live at an extreme. The output is approximately -1..1 and clusters near 0.
  return ((random() + random() + random()) / 3 - 0.5) * 2
}

export function normalizeCircuitAiAbility(rawScore: number): number {
  if (!Number.isFinite(rawScore)) return 0.5

  // Minigame Lab passes generic 0-100 scores. Real challenge simulation can pass
  // the Circuit's native 150-285 range. In both cases this value is treated as
  // an ability signal, not as a final score that must be preserved exactly.
  if (rawScore <= 100) return clamp(rawScore / 100, 0, 1)
  return clamp((rawScore - 150) / 135, 0, 1)
}

function stageScore(
  meanLow: number,
  meanHigh: number,
  spread: number,
  floor: number,
  ceiling: number,
  ability: number,
  random: () => number,
  meanAdjustment: number
): number {
  const mean = meanLow + (meanHigh - meanLow) * ability + meanAdjustment
  let score = mean + centeredHumanNoise(random) * spread

  // Even strong humans occasionally make a material mistake. This prevents the
  // AI from feeling like a deterministic calculator while still rewarding skill.
  const errorChance = 0.2 - ability * 0.12
  if (random() < errorChance) {
    score -= 7 + random() * (10 + (1 - ability) * 7)
  }

  return Math.round(clamp(score, floor, ceiling))
}

/**
 * Produces human-like Final Three Circuit stage scores.
 *
 * The old implementation split one precomputed total across all three stages,
 * which made AI players look unnaturally consistent and often near-perfect.
 * The upstream competition simulator has already turned player skills and
 * season form into a score. Preserve that expected total while adding realistic
 * stage-to-stage strengths, mistakes, and deterministic run variance.
 */
export function simulateAiCircuitScores(
  rawAbilityScore: number,
  seed: number,
  playerId: string,
  part: 1 | 2 = 1
): CircuitStageScores {
  const ability = normalizeCircuitAiAbility(rawAbilityScore)
  const random = seededRandom((seed ^ hashStringU32(`circuit-human-ai:${playerId}`)) >>> 0)

  // Generic competition AI scores have already incorporated profile skills,
  // form, and intent. Treat that score as an expected Circuit total rather
  // than converting it to ability and scoring it a second time.
  const targetTotal =
    clamp(rawAbilityScore <= 100 ? 150 + rawAbilityScore * 1.35 : rawAbilityScore, 150, 285) *
    (part === 2 ? 0.94 : 1)
  const means = [52 + 34 * ability, 43 + 41 * ability, 39 + 40 * ability]
  const expectedError = 3 * (0.2 - ability * 0.12) * (12 + 3.5 * (1 - ability))
  const correction =
    (targetTotal - means.reduce((sum, score) => sum + score, 0) + expectedError) / 3

  // A finalist can favor one discipline over another. Keep these tendencies
  // centered so they affect the shape of the run without distorting its total.
  const tendencies = [random(), random(), random()].map((roll) => (roll - 0.5) * 10)
  const tendencyMean = tendencies.reduce((sum, value) => sum + value, 0) / tendencies.length
  const stageAdjustment = (index: number) => correction + tendencies[index] - tendencyMean

  const signal = stageScore(52, 86, 10, 28, 95, ability, random, stageAdjustment(0))
  const sequence = stageScore(43, 84, 14, 20, 96, ability, random, stageAdjustment(1))
  const risk = stageScore(39, 79, 13, 18, 94, ability, random, stageAdjustment(2))

  return [signal, sequence, risk]
}
