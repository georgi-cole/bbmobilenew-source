import { useCinematicSession } from './session.js'
import React from 'react'
import Standard from '../../components/DayStartShockPopup/DayStartShockPopup'
import { PremiumBridge } from './bridge.jsx'
export default function DayShock(props) {
  const cinematic = useCinematicSession()
  if (!cinematic) return <Standard {...props} />
  return (
    <PremiumBridge scene="shock" shockType="dayStartShock" standard={Standard} original={props} />
  )
}
