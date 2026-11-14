import { createPortal } from 'react-dom'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { getEffectiveSocialMode } from '../../social/socialMode'
import { openSocialPanel } from '../../social/socialSlice'
import SocialPanelV2 from '../../components/SocialPanelV2/SocialPanelV2'

/** Social opens over the pending decision; closing it returns to the same choice. */
export default function ConfessionalAllianceConsultation() {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => getEffectiveSocialMode(state) === 'drama')
  if (!enabled) return null
  return (
    <div className="rcd-decision-tools">
      <span>Before you decide</span>
      <button
        type="button"
        className="rcd-read-trigger"
        onClick={() => dispatch(openSocialPanel())}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.7" />
        </svg>
        <span>Open Social</span>
      </button>
      {createPortal(<SocialPanelV2 />, document.body)}
    </div>
  )
}
