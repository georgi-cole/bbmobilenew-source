import { useCinematicSession } from './session.js'
import React from 'react'
import { useStore } from 'react-redux'
import Standard from '../../components/WinnerTileLiftAnimation/WinnerTileLiftAnimation'
import { PremiumBridge } from './bridge.jsx'
import { winnerScene } from './runtime.mjs'
export default function Winner(props) {
  const cinematic = useCinematicSession()
  const game = useStore().getState().game
  if (!cinematic) return <Standard {...props} />
  return (
    <PremiumBridge
      key={`${props.caption}:${props.targetIds?.join(',')}`}
      scene={winnerScene(props, game)}
      standard={Standard}
      original={props}
    />
  )
}
