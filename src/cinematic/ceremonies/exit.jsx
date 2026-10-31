import { useCinematicSession } from './session.js'
import React from 'react'
import { useStore } from 'react-redux'
import Standard from '../../components/Eviction/SpotlightEvictionOverlay'
import { PremiumBridge } from './bridge.jsx'
import { exitTracker } from './runtime.mjs'
export default function Exit(props) {
  const cinematic = useCinematicSession()
  const game = useStore().getState().game
  if (!cinematic) return <Standard {...props} />
  return (
    <PremiumBridge
      key={`${game.gameId}:${props.evictee.id}:${props.variant}`}
      scene={props.variant === 'return' ? null : exitTracker.scene(game, props.evictee.id)}
      standard={Standard}
      original={props}
    />
  )
}
