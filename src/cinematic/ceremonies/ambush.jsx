import React, { useEffect, useRef, useState } from 'react'
import { useStore, useSelector } from 'react-redux'
import { selectIsVipActive } from '../../store/vipSlice'
import {
  registerAmbush,
  shouldPlayCinematic,
  isCinematicSceneAllowed,
  adaptCeremonyScene,
} from './runtime.mjs'
import { PremiumBridge } from './bridge.jsx'
function NativeAmbush({ nativeEffect, onDone }) {
  const started = useRef(false)
  useEffect(() => {
    if (!started.current) {
      started.current = true
      nativeEffect()
    }
    let done = false
    const complete = () => {
      if (done) return
      done = true
      observer.disconnect()
      clearTimeout(timer)
      onDone()
    }
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-backdoor-spotlight="true"]')) complete()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = setTimeout(complete, 2300)
    if (!document.querySelector('[data-backdoor-spotlight="true"]')) queueMicrotask(complete)
    return () => {
      done = true
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [])
  return null
}
export default function VipAmbushDirector() {
  const mode = useSelector((state) => state.game.mode)
  const gameId = useSelector((state) => state.game.gameId)
  const store = useStore(),
    current = useRef(null),
    [pending, setPending] = useState(null),
    seen = useRef(null)
  useEffect(
    () =>
      registerAmbush((nativeEffect) => {
        const state = store.getState()
        const scene = adaptCeremonyScene('ambush', {}, state.game)
        if (!isCinematicSceneAllowed(state.game, scene)) return false
        if (!state.settings.gameUX.animations) return true
        if (!shouldPlayCinematic(state, selectIsVipActive(state))) return false
        const plan = state.game.lohNominationPlan
        const key = `${state.game.gameId}:${state.game.week}:${plan?.targetId}`
        if (current.current?.gameId === state.game.gameId) return true
        if (seen.current === key) return false
        seen.current = key
        current.current = { key, gameId: state.game.gameId }
        setPending({ nativeEffect, key, gameId: state.game.gameId, scene })
        return true
      }),
    []
  )
  return pending && pending.gameId === gameId && !['survival', 'survivor'].includes(mode) ? (
    <PremiumBridge
      key={pending.key}
      scene={pending.scene}
      standard={NativeAmbush}
      original={{
        nativeEffect: pending.nativeEffect,
        onDone: () => {
          current.current = null
          setPending(null)
        },
      }}
    />
  ) : null
}
