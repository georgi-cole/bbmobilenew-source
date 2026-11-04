import type { GameState } from '../../types'
export interface CinematicCeremonyReturn {
  gameId: string
  week: number
  receiptCount: number
}
export function canResumeCinematicCeremony(
  context: CinematicCeremonyReturn | undefined,
  game: GameState,
  receiptCount: number,
  hasDecision: boolean
) {
  return Boolean(
    context &&
    context.gameId === (game.gameId ?? `season-${game.season}`) &&
    context.week === game.week &&
    game.phase === 'pos_ceremony_results' &&
    (receiptCount > context.receiptCount ||
      !hasDecision ||
      (game.missionPowers?.safetyIntent && !game.missionPowers.decision))
  )
}
