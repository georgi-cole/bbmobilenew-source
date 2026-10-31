import React from 'react'
import { useStore } from 'react-redux'
import Standard from '../../components/AnimatedVoteResultsModal/AnimatedVoteResultsModal'
import { PremiumBridge } from './bridge.jsx'
import { useCinematicSession } from './session.js'
import { publicResult } from './mode-routing.mjs'

export default function VoteResults(props) {
  const game = useStore().getState().game
  const scene =
    props.resultMode === 'public' && game.voxPopuli?.status === 'active' ? 'voxResults' : null
  const cinematic = useCinematicSession(scene)
  if (!cinematic) return <Standard {...props} />
  const outcome = publicResult(props)
  const complete = () => {
    if (outcome.kind === 'tie') {
      props.onTiebreakerRequired?.(outcome.ids)
      return
    }
    if (outcome.kind === 'public-tie') props.onPublicTiebreakResolved?.(outcome.ids)
    props.onDone()
  }
  // A genuinely new resolution remounts; ordinary parent renders cannot restart the film.
  const key = JSON.stringify([
    game.gameId,
    game.week,
    props.nominees.map((t) => [t.nominee.id, t.voteCount]),
    outcome,
  ])
  return (
    <PremiumBridge
      key={key}
      scene={scene}
      standard={Standard}
      original={{ ...props, onComplete: complete }}
      finishDirect
    />
  )
}
