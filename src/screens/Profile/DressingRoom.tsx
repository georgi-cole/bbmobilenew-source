import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import AppearanceCarousel from '../../appearance/AppearanceCarousel'
import { warmAppearanceRole, warmSelectedAppearance } from '../../appearance/preloadAppearance'
import { getAppearanceAsset, SELECTABLE_LOOKS } from '../../appearance/catalog'
import { canFillInitialSeasonAppearance } from '../../appearance/initialSeasonAppearance'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { MAX_PROFILES, selectCurrentProfile, updateProfile } from '../../store/profilesSlice'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import { joinPublicAssetPath } from '../../utils/avatar'
import LookLockInReveal, { LOCK_IN_FRAME_URL, type LockInLook } from './LookLockInReveal'
import { preloadImage } from '../../utils/preload'
import './DressingRoom.css'

export default function DressingRoom() {
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as {
    from?: string
    createProfile?: boolean
    initialLookId?: string
    adoptGuestRun?: boolean
    fromPlayerAccount?: boolean
    playerAccountId?: string
  } | null
  const creatingProfile = routeState?.createProfile === true
  const dispatch = useAppDispatch()
  const profile = useAppSelector(selectCurrentProfile)
  const atProfileLimit = useAppSelector((state) => state.profiles.profiles.length >= MAX_PROFILES)
  const canFillCurrentLook = useAppSelector((state) =>
    Boolean(state.game && canFillInitialSeasonAppearance(state.game))
  )
  const profileIdAtOpen = useRef(creatingProfile ? undefined : profile?.id)
  const figureRef = useRef<HTMLImageElement>(null)
  const [lockIn, setLockIn] = useState<LockInLook | null>(null)
  const [selectedId, setSelectedId] = useState(
    creatingProfile && SELECTABLE_LOOKS.some((look) => look.id === routeState?.initialLookId)
      ? routeState!.initialLookId!
      : profile?.appearanceSelection?.kind === 'catalog'
        ? profile.appearanceSelection.lookId
        : (SELECTABLE_LOOKS[0]?.id ?? '')
  )
  const returnTo = routeState?.from === '/' ? '/' : '/game'
  const creationBack = routeState?.fromPlayerAccount ? '/profile/account' : '/'

  useEffect(() => {
    if (creatingProfile && atProfileLimit)
      navigate('/profile-picker', {
        replace: true,
        state: routeState?.fromPlayerAccount
          ? { from: '/profile/account', manageOnly: true }
          : { from: returnTo },
      })
  }, [creatingProfile, atProfileLimit, navigate, routeState?.fromPlayerAccount, returnTo])

  useEffect(() => {
    void preloadImage(LOCK_IN_FRAME_URL)
  }, [])

  useEffect(() => {
    if (!creatingProfile && (!profile || profile.id !== profileIdAtOpen.current)) {
      navigate('/profile-picker', { replace: true, state: { from: returnTo } })
    }
  }, [creatingProfile, navigate, profile, returnTo])

  useEffect(() => {
    const look = SELECTABLE_LOOKS.find((candidate) => candidate.id === selectedId)
    if (look) {
      void warmAppearanceRole({ kind: 'catalog', lookId: look.id, revision: look.revision }, 'main')
    }
  }, [selectedId])

  if ((!creatingProfile && !profile) || (creatingProfile && atProfileLimit)) return null

  function confirmSelection() {
    if ((!creatingProfile && (!profile || profile.id !== profileIdAtOpen.current)) || lockIn) return
    const look = SELECTABLE_LOOKS.find((candidate) => candidate.id === selectedId)
    if (!look) return
    const selection = { kind: 'catalog' as const, lookId: look.id, revision: look.revision }
    const firstAppearance = profile?.initialAppearanceSelection ?? profile?.appearanceSelection
    const appliesToCurrentSeason =
      canFillCurrentLook &&
      (firstAppearance?.kind !== 'catalog' || firstAppearance.lookId === selection.lookId)
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
    if (!creatingProfile) dispatch(updateProfile({ appearanceSelection: selection }))
    void warmSelectedAppearance(selection)
    if (!casualAsset || !portraitAsset) {
      finishLockIn()
      return
    }
    setLockIn({
      lookId: look.id,
      label: look.label,
      displayName: creatingProfile ? look.label : (profile?.name ?? look.label),
      casualUrl: joinPublicAssetPath(casualAsset),
      portraitUrl: joinPublicAssetPath(portraitAsset),
      headTopPercent: look.headTopPercent,
      source: source
        ? { left: source.left, top: source.top, width: source.width, height: source.height }
        : null,
      ...(creatingProfile
        ? { readyEyebrow: 'Look chosen', completionCopy: 'Now make it yours.' }
        : appliesToCurrentSeason
          ? { completionCopy: 'Your first character is ready for this season.' }
          : {}),
    })
  }

  function finishLockIn() {
    if (creatingProfile) {
      navigate('/profile-edit', {
        replace: true,
        state: {
          from: '/',
          createProfile: true,
          appearanceSelection: { kind: 'catalog', lookId: selectedId, revision: 1 },
          adoptGuestRun: routeState?.adoptGuestRun === true,
          ...(routeState?.fromPlayerAccount && { fromPlayerAccount: true }),
          ...(routeState?.playerAccountId && { playerAccountId: routeState.playerAccountId }),
        },
      })
      return
    }
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
            onClick={() =>
              navigate(creatingProfile ? creationBack : '/profile', {
                state: creatingProfile ? undefined : { from: returnTo },
              })
            }
            label={
              creatingProfile
                ? routeState?.fromPlayerAccount
                  ? 'Back to account'
                  : 'Back to home'
                : 'Back to profile'
            }
          />
          <span>Changing room</span>
        </div>
        <h1>Choose your look</h1>
        <p className="dressing-room__subtitle">Your name. Your story. Your style.</p>
        <AppearanceCarousel
          selectedId={selectedId}
          onSelect={setSelectedId}
          onConfirm={confirmSelection}
          confirmLabel={creatingProfile ? 'Choose this look' : 'Use this look'}
          figureRef={figureRef}
        />
        {!creatingProfile && (
          <p className="dressing-room__season-note">
            Your first character replaces the guest silhouette now. Changing an existing character
            takes effect next season.
          </p>
        )}
      </main>
      {lockIn && <LookLockInReveal look={lockIn} onComplete={finishLockIn} />}
    </>
  )
}
