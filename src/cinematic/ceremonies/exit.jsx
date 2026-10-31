import { useCinematicSession } from './session.js'
import React from 'react'
import { useStore } from 'react-redux'
import Standard from '../../components/Eviction/SpotlightEvictionOverlay'
import { PremiumBridge } from './bridge.jsx'
import { exitTracker, adaptCeremonyScene } from './runtime.mjs'
export default function Exit(props) {
  const game = useStore().getState().game
  const scene =
    props.variant === 'return'
      ? null
      : adaptCeremonyScene(exitTracker.scene(game, props.evictee.id), props, game)
  const cinematic = useCinematicSession(scene)
  if (!cinematic) return <Standard {...props} />
  return (
    <PremiumBridge
      key={`${game.gameId}:${props.evictee.id}:${props.variant}`}
      scene={scene}
      standard={Standard}
      original={props}
    />
  )
}
