import type { Player } from '../../types'
import FinalThreeStage from '../FinalThreeStage/FinalThreeStage'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import './ChampionFinaleStage.css'

interface Props {
  winner: Player
  runnerUp: Player | null
  season: number
  decidedBy: 'tribunal' | 'audience'
  revealed: boolean
  active: boolean
  onContinue: () => void
}

/** One coronation for Classic and Vox, independent of their voting mechanics. */
export default function ChampionFinaleStage({
  winner,
  runnerUp,
  season,
  decidedBy,
  revealed,
  active,
  onContinue,
}: Props) {
  return (
    <section
      className="season-finale season-finale--winner season-finale--champion"
      data-presentation-root="season-winner"
      data-presentation-suspended={!active || undefined}
      data-champion-revealed={revealed}
      data-winner-id={revealed ? winner.id : undefined}
      data-final-vote={decidedBy}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`Season ${season} champion coronation`}
    >
      <FinalThreeStage scene="champion">
        <div className="season-finale__champion-monitor" aria-live="polite" aria-atomic="true">
          <span className="season-finale__champion-eyebrow">
            Season {season} · The Final Verdict
          </span>
          {revealed ? (
            <>
              <h2>{winner.name}</h2>
              <p>
                {decidedBy === 'audience'
                  ? 'Chosen by the public · Season champion'
                  : 'Chosen by the Tribunal · Season champion'}
              </p>
            </>
          ) : (
            <>
              <h2>The Big Eye</h2>
              <p>One season. One champion.</p>
            </>
          )}
        </div>
      </FinalThreeStage>

      <div className="season-finale__champion-stage" aria-hidden="true">
        {runnerUp && (
          <div className="season-finale__champion-player season-finale__champion-player--runner">
            <span className="season-finale__champion-light" />
            <span className="season-finale__champion-podium" />
            <FullSizeCutoutImage player={runnerUp} attire="formal" alt="" draggable={false} />
          </div>
        )}
        <div className="season-finale__champion-player season-finale__champion-player--winner">
          <span className="season-finale__champion-light" />
          <span className="season-finale__champion-podium" />
          <FullSizeCutoutImage player={winner} attire="formal" alt="" draggable={false} />
        </div>
      </div>
      {revealed && (
        <>
          <div className="season-finale__champion-confetti" aria-hidden="true" />
          <div className="season-finale__champion-footer">
            {runnerUp && (
              <p className="season-finale__champion-runner-label">
                Runner-up · {runnerUp.name}
              </p>
            )}
            <button className="season-finale__champion-continue" type="button" onClick={onContinue}>
              Continue to winner interview
            </button>
          </div>
        </>
      )}
    </section>
  )
}
