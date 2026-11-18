import type { Player } from '../../types'
import { joinPublicAssetPath } from '../../utils/avatar'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import FinaleContinueButton from '../FinalThreeStage/FinaleContinueButton'
import { FINAL_THREE_SET_ASSETS } from '../FinalThreeStage/finalThreeSetAssets'
import ChampionFireworks from './ChampionFireworks'
import './ChampionFinaleStage.css'

interface Props {
  winner: Player
  season: number
  decidedBy: 'tribunal' | 'audience'
  revealed: boolean
  active: boolean
  animate?: boolean
  onContinue: () => void
}

/** Leave the voting set for one winner's public celebration. */
export default function ChampionFinaleStage({
  winner,
  season,
  decidedBy,
  revealed,
  active,
  animate = true,
  onContinue,
}: Props) {
  return (
    <section
      className="season-finale season-finale--winner season-finale--champion"
      data-presentation-root="season-winner"
      data-presentation-suspended={!active || undefined}
      data-champion-revealed={revealed}
      data-motion={animate ? 'full' : 'reduced'}
      data-winner-id={revealed ? winner.id : undefined}
      data-final-vote={decidedBy}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`Season ${season} champion coronation`}
    >
      <div className="season-finale__champion-frame">
        <img
          className="season-finale__champion-backdrop"
          src={joinPublicAssetPath('assets/ceremonies/shared/winner-stage.webp')}
          alt=""
          draggable={false}
        />
        <div className="season-finale__champion-shade" aria-hidden="true" />
        <img className="season-finale__champion-eye" src={FINAL_THREE_SET_ASSETS.eye} alt="" />
        <div className="season-finale__champion-heading" aria-live="polite" aria-atomic="true">
          <span className="season-finale__champion-eyebrow">Season {season} · The champion</span>
          <h2>{revealed ? winner.name : 'One season. One champion.'}</h2>
          {revealed && <p>Chosen by {decidedBy === 'audience' ? 'the public' : 'the Tribunal'}</p>}
        </div>
        <div className="season-finale__champion-stage" aria-hidden="true" hidden={!revealed}>
          <span className="season-finale__champion-contact" />
          <FullSizeCutoutImage
            className="season-finale__champion-cutout"
            player={winner}
            attire="formal"
            grounded
            alt=""
            draggable={false}
          />
        </div>
        {revealed && animate && <ChampionFireworks />}
        {revealed && (
          <FinaleContinueButton ariaLabel="Continue to winner interview" onContinue={onContinue} />
        )}
      </div>
    </section>
  )
}
