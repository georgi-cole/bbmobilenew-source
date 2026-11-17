import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './HubmateChoiceChip.css'

interface Props {
  player: Player
  selected: boolean
  onClick: () => void
  label?: string
}

export default function HubmateChoiceChip({ player, selected, onClick, label }: Props) {
  return (
    <button
      type="button"
      className={`hubmate-choice-chip${selected ? ' hubmate-choice-chip--selected' : ''}`}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
    >
      <PlayerAvatar player={player} size="sm" showRelationshipOutline={false} />
      <span className="hubmate-choice-chip__name">{player.name}</span>
    </button>
  )
}
