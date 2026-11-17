import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { selectPendingChallenge } from '../../store/challengeSlice'
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
  const pending = useAppSelector(selectPendingChallenge)
  const competitionCheckout =
    /^#\/(?:store|game)(?:[/?]|$)/.test(hash) && pending?.premiumOffer?.decision === 'marketplace'
  const state = useCinematicPackDownload()
  const open = state.prompt > 0 && !competitionCheckout
  const supported = supportsCinematicDownloads()
  const busy = state.status === 'downloading' || state.status === 'verifying'
  const shouldOffer =
    supported &&
    vip &&
    state.status === 'available' &&
    state.choice !== 'standard' &&
    !open &&
    !competitionCheckout &&
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
            {state.status === 'verifying' ? 'Almost showtime…' : 'Your close-up is coming…'}
          </h2>
          <progress
            aria-label="Cinematic download progress"
            max={VIP_CINEMATIC_PACK.totalBytes}
            value={state.bytes}
          />
          <p className="confirm-modal__desc">
            {Math.floor((state.bytes / VIP_CINEMATIC_PACK.totalBytes) * 100)}% · Keep the app open
            while your animations download.
          </p>
          <button
            className="game-button game-button--ghost"
            onClick={() => {
              void cinematicPackDownloads.cancel().then(keepStandard)
            }}
          >
            Cancel download
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
          ? 'Not quite showtime…'
          : state.status === 'ready'
            ? 'The cameras are ready!'
            : 'Ready for your close-up?'
      }
      description={
        state.error ??
        (state.status === 'ready'
          ? 'Your cinematic animations are already here. Turn them on for your next big moment—no download needed.'
          : `Give exits and ceremonies the TV treatment. Download ${(VIP_CINEMATIC_PACK.totalBytes / 1_000_000).toFixed(1)} MB to turn on cinematic animations. They work offline too.`)
      }
      confirmLabel={
        state.status === 'ready'
          ? 'Turn on Cinematic'
          : state.status === 'error'
            ? 'Try download again'
            : 'Download & turn on'
      }
      cancelLabel="Stay with Standard"
      onConfirm={() => {
        void enable()
      }}
      onCancel={keepStandard}
    />
  )
}
