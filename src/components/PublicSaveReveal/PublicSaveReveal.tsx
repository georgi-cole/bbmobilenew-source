import { memo, useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import type { CupidArrowPair, Player } from '../../types'
import { store } from '../../store/store'
import { normalisePublicSaveVoteShares } from '../../publicOpinion/PublicSaveService'
import { completeDramaPublicSave } from '../../publicOpinion/DramaPublicSaveIntegration'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { usePresentationTimeline } from '../../services/presentation/usePresentationTimeline'
import {
  PRESENTATION_PRIORITY,
  usePresentationOwner,
  usePresentationForeground,
} from '../../services/presentation/presentationOwnership'
import './PublicSaveReveal.css'

export interface PublicSaveRevealProps {
  nominees: Player[]
  /** Audience ballot scores or precomputed vote shares, normalised to exactly 100%. */
  approvals: Record<string, number>
  savedId: string
  tieBreakUsed?: boolean
  /** Active Cupid pairs are rendered as one compact, shared-vote TV unit. */
  pairs?: CupidArrowPair[]
  onDone: () => void
}

type PublicSaveDisplayUnit = {
  id: string
  members: Player[]
  label: string
  voteShare: number
  color?: string
}

function buildPublicSaveDisplayUnits(
  nominees: Player[],
  voteShares: Record<string, number>,
  pairs: CupidArrowPair[] = []
): PublicSaveDisplayUnit[] {
  if (pairs.length === 0) {
    return nominees.map((player) => ({
      id: player.id,
      members: [player],
      label: player.name,
      voteShare: voteShares[player.id] ?? 0,
    }))
  }

  const nomineeById = new Map(nominees.map((player) => [player.id, player]))
  const consumedIds = new Set<string>()
  const units: PublicSaveDisplayUnit[] = []
  nominees.forEach((player) => {
    if (consumedIds.has(player.id)) return
    const pair = pairs.find((candidate) => candidate.memberIds.includes(player.id))
    const members = pair
      ? pair.memberIds
          .map((id) => nomineeById.get(id))
          .filter((member): member is Player => Boolean(member))
      : [player]
    members.forEach((member) => consumedIds.add(member.id))
    units.push({
      id: pair?.id ?? player.id,
      members,
      label: members.map((member) => member.name).join(' & '),
      voteShare: members.reduce((sum, member) => sum + (voteShares[member.id] ?? 0), 0),
      color: pair?.color,
    })
  })
  return units
}

type AnimPhase = 'entering' | 'revealing' | 'saved' | 'exiting'

const ENTER_TO_REVEAL_MS = 900
const COUNT_VALUES_MS = 3600
const SHOW_SAVED_MS = 7600
const EXIT_MS = 9300
const DONE_MS = 10000

function formatShare(value: number): string {
  const rounded = Number(value.toFixed(4))
  const formatted = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return `${formatted}%`
}

const PublicSaveShareCount = memo(function PublicSaveShareCount({
  label,
  value,
  phase,
  active,
}: {
  label: string
  value: number
  phase: AnimPhase
  active: boolean
}) {
  const [displayedValue, setDisplayedValue] = useState(0)
  const elapsedRef = useRef(0)

  useEffect(() => {
    if (!active || phase !== 'revealing' || elapsedRef.current >= COUNT_VALUES_MS) return undefined

    let animationFrame = 0
    const startedAt = performance.now() - elapsedRef.current
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / COUNT_VALUES_MS)
      elapsedRef.current = progress * COUNT_VALUES_MS
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayedValue(value * eased)
      if (progress < 1) animationFrame = window.requestAnimationFrame(tick)
      else setDisplayedValue(value)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [active, phase, value])

  return (
    <span
      className={`psr__approval-value${phase === 'revealing' ? ' psr__approval-value--counting' : ''}`}
      aria-label={`${label} save vote: ${phase === 'revealing' ? 'counting' : formatShare(value)}`}
    >
      {phase === 'entering' ? '—' : formatShare(phase === 'revealing' ? displayedValue : value)}
    </span>
  )
})

function NormalPublicSaveReveal({
  nominees,
  voteShares,
  savedId,
  tieBreakUsed,
  pairs,
  onDone,
}: {
  nominees: Player[]
  voteShares: Record<string, number>
  savedId: string
  tieBreakUsed: boolean
  pairs?: CupidArrowPair[]
  onDone: () => void
}) {
  const [phase, setPhase] = useState<AnimPhase>('entering')
  const reducedMotion = usePresentationReducedMotion()
  const { isOwner } = usePresentationOwner('public-save', PRESENTATION_PRIORITY.audienceResult)
  const active = usePresentationForeground() && isOwner
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  const displayUnits = useMemo(
    () => buildPublicSaveDisplayUnits(nominees, voteShares, pairs),
    [nominees, pairs, voteShares]
  )
  const savedUnit = displayUnits.find((unit) =>
    unit.members.some((member) => member.id === savedId)
  )
  const hasPairedUnits = displayUnits.some((unit) => unit.members.length > 1)
  const displayedTie = Boolean(
    savedUnit &&
    displayUnits.some(
      (unit) =>
        unit.id !== savedUnit.id && formatShare(unit.voteShare) === formatShare(savedUnit.voteShare)
    )
  )
  const decisionNote = tieBreakUsed
    ? 'Audience scores tied. Season average, completed goals, then stable player order settled the save.'
    : displayedTie
      ? 'These shares match at 0.0001% precision. The saved result follows the full audience-ballot calculation.'
      : null

  const fireDone = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onDoneRef.current()
  }, [])

  const cues = useMemo(
    () =>
      reducedMotion
        ? [{ atMs: 0, run: fireDone }]
        : [
            { atMs: ENTER_TO_REVEAL_MS, run: () => setPhase('revealing') },
            { atMs: SHOW_SAVED_MS, run: () => setPhase('saved') },
            { atMs: EXIT_MS, run: () => setPhase('exiting') },
            { atMs: DONE_MS, run: fireDone },
          ],
    [fireDone, reducedMotion]
  )
  usePresentationTimeline(active, cues, reducedMotion ? 'reduced' : 'full')

  return (
    <div
      className={`psr psr--${phase}`}
      data-presentation-root="public-save-reveal"
      data-presentation-suspended={!active || undefined}
      aria-hidden={!active || undefined}
      inert={!active}
      style={active ? undefined : { visibility: 'hidden' }}
      role="status"
      aria-live="assertive"
      aria-label={`Public Save: ${savedUnit?.label ?? ''} ${savedUnit?.members.length === 2 ? 'are' : 'is'} saved`}
    >
      <div className="psr__panel">
        <div className="psr__heading">
          <span className="psr__heading-eyebrow">Public Save</span>
          <p className="psr__heading-sub">
            Before the safety battle, the {hasPairedUnits ? 'pair' : 'player'} with the highest
            public support is saved.
          </p>
        </div>

        <div className="psr__nominees">
          {displayUnits.map((unit, index) => {
            const isSaved = unit.members.some((member) => member.id === savedId)
            const voteShare = unit.voteShare
            return (
              <div
                key={unit.id}
                className={[
                  'psr__nominee',
                  isSaved && (phase === 'saved' || phase === 'exiting')
                    ? 'psr__nominee--saved'
                    : '',
                  !isSaved && (phase === 'saved' || phase === 'exiting')
                    ? 'psr__nominee--nominated'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    '--stagger': index,
                    '--pair-color': unit.color,
                  } as CSSProperties
                }
              >
                <div
                  className={`psr__avatar-wrap${unit.members.length > 1 ? ' psr__avatar-wrap--pair' : ''}`}
                >
                  {unit.members.map((member) => (
                    <div className="psr__avatar-member" key={member.id}>
                      <PlayerAvatar player={member} size="sm" />
                    </div>
                  ))}
                </div>
                <span className="psr__name">{unit.label}</span>
                <PublicSaveShareCount
                  label={unit.label}
                  value={voteShare}
                  phase={phase}
                  active={active}
                />
              </div>
            )
          })}
        </div>
        {decisionNote && (phase === 'saved' || phase === 'exiting') && (
          <p className="psr__decision-note" aria-live="polite">
            {decisionNote}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Public Save uses the established Normal Mode presentation in every mode.
 * Drama Mode keeps its premium relationship and story consequences behind the
 * scenes, but it no longer replaces the reveal with Audience Verdict UI.
 */
export default function PublicSaveReveal({
  nominees,
  approvals,
  savedId,
  tieBreakUsed = false,
  pairs,
  onDone,
}: PublicSaveRevealProps) {
  const currentState = store.getState()
  const dramaModeEnabled =
    currentState.settings.gameUX.dramaMode === true && currentState.game.publicModeEnabled === true
  const nomineeIds = nominees.map((nominee) => nominee.id)
  const voteShares = normalisePublicSaveVoteShares(nomineeIds, approvals)
  const displayUnits = buildPublicSaveDisplayUnits(nominees, voteShares, pairs)

  const handleDone = () => {
    // The established result announcement reads this same object. Mutating it
    // preserves that flow while replacing absolute approval with vote shares.
    Object.assign(approvals, voteShares)

    if (dramaModeEnabled) {
      const winningUnit = displayUnits.find((unit) =>
        unit.members.some((member) => member.id === savedId)
      )
      const winningShare = winningUnit?.voteShare ?? voteShares[savedId] ?? 0
      const runnerUpShare = Math.max(
        0,
        ...displayUnits.filter((unit) => unit.id !== winningUnit?.id).map((unit) => unit.voteShare)
      )
      completeDramaPublicSave(
        nomineeIds,
        {
          savedId,
          winningShare,
          winningMargin: Math.max(0, winningShare - runnerUpShare),
        },
        { commitGameplay: false }
      )
    }

    onDone()
  }

  return (
    <NormalPublicSaveReveal
      nominees={nominees}
      voteShares={voteShares}
      savedId={savedId}
      tieBreakUsed={tieBreakUsed}
      pairs={pairs}
      onDone={handleDone}
    />
  )
}
