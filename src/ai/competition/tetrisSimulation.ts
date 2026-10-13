import { mulberry32 } from '../../store/rng'

export interface TetrisAiParticipantInput {
  id: string
  /** The competition AI's 0–100 predicted performance rating. */
  baselineScore?: number
}

export interface SimulateTetrisAiScoresArgs {
  seed: number
  participants: ReadonlyArray<TetrisAiParticipantInput>
  minScore: number
  maxScore: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hashString(value: string): number {
  let hash = 0x811c9dc5 >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * Generates independent, seeded scores calibrated to the game's full score
 * range. Ratings influence expected performance while round-to-round form keeps
 * the result uncertain. Score gaps are never enforced: competitors can finish
 * close together, and large heats do not collapse at an artificial score floor.
 */
export function simulateTetrisAiScores({
  seed,
  participants,
  minScore,
  maxScore,
}: SimulateTetrisAiScoresArgs): Record<string, number> {
  if (participants.length === 0) return {}

  const floor = Math.round(Math.min(minScore, maxScore))
  const ceiling = Math.round(Math.max(minScore, maxScore))
  const span = Math.max(1, ceiling - floor)
  const ordered = participants
    .map((participant) => {
      const rng = mulberry32(((seed >>> 0) ^ hashString(participant.id) ^ 0x7e7715) >>> 0)
      const rating = clamp((participant.baselineScore ?? 50) / 100, 0, 1)
      return { ...participant, form: rng() * 0.75 + rating * 0.25 }
    })
    .sort((a, b) => b.form - a.form || a.id.localeCompare(b.id))

  const scores: Record<string, number> = {}

  ordered.forEach((participant, rank) => {
    const position =
      participants.length === 1 ? 0.5 : (rank + 0.35) / (participants.length - 1 + 0.7)
    // About 60% -> 30% of the range before rating and form, avoiding an
    // automatic high-score tier in elimination heats. Individual skill shifts
    // the expected score even in a one-AI final.
    const rating = clamp((participant.baselineScore ?? 50) / 100, 0, 1)
    const expectedRatio = clamp(0.6 - position * 0.3 + (rating - 0.5) * 0.24, 0.18, 0.72)
    const rng = mulberry32(((seed >>> 0) ^ hashString(participant.id) ^ 0xf17e1e) >>> 0)
    const jitter = (rng() + rng() - 1) * span * 0.08
    const score = clamp(Math.round((floor + span * expectedRatio + jitter) / 5) * 5, floor, ceiling)
    scores[participant.id] = score
  })

  return scores
}
