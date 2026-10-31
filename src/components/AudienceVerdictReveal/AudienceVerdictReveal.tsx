import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { usePresentationTimeline } from '../../services/presentation/usePresentationTimeline'
import {
  PRESENTATION_PRIORITY,
  usePresentationOwner,
  usePresentationForeground,
} from '../../services/presentation/presentationOwnership'
import './AudienceVerdictReveal.css'

export interface AudienceVerdictRevealProps {
  nominees: Player[]
  voteShares: Record<string, number>
  savedId: string
  onDone: () => void
}

type VerdictPhase = 'interrupt' | 'lineup' | 'settling' | 'result' | 'exiting'

type PulseMetrics = {
  startX: number
  startY: number
  deltaX: number
  deltaY: number
}

const LINEUP_MS = 500
const SETTLING_MS = 2200
const RESULT_MS = 3400
const EXIT_MS = 5400
const DONE_MS = 6200
const CLOSE_VOTE_MARGIN = 2

function formatShare(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`
}

export default function AudienceVerdictReveal({
  nominees,
  voteShares,
  savedId,
  onDone,
}: AudienceVerdictRevealProps) {
  const reducedMotion = usePresentationReducedMotion()
  const { isOwner } = usePresentationOwner('audience-verdict', PRESENTATION_PRIORITY.audienceResult)
  const active = usePresentationForeground() && isOwner
  const rootRef = useRef<HTMLDivElement | null>(null)
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  const [phase, setPhase] = useState<VerdictPhase>('interrupt')
  const [skipping, setSkipping] = useState(false)
  const [pulseMetrics, setPulseMetrics] = useState<PulseMetrics | null>(null)

  const fireDone = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onDoneRef.current()
  }, [])

  const cues = useMemo(
    () =>
      reducedMotion
        ? [
            {
              atMs: 0,
              run: () => {
                setPhase('result')
                fireDone()
              },
            },
          ]
        : skipping
          ? [
              { atMs: 1500, run: () => setPhase('exiting') },
              { atMs: 2100, run: fireDone },
            ]
          : [
              { atMs: LINEUP_MS, run: () => setPhase('lineup') },
              { atMs: SETTLING_MS, run: () => setPhase('settling') },
              { atMs: RESULT_MS, run: () => setPhase('result') },
              { atMs: EXIT_MS, run: () => setPhase('exiting') },
              { atMs: DONE_MS, run: fireDone },
            ],
    [fireDone, reducedMotion, skipping]
  )
  const cancelTimeline = usePresentationTimeline(
    active,
    cues,
    reducedMotion ? 'reduced' : skipping ? 'skip' : 'full'
  )

  const ranked = useMemo(
    () =>
      [...nominees].sort(
        (left, right) =>
          (voteShares[right.id] ?? 0) - (voteShares[left.id] ?? 0) ||
          left.id.localeCompare(right.id)
      ),
    [nominees, voteShares]
  )
  const savedPlayer = nominees.find((player) => player.id === savedId)
  const runnerUp = ranked.find((player) => player.id !== savedId)
  const winningShare = voteShares[savedId] ?? 0
  const runnerUpShare = runnerUp ? (voteShares[runnerUp.id] ?? 0) : 0
  const closeVote = winningShare - runnerUpShare <= CLOSE_VOTE_MARGIN
  const resultVisible = phase === 'result' || phase === 'exiting'

  useEffect(() => {
    if (!active || !resultVisible || !rootRef.current) return
    const target = document.querySelector<HTMLElement>(`[data-player-id="${savedId}"]`)
    if (!target) return

    const sourceRect = rootRef.current.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const startX = sourceRect.left + sourceRect.width / 2
    const startY = sourceRect.top + sourceRect.height / 2
    setPulseMetrics({
      startX,
      startY,
      deltaX: targetRect.left + targetRect.width / 2 - startX,
      deltaY: targetRect.top + targetRect.height / 2 - startY,
    })
  }, [active, resultVisible, savedId])

  const skipToResult = useCallback(() => {
    if (resultVisible || doneRef.current) return
    cancelTimeline()
    setPhase('result')
    setSkipping(true)
  }, [cancelTimeline, resultVisible])

  return (
    <>
      <div
        ref={rootRef}
        className={`avr avr--${phase}`}
        data-presentation-root="audience-verdict"
        data-presentation-suspended={!active || undefined}
        aria-hidden={!active || undefined}
        inert={!active}
        style={active ? undefined : { visibility: 'hidden' }}
        role="button"
        tabIndex={0}
        aria-label={`Audience Verdict: ${savedPlayer?.name ?? 'a nominee'} is saved. Activate to reveal now.`}
        onClick={skipToResult}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            skipToResult()
          }
        }}
      >
        <div className="avr__broadcast-head">
          <span className="avr__live-dot" aria-hidden="true" />
          <span>LIVE · AUDIENCE VERDICT</span>
        </div>
        <p className="avr__prompt">The public has voted to save one nominee.</p>

        <div className="avr__lineup">
          {nominees.map((player) => {
            const isSaved = player.id === savedId
            return (
              <div
                key={player.id}
                className={`avr__nominee${resultVisible && isSaved ? ' avr__nominee--saved' : ''}${resultVisible && !isSaved ? ' avr__nominee--danger' : ''}`}
              >
                <div className="avr__portrait">
                  <PlayerAvatar player={player} size="sm" />
                </div>
                <span className="avr__name">{player.name}</span>
                <span className="avr__share">
                  {phase === 'settling' || resultVisible
                    ? formatShare(voteShares[player.id] ?? 0)
                    : '—'}
                </span>
              </div>
            )
          })}
        </div>

        <div className="avr__vote-strip" aria-label="Public save vote distribution">
          {nominees.map((player) => (
            <span
              key={player.id}
              className={`avr__vote-segment${resultVisible && player.id === savedId ? ' avr__vote-segment--winner' : ''}`}
              style={{ width: `${voteShares[player.id] ?? 0}%` }}
              title={`${player.name}: ${formatShare(voteShares[player.id] ?? 0)}`}
            />
          ))}
        </div>

        {phase === 'settling' && closeVote && (
          <div className="avr__close-call">TOO CLOSE TO CALL</div>
        )}

        {resultVisible && savedPlayer && (
          <div className="avr__lower-third" aria-live="assertive">
            <strong>{savedPlayer.name.toUpperCase()} SAVED BY THE PUBLIC</strong>
            <span>{formatShare(winningShare)} of the save vote</span>
          </div>
        )}
      </div>

      {pulseMetrics &&
        resultVisible &&
        createPortal(
          <span
            className="avr-extraction-pulse"
            data-presentation-suspended={!active || undefined}
            aria-hidden="true"
            style={
              {
                '--avr-pulse-x': `${pulseMetrics.startX}px`,
                '--avr-pulse-y': `${pulseMetrics.startY}px`,
                '--avr-pulse-dx': `${pulseMetrics.deltaX}px`,
                '--avr-pulse-dy': `${pulseMetrics.deltaY}px`,
              } as CSSProperties
            }
          >
            ◉
          </span>,
          document.body
        )}
    </>
  )
}
