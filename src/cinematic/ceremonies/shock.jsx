import { useCinematicSession } from './session.js'
import React from 'react'
import Standard from '../../components/ui/ShockIntroOverlay/ShockIntroOverlay'
import { PremiumBridge } from './bridge.jsx'
import { shockVariant } from './runtime.mjs'
export default function Shock(props) {
  const cinematic = useCinematicSession('shock', props.shockKey)
  if (!cinematic) return <Standard {...props} />
  return props.active ? (
    <PremiumBridge
      key={props.shockKey}
      scene="shock"
      shockType={shockVariant(props.shockKey)}
      standard={Standard}
      original={props}
      finishDirect
    />
  ) : (
    <Standard {...props} />
  )
}
