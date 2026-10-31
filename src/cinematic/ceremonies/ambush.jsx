import React, { useEffect, useRef, useState } from 'react'
import { useStore } from 'react-redux'
import { selectIsVipActive } from '../../store/vipSlice'
import { registerAmbush, shouldPlayCinematic } from './runtime.mjs'
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
  const store = useStore(),
    current = useRef(null),
    [pending, setPending] = useState(null),
    seen = useRef(null)
  useEffect(
    () =>
      registerAmbush((nativeEffect) => {
        const state = store.getState()
        if (!state.settings.gameUX.animations) return true
        if (!shouldPlayCinematic(state, selectIsVipActive(state))) return false
        const plan = state.game.lohNominationPlan
        const key = `${state.game.gameId}:${state.game.week}:${plan?.targetId}`
        if (current.current) return true
        if (seen.current === key) return false
        seen.current = key
        current.current = key
        setPending({ nativeEffect, key })
        return true
      }),
    []
  )
  return pending ? (
    <PremiumBridge
      key={pending.key}
      scene="ambush"
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
