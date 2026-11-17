/**
 * PressurePlank — native React minigame component.
 *
 * Modernized survival/endurance game. Players must keep a balance needle
 * inside a narrowing safe zone by tapping LEFT / RIGHT buttons, countering
 * natural drift and periodic surge events.
 *
 * Supports two rendering modes:
 *  1. LOH/POS path: receives `session` + `players`; dispatches `completeMinigame`
 *     with canonical survival standings and winner/last-place IDs.
 *  2. MinigameHost path: receives participant data and reports the same standings.
 *
 * Scoring semantics:
 *  - Score = survival time in seconds, preserved to millisecond precision.
 *  - Higher score = better (matches AI registry: scoreDirection = 'higher-is-better').
 *  - Last-place finisher = lowest score = shortest survival time.
 *  - The component derives lastPlaceId authoritatively and passes it to the store.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useCompetitionResultCheckpoint } from '../../minigames/competitionResultContext'
import { useTranslate } from '../../i18n'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { completeMinigame } from '../../store/gameSlice'
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types'
import {
  PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE,
  PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH,
  PRESSURE_PLANK_ROUND_SECONDS,
  PRESSURE_PLANK_STABILITY_MAX,
  getPressurePlankGaugeSafeZoneBounds,
  normalizePressurePlankSurvivalSeconds,
  rankPressurePlankResults,
} from './pressurePlankLogic'
import {
  PressurePlankEngine,
  PRESSURE_PLANK_MAX_BALANCE,
  PRESSURE_PLANK_SURGES,
} from './pressurePlankEngine'
import './PressurePlank.css'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Countdown seconds before game starts. */
const READY_COUNT = 3

const MAX_BALANCE = PRESSURE_PLANK_MAX_BALANCE
const DANGER_THRESHOLD = 65
const SAFE_ZONE_INITIAL = PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH
type SurgeEvent = (typeof PRESSURE_PLANK_SURGES)[number]

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'ready' | 'playing' | 'results'

interface ScoreEntry {
  id: string
  name: string
  /** Survival time in seconds. */
  survivalSeconds: number
  /** Native survival time in seconds. */
  score: number
  isHuman: boolean
  eliminated: boolean
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** LOH/POS minigame path: full session data. */
  session?: MinigameSession
  /** LOH/POS minigame path: all game players (for name lookup). */
  players?: Player[]
  /** MinigameHost path: called with the human result plus canonical standings. */
  onFinish?: (
    value: number,
    tiebreakerMs?: number,
    completion?: {
      authoritativeWinnerId?: string | null
      authoritativeLastPlaceId?: string | null
      rawValue?: number
      rawResults?: Record<string, number>
    }
  ) => void
  /** MinigameHost path: competition seed (reserved). */
  seed?: number
  /** MinigameHost path: when true, skip the start countdown delay. */
  autoStart?: boolean
  participantIds?: string[]
  participants?: Array<{
    id: string
    name: string
    isHuman: boolean
    precomputedScore: number
  }>
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PressurePlank({
  session,
  players = [],
  onFinish,
  seed = 0,
  autoStart = false,
  participantIds = [],
  participants = [],
}: Props) {
  const t = useTranslate()
  const dispatch = useAppDispatch()
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id)

  // ── Phase & countdown ──────────────────────────────────────────────────────

  const [gamePhase, setGamePhase] = useState<GamePhase>(autoStart ? 'playing' : 'ready')
  const [countdown, setCountdown] = useState(READY_COUNT)

  // ── Rendered game state (updated from RAF loop) ────────────────────────────

  const [balance, setBalance] = useState(0) // -100 to +100
  const [survivalMs, setSurvivalMs] = useState(0)
  const [safeZone, setSafeZone] = useState(SAFE_ZONE_INITIAL)
  const [stability, setStability] = useState(PRESSURE_PLANK_STABILITY_MAX)
  const [activeSurge, setActiveSurge] = useState<SurgeEvent | null>(null)
  const [results, setResults] = useState<ScoreEntry[]>([])
  const [completedRound, setCompletedRound] = useState(false)

  // ── Refs for game loop (avoid stale closures) ──────────────────────────────

  const engineRef = useRef<PressurePlankEngine | null>(null)
  const startTimeRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const endedRef = useRef(false)

  /**
   * Keep stable refs for props that are read inside the RAF loop.
   * Props are guaranteed stable for one competition session but using refs
   * avoids any stale-closure lint concern and eliminates eslint suppressions.
   */
  const sessionRef = useRef(session)
  const humanIdRef = useRef(humanId)
  const playersRef = useRef(players)
  const onFinishRef = useRef(onFinish)
  const participantIdsRef = useRef(participantIds)
  const participantsRef = useRef(participants)
  useEffect(() => {
    sessionRef.current = session
  })
  useEffect(() => {
    humanIdRef.current = humanId
  })
  useEffect(() => {
    playersRef.current = players
  })
  useEffect(() => {
    onFinishRef.current = onFinish
  })
  useEffect(() => {
    participantIdsRef.current = participantIds
  })
  useEffect(() => {
    participantsRef.current = participants
  })

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ── Ready countdown ────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'ready') return
    const timeoutMs = countdown <= 0 || (autoStart && countdown === READY_COUNT) ? 0 : 1000
    const t = setTimeout(() => {
      if (autoStart && countdown === READY_COUNT) {
        setCountdown(0)
        return
      }
      if (countdown <= 0) {
        setGamePhase('playing')
        return
      }
      setCountdown((c) => c - 1)
    }, timeoutMs)
    return () => clearTimeout(t)
  }, [gamePhase, countdown, autoStart])

  // ── Game over handler ──────────────────────────────────────────────────────

  const endGame = useCallback(
    (finalElapsedMs: number, completed: boolean) => {
      if (endedRef.current) return
      endedRef.current = true
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      const survivalSec = normalizePressurePlankSurvivalSeconds(
        completed ? PRESSURE_PLANK_ROUND_SECONDS : finalElapsedMs / 1000
      )

      const currentSession = sessionRef.current
      const hostedParticipants = participantsRef.current
      const currentHumanId =
        humanIdRef.current ?? hostedParticipants.find((participant) => participant.isHuman)?.id
      const currentPlayers = playersRef.current
      const currentParticipantIds = currentSession?.participants ?? participantIdsRef.current
      const allScores: Record<string, number> = currentSession
        ? { ...currentSession.aiScores }
        : Object.fromEntries(
            hostedParticipants
              .filter((participant) => !participant.isHuman)
              .map((participant) => [participant.id, participant.precomputedScore])
          )
      if (currentHumanId && currentParticipantIds.includes(currentHumanId)) {
        allScores[currentHumanId] = survivalSec
      }

      const ordered = rankPressurePlankResults(
        currentParticipantIds,
        allScores,
        currentSession?.seed ?? seed
      )
      const entries: ScoreEntry[] = ordered.map((result) => {
        const gamePlayer = currentPlayers.find((player) => player.id === result.playerId)
        const hostedPlayer = hostedParticipants.find(
          (participant) => participant.id === result.playerId
        )
        return {
          id: result.playerId,
          name: gamePlayer?.name ?? hostedPlayer?.name ?? result.playerId,
          survivalSeconds: result.survivalSeconds,
          score: result.survivalSeconds,
          isHuman: result.playerId === currentHumanId,
          eliminated: result.survivalSeconds < PRESSURE_PLANK_ROUND_SECONDS,
        }
      })
      setSurvivalMs(survivalSec * 1000)
      setCompletedRound(completed)
      setResults(entries)
      setGamePhase('results')
    },
    // Only refs and stable setters — no prop dependencies needed.
    [seed]
  )

  // ── RAF game loop ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return

    const engine = new PressurePlankEngine(sessionRef.current?.seed ?? seed)
    engineRef.current = engine
    endedRef.current = false
    const startTime = Date.now()
    startTimeRef.current = startTime
    let lastReactUpdate = 0
    const loop = (now: number) => {
      const state = engine.advance(Date.now() - startTime)
      if (now - lastReactUpdate >= 50 || state.status !== 'active') {
        lastReactUpdate = now
        setBalance(Math.round(state.balance))
        setSurvivalMs(state.elapsedMs)
        setSafeZone(state.safeZone)
        setStability(state.stability)
        const seconds = state.elapsedMs / 1000
        setActiveSurge(
          PRESSURE_PLANK_SURGES.find(
            (e) => seconds >= e.startsAt && seconds < e.startsAt + e.duration
          ) ?? null
        )
      }
      if (state.status !== 'active') {
        endGame(state.elapsedMs, state.status === 'complete')
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [gamePhase, endGame, seed])

  // ── Tap handlers ───────────────────────────────────────────────────────────

  const handleTapLeft = useCallback(() => {
    if (gamePhase !== 'playing') return
    engineRef.current?.tap(-1, Date.now() - startTimeRef.current)
  }, [gamePhase])

  const handleTapRight = useCallback(() => {
    if (gamePhase !== 'playing') return
    engineRef.current?.tap(1, Date.now() - startTimeRef.current)
  }, [gamePhase])

  useCompetitionResultCheckpoint(
    gamePhase === 'results'
      ? {
          rawValue: results.find((entry) => entry.isHuman)?.score ?? 0,
          partial: false,
          completion: {
            authoritativeWinnerId: results[0]?.id,
            authoritativeLastPlaceId: results.at(-1)?.id,
            rawResults: Object.fromEntries(results.map((entry) => [entry.id, entry.score])),
          },
        }
      : null
  )

  // ── Done handler (LOH path: dispatches to store) ───────────────────────────

  const handleDone = useCallback(() => {
    const humanScore = results.find((e) => e.isHuman)?.score ?? 0
    const winnerId = results[0]?.id
    const lastPlaceId = results.length > 0 ? results[results.length - 1].id : undefined
    const rawResults = Object.fromEntries(results.map((result) => [result.id, result.score]))
    if (session) {
      const payload: CompleteMinigamePayload = { humanScore, winnerId, lastPlaceId }
      dispatch(completeMinigame(payload))
      return
    }
    onFinishRef.current?.(humanScore, undefined, {
      authoritativeWinnerId: winnerId,
      authoritativeLastPlaceId: lastPlaceId,
      rawValue: humanScore,
      rawResults,
    })
  }, [dispatch, results, session])

  // ── Derived UI values ──────────────────────────────────────────────────────

  const absBalance = Math.abs(balance)
  const outsideSafeZone = absBalance > safeZone + PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE
  const isDanger = absBalance > DANGER_THRESHOLD || stability <= 35
  const isWarning = outsideSafeZone && !isDanger
  const survivalSeconds = (survivalMs / 1000).toFixed(3)
  /** Needle and safe-zone positions share the same -MAX_BALANCE..+MAX_BALANCE scale. */
  const needlePct = ((balance + MAX_BALANCE) / (2 * MAX_BALANCE)) * 100
  const safeZoneBounds = getPressurePlankGaugeSafeZoneBounds(safeZone, MAX_BALANCE)
  const safeLeft = safeZoneBounds.leftPercent
  const safeRight = safeLeft + safeZoneBounds.widthPercent

  const medals = ['🥇', '🥈', '🥉']

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        'pp',
        isDanger ? 'pp--danger' : isWarning ? 'pp--warning' : '',
        gamePhase === 'playing' ? 'pp--playing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Pressure Plank Competition"
      onContextMenu={(event) => {
        if (gamePhase === 'playing') event.preventDefault()
      }}
      onDragStart={(event) => {
        if (gamePhase === 'playing') event.preventDefault()
      }}
    >
      <div className="pp__card">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="pp__header">
          <h2 className="pp__title">⚖️ Pressure Plank</h2>
          <p className="pp__subtitle">Stay centred. Lost stability never returns.</p>
        </header>

        {/* ── Ready phase ───────────────────────────────────────────────── */}
        {gamePhase === 'ready' && (
          <div className="pp__ready">
            <div className="pp__countdown" aria-live="polite" aria-atomic="true">
              {countdown > 0 ? countdown : '🏁'}
            </div>
            <p className="pp__hint">
              Tap <strong>◀ LEFT</strong> or <strong>RIGHT ▶</strong>. Leaving the green zone drains
              stability.
            </p>
          </div>
        )}

        {/* ── Playing phase ─────────────────────────────────────────────── */}
        {gamePhase === 'playing' && (
          <div className="pp__game">
            {/* Surge banner */}
            {activeSurge && (
              <div className="pp__surge" aria-live="assertive" aria-atomic="true">
                {activeSurge.label}
              </div>
            )}

            {/* Timer */}
            <div className="pp__timer" aria-label={`Survival time: ${survivalSeconds} seconds`}>
              <span className="pp__timer-value">{survivalSeconds}s</span>
              <span className="pp__timer-label">survived</span>
            </div>

            <div
              className={`pp__stability${stability <= 35 ? ' pp__stability--danger' : ''}`}
              role="progressbar"
              aria-label="Remaining stability"
              aria-valuemin={0}
              aria-valuemax={PRESSURE_PLANK_STABILITY_MAX}
              aria-valuenow={Math.round(stability)}
            >
              <div className="pp__stability-head">
                <span>Stability</span>
                <strong>{Math.ceil(stability)}%</strong>
              </div>
              <div className="pp__stability-track">
                <div className="pp__stability-fill" style={{ width: `${stability}%` }} />
              </div>
            </div>

            {/* Balance gauge */}
            <div
              className="pp__gauge"
              role="meter"
              aria-valuemin={-MAX_BALANCE}
              aria-valuemax={MAX_BALANCE}
              aria-valuenow={balance}
              aria-label="Balance gauge"
            >
              {/* Safe zone band */}
              <div
                className="pp__safe-zone"
                style={{
                  left: `${safeLeft}%`,
                  width: `${safeRight - safeLeft}%`,
                }}
              />

              {/* Danger markers */}
              <div className="pp__danger-left" />
              <div className="pp__danger-right" />

              {/* Needle */}
              <div
                className={[
                  'pp__needle',
                  isDanger ? 'pp__needle--danger' : isWarning ? 'pp__needle--warning' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `${needlePct}%` }}
              />

              {/* Centre line */}
              <div className="pp__centre-line" />
            </div>

            {/* Balance zone label */}
            <div
              className={[
                'pp__zone-label',
                isDanger
                  ? 'pp__zone-label--danger'
                  : isWarning
                    ? 'pp__zone-label--warning'
                    : 'pp__zone-label--safe',
              ].join(' ')}
              aria-live="polite"
              aria-atomic="true"
            >
              {isDanger ? '⚠️ CRITICAL!' : isWarning ? '⚠ LOSING STABILITY' : '✓ BALANCED'}
            </div>

            {/* Control buttons */}
            <div className="pp__controls">
              <button
                className="pp__btn pp__btn--left"
                onPointerDown={(event) => {
                  event.preventDefault()
                  handleTapLeft()
                }}
                onClick={(event) => {
                  if (event.detail === 0) handleTapLeft()
                }}
                aria-label="Tap left to shift balance left"
                type="button"
              >
                ◀ LEFT
              </button>
              <button
                className="pp__btn pp__btn--right"
                onPointerDown={(event) => {
                  event.preventDefault()
                  handleTapRight()
                }}
                onClick={(event) => {
                  if (event.detail === 0) handleTapRight()
                }}
                aria-label="Tap right to shift balance right"
                type="button"
              >
                RIGHT ▶
              </button>
            </div>

            {/* Safe zone width indicator */}
            <div className="pp__safe-hint">
              {t('pressurePlank.safeZone')}{' '}
              <strong>{safeZoneBounds.widthPercent.toFixed(0)}%</strong>
            </div>
          </div>
        )}

        {/* ── Results phase ─────────────────────────────────────────────── */}
        {gamePhase === 'results' && (
          <div className="pp__results">
            <div className="pp__results-fell">
              {completedRound ? '🏁 You survived the full round!' : '🫸 You fell off!'}
            </div>
            <div className="pp__results-time">Survived: {survivalSeconds}s</div>

            <ol className="pp__leaderboard" aria-label="Competition results">
              {results.map((entry, idx) => (
                <li
                  key={entry.id}
                  className={[
                    'pp__leaderboard-row',
                    entry.isHuman ? 'pp__leaderboard-row--human' : '',
                    idx === results.length - 1 ? 'pp__leaderboard-row--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="pp__rank">
                    {idx < medals.length ? medals[idx] : `#${idx + 1}`}
                  </span>
                  <span className="pp__player-name">
                    {entry.name}
                    {entry.isHuman ? ' (you)' : ''}
                  </span>
                  <span className="pp__player-score">{entry.survivalSeconds.toFixed(3)}s</span>
                </li>
              ))}
            </ol>

            {(session || onFinish) && (
              <button className="pp__continue" onClick={handleDone} type="button">
                Continue ▶
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
