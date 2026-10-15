import { useCallback, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import {
  selectActiveConfessionalDecision,
  type ActiveConfessionalDecision,
} from '../../store/confessionalDecisionSelectors'
import { consumeBroadcastEvent, returnFromWeekendTribunalStream } from '../../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import DiaryRoom from './DiaryRoom'
import { findConfessionalSourceBroadcast } from './confessionalBroadcastReceipt'
import RequiredConfessionalSession from './RequiredConfessionalSession'
import FinaleTribunalStream from './FinaleTribunalStream'

export default function ConfessionalRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const dispatch = useAppDispatch()
  const activeDecision = useAppSelector(selectActiveConfessionalDecision)
  const focusedDecision = activeDecision?.type === 'twin_shock' ? null : activeDecision
  const focusedDecisionKey = focusedDecision
    ? `${focusedDecision.type}:${focusedDecision.week}:${focusedDecision.phase}`
    : null
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const currentWeek = useAppSelector((state) => state.game.week)
  const game = useAppSelector((state) => state.game)
  const finaleTribunalStream =
    searchParams.get('stream') === 'finale-tribunal' &&
    game.weekendInterlude?.active &&
    game.weekendInterlude.finaleWeekend &&
    ['tribunal_invitation', 'tribunal_glimpse', 'finale_battle_ready'].includes(
      game.weekendInterlude.stage
    )
      ? game.weekendInterlude.tribunalGlimpse
      : null
  const [requiredSessionActive, setRequiredSessionActive] = useState(focusedDecision !== null)
  const [previousDecisionKey, setPreviousDecisionKey] = useState(focusedDecisionKey)

  if (focusedDecisionKey !== previousDecisionKey) {
    setPreviousDecisionKey(focusedDecisionKey)
    if (focusedDecisionKey) setRequiredSessionActive(true)
  }

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

  const closeFinaleTribunalStream = useCallback(() => {
    const requestedReturn = (location.state as { returnTo?: unknown } | null)?.returnTo
    const returnPath =
      typeof requestedReturn === 'string' && requestedReturn.startsWith('/game')
        ? requestedReturn
        : '/game'
    dispatch(returnFromWeekendTribunalStream())
    navigate(returnPath, { replace: true })
  }, [dispatch, location.state, navigate])

  if (finaleTribunalStream && !activeDecision) {
    return (
      <FinaleTribunalStream
        speeches={finaleTribunalStream.speeches}
        players={game.players}
        onClose={closeFinaleTribunalStream}
      />
    )
  }

  if (activeDecision?.type === 'twin_shock') {
    return <DiaryRoom />
  }

  if (requiredSessionActive) {
    return <RequiredConfessionalSession decision={focusedDecision} onReturnToGame={returnToGame} />
  }

  return <DiaryRoom />
}
