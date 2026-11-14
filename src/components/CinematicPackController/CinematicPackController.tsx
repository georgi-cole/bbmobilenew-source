import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { selectIsVipActive } from '../../store/vipSlice'
import { setGameUX } from '../../store/settingsSlice'
import { VIP_CINEMATIC_PACK } from '../../cinematic/media/vipCinematicPack'
import {
  cinematicPackDownloads,
  supportsCinematicDownloads,
  useCinematicPackDownload,
} from '../../cinematic/media/cinematicPackDownloads'
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal'
import '../ConfirmExitModal/ConfirmExitModal.css'

export default function CinematicPackController({ hash }: { hash: string }) {
  const dispatch = useAppDispatch()
  const vip = useAppSelector(selectIsVipActive)
  const state = useCinematicPackDownload()
  const open = state.prompt > 0
  const supported = supportsCinematicDownloads()
  const busy = state.status === 'downloading' || state.status === 'verifying'
  const shouldOffer =
    supported &&
    vip &&
    state.status === 'available' &&
    state.choice == null &&
    !open &&
    !/^#\/game(?:[/?]|$)/.test(hash)

  useEffect(() => {
    if (supported) void cinematicPackDownloads.initialize()
  }, [supported])

  useEffect(() => {
    if (shouldOffer) cinematicPackDownloads.request()
  }, [shouldOffer])

  useEffect(() => {
    if (supported && vip && open && state.status !== 'ready') {
      dispatch(setGameUX({ animationMode: 'standard' }))
    }
  }, [dispatch, open, state.status, supported, vip])

  const keepStandard = () => {
    cinematicPackDownloads.choose('standard')
    dispatch(setGameUX({ animationMode: 'standard' }))
    cinematicPackDownloads.dismiss()
  }
  const enable = async () => {
    const success = state.status === 'ready' || (await cinematicPackDownloads.download())
    if (success) {
      cinematicPackDownloads.choose('cinematic')
      dispatch(setGameUX({ animationMode: 'cinematic' }))
      cinematicPackDownloads.dismiss()
    }
  }
  if (!supported || !vip || !open) return null
  if (busy)
    return createPortal(
      <div
        className="confirm-modal__backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Getting your cinematic scenes ready"
      >
        <div className="confirm-modal__card">
          <h2 className="confirm-modal__title">
            {state.status === 'verifying' ? 'Almost time for your close-up…' : 'Quiet on set…'}
          </h2>
          <progress
            aria-label="Cinematic download progress"
            max={VIP_CINEMATIC_PACK.totalBytes}
            value={state.bytes}
          />
          <p className="confirm-modal__desc">
            {Math.floor((state.bytes / VIP_CINEMATIC_PACK.totalBytes) * 100)}% · We’re getting the
            house ready for its close-up. Keep the app open a little longer, or carry on in Standard
            and come back when you’re ready.
          </p>
          <button
            className="game-button game-button--ghost"
            onClick={() => {
              void cinematicPackDownloads.cancel().then(keepStandard)
            }}
          >
            Take me back to the show
          </button>
        </div>
      </div>,
      document.body
    )
  return (
    <ConfirmExitModal
      open
      title={
        state.status === 'error'
          ? 'A little hold-up backstage'
          : state.status === 'ready'
            ? 'The cameras are ready.'
            : 'Give every goodbye its moment.'
      }
      description={
        state.error ??
        (state.status === 'ready'
          ? 'Your next big moment is waiting for its close-up. Your scenes are already here, so we can roll whenever you’re ready—even without internet.'
          : `The house falls silent. All eyes turn to the door. A goodbye like this deserves its close-up. Want the full scene? One download (${(VIP_CINEMATIC_PACK.totalBytes / 1_000_000).toFixed(1)} MB) brings Cinematic to your season, ready even without internet. If now isn’t the moment, choose Cinematic later in Settings → Animation style.`)
      }
      confirmLabel={
        state.status === 'ready'
          ? 'Let the cameras roll'
          : state.status === 'error'
            ? 'Give it another take'
            : 'Yes, bring on the drama'
      }
      cancelLabel="Maybe later"
      onConfirm={() => {
        void enable()
      }}
      onCancel={keepStandard}
    />
  )
}
