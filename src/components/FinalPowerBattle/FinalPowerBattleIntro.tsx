import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './FinalPowerBattle.css'

interface Props {
  finalists: Player[]
  mode: 'classic' | 'vox_populi'
  onComplete: () => void
}

const OPENING_BEAT_MS = 2200
const PART_BEAT_MS = 2600
const READY_BEAT = 4

const BEATS = [
  {
    label: 'Finale night',
    title: 'The Final Power Battle',
    copy: 'Three finalists. Three parts. Two places in the Final Two.',
  },
  {
    label: 'Part 1 · The opening',
    title: 'One advances',
    copy: 'All three compete. The winner advances directly to Part 3.',
  },
  {
    label: 'Part 2 · The qualifier',
    title: 'One last place',
    copy: 'The other two compete for the remaining seat in Part 3.',
  },
  {
    label: 'Part 3 · The decision',
    title: 'Power changes everything',
    copy: 'The winner earns the final say on who joins them in the Final Two.',
  },
  {
    label: 'Ready when you are',
    title: 'The finale begins here',
    copy: 'Three finalists are ready to make their first move.',
  },
] as const

export default function FinalPowerBattleIntro({ finalists, mode, onComplete }: Props) {
  const [beat, setBeat] = useState(0)
  const beatRef = useRef(0)
  const completedRef = useRef(false)

  useLayoutEffect(() => {
    beatRef.current = beat
  }, [beat])

  useEffect(() => {
    if (beat >= READY_BEAT) return
    const timer = window.setTimeout(
      () => setBeat((current) => Math.min(READY_BEAT, current + 1)),
      beat === 0 ? OPENING_BEAT_MS : PART_BEAT_MS
    )
    return () => window.clearTimeout(timer)
  }, [beat])

  useEffect(() => {
    const handlePlay = (event: Event) => {
      if (completedRef.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (beatRef.current < READY_BEAT) {
        setBeat(READY_BEAT)
        return
      }
      completedRef.current = true
      onComplete()
    }
    window.addEventListener('ui:playPressed', handlePlay, { capture: true })
    return () => window.removeEventListener('ui:playPressed', handlePlay, { capture: true })
  }, [onComplete])

  const currentBeat = BEATS[beat]

  return (
    <section
      className="fpb-intro fpb-intro--inline"
      role="region"
      aria-label="Final Power Battle introduction"
      aria-live="polite"
      data-beat={beat}
    >
      <div className="fpb-intro__scan" aria-hidden="true" />
      <p className="fpb-intro__network">THE BIG EYE · FINALE NIGHT</p>
      <div className="fpb-intro__finalists" aria-label="Finalists">
        {finalists.slice(0, 3).map((player, index) => (
          <div className={`fpb-intro__finalist fpb-intro__finalist--${index + 1}`} key={player.id}>
            <PlayerAvatar player={player} size="sm" showEvictedStyle={false} />
            <span>{player.name}</span>
          </div>
        ))}
      </div>

      <div className="fpb-intro__copy" key={`beat-${beat}`}>
        <p className="fpb-intro__eyebrow">{currentBeat.label}</p>
        <h2>{currentBeat.title}</h2>
        <p className="fpb-intro__lead">
          {beat === 3 && mode === 'vox_populi'
            ? 'The winner earns final immunity. The audience decides the last Final Two place.'
            : currentBeat.copy}
        </p>
      </div>

      <div className="fpb-intro__progress" aria-label={`Finale introduction beat ${beat + 1} of 5`}>
        {BEATS.map((item, index) => (
          <span className={index <= beat ? 'is-active' : ''} key={item.label} aria-hidden="true" />
        ))}
      </div>
      <p className="fpb-intro__play-cue">
        {beat === READY_BEAT ? 'Press Play to begin Part 1.' : 'The finale story is unfolding.'}
      </p>
    </section>
  )
}
