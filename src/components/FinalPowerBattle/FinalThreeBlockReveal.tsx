import { useEffect, useRef } from 'react'
import type { Player } from '../../types'
import duelBackdrop from '../../assets/finale/final-power-battle-duel.webp'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './FinalPowerBattle.css'

interface Props {
  blockPlayer: Player
  competitors: Player[]
  mode: 'classic' | 'vox_populi'
  onComplete: () => void
}

export default function FinalThreeBlockReveal({
  blockPlayer,
  competitors,
  mode,
  onComplete,
}: Props) {
  const completedRef = useRef(false)

  useEffect(() => {
    const handlePlay = (event: Event) => {
      if (completedRef.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      completedRef.current = true
      onComplete()
    }
    window.addEventListener('ui:playPressed', handlePlay)
    return () => window.removeEventListener('ui:playPressed', handlePlay)
  }, [onComplete])

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
      <div className="fpb-block__backdrop" aria-hidden="true">
        <div
          className="fpb-block__backdrop-image"
          style={{ backgroundImage: `url("${duelBackdrop}")` }}
        />
      </div>
      <div className="fpb-block__atmosphere" aria-hidden="true" />
      <p className="fpb-block__network">LIVE FROM THE BACKYARD · THE BIG EYE</p>
      <div className="fpb-block__scene-plane">
        <div
          className="fpb-block__nominee-monitor"
          role="group"
          aria-label={`${blockPlayer.name} is nominated; awaiting one more nominee`}
        >
          <div className="fpb-block__monitor-slots">
            <div className="fpb-block__monitor-player">
              <PlayerAvatar
                player={blockPlayer}
                size="md"
                className="fpb-block__nominee-avatar"
                showRelationshipOutline={false}
                showEvictedStyle={false}
              />
              <div>
                <strong>{blockPlayer.name}</strong>
              </div>
            </div>
            <div className="fpb-block__monitor-player fpb-block__monitor-player--pending">
              <span className="fpb-block__wildcard-avatar" aria-hidden="true">
                ?
              </span>
              <div>
                <strong>Next</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
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
              <FullSizeCutoutImage
                player={player}
                attire="informal"
                className="fpb-block__competitor-cutout"
                alt=""
                draggable={false}
              />
            </div>
          ))}
          {competitors.length > 1 && <span className="fpb-block__vs">VS</span>}
        </div>
      </div>
      <div className="fpb-block__platform-names" aria-hidden="true">
        {competitors.slice(0, 2).map((player, index) => (
          <span
            className={`fpb-block__platform-name fpb-block__platform-name--${index + 1}`}
            key={player.id}
          >
            {player.name}
          </span>
        ))}
      </div>
      <div className="fpb-block__copy">
        <p className="fpb-block__eyebrow">PART 3</p>
        <h2>The Final Power Battle</h2>
        <p>{battleRule}</p>
      </div>
    </section>
  )
}
