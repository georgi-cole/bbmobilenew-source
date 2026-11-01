export type FinalThreeCompetitionPart = 1 | 2 | 3

export type CompetitionBroadcastStage =
  | 'establish'
  | 'lineup'
  | 'signal'
  | 'sequence'
  | 'risk'
  | 'memory'
  | 'duel'
  | 'lock'
  | 'verdict'
  | 'handoff'

/** Active presentation time. Background tabs and interrupted ownership do not consume it. */
export const FINAL_THREE_BROADCAST_TIMINGS = {
  circuit: {
    lineup: 2800,
    signal: 5000,
    sequence: 9000,
    risk: 13000,
    lock: 17400,
    verdict: 19400,
    handoff: 24200,
    end: 25600,
  },
  memory: {
    lineup: 3000,
    memory: 5000,
    duel: 10000,
    lock: 15000,
    verdict: 17000,
    handoff: 22000,
    end: 23400,
  },
} as const

export function competitionBroadcastStageAt(
  part: FinalThreeCompetitionPart,
  elapsedMs: number
): CompetitionBroadcastStage {
  const timings =
    part === 3 ? FINAL_THREE_BROADCAST_TIMINGS.memory : FINAL_THREE_BROADCAST_TIMINGS.circuit
  const beats = Object.entries(timings).filter(([key]) => key !== 'end')
  let stage: CompetitionBroadcastStage = 'establish'
  for (const [key, start] of beats) {
    if (elapsedMs < start) break
    stage = key as CompetitionBroadcastStage
  }
  return stage
}

export function competitionBroadcastDuration(part: FinalThreeCompetitionPart): number {
  return part === 3
    ? FINAL_THREE_BROADCAST_TIMINGS.memory.end
    : FINAL_THREE_BROADCAST_TIMINGS.circuit.end
}
