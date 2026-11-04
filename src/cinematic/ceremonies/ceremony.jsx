import { useCinematicSession } from './session.js'
import React from 'react'
import Standard from '../../components/CeremonyOverlay/CeremonyOverlay'
import { useStore } from 'react-redux'
import { PremiumBridge } from './bridge.jsx'
import { adaptCeremonyScene, baseScene, hasLeadershipRole } from './runtime.mjs'

function CeremonyHandoff(props) {
  if (!props.badgeOnlyHandoff) return <Standard {...props} />
  return <Standard {...props} badgeOnly showDim={false} showCaption={false} durationMs={1000} />
}

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
  const scene =
    props.replacementOutcome?.owner === 'replacement'
      ? 'replacement'
      : adaptCeremonyScene(
          base === 'safety' && hasLeadershipRole(game, game.posWinnerId) ? 'allPower' : base,
          props,
          game
        )
  const cinematic = useCinematicSession(scene)
  if (!cinematic) return <Standard {...props} />
  if (base === 'save' && ['vip', 'coup'].includes(game.specialVeto?.activeType))
    return <Standard {...props} badgeOnly showDim={false} showCaption={false} durationMs={1000} />
  const coLohAssignments = (game.coLohIds ?? [])
    .map((coLohId) => ({ coLohId, nomineeId: game.coLohNomineeByCoLohId?.[coLohId] }))
    .filter((assignment) => assignment.nomineeId)
  const original =
    scene === 'replacement'
      ? { ...props, badgeOnly: false, showDim: true, showCaption: true }
      : scene === 'nominations' && coLohAssignments.length > 1
        ? {
            ...props,
            cinematicCoLohIds: game.coLohIds,
            cinematicCoLohAssignments: coLohAssignments,
          }
        : props
  return (
    <PremiumBridge
      key={`${props.caption}:${props.ariaLabel}`}
      scene={scene}
      standard={CeremonyHandoff}
      badgeOnlyHandoff={
        scene != null &&
        ['replacement', 'nominations', 'loh', 'safety', 'allPower', 'save'].includes(
          baseScene(scene)
        )
      }
      original={original}
    />
  )
}
