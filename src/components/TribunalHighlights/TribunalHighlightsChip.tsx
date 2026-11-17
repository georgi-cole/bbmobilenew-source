import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { markTribunalHighlightsShortcutSeen, setTribunalViewingMode } from '../../store/gameSlice'
import {
  isTribunalHighlightsEligible,
  tribunalHighlightsEnabled,
  tribunalRequiresLiveShow,
} from '../../features/tribunal/tribunalHighlights'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { joinPublicAssetPath } from '../../utils/avatar'
import '../TopUtilityButton/TopUtilityButton.css'
import './TribunalHighlightsChip.css'

/** The full-show shortcut belongs to the audio utility row, outside the TV picture. */
export default function TribunalHighlightsChip() {
  const dispatch = useAppDispatch()
  const visible = useAppSelector(
    ({ game }) =>
      tribunalHighlightsEnabled() &&
      game.tribunalViewingMode === 'full' &&
      isTribunalHighlightsEligible(game) &&
      !tribunalRequiresLiveShow(game)
  )
  const seen = useAppSelector(({ game }) => game.tribunalHighlightsShortcutSeen === true)
  const animations = useAppSelector(({ settings }) => settings.gameUX.animations)
  const reduced = usePresentationReducedMotion()

  useEffect(() => {
    if (!visible || seen) return
    if (reduced || !animations) {
      dispatch(markTribunalHighlightsShortcutSeen())
      return
    }
    const timer = window.setTimeout(() => dispatch(markTribunalHighlightsShortcutSeen()), 1500)
    return () => window.clearTimeout(timer)
  }, [visible, seen, reduced, animations, dispatch])

  if (!visible) return null
  return (
    <button
      type="button"
      className={`top-utility-btn tribunal-highlights-chip${!seen && !reduced && animations ? ' tribunal-highlights-chip--discover' : ''}`}
      aria-label="Tribunal highlights"
      title="Return to Tribunal highlights"
      onClick={() => {
        dispatch(markTribunalHighlightsShortcutSeen())
        dispatch(setTribunalViewingMode('highlights'))
      }}
    >
      <img
        className="top-utility-btn__shell"
        src={joinPublicAssetPath('assets/control_dock/top_utility_shell.svg?v=precision-glass-3')}
        alt=""
        aria-hidden="true"
      />
      <img
        className="top-utility-btn__glyph"
        src={joinPublicAssetPath('assets/avatar_badges/tribunal_badge.svg')}
        alt=""
        aria-hidden="true"
      />
    </button>
  )
}
