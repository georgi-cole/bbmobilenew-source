import React from 'react'
import CeremonyOverlay from '../../components/CeremonyOverlay/CeremonyOverlay'
import { PremiumBridge } from './bridge.jsx'
import { useCinematicSession } from './session.js'

function BackupNominationHandoff({ badgeOnlyHandoff = false, ...props }) {
  if (!badgeOnlyHandoff) return <CeremonyOverlay {...props} />
  return (
    <CeremonyOverlay {...props} badgeOnly showDim={false} showCaption={false} durationMs={900} />
  )
}

export default function BackupNominationCeremony(props) {
  const cinematic = useCinematicSession('backupNomination')
  if (!cinematic) return <CeremonyOverlay {...props} />

  return (
    <PremiumBridge
      key={`${props.backupNomineeId}:${props.backupChooserId}`}
      scene="backupNomination"
      standard={BackupNominationHandoff}
      badgeOnlyHandoff
      original={props}
    />
  )
}
