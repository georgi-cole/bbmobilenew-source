import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import AppearanceCarousel from '../../appearance/AppearanceCarousel'
import { warmAppearanceRole, warmSelectedAppearance } from '../../appearance/preloadAppearance'
import { getAppearanceAsset, SELECTABLE_LOOKS } from '../../appearance/catalog'
import {
  APPEARANCE_LOOK_PRICE_EYEROS,
  hasAppearanceLookAccess,
  isFreeAppearanceLook,
} from '../../appearance/lookAccess'
import { canFillInitialSeasonAppearance } from '../../appearance/initialSeasonAppearance'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { MAX_PROFILES, purchaseAppearanceLook, selectCurrentProfile, updateProfile } from '../../store/profilesSlice'
import { selectIsVipActive } from '../../store/vipSlice'
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
  const isVip = useAppSelector(selectIsVipActive)
  const atProfileLimit = useAppSelector((state) => state.profiles.profiles.length >= MAX_PROFILES)
  const canFillCurrentLook = useAppSelector((state) =>
    Boolean(state.game && canFillInitialSeasonAppearance(state.game))
  )
  const profileIdAtOpen = useRef(creatingProfile ? undefined : profile?.id)
  const figureRef = useRef<HTMLImageElement>(null)
  const [lockIn, setLockIn] = useState<LockInLook | null>(null)
  const [pendingUnlockId, setPendingUnlockId] = useState<string | null>(null)
  const [accessMessage, setAccessMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState(
    creatingProfile && SELECTABLE_LOOKS.some((look) => look.id === routeState?.initialLookId)
      ? routeState!.initialLookId!
      : profile?.appearanceSelection?.kind === 'catalog'
        ? profile.appearanceSelection.lookId
        : (SELECTABLE_LOOKS[0]?.id ?? '')
  )
  const returnTo = routeState?.from === '/' ? '/' : '/game'
  const creationBack = routeState?.fromPlayerAccount ? '/profile/account' : '/'
  const currentLook = SELECTABLE_LOOKS.find((look) => look.id === selectedId)
  const isAvailable = hasAppearanceLookAccess(selectedId, creatingProfile ? null : profile, isVip)
  const isIncluded = isFreeAppearanceLook(selectedId)
  const balance = profile?.eyeoleans ?? 0
  const accessText = isIncluded
    ? 'Free look'
    : isVip
      ? 'Included with VIP'
      : isAvailable
        ? 'Permanently unlocked'
        : `VIP or ${APPEARANCE_LOOK_PRICE_EYEROS.toLocaleString('en-US')} Eyeros`
  const confirmLabel = isAvailable
    ? creatingProfile
      ? 'Choose this look'
      : 'Use this look'
    : creatingProfile
      ? 'VIP look'
      : `Unlock · ${APPEARANCE_LOOK_PRICE_EYEROS.toLocaleString('en-US')} Eyeros`

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
    if (!hasAppearanceLookAccess(look.id, creatingProfile ? null : profile, isVip)) {
      if (creatingProfile) {
        setAccessMessage('Choose one of the five free looks, or unlock VIP in the Store.')
      } else if (balance < APPEARANCE_LOOK_PRICE_EYEROS) {
        setAccessMessage(
          `You need ${(APPEARANCE_LOOK_PRICE_EYEROS - balance).toLocaleString('en-US')} more Eyeros to unlock this look.`
        )
      } else {
        setAccessMessage(null)
        setPendingUnlockId(look.id)
      }
      return
    }
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

  function confirmUnlock() {
    if (
      !profile ||
      !pendingUnlockId ||
      pendingUnlockId !== selectedId ||
      !currentLook ||
      balance < APPEARANCE_LOOK_PRICE_EYEROS ||
      hasAppearanceLookAccess(pendingUnlockId, profile, isVip)
    ) {
      setPendingUnlockId(null)
      return
    }
    dispatch(purchaseAppearanceLook({ lookId: pendingUnlockId }))
    setPendingUnlockId(null)
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
        {!creatingProfile && (
          <p className="dressing-room__wallet">
            Available: <strong>{balance.toLocaleString('en-US')} Eyeros</strong>
          </p>
        )}
        <AppearanceCarousel
          selectedId={selectedId}
          onSelect={(lookId) => {
            setSelectedId(lookId)
            setPendingUnlockId(null)
            setAccessMessage(null)
          }}
          onConfirm={confirmSelection}
          confirmLabel={confirmLabel}
          accessText={accessText}
          figureRef={figureRef}
        />
        {accessMessage && (
          <p className="dressing-room__access-message" role="status">{accessMessage}</p>
        )}
        {!isAvailable && (
          <button
            type="button"
            className="dressing-room__vip-link"
            onClick={() => navigate('/store')}
          >
            View VIP in Store
          </button>
        )}
        {!creatingProfile && (
          <p className="dressing-room__season-note">
            Your first character replaces the guest silhouette now. Changing an existing character
            takes effect next season.
          </p>
        )}
        {pendingUnlockId && (
          <div className="dressing-room__unlock-backdrop">
            <div
              className="dressing-room__unlock-panel"
              role="alertdialog"
              aria-modal="true"
              aria-label="Unlock selected look"
              aria-describedby="dressing-room-unlock-description"
            >
              <span className="dressing-room__unlock-eyebrow">Permanent look unlock</span>
              <h2>{currentLook?.label}</h2>
              <p id="dressing-room-unlock-description">
                Unlock this look for 30,000 Eyeros? It will stay available on this profile,
                including in future seasons.
              </p>
              <div className="dressing-room__unlock-actions">
                <button type="button" onClick={() => setPendingUnlockId(null)}>
                  Cancel
                </button>
                <button type="button" onClick={confirmUnlock}>
                  Confirm · 30,000 Eyeros
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      {lockIn && <LookLockInReveal look={lockIn} onComplete={finishLockIn} />}
    </>
  )
}
