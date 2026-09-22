import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import type { GameState, Player } from '../../types'
import { getConfessionalPowerName } from './confessionalPowerName'
import { getRequiredConfessionalPresentation } from './requiredConfessionalPresentation'

export interface DecisionPresentation {
  key: string
  prompt: string
}

export { getConfessionalPowerName }

export function getConfessionalDecisionPresentation(
  decision: ActiveConfessionalDecision,
  game: GameState,
  _alivePlayers: Player[]
): DecisionPresentation {
  const presentation = getRequiredConfessionalPresentation(decision, game)
  return { key: presentation.key, prompt: presentation.prompt }
}
