import { memo, type CSSProperties } from 'react'
import ResolvedAvatarImage from '../ResolvedAvatarImage/ResolvedAvatarImage'
import type { HouseOfCardsBoardCard } from './houseOfCardsUtils'

export const HouseOfCardsCard = memo(function HouseOfCardsCard({
  card,
  flipped,
  disabled,
  premiumPresentation,
  isFinal,
  humanId,
  onChoose,
}: {
  card: HouseOfCardsBoardCard
  flipped: boolean
  disabled: boolean
  premiumPresentation: boolean
  isFinal: boolean
  humanId: string | null
  onChoose: (index: number) => void
}) {
  return (
    <button
      key={card.index}
      className="hoc-card"
      style={
        {
          '--hoc-card-index': card.index,
        } as CSSProperties
      }
      type="button"
      role="gridcell"
      data-flipped={flipped ? 'true' : 'false'}
      data-matched={card.isMatched ? 'true' : 'false'}
      data-mismatch={card.isMismatch ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => onChoose(card.index)}
      aria-label={flipped || card.isMatched ? (card.portraitName ?? card.symbol) : 'Hidden card'}
    >
      <span className="hoc-card-inner">
        <span className="hoc-card-face hoc-card-back">
          <span className="hoc-card-back-pattern" />
          {premiumPresentation && (
            <img
              className="hoc-premium-card-art"
              src={`${import.meta.env.BASE_URL}assets/minigames/deck-of-light-card-back.webp`}
              alt=""
              aria-hidden="true"
            />
          )}
          <svg className="hoc-card-eye" viewBox="0 0 24 24" aria-hidden="true">
            <ellipse cx="12" cy="12" rx="10" ry="6" />
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="1.2" className="hoc-card-eye-pupil" />
          </svg>
        </span>
        <span
          className={`hoc-card-face hoc-card-front${card.portraitPlayerId ? ' hoc-portrait-face' : ''}`}
        >
          {card.portraitPlayerId && card.portraitName ? (
            <>
              <ResolvedAvatarImage
                className="hoc-portrait-face__image"
                id={card.portraitPlayerId}
                name={card.portraitName}
                avatar={card.portraitAvatar}
                isUser={card.portraitPlayerId === humanId}
                alt=""
                loading={isFinal ? 'eager' : 'lazy'}
              />
              <span className="hoc-portrait-face__name">{card.portraitName}</span>
              {card.portraitBadge && (
                <span className="hoc-portrait-face__badge">{card.portraitBadge}</span>
              )}
            </>
          ) : (
            card.symbol
          )}
        </span>
      </span>
    </button>
  )
})
