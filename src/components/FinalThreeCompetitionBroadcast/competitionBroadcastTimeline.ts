import { COMPETITION_REPLAY_DURATION_MS } from './competitionBroadcastSimulation'

export type FinalThreeCompetitionPart = 1 | 2 | 3

export type CompetitionBroadcastStage =
  | 'establish'
  | 'lineup'
  | 'live'
  | 'lock'
  | 'verdict'
  | 'handoff'

export const FINAL_THREE_LIVE_START_MS = 5200
export const FINAL_THREE_BRAND_DURATION_MS = 3000

/** All beats follow active presentation time, including the simulated contest. */
export function competitionBroadcastTimings(
  part: FinalThreeCompetitionPart,
  simulationDurationMs?: number
) {
  const defaultDuration =
    part === 1
      ? COMPETITION_REPLAY_DURATION_MS.signal
      : part === 2
        ? COMPETITION_REPLAY_DURATION_MS.sequence
        : COMPETITION_REPLAY_DURATION_MS.memory
  const replayDuration =
    simulationDurationMs !== undefined &&
    Number.isFinite(simulationDurationMs) &&
    simulationDurationMs > 0
      ? simulationDurationMs
      : defaultDuration
  const lock = FINAL_THREE_LIVE_START_MS + replayDuration
  const verdict = lock + 1800
  const handoff = verdict + 5000
  return {
    lineup: 2800,
    live: FINAL_THREE_LIVE_START_MS,
    lock,
    verdict,
    handoff,
    end: handoff + FINAL_THREE_BRAND_DURATION_MS,
  }
}

export const FINAL_THREE_BROADCAST_TIMINGS = {
  1: competitionBroadcastTimings(1),
  2: competitionBroadcastTimings(2),
  3: competitionBroadcastTimings(3),
} as const

export function competitionBroadcastStageAt(
  part: FinalThreeCompetitionPart,
  elapsedMs: number,
  simulationDurationMs?: number
): CompetitionBroadcastStage {
  const timings = competitionBroadcastTimings(part, simulationDurationMs)
  const beats = Object.entries(timings).filter(([key]) => key !== 'end')
  let stage: CompetitionBroadcastStage = 'establish'
  for (const [key, start] of beats) {
    if (elapsedMs < start) break
    stage = key as CompetitionBroadcastStage
  }
  return stage
}

export function competitionBroadcastDuration(
  part: FinalThreeCompetitionPart,
  simulationDurationMs?: number
): number {
  return competitionBroadcastTimings(part, simulationDurationMs).end
}
