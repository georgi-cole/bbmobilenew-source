import type { Player } from '../../types'
import backyardPlayfield from '../../assets/finale/final-power-battle-backyard.webp'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import './FinalPowerBattle.css'

interface Props {
  finalists: Player[]
  mode: 'classic' | 'vox_populi'
}

/** One concise scene: the shared dock owns the single Play-to-start action. */
export default function FinalPowerBattleIntro({ finalists, mode }: Props) {
  return (
    <section
      className="fpb-intro"
      role="region"
      aria-label="Final Power Battle introduction"
      aria-live="polite"
      data-beat={0}
    >
      <div
        className="fpb-intro__backdrop"
        style={{ backgroundImage: `url("${backyardPlayfield}")` }}
        aria-hidden="true"
      />
      <div className="fpb-intro__atmosphere" aria-hidden="true" />
      <p className="fpb-intro__network">LIVE FROM THE BACKYARD · THE BIG EYE</p>
      <div className="fpb-intro__copy">
        <p className="fpb-intro__eyebrow">Final Three · One final battle</p>
        <h2>The Final Power Battle</h2>
        <p className="fpb-intro__lead">
          Three finalists. Two qualifiers. One final duel.{' '}
          {mode === 'vox_populi'
            ? 'The winner earns final immunity.'
            : 'The winner earns final power.'}{' '}
          Press Play to begin.
        </p>
      </div>

      <div className="fpb-intro__stage" role="list" aria-label="Finalists">
        {finalists.slice(0, 3).map((player, index) => (
          <div
            className={`fpb-intro__panel fpb-intro__panel--${index + 1}`}
            key={player.id}
            aria-label={player.name}
            role="listitem"
          >
            <span className="fpb-intro__panel-light" aria-hidden="true" />
            <FullSizeCutoutImage
              player={player}
              attire="informal"
              className="fpb-intro__cutout"
              alt=""
              draggable={false}
            />
            <span className="fpb-intro__name">{player.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
