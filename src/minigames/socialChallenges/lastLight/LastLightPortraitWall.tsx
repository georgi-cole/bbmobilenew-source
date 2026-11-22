import { joinPublicAssetPath } from '../../../utils/avatar'
import { ChallengePortrait } from '../ChallengeStage'
import type { ChallengePlayer } from '../shared'

const frameUrl = joinPublicAssetPath('assets/dressing-room/antique-gold-frame.webp')

export function LastLightPortraitWall({
  players,
  selected,
  previousTarget,
  eligibleTargets,
  framed,
  onSelect,
}: {
  players: readonly ChallengePlayer[]
  selected?: string
  previousTarget?: string
  eligibleTargets: readonly string[]
  framed: boolean
  onSelect: (id: string) => void
}) {
  return (
    <div
      className="last-light__wall"
      role="group"
      aria-label="Active player portraits"
      data-count={players.length}
    >
      {players.map((player) => {
        const isPrevious = player.id === previousTarget
        const portrait = (
          <>
            <ChallengePortrait player={player} />
            {framed && <img className="last-light__portrait-frame" src={frameUrl} alt="" />}
            {isPrevious && <span className="last-light__last-pick">Last pick</span>}
          </>
        )
        return player.isHuman ? (
          <div className="last-light__wall-entry" key={player.id} data-self="true">
            {portrait}
          </div>
        ) : (
          <button
            type="button"
            className="last-light__wall-entry"
            key={player.id}
            data-eligible={eligibleTargets.includes(player.id)}
            aria-label={`Inspect ${player.name}${isPrevious ? ', your last pick' : ''}`}
            aria-pressed={selected === player.id}
            onClick={() => onSelect(player.id)}
          >
            {portrait}
          </button>
        )
      })}
    </div>
  )
}
