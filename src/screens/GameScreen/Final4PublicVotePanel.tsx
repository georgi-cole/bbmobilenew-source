import type { MouseEvent, PointerEvent } from 'react'
import type { Player } from '../../types'
import PlayerAvatar from '../../components/PlayerAvatar/PlayerAvatar'
import './Final4PublicVotePanel.css'

interface Final4PublicVotePanelProps {
  nominees: Player[]
  onSelect: (playerId: string) => void
}

export default function Final4PublicVotePanel({ nominees, onSelect }: Final4PublicVotePanelProps) {
  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>, playerId: string) => {
    if (event.button !== 0) return

    const { left, right, top, bottom, width, height } = event.currentTarget.getBoundingClientRect()
    if (
      width > 0 &&
      height > 0 &&
      (event.clientX < left ||
        event.clientX > right ||
        event.clientY < top ||
        event.clientY > bottom)
    ) {
      return
    }

    const button = event.currentTarget
    button.dataset.pointerVoteHandled = 'true'
    onSelect(playerId)
    window.setTimeout(() => {
      delete button.dataset.pointerVoteHandled
    }, 0)
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>, playerId: string) => {
    // Pointer activation is handled on release so the embedded browser
    // doesn't leave a tap looking inert. Ignore its follow-up click, but keep
    // click activation for keyboard users (detail === 0).
    if (event.detail > 0 && event.currentTarget.dataset.pointerVoteHandled === 'true') {
      delete event.currentTarget.dataset.pointerVoteHandled
      return
    }
    onSelect(playerId)
  }

  return (
    <div className="final4-public-vote" data-testid="final4-public-vote">
      <p className="final4-public-vote__eyebrow">Your decision is public</p>
      <div className="final4-public-vote__choices" role="group" aria-label="Final 4 vote choices">
        {nominees.map((nominee) => (
          <button
            key={nominee.id}
            className="final4-public-vote__choice"
            type="button"
            aria-label={`Vote to eliminate ${nominee.name}`}
            onPointerUp={(event) => handlePointerUp(event, nominee.id)}
            onClick={(event) => handleClick(event, nominee.id)}
          >
            <PlayerAvatar player={nominee} size="sm" />
            <span>{nominee.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
