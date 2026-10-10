import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import PlayerAvatar from '../../components/PlayerAvatar/PlayerAvatar'
import RealityLedger from '../../components/RealityLedger/RealityLedger'
import {
  combinedLiveRelationship,
  liveRelationshipLabel,
  liveRelationshipMetrics,
} from '../../components/RealityLedger/relationshipRead'
import { getRelationshipLabel } from '../../components/SocialPanelV2/relationshipUtils'
import { useAppSelector } from '../../store/hooks'
import { getIntelLeadViews } from '../../social/intelligenceSystem'
import { getEffectiveSocialMode } from '../../social/socialMode'
import { selectCanonicalRelationshipView } from '../../social/relationshipSemantics'
import { getRealityAllianceKnowledgeView } from '../../social/reality'
import type {
  TieBreakerAllianceAdvice,
  TieBreakerRecommendation,
} from '../../social/tieBreakerStrategy'
import type { Player } from '../../types'
import './ConfessionalDecisionBriefing.css'

interface Props {
  playerIds: readonly string[]
  selectedPlayerIds?: readonly string[]
  allianceAdvice?: readonly TieBreakerAllianceAdvice[]
  recommendation?: TieBreakerRecommendation | null
  onUseAdvice?: (playerId: string) => void
}

function ReadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  )
}

function ReadSheet({
  targets,
  initialPlayerId,
  allianceAdvice = [],
  recommendation,
  onUseAdvice,
  onClose,
}: Omit<Props, 'playerIds' | 'selectedPlayerIds'> & {
  targets: Player[]
  initialPlayerId: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const adviceRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const [playerId, setPlayerId] = useState(initialPlayerId)
  const game = useAppSelector((state) => state.game)
  const social = useAppSelector((state) => state.social)
  const realityMode = useAppSelector((state) => getEffectiveSocialMode(state) === 'drama')
  const humanId = game.players.find((player) => player.isUser)?.id
  const target = targets.find((player) => player.id === playerId) ?? targets[0]

  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  if (!humanId || !target) return null

  const relationship = selectCanonicalRelationshipView({
    relationships: social.relationships,
    reality: social.reality,
    actorId: humanId,
    targetId: target.id,
  })
  const live = combinedLiveRelationship(social.relationships, humanId, target.id)
  const edge = social.reality.relationships[humanId]?.[target.id]
  const affinity = realityMode ? live?.affinity : relationship.affinity
  const label =
    realityMode && edge
      ? liveRelationshipLabel(edge, live)
      : affinity === undefined
        ? 'Still forming'
        : getRelationshipLabel(affinity).label
  const alliance = relationship.alliance?.operational
    ? getRealityAllianceKnowledgeView(social.reality, relationship.alliance.id, humanId)
    : null
  const intel = realityMode
    ? getIntelLeadViews(social.reality, humanId, game.players, game.week).filter((lead) =>
        lead.subjectIds.includes(target.id)
      )
    : []

  function selectFromAdvice(id: string) {
    onUseAdvice?.(id)
    closeSheet()
  }

  function closeSheet() {
    dialogRef.current?.close()
    onClose()
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="rcd-read-sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        closeSheet()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          closeSheet()
      }}
    >
      <header className="rcd-read-sheet__header">
        <div>
          <span className="rcd-read-sheet__eyebrow">Just for you</span>
          <h2 id={titleId}>Your read</h2>
        </div>
        <button
          type="button"
          className="rcd-read-sheet__close"
          aria-label="Close your read"
          onClick={closeSheet}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <nav className="rcd-read-sheet__people" aria-label="Review a housemate">
        {targets.map((player) => (
          <button
            type="button"
            key={player.id}
            aria-pressed={target.id === player.id}
            onClick={() => {
              setPlayerId(player.id)
              if (contentRef.current) contentRef.current.scrollTop = 0
            }}
          >
            <PlayerAvatar player={player} size="sm" showRelationshipOutline={false} />
            <span>{player.name}</span>
          </button>
        ))}
        {allianceAdvice.length > 0 && (
          <button
            type="button"
            className="rcd-read-sheet__advice-link"
            onClick={() => adviceRef.current?.scrollIntoView({ block: 'start' })}
          >
            Alliance advice <span aria-hidden="true">↓</span>
          </button>
        )}
      </nav>
      <div className="rcd-read-sheet__content" ref={contentRef}>
        <div className="rcd-read-sheet__profile">
          <PlayerAvatar player={target} size="lg" showRelationshipOutline={false} />
          <div>
            <h3>{target.name}</h3>
            <p>{label}</p>
            {alliance && alliance.level === 'MEMBER' && (
              <span className="rcd-read-sheet__alliance">
                {alliance.displayName ?? 'Shared alliance'}
              </span>
            )}
          </div>
        </div>
        {realityMode && edge && (
          <section
            className="rcd-read-sheet__section"
            aria-label={`Your relationship with ${target.name}`}
          >
            <h4>Relationship</h4>
            <div className="rcd-read-sheet__metrics">
              {liveRelationshipMetrics(edge, live).map(([name, rawValue]) => {
                const value = Math.max(
                  0,
                  Math.min(100, name === 'Tension' ? rawValue : (rawValue + 100) / 2)
                )
                const level = value >= 65 ? 'High' : value < 35 ? 'Low' : 'Moderate'
                return (
                  <div
                    className={`rcd-read-sheet__metric${name === 'Tension' ? ' rcd-read-sheet__metric--tension' : ''}`}
                    key={name}
                  >
                    <span>{name}</span>
                    <span
                      className="rcd-read-sheet__meter"
                      role="meter"
                      aria-label={name}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(value)}
                      aria-valuetext={level}
                      style={{ '--read-value': `${value}%` } as CSSProperties}
                    >
                      <i />
                    </span>
                    <small>{level}</small>
                  </div>
                )
              })}
            </div>
          </section>
        )}
        {realityMode && !edge && (
          <p className="rcd-read-sheet__quiet">
            You haven’t formed a detailed read on {target.name} yet.
          </p>
        )}
        {realityMode && (
          <section
            className="rcd-read-sheet__section rcd-read-sheet__commitments"
            aria-label="Promises and favors"
          >
            <h4>Promises &amp; favors</h4>
            <RealityLedger
              reality={social.reality}
              players={game.players}
              humanId={humanId}
              relationships={social.relationships}
              socialCommitments={social.commitments ?? []}
              section="deals"
              focusPlayerId={target.id}
              currentDay={game.week}
              compact
            />
          </section>
        )}
        {intel.length > 0 && (
          <section className="rcd-read-sheet__section" aria-label="Known intel">
            <h4>What you’ve learned</h4>
            {intel.slice(0, 3).map((lead) => (
              <article className="rcd-read-sheet__intel" key={lead.factId}>
                <p>{lead.text}</p>
                <small>
                  {lead.source} · {lead.confidence}
                </small>
              </article>
            ))}
          </section>
        )}
        {allianceAdvice.length > 0 && (
          <section className="rcd-read-sheet__section" aria-label="Alliance advice" ref={adviceRef}>
            <h4>From your alliance</h4>
            {allianceAdvice.map((advice) => (
              <article className="rcd-read-sheet__advice" key={advice.advisorId}>
                <strong>{advice.advisorName}</strong>
                <p>
                  Would eliminate {advice.nomineeName}. {advice.reason}
                </p>
                {onUseAdvice && (
                  <button type="button" onClick={() => selectFromAdvice(advice.nomineeId)}>
                    Select {advice.nomineeName}
                    <span aria-hidden="true">↗</span>
                  </button>
                )}
              </article>
            ))}
          </section>
        )}
        {recommendation && (
          <section className="rcd-read-sheet__section" aria-label="Strategic read">
            <h4>Strategic read</h4>
            <article className="rcd-read-sheet__advice">
              <strong>Consider eliminating {recommendation.nomineeName}</strong>
              <p>{recommendation.reason}</p>
              {onUseAdvice && (
                <button type="button" onClick={() => selectFromAdvice(recommendation.nomineeId)}>
                  Select {recommendation.nomineeName}
                  <span aria-hidden="true">↗</span>
                </button>
              )}
            </article>
          </section>
        )}
        <p className="rcd-read-sheet__privacy">
          Your perspective. Their private thoughts stay hidden.
        </p>
      </div>
    </dialog>,
    document.body
  )
}

export default function ConfessionalDecisionBriefing({
  playerIds,
  selectedPlayerIds = [],
  ...advice
}: Props) {
  const players = useAppSelector((state) => state.game.players)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const targets = [...new Set(playerIds)]
    .map((id) => players.find((player) => player.id === id && !player.isUser))
    .filter((player): player is Player => Boolean(player))
  if (targets.length === 0) return null

  const initialPlayerId =
    targets.find((player) => selectedPlayerIds.includes(player.id))?.id ?? targets[0].id
  return (
    <div className="rcd-decision-tools">
      <span>Before you decide</span>
      <button
        ref={triggerRef}
        type="button"
        className="rcd-read-trigger"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <ReadIcon />
        <span>Your read</span>
        <span className="rcd-read-trigger__arrow" aria-hidden="true">
          ↗
        </span>
      </button>
      {open && (
        <ReadSheet
          {...advice}
          targets={targets}
          initialPlayerId={initialPlayerId}
          onClose={() => {
            setOpen(false)
            triggerRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
