import { useCinematicSession } from './session.js'
import React from 'react'
import { useStore } from 'react-redux'
import Standard from '../../components/WinnerTileLiftAnimation/WinnerTileLiftAnimation'
import { PremiumBridge } from './bridge.jsx'
import { winnerScene } from './runtime.mjs'
export default function Winner(props) {
  const game = useStore().getState().game
  const scene = winnerScene(props, game)
  const cinematic = useCinematicSession(scene)
  if (!cinematic) return <Standard {...props} />
  return (
    <PremiumBridge
      key={`${props.caption}:${props.targetIds?.join(',')}`}
      scene={scene}
      standard={Standard}
      original={props}
    />
  )
}
