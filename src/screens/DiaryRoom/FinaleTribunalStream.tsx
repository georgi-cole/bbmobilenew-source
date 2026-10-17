import { useEffect, useRef, useState } from 'react'
import type { Player, WeekendTribunalSpeech } from '../../types'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import { preloadImages } from '../../utils/preloadImages'
import PlayerAvatar from '../../components/PlayerAvatar/PlayerAvatar'
import { TRIBUNAL_BACKDROP_SRC, TRIBUNAL_BACKDROP_STYLE } from './diaryRoomAssets'
import './FinaleTribunalStream.css'

interface FinaleTribunalStreamProps {
  speeches: WeekendTribunalSpeech[]
  players: Player[]
  onClose: () => void
}

export default function FinaleTribunalStream({
  speeches,
  players,
  onClose,
}: FinaleTribunalStreamProps) {
  const [visibleSpeechCount, setVisibleSpeechCount] = useState(0)
  const chatRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    preloadImages([TRIBUNAL_BACKDROP_SRC])
  }, [])

  useEffect(() => {
    if (visibleSpeechCount >= speeches.length) return
    const timeout = window.setTimeout(
      () => setVisibleSpeechCount((count) => Math.min(count + 1, speeches.length)),
      visibleSpeechCount === 0 ? 700 : 1150
    )
    return () => window.clearTimeout(timeout)
  }, [speeches.length, visibleSpeechCount])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [visibleSpeechCount])

  return (
    <div className="diary-room diary-room__tribunal-stream" style={TRIBUNAL_BACKDROP_STYLE}>
      <div className="diary-room__shell">
        <header className="diary-room__header diary-room__tribunal-header">
          <GameBackButton
            className="diary-room__back"
            label="Return to the game"
            onClick={onClose}
          />
          <div className="diary-room__tribunal-heading">
            <span className="diary-room__tribunal-eyebrow">SPECIAL STREAM</span>
            <h1 className="diary-room__title">Tribunal Sequester</h1>
          </div>
        </header>

        <main className="diary-room__body diary-room__tribunal-body">
          <p className="diary-room__tribunal-intro">
            Behind closed doors, the Tribunal weighs the finalists’ games.
          </p>

          <section
            className="diary-room__chat diary-room__tribunal-chat"
            role="log"
            aria-label="Tribunal conversation"
            aria-live="polite"
            ref={chatRef}
          >
            {speeches.slice(0, visibleSpeechCount).map((speech, index) => {
              const speaker = speech.speakerId
                ? players.find((player) => player.id === speech.speakerId)
                : undefined
              const stance = speech.stance ?? 'neutral'
              return (
                <article
                  key={`${speech.speakerId ?? speech.speakerName}-${index}`}
                  className={`diary-room__tribunal-message diary-room__tribunal-message--${stance}`}
                >
                  {speaker ? (
                    <PlayerAvatar player={speaker} size="sm" showRelationshipOutline={false} />
                  ) : (
                    <span className="diary-room__tribunal-avatar-fallback" aria-hidden="true">
                      ◉
                    </span>
                  )}
                  <div className="diary-room__bubble diary-room__bubble--bb diary-room__tribunal-bubble">
                    <span className="diary-room__bubble-author">{speech.speakerName}</span>
                    <span className="diary-room__bubble-text">{speech.text}</span>
                  </div>
                </article>
              )
            })}
            {visibleSpeechCount < speeches.length && (
              <div
                className="diary-room__tribunal-typing"
                role="status"
                aria-label="Tribunal members are speaking"
              >
                <span />
                <span />
                <span />
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
