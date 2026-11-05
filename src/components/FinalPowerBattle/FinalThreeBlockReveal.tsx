import type { Player } from '../../types'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import FinalThreeStage from '../FinalThreeStage/FinalThreeStage'
import FinalThreePodium from '../FinalThreeStage/FinalThreePodium'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './FinalPowerBattle.css'

interface Props {
  blockPlayer: Player
  competitors: Player[]
  mode: 'classic' | 'vox_populi'
}

export default function FinalThreeBlockReveal({ blockPlayer, competitors, mode }: Props) {
  const battleRule =
    mode === 'vox_populi'
      ? 'Winner earns immunity. The audience decides the final place.'
      : 'Winner chooses who joins them in the Final Two.'

  return (
    <section
      className="fpb-block"
      role="dialog"
      aria-modal="true"
      aria-label="Final Power Battle setup"
    >
      <FinalThreeStage scene="block">
        <div
          className="fpb-block__nominee-monitor"
          role="group"
          aria-label={`${blockPlayer.name} is nominated; awaiting one more nominee`}
        >
          <h2 className="fpb-block__monitor-kicker">Part 3 · Final Power Battle</h2>
          <div className="fpb-block__monitor-slots">
            <div className="fpb-block__monitor-player">
              <PlayerAvatar
                player={blockPlayer}
                size="md"
                className="fpb-block__nominee-avatar"
                showRelationshipOutline={false}
                showEvictedStyle={false}
              />
              <strong>{blockPlayer.name}</strong>
            </div>
            <div className="fpb-block__monitor-player fpb-block__monitor-player--pending">
              <span className="fpb-block__wildcard-avatar" aria-hidden="true">
                ?
              </span>
              <strong>Next</strong>
            </div>
          </div>
          <p className="fpb-block__monitor-rule">{battleRule}</p>
        </div>
      </FinalThreeStage>
      <div
        className="fpb-block__stage"
        role="group"
        aria-label="The two Final Power Battle competitors"
      >
        <div className="fpb-block__versus" aria-label="Final Power Battle competitors">
          {competitors.slice(0, 2).map((player, index) => (
            <div
              className={`fpb-block__competitor fpb-block__competitor--${index + 1}`}
              key={player.id}
              role="group"
              aria-label={`${player.name}, competitor ${index + 1}`}
            >
              <span className="fpb-block__competitor-light" aria-hidden="true" />
              <FinalThreePodium className="fpb-block__podium" />
              <FullSizeCutoutImage
                player={player}
                attire="informal"
                grounded
                className="fpb-block__competitor-cutout"
                alt=""
                draggable={false}
              />
              <span className="fpb-block__platform-name">{player.name}</span>
            </div>
          ))}
          {competitors.length > 1 && <span className="fpb-block__vs">VS</span>}
        </div>
      </div>
    </section>
  )
}
