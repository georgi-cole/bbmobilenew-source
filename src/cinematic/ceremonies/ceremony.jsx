import { useCinematicSession } from './session.js'
import React from 'react'
import Standard from '../../components/CeremonyOverlay/CeremonyOverlay'
import { useStore } from 'react-redux'
import { PremiumBridge } from './bridge.jsx'
import { adaptCeremonyScene } from './runtime.mjs'
export default function Ceremony(props) {
  const game = useStore().getState().game
  const text = `${props.caption} ${props.ariaLabel}`.toLowerCase()
  const base = /saved/.test(text)
    ? 'save'
    : /backup|replacement/.test(text)
      ? null
      : /nominat/.test(text)
        ? 'nominations'
        : /safety/.test(text)
          ? 'safety'
          : /leader|loh/.test(text)
            ? 'loh'
            : null
  const scene = adaptCeremonyScene(
    base === 'safety' && game.posWinnerId === game.lohId ? 'allPower' : base,
    props,
    game
  )
  const cinematic = useCinematicSession(scene)
  if (!cinematic) return <Standard {...props} />
  return (
    <PremiumBridge
      key={`${props.caption}:${props.ariaLabel}`}
      scene={scene}
      standard={Standard}
      original={props}
    />
  )
}
