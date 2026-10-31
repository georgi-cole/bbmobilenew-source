import { useCinematicSession } from './session.js'
import React from 'react'
import { useStore } from 'react-redux'
import Standard from '../../components/WinnerTileLiftAnimation/WinnerTileLiftAnimation'
import BadgeReveal from '../../components/CeremonyOverlay/CeremonyOverlay'
import { PremiumBridge } from './bridge.jsx'
import { winnerScene } from './runtime.mjs'

function WinnerHandoff(props) {
  if (!props.badgeOnlyHandoff) return <Standard {...props} />

  const resolveTiles = () =>
    (props.targetIds ?? []).map((playerId, index) => ({
      ...(props.tiles?.[index] ?? {}),
      rect: props.resolveTarget?.(playerId)?.getBoundingClientRect() ?? null,
    }))

  return (
    <BadgeReveal
      tiles={[]}
      resolveTiles={resolveTiles}
      caption=""
      ariaLabel={props.ariaLabel ?? props.caption}
      onDone={props.onDone}
      badgeOnly
      showDim={false}
      showCaption={false}
      durationMs={1000}
    />
  )
}

export default function Winner(props) {
  const game = useStore().getState().game
  const scene = winnerScene(props, game)
  const cinematic = useCinematicSession(scene)
  if (!cinematic) return <Standard {...props} />
  return (
    <PremiumBridge
      key={`${props.caption}:${props.targetIds?.join(',')}`}
      scene={scene}
      standard={WinnerHandoff}
      badgeOnlyHandoff
      original={props}
    />
  )
}
