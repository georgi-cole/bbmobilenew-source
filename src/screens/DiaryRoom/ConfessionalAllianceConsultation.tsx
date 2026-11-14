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
    <>
      <button
        type="button"
        className="rcd-read-trigger"
        onClick={() => dispatch(openSocialPanel())}
      >
        Open Social before you decide
      </button>
      {createPortal(<SocialPanelV2 />, document.body)}
    </>
  )
}
