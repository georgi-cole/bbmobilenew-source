import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  selectActiveConfessionalDecision,
  type ActiveConfessionalDecision,
} from '../../store/confessionalDecisionSelectors'
import { consumeBroadcastEvent } from '../../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import DiaryRoom from './DiaryRoom'
import { findConfessionalSourceBroadcast } from './confessionalBroadcastReceipt'
import RequiredConfessionalSession from './RequiredConfessionalSession'

export default function ConfessionalRoute() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeDecision = useAppSelector(selectActiveConfessionalDecision)
  const focusedDecision = activeDecision?.type === 'twin_shock' ? null : activeDecision
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const currentWeek = useAppSelector((state) => state.game.week)
  const [requiredSessionActive, setRequiredSessionActive] = useState(focusedDecision !== null)

  const returnToGame = useCallback(
    (returnCue: string, decisionType: ActiveConfessionalDecision['type'] | null) => {
      // Consume the exact prompt associated with the decision that was just
      // committed. Broadcast template metadata is authoritative; copy parsing
      // is retained only for legacy saves that pre-date structured templates.
      const sourcePrompt = findConfessionalSourceBroadcast(tvFeed, decisionType, currentWeek)
      if (sourcePrompt) dispatch(consumeBroadcastEvent(sourcePrompt.id))
      setRequiredSessionActive(false)
      navigate('/game', {
        replace: true,
        state: {
          resumedFromConfessional: true,
          returnCue,
        },
      })
    },
    [currentWeek, dispatch, navigate, tvFeed]
  )

  if (activeDecision?.type === 'twin_shock') {
    return <DiaryRoom />
  }

  if (requiredSessionActive) {
    return <RequiredConfessionalSession decision={focusedDecision} onReturnToGame={returnToGame} />
  }

  return <DiaryRoom />
}
