/**
 * Compatibility surface for older callers. RequiredConfessionalDecision is the
 * sole decision renderer; this component deliberately contains no ceremony
 * rules, local eligibility checks, or reducer dispatches of its own.
 */

import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { useAppSelector } from '../../store/hooks'
import RequiredConfessionalDecision from './RequiredConfessionalDecision'
import { getRequiredConfessionalPresentation } from './requiredConfessionalPresentation'

interface Props {
  decision: ActiveConfessionalDecision
  onDecisionCommitted?: (summary: string) => void
}

export default function ConfessionalDecisionPanel({ decision, onDecisionCommitted }: Props) {
  const game = useAppSelector((state) => state.game)

  return (
    <RequiredConfessionalDecision
      decision={decision}
      presentation={getRequiredConfessionalPresentation(decision, game)}
      onDecisionCommitted={onDecisionCommitted ?? (() => undefined)}
    />
  )
}
