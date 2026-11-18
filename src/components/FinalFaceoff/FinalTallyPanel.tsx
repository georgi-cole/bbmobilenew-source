import type { Player } from '../../types'
import type { RefObject } from 'react'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import './FinalTallyPanel.css'

interface Props {
  finalists: Player[]
  tally: Record<string, number>
  introducingFinalists?: boolean
  latestFinalistId?: string
  pendingFinalistId?: string
  ballotDestination?: RefObject<HTMLElement | null>
  remainingBallots?: { jurorId: string; name: string; finalistId: string }[]
}

export default function FinalTallyPanel({
  finalists,
  tally,
  introducingFinalists,
  latestFinalistId,
  pendingFinalistId,
  ballotDestination,
  remainingBallots,
}: Props) {
  const isFinal = remainingBallots !== undefined
  const hasRemaining = Boolean(remainingBallots?.length)

  return (
    <div
      className={`fo-score fo-score--${isFinal ? 'final' : 'live'}${introducingFinalists ? ' fo-score--introducing' : ''}`}
    >
      {(isFinal || introducingFinalists) && (
        <div className="fo-score__tableau" aria-hidden="true">
          {finalists.map((finalist) => (
            <div className="fo-score__portrait" key={finalist.id}>
              <FullSizeCutoutImage player={finalist} attire="formal" alt="" draggable={false} />
            </div>
          ))}
        </div>
      )}
      <div
        className="fo-score__lineup"
        role={hasRemaining ? 'region' : 'group'}
        aria-label={hasRemaining ? 'Remaining ballots' : 'Tribunal vote tally'}
      >
        {finalists.map((finalist) => {
          const count = tally[finalist.id] ?? 0
          const extraVotes = remainingBallots?.filter((vote) => vote.finalistId === finalist.id)
          const justCounted = latestFinalistId === finalist.id
          const pending = pendingFinalistId === finalist.id
          return (
            <div className="fo-score__side" key={finalist.id}>
              <div className="fo-score__total">
                <span className="fo-score__name">{finalist.name}</span>
                <span
                  className="fo-score__count"
                  key={count}
                  aria-label={`${finalist.name}: ${count} votes`}
                  data-registering={justCounted || undefined}
                >
                  {count}
                </span>
              </div>
              <div className="fo-score__seals" aria-hidden="true">
                {Array.from({ length: count }, (_, index) => (
                  <i
                    key={index}
                    data-registering={(justCounted && index === count - 1) || undefined}
                  />
                ))}
                {pending && <i ref={ballotDestination} data-pending />}
              </div>
              {Boolean(extraVotes?.length) && (
                <ul
                  className="fo-score__voters"
                  aria-label={`Remaining votes for ${finalist.name}`}
                >
                  {extraVotes?.map((vote) => (
                    <li key={vote.jurorId}>{vote.name}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      {hasRemaining && <p className="fo-score__signature">Remaining ballots included</p>}
    </div>
  )
}
