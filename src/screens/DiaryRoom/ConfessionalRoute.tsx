import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { consumeBroadcastEvent } from '../../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import DiaryRoom from './DiaryRoom'
import RequiredConfessionalSession from './RequiredConfessionalSession'

export default function ConfessionalRoute() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const activeDecision = useAppSelector(selectActiveConfessionalDecision)
  const focusedDecision = activeDecision?.type === 'twin_shock' ? null : activeDecision
  const tvFeed = useAppSelector((state) => state.game.tvFeed)
  const [requiredSessionActive, setRequiredSessionActive] = useState(focusedDecision !== null)

  const returnToGame = useCallback(
    (returnCue: string) => {
      // A required Confessional decision acknowledges the Faux-TV prompt that
      // opened it. Without this receipt the prompt survives the route change
      // and is selected again when the game screen remounts.
      const normalizedCue = returnCue.toLowerCase()
      const sourcePrompt = tvFeed.find((event) => {
        if (event.meta?.broadcastConsumed === true) return false
        const text = event.text.toLowerCase()
        if (normalizedCue.includes('halo exchange'))
          return text.includes('will you use halo exchange')
        if (normalizedCue.includes('double vote')) return text.includes('double vote')
        if (normalizedCue.includes('safety'))
          return text.includes('will you use') || text.includes('power of safety')
        return false
      })
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
    [dispatch, navigate, tvFeed]
  )

  if (activeDecision?.type === 'twin_shock') {
    return <DiaryRoom />
  }

  if (requiredSessionActive) {
    return <RequiredConfessionalSession decision={focusedDecision} onReturnToGame={returnToGame} />
  }

  return <DiaryRoom />
}
