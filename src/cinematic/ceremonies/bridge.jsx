import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore, useSelector } from 'react-redux'
import { selectIsVipActive } from '../../store/vipSlice'
import {
  getPresentationOwner,
  usePresentationOwner,
  usePresentationForeground,
  PRESENTATION_PRIORITY,
} from '../../services/presentation/presentationOwnership'
import { MotionConfig } from 'framer-motion'
import CinematicSkipButton from '../../components/CinematicSkipButton/CinematicSkipButton'
import { modeDetails, baseScene } from './mode-routing.mjs'
import './bridge.css'
import {
  shouldPlayCinematic,
  ceremonyCast,
  ceremonyQueue,
  battleBackIntroGuard,
  isCinematicSceneAllowed,
} from './runtime.mjs'
export function PremiumBridge({
  scene,
  standard: Standard,
  original,
  shockType = 'generic',
  finishDirect = false,
  rosterExit = false,
  badgeOnlyHandoff = false,
  soundtrackContinuation,
}) {
  const store = useStore(),
    target = useRef(null),
    clip = useRef(null),
    completed = useRef(false),
    handed = useRef(false),
    lease = useRef(null),
    run = useRef(null),
    props = useRef(original),
    skipButton = useRef(null),
    mountedMovie = useRef(false),
    soundtrack = useRef(soundtrackContinuation),
    soundtrackFinished = useRef(false)
  props.current = original
  soundtrack.current = soundtrackContinuation
  const finishSoundtrack = useCallback(() => {
    if (soundtrackFinished.current) return
    soundtrackFinished.current = true
    soundtrack.current?.finish()
  }, [])
  const vip = useSelector(selectIsVipActive),
    settings = useSelector((s) => s.settings),
    mode = useSelector((s) => s.game.mode)
  const managed = Boolean(scene || original.onDone || finishDirect)
  const wantsClip = Boolean(
    scene &&
    shouldPlayCinematic({ settings, game: { mode } }, vip) &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [owned, setOwned] = useState(!managed),
    [handover, setHandover] = useState(!wantsClip),
    [preparing, setPreparing] = useState(false),
    [entryCover, setEntryCover] = useState(() => wantsClip && ceremonyQueue.counts.active === 0),
    [finished, setFinished] = useState(false)
  const globalPriority =
    scene === 'shock'
      ? PRESENTATION_PRIORITY.broadcastShock
      : ['exit', 'final3', 'final4', 'tiebreak'].includes(baseScene(scene)) ||
          scene === 'voxResults'
        ? PRESENTATION_PRIORITY.evictionSpotlight
        : ['loh', 'safety', 'allPower'].includes(baseScene(scene)) ||
            ['voxFinal4', 'voxImmunity'].includes(scene)
          ? PRESENTATION_PRIORITY.winnerAward
          : PRESENTATION_PRIORITY.ceremony
  const currentPresentation = getPresentationOwner()
  const canCoverCurrentPresentation =
    !currentPresentation || currentPresentation.priority <= globalPriority
  const globalOwner = usePresentationOwner(
    soundtrackContinuation?.presentationGroupId ?? 'vip-cinematic',
    globalPriority,
    managed && owned && !handover && !finished
  )
  const foreground = usePresentationForeground()
  const canPresent = useRef(false)
  canPresent.current = globalOwner.isOwner
  const emit = useCallback(
    (phase, extra = {}) =>
      window.dispatchEvent(
        new CustomEvent('vip:ceremony', { detail: { phase, scene, shockType, ...extra } })
      ),
    [scene, shockType]
  )
  const finish = useCallback(
    (method) => {
      if (completed.current) return
      completed.current = true
      clip.current?.stop()
      clearTimeout(run.current?.watchdog)
      setPreparing(false)
      setEntryCover(false)
      if (
        scene === 'shock' &&
        shouldPlayCinematic(store.getState(), selectIsVipActive(store.getState()))
      ) {
        battleBackIntroGuard(store).mark(store.getState(), props.current.shockKey)
      }
      emit('complete')
      finishSoundtrack()
      lease.current?.()
      lease.current = null
      setFinished(true)
      props.current[method]?.()
    },
    [emit, finishSoundtrack, scene, store]
  )
  const handoff = useCallback(
    (reason = 'natural') => {
      if (completed.current || handed.current || run.current?.cancelled) return
      handed.current = true
      clearTimeout(run.current?.watchdog)
      setPreparing(false)
      setEntryCover(false)
      if (scene === 'shock' && run.current?.started)
        battleBackIntroGuard(store).mark(store.getState(), props.current.shockKey)
      emit('handoff', { reason })
      finishSoundtrack()
      setHandover(true)
    },
    [emit, finishSoundtrack, scene, store]
  )
  const skip = useCallback(() => {
    if (completed.current || !owned) return
    clip.current?.stop()
    finishDirect ? finish('onComplete') : handoff('skip')
  }, [owned, finishDirect, finish, handoff])
  useEffect(() => {
    if (!managed) return
    const current = { cancelled: false, started: false, watchdog: null }
    run.current = current
    const begin = () => {
      if (current.cancelled || current.started || document.hidden) return
      const state = store.getState()
      if (!state.settings.gameUX.animations && (props.current.onDone || finishDirect)) {
        finish(finishDirect ? 'onComplete' : 'onDone')
        return
      }
      if (
        !scene ||
        !shouldPlayCinematic(state, selectIsVipActive(state)) ||
        !isCinematicSceneAllowed(state.game, scene, props.current.shockKey) ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        handoff('standard')
        return
      }
      if (!canPresent.current) return
      if (
        scene === 'shock' &&
        battleBackIntroGuard(store).shouldSkip(state, props.current.shockKey)
      ) {
        emit('suppressed', { reason: 'battle-back follow-up or acknowledged reveal' })
        finish('onComplete')
        return
      }
      current.started = true
      setHandover(false)
      setPreparing(true)
      current.watchdog = setTimeout(() => {
        if (!current.cancelled && !handed.current) {
          clip.current?.stop()
          emit('fallback', { reason: 'artwork timeout' })
          handoff('timeout')
        }
      }, 10000)
      Promise.all([import('./renderer.js'), import('./cast.json')])
        .then(async ([clipModule, catalogModule]) => {
          if (current.cancelled || completed.current || handed.current) return
          const cast = ceremonyCast(
            scene,
            props.current,
            state.game,
            catalogModule.default.characters
          )
          if (!cast) {
            emit('fallback', { reason: 'unsupported character or cast' })
            handoff('missing-art')
            return
          }
          const controller = clipModule.createClip()
          clip.current = controller
          const details = modeDetails(scene, props.current, state.game)
          // The final-day ident belongs after the already-approved doorway zoom.
          // Ordinary weekly and paired exits retain their existing film and clock.
          if (state.game.phase?.startsWith('final3') && ['exit', 'final3'].includes(scene))
            details.closingBrand = true
          const ok = await controller.prepare(scene, cast, shockType, details)
          if (current.cancelled || completed.current || handed.current || !ok) return
          clearTimeout(current.watchdog)
          if (scene === 'shock') battleBackIntroGuard(store).mark(state, props.current.shockKey)
          emit('start', {
            characters: Object.fromEntries(Object.entries(cast).map(([k, p]) => [k, p.id])),
          })
          controller.mount(
            target.current,
            () => handoff(),
            () => {
              if (!current.cancelled) finishDirect ? finish('onComplete') : handoff()
            },
            shockType,
            {
              matchHandoff: true,
              origin: (() => {
                const id = state.game.nomineeIds?.[0]
                return id
                  ? document
                      .querySelector(`[data-player-id="${CSS.escape(id)}"] [data-ceremony-tile]`)
                      ?.getBoundingClientRect()
                  : null
              })(),
            }
          )
          mountedMovie.current = true
          setPreparing(false)
          setEntryCover(false)
          const visible = !document.hidden && canPresent.current
          controller.setVisible(visible)
          if (!visible) controller.pause()
        })
        .catch(() => {
          if (!current.cancelled && !completed.current && !handed.current) {
            clip.current?.stop()
            emit('fallback', { reason: 'artwork failed' })
            handoff('error')
          }
        })
    }
    const visibility = () => {
      if (current.cancelled) return
      if (document.hidden) {
        clip.current?.pause()
        clip.current?.setVisible(false)
      } else {
        if (lease.current && ceremonyQueue.counts.active) begin()
        if (handed.current || canPresent.current) {
          clip.current?.setVisible(true)
          clip.current?.resume()
        }
      }
    }
    current.begin = begin
    let granted = false
    lease.current = ceremonyQueue.acquire(
      () => {
        granted = true
        setOwned(true)
        begin()
      },
      scene === 'shock' ? 2 : 1,
      () => {
        setOwned(true)
        emit('fallback', { reason: 'presentation startup failed' })
        handoff('error')
      }
    )
    const visible = () => {
      if (granted) visibility()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      current.cancelled = true
      clearTimeout(current.watchdog)
      document.removeEventListener('visibilitychange', visible)
      clip.current?.stop()
      clip.current = null
      lease.current?.()
      lease.current = null
    }
  }, [])
  useEffect(() => {
    if (!owned || handover || finished) return
    if (globalOwner.isOwner && foreground) {
      run.current?.begin?.()
      clip.current?.setVisible(true)
      clip.current?.resume()
    } else {
      clip.current?.pause()
      clip.current?.setVisible(false)
    }
  }, [owned, handover, finished, globalOwner.isOwner, foreground])
  useEffect(() => {
    if (!soundtrack.current) return
    if (handover || finished) {
      // Let the musical tail finish over the native handoff; backgrounding still
      // stops it immediately. This also handles an initially native fallback.
      if (!foreground) soundtrack.current.setActive(false)
      finishSoundtrack()
      return
    }
    // With no owner, the outgoing scene is only between leases. Preserve the
    // running element until this group acquires, rather than inserting silence.
    if (globalOwner.hasOwner || !foreground) {
      soundtrack.current.setActive(globalOwner.isOwner && foreground)
    }
  }, [handover, finished, globalOwner.hasOwner, globalOwner.isOwner, foreground, finishSoundtrack])
  useEffect(() => {
    if (!owned || !managed || completed.current) return
    if (!settings.gameUX.animations && (original.onDone || finishDirect)) {
      clip.current?.stop()
      finish(finishDirect ? 'onComplete' : 'onDone')
      return
    }
    if (!wantsClip && !handover) {
      clip.current?.stop()
      finishDirect ? finish('onComplete') : handoff('preference-change')
    }
  }, [
    owned,
    mode,
    settings.gameUX.animations,
    settings.gameUX.animationMode,
    settings.display.reduceMotion,
    vip,
  ])
  useEffect(() => {
    if (!owned || !handover || !clip.current) return
    let cancelled = false,
      decodeTimer
    const frame = requestAnimationFrame(async () => {
      const portrait = document.querySelector('.seo__hero-photo')
      if (portrait)
        await Promise.race([
          portrait.decode().catch(() => undefined),
          new Promise((resolve) => {
            decodeTimer = setTimeout(resolve, 400)
          }),
        ])
      clearTimeout(decodeTimer)
      if (!cancelled) clip.current?.nativeReady(rosterExit && mountedMovie.current)
    })
    return () => {
      cancelled = true
      clearTimeout(decodeTimer)
      cancelAnimationFrame(frame)
    }
  }, [owned, handover])
  useEffect(() => {
    if (!owned || handover || finished || !globalOwner.isOwner || !foreground) return
    const previous = document.activeElement,
      overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    skipButton.current?.focus({ preventScroll: true })
    const keyboard = (event) => {
      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        skipButton.current?.focus()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        skip()
      }
    }
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', keyboard, true)
      if (previous?.isConnected && document.activeElement === skipButton.current)
        previous.focus?.({ preventScroll: true })
    }
  }, [owned, handover, finished, skip, globalOwner.isOwner, foreground])
  if (!managed) return <Standard {...original} />
  if (finished) return null
  let standardProps = { ...original }
  if (rosterExit) standardProps.premiumRosterExit = mountedMovie.current
  if (badgeOnlyHandoff) standardProps.badgeOnlyHandoff = mountedMovie.current
  for (const method of ['onDone', 'onComplete', 'onDismiss', 'onConfirm'])
    if (typeof original[method] === 'function') standardProps[method] = () => finish(method)
  return (
    <>
      {createPortal(<div ref={target} />, document.body)}
      {entryCover &&
        wantsClip &&
        canCoverCurrentPresentation &&
        !handover &&
        !finished &&
        createPortal(
          <div
            className="vip-film-prelude"
            aria-hidden="true"
            style={{ zIndex: 10001, pointerEvents: 'auto' }}
          >
            <PreludeEye />
          </div>,
          document.body
        )}
      {owned &&
        (handover ? (
          <MotionConfig skipAnimations={!settings.gameUX.animations}>
            <Standard {...standardProps} />
          </MotionConfig>
        ) : globalOwner.isOwner && foreground ? (
          createPortal(
            <div
              data-cinematic-active="true"
              role="dialog"
              aria-modal="true"
              aria-label={`${scene} cinematic`}
              style={{ position: 'fixed', inset: 0, zIndex: 10001 }}
            >
              {preparing && !entryCover && (
                <div className="vip-film-prelude" aria-hidden="true">
                  <PreludeEye />
                </div>
              )}
              <CinematicSkipButton ref={skipButton} ariaLabel="Skip cinematic" onClick={skip} />
            </div>,
            document.body
          )
        ) : null)}
    </>
  )
}

function PreludeEye() {
  return (
    <svg className="vip-film-prelude__eye" viewBox="0 0 160 100" fill="none" aria-hidden="true">
      <path d="M7 50C29 21 53 9 80 9s51 12 73 41c-22 29-46 41-73 41S29 79 7 50Z" />
      <circle cx="80" cy="50" r="24" />
      <circle className="vip-film-prelude__iris" cx="80" cy="50" r="10" />
      <path d="M25 50h18m74 0h18" />
    </svg>
  )
}
