import { useAppSelector } from '../../store/hooks'
import RequiredConfessionalDecision from '../../screens/DiaryRoom/RequiredConfessionalDecision'
import { getRequiredConfessionalPresentation } from '../../screens/DiaryRoom/requiredConfessionalPresentation'
import '../../screens/DiaryRoom/RequiredConfessionalSession.css'

/** Reuse the existing earned-power controls and canonical validation. */
export default function MissionCeremonyDecision() {
  const game = useAppSelector((state) => state.game)
  if (!game.missionPowers?.decision) return null
  const decision = { type: 'mission_power' as const, week: game.week, phase: game.phase }
  return (
    <div className="replacement-mission-panel required-confessional">
      <RequiredConfessionalDecision
        key={game.missionPowers.decision.id + game.missionPowers.decision.kind}
        decision={decision}
        presentation={getRequiredConfessionalPresentation(decision, game)}
        onDecisionCommitted={() => {}}
      />
    </div>
  )
}
