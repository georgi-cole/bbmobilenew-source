import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './ReunionGuestInteractionDialog.css'

type ReunionAction = 'clear-the-air' | 'lay-low' | 'compliment'

const ACTIONS: Array<{ id: ReunionAction; label: string }> = [
  { id: 'clear-the-air', label: 'Clear the air' },
  { id: 'lay-low', label: 'Lay low' },
  { id: 'compliment', label: 'Compliment' },
]

const REPLIES: Record<ReunionAction, string> = {
  'clear-the-air': 'I’m glad we got the chance to talk.',
  'lay-low': 'No pressure. Let’s just enjoy tonight.',
  compliment: 'That’s kind of you. I needed that.',
}

type Props = {
  player: Player
  onClose: () => void
}

export default function ReunionGuestInteractionDialog({ player, onClose }: Props) {
  const [chosenAction, setChosenAction] = useState<ReunionAction | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    dialogRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return createPortal(
    <div
      className="reunion-chat-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="reunion-chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reunion-chat-title"
        tabIndex={-1}
      >
        <button
          className="reunion-chat-close"
          type="button"
          aria-label="Close conversation"
          onClick={onClose}
        >
          ×
        </button>

        <div className="reunion-chat-heading">
          <PlayerAvatar
            player={player}
            className="reunion-chat-avatar"
            size="lg"
            showRelationshipOutline={false}
            showEvictedStyle={false}
          />
          <div>
            <p className="reunion-chat-eyebrow">ONE LAST CONVERSATION</p>
            <h2 id="reunion-chat-title">{player.name}</h2>
          </div>
        </div>

        {chosenAction ? (
          <div className="reunion-chat-reply" aria-live="polite">
            <span className="reunion-chat-action">
              {ACTIONS.find((action) => action.id === chosenAction)?.label}
            </span>
            <p>“{REPLIES[chosenAction]}”</p>
            <button className="reunion-chat-done" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="reunion-chat-prompt">How do you want to spend this moment?</p>
            <div className="reunion-chat-actions">
              {ACTIONS.map((action) => (
                <button
                  key={action.id}
                  className="reunion-chat-action-button"
                  type="button"
                  onClick={() => setChosenAction(action.id)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
