import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import AppearanceCarousel from '../../appearance/AppearanceCarousel'
import { warmAppearanceRole, warmSelectedAppearance } from '../../appearance/preloadAppearance'
import { getAppearanceAsset, SELECTABLE_LOOKS } from '../../appearance/catalog'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { selectCurrentProfile, updateProfile } from '../../store/profilesSlice'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import { joinPublicAssetPath } from '../../utils/avatar'
import LookLockInReveal, { LOCK_IN_FRAME_URL, type LockInLook } from './LookLockInReveal'
import { preloadImage } from '../../utils/preload'
import './DressingRoom.css'

export default function DressingRoom() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const profile = useAppSelector(selectCurrentProfile)
  const profileIdAtOpen = useRef(profile?.id)
  const figureRef = useRef<HTMLImageElement>(null)
  const [lockIn, setLockIn] = useState<LockInLook | null>(null)
  const [selectedId, setSelectedId] = useState(
    profile?.appearanceSelection?.kind === 'catalog'
      ? profile.appearanceSelection.lookId
      : (SELECTABLE_LOOKS[0]?.id ?? '')
  )
  const returnTo = (location.state as { from?: string } | null)?.from === '/' ? '/' : '/game'

  useEffect(() => {
    void preloadImage(LOCK_IN_FRAME_URL)
  }, [])

  useEffect(() => {
    if (!profile || profile.id !== profileIdAtOpen.current) {
      navigate('/profile-picker', { replace: true, state: { from: returnTo } })
    }
  }, [navigate, profile, returnTo])

  useEffect(() => {
    const look = SELECTABLE_LOOKS.find((candidate) => candidate.id === selectedId)
    if (look) {
      void warmAppearanceRole({ kind: 'catalog', lookId: look.id, revision: look.revision }, 'main')
    }
  }, [selectedId])

  if (!profile) return null

  function confirmSelection() {
    if (!profile || profile.id !== profileIdAtOpen.current || lockIn) return
    const look = SELECTABLE_LOOKS.find((candidate) => candidate.id === selectedId)
    if (!look) return
    const selection = { kind: 'catalog' as const, lookId: look.id, revision: look.revision }
    const casualAsset = getAppearanceAsset(selection, 'casual')
    const portraitAsset = getAppearanceAsset(selection, 'main')
    const figure = figureRef.current
    const bounds = figure?.getBoundingClientRect()
    // The carousel contains the image at bottom-center. Its CSS box can include
    // letterboxing, which must not become part of the cloned figure's face coordinates.
    let source = bounds
    if (figure && bounds && figure.naturalWidth > 0 && figure.naturalHeight > 0) {
      const fit = Math.min(bounds.width / figure.naturalWidth, bounds.height / figure.naturalHeight)
      const width = figure.naturalWidth * fit
      const height = figure.naturalHeight * fit
      source = new DOMRect(
        bounds.left + (bounds.width - width) / 2,
        bounds.bottom - height,
        width,
        height
      )
    }
    // Persistence is independent of the cinematic and of image/network readiness.
    dispatch(updateProfile({ appearanceSelection: selection }))
    void warmSelectedAppearance(selection)
    if (!casualAsset || !portraitAsset) {
      finishLockIn()
      return
    }
    setLockIn({
      lookId: look.id,
      label: look.label,
      displayName: profile.name,
      casualUrl: joinPublicAssetPath(casualAsset),
      portraitUrl: joinPublicAssetPath(portraitAsset),
      headTopPercent: look.headTopPercent,
      source: source
        ? { left: source.left, top: source.top, width: source.width, height: source.height }
        : null,
    })
  }

  function finishLockIn() {
    navigate('/profile', {
      replace: true,
      state: { from: returnTo, fromLookReveal: Boolean(lockIn) },
    })
  }

  return (
    <>
      <main
        className="dressing-room placeholder-screen"
        aria-hidden={lockIn ? true : undefined}
        inert={Boolean(lockIn)}
      >
        <div className="dressing-room__topbar">
          <GameBackButton
            onClick={() => navigate('/profile', { state: { from: returnTo } })}
            label="Back to profile"
          />
          <span>Changing room</span>
        </div>
        <h1>Choose your look</h1>
        <p className="dressing-room__subtitle">Your name. Your story. Your style.</p>
        <AppearanceCarousel
          selectedId={selectedId}
          onSelect={setSelectedId}
          onConfirm={confirmSelection}
          confirmLabel="Use this look"
          figureRef={figureRef}
        />
        <p className="dressing-room__season-note">Changes will take effect on new season start</p>
      </main>
      {lockIn && <LookLockInReveal look={lockIn} onComplete={finishLockIn} />}
    </>
  )
}
