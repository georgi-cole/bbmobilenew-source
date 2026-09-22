import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { useAppSelector } from '../../store/hooks'
import DiaryRoom from './DiaryRoom'
import RequiredConfessionalSession from './RequiredConfessionalSession'

export default function ConfessionalRoute() {
  const navigate = useNavigate()
  const activeDecision = useAppSelector(selectActiveConfessionalDecision)
  const [requiredSessionActive, setRequiredSessionActive] = useState(activeDecision !== null)

  const returnToGame = useCallback(
    (returnCue: string) => {
      setRequiredSessionActive(false)
      navigate('/game', {
        replace: true,
        state: {
          resumedFromConfessional: true,
          returnCue,
        },
      })
    },
    [navigate]
  )

  if (activeDecision !== null || requiredSessionActive) {
    return <RequiredConfessionalSession decision={activeDecision} onReturnToGame={returnToGame} />
  }

  return <DiaryRoom />
}
