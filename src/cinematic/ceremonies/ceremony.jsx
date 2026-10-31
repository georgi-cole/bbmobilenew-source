import { useCinematicSession } from './session.js'
import React from 'react'
import Standard from '../../components/CeremonyOverlay/CeremonyOverlay'
import { useStore } from 'react-redux'
import { PremiumBridge } from './bridge.jsx'
export default function Ceremony(props) {
  const cinematic = useCinematicSession()
  const game = useStore().getState().game
  if (!cinematic) return <Standard {...props} />
  const text = `${props.caption} ${props.ariaLabel}`.toLowerCase()
  const scene = /saved/.test(text)
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
  return (
    <PremiumBridge
      key={`${props.caption}:${props.ariaLabel}`}
      scene={scene === 'safety' && game.posWinnerId === game.lohId ? 'allPower' : scene}
      standard={Standard}
      original={props}
    />
  )
}
