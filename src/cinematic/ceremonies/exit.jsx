import { useCinematicSession } from './session.js'
import React, { useEffect } from 'react'
import { useStore } from 'react-redux'
import Standard from '../../components/Eviction/SpotlightEvictionOverlay'
import { PremiumBridge } from './bridge.jsx'
import { exitTracker, adaptCeremonyScene } from './runtime.mjs'
import { expandPair } from './mode-routing.mjs'
import RosterExit from './roster-exit'
import { hasCoveredRosterExit, clearRosterExit } from './roster-exit-state'

function ExitHandoff({ premiumRosterExit, ...props }) {
  return premiumRosterExit ? <RosterExit {...props} /> : <Standard {...props} />
}
export default function Exit({ decisionAlreadyPresented = false, ...props }) {
  const store = useStore()
  const game = store.getState().game
  const covered = props.variant !== 'return' && hasCoveredRosterExit(store, game, props.evictee.id)
  const trackedScene = props.variant === 'return' ? null : exitTracker.scene(game, props.evictee.id)
  const scene = adaptCeremonyScene(
    decisionAlreadyPresented && trackedScene === 'final3' ? 'exit' : trackedScene,
    props,
    game
  )
  const cinematic = useCinematicSession(scene ?? (covered ? 'exit' : null))
  useEffect(() => {
    if (covered && !cinematic) clearRosterExit(store)
  }, [cinematic, covered, store])
  if (!cinematic) return <Standard {...props} />
  if (covered) return <RosterExit {...props} />
  return (
    <PremiumBridge
      key={`${game.gameId}:${props.evictee.id}:${props.variant}`}
      scene={scene}
      standard={ExitHandoff}
      original={{
        ...props,
        rosterIds:
          scene === 'cupidExit' ? expandPair(game, [props.evictee.id]) : [props.evictee.id],
      }}
      rosterExit
    />
  )
}
