import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'react-redux'
import { shouldPlayCinematic } from '../../cinematic/ceremonies/runtime.mjs'
import {
  PRESENTATION_PRIORITY,
  usePresentationForeground,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { closeSpectator, openSpectator } from '../../store/gameSlice'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { RootState } from '../../store/store'
import { selectIsVipActive } from '../../store/vipSlice'
import type { GameState, Player } from '../../types'
import CinematicSkipButton from '../CinematicSkipButton/CinematicSkipButton'
import { buildMemoryLaneQuestionBank } from '../DownMemoryLane/downMemoryLaneLogic'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import { buildSequenceBoards, buildSignalBoard } from '../FinalThreeCircuit/finalThreeCircuitLogic'
import {
  prepareCompetitionBroadcastArtwork,
  type CompetitionBroadcastArtwork,
} from './competitionBroadcastArtwork'
import {
  competitionBroadcastDuration,
  competitionBroadcastStageAt,
  type CompetitionBroadcastStage,
  type FinalThreeCompetitionPart,
} from './competitionBroadcastTimeline'
import { useFinalThreeCompetitionAudio } from './useFinalThreeCompetitionAudio'
import './FinalThreeCompetitionBroadcast.css'

export interface FinalThreeCompetitionBroadcastProps {
  part: FinalThreeCompetitionPart
  competitorIds: string[]
  expectedWinnerId?: string
  onDone: () => void
  onPlayAvailabilityChange?: (available: boolean) => void
}

const ROUND_NAMES = {
  1: 'The Advancement',
  2: 'The Qualifier',
  3: 'The Final Power Battle',
} as const
let lastLeaseTime = 0

function subscribeViewport(listener: () => void): () => void {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

function viewportTooShort(): boolean {
  return typeof window !== 'undefined' && window.innerHeight < 480
}

function sameGameScope(left: GameState, right: GameState): boolean {
  return (
    left.gameId === right.gameId &&
    left.season === right.season &&
    left.week === right.week &&
    left.phase === right.phase &&
    left.seed === right.seed
  )
}

function viewerCopy(game: GameState, part: FinalThreeCompetitionPart): string {
  const human = game.players.find((player) => player.isUser)
  if (!human || human.status === 'jury' || human.status === 'evicted')
    return 'Your view from the gallery'
  if (part === 2) {
    const qualified = game.finalThree?.part1?.winnerId ?? game.f3Part1WinnerId
    return qualified === human.id ? 'Your place in Part 3 is secure' : 'One place in Part 3 remains'
  }
  if (part === 3) {
    return game.voxPopuli?.status === 'active'
      ? 'Watch who wins final immunity'
      : 'Watch who wins the final power'
  }
  return 'Finale night · competition coverage'
}

function stakesCopy(part: FinalThreeCompetitionPart, vox: boolean): string {
  if (part === 1) return 'Three finalists. One place in Part 3.'
  if (part === 2) return 'Two finalists. One remaining place.'
  return vox ? 'One winner earns final immunity.' : 'One winner controls the Final Two.'
}

function resultCopy(part: FinalThreeCompetitionPart, vox: boolean): string {
  return part === 3 ? (vox ? 'Wins final immunity' : 'Wins the final power') : 'Advances to Part 3'
}

/**
 * The AI-only game path records a winner and seed, not a move-by-move match.
 * These motifs explain each real competition; they never manufacture scores,
 * answer histories, changing leaders or lost lives.
 */
function CompetitionMonitor({
  stage,
  ...props
}: {
  part: FinalThreeCompetitionPart
  stage: CompetitionBroadcastStage
  game: GameState
  players: Player[]
  winner: Player | undefined
}) {
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = content.current
    if (!node) return undefined
    let disposed = false
    const fit = () => {
      if (disposed) return
      const copy = node.firstElementChild as HTMLElement | null
      if (!copy) return
      const text = [
        ...node.querySelectorAll<HTMLElement>(
          'h2, p:not(.f3-broadcast__eyebrow), .f3-broadcast__lineup-names span'
        ),
      ]
      for (const item of text) item.style.removeProperty('font-size')
      const sizes = text.map((item) => Number.parseFloat(getComputedStyle(item).fontSize))
      const room = node.clientHeight
      const tooTall = () =>
        copy.offsetHeight > room + 1 ||
        [...copy.querySelectorAll<HTMLElement>('.f3-broadcast__challenge-copy')].some(
          (item) => item.offsetHeight > room + 1
        )
      // Keep whole names and sentences. Only optional visual choice chips are
      // removed by the compact layout; the text itself is never truncated.
      for (let reduction = 1; reduction <= 24 && tooTall(); reduction += 1) {
        for (const [index, item] of text.entries()) {
          item.style.fontSize = `${Math.max(Math.min(12, sizes[index]), sizes[index] - reduction)}px`
        }
      }
      node.dataset.copyOverflow = tooTall() ? 'true' : 'false'
    }
    fit()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    observer?.observe(node)
    window.addEventListener('resize', fit)
    void document.fonts?.ready.then(fit)
    return () => {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [stage])
  return (
    <div className="f3-broadcast__monitor-content" ref={content}>
      <CompetitionMonitorContent {...props} stage={stage} />
    </div>
  )
}

function CompetitionMonitorContent({
  part,
  stage,
  game,
  players,
  winner,
}: {
  part: FinalThreeCompetitionPart
  stage: CompetitionBroadcastStage
  game: GameState
  players: Player[]
  winner: Player | undefined
}) {
  const [boards] = useState(() => ({
    signal: buildSignalBoard(game.seed, 0, 0, 16),
    sequence: buildSequenceBoards(game.seed, part === 2 ? 2 : 1)[0].initial,
    question:
      part === 3
        ? (() => {
            const bank = buildMemoryLaneQuestionBank(game, game.seed)
            return bank.find((question) => question.prompt.length <= 100) ?? bank[0]
          })()
        : undefined,
  }))
  const vox = game.voxPopuli?.status === 'active'
  const result = stage === 'verdict' || stage === 'handoff'

  if (result && winner) {
    return (
      <div className="f3-broadcast__monitor-result" key="result">
        <p className="f3-broadcast__eyebrow">
          {part === 3 ? (vox ? 'Final immunity' : 'Final power') : `Part ${part} winner`}
        </p>
        <h2>{winner.name}</h2>
        <p>{resultCopy(part, vox)}</p>
      </div>
    )
  }
  if (stage === 'lock') {
    return (
      <div className="f3-broadcast__monitor-lock" key="lock">
        <span className="f3-broadcast__seal" aria-hidden="true" />
        <p className="f3-broadcast__eyebrow">The result is in</p>
        <h2>One name.</h2>
      </div>
    )
  }
  if (stage === 'signal') {
    return (
      <div className="f3-broadcast__challenge" key="signal">
        <div className="f3-broadcast__challenge-copy">
          <p className="f3-broadcast__eyebrow">The circuit · 01</p>
          <h2>Signal Hunt</h2>
          <p>Find the signal.</p>
        </div>
        <div className="f3-broadcast__signal-board" aria-hidden="true">
          {boards.signal.map((value, index) => (
            <span
              key={value}
              className={index === 5 ? 'is-target' : undefined}
              style={{ '--cell': index } as CSSProperties}
            >
              {String(value).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
    )
  }
  if (stage === 'sequence') {
    return (
      <div className="f3-broadcast__challenge" key="sequence">
        <div className="f3-broadcast__challenge-copy">
          <p className="f3-broadcast__eyebrow">The circuit · 02</p>
          <h2>Sequence Builder</h2>
          <p>Put the pieces together.</p>
        </div>
        <div className="f3-broadcast__sequence-board" aria-hidden="true">
          {boards.sequence.map((value, index) => (
            <span
              key={value}
              className={value === '__empty__' ? 'is-empty' : undefined}
              style={{ '--cell': index } as CSSProperties}
            >
              {value === '__empty__' ? '' : value}
            </span>
          ))}
        </div>
      </div>
    )
  }
  if (stage === 'risk') {
    return (
      <div className="f3-broadcast__risk" key="risk">
        <p className="f3-broadcast__eyebrow">The circuit · 03</p>
        <h2>Risk Run</h2>
        <div className="f3-broadcast__risk-symbols" aria-hidden="true">
          <span className="f3-broadcast__risk-symbol f3-broadcast__risk-symbol--escape">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="f3-broadcast__risk-symbol f3-broadcast__risk-symbol--balance">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="f3-broadcast__risk-symbol f3-broadcast__risk-symbol--override">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <p className="f3-broadcast__risk-labels">
          <span>Escape</span>
          <span>Balance</span>
          <span>Override</span>
        </p>
      </div>
    )
  }
  if (stage === 'memory' && boards.question) {
    return (
      <div className="f3-broadcast__memory" key="memory">
        <p className="f3-broadcast__eyebrow">Down Memory Lane · From this season</p>
        <h2>{boards.question.prompt}</h2>
        <div className="f3-broadcast__memory-options">
          {boards.question.optionPlayerIds.map((id) => (
            <span key={id}>
              {game.players.find((player) => player.id === id)?.name ?? 'Hubmate'}
            </span>
          ))}
        </div>
      </div>
    )
  }
  if (stage === 'memory' || stage === 'duel') {
    return (
      <div className="f3-broadcast__memory-duel" key="duel">
        <p className="f3-broadcast__eyebrow">The final duel</p>
        <h2>Down Memory Lane</h2>
        <div className="f3-broadcast__lives" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((value) => (
            <i key={value} style={{ '--cell': value } as CSSProperties} />
          ))}
        </div>
        <p>Five lives each.</p>
      </div>
    )
  }
  return (
    <div className="f3-broadcast__monitor-intro" key={stage}>
      <p className="f3-broadcast__eyebrow">
        Part {part} · {part === 3 ? 'The final duel' : 'Final Three Circuit'}
      </p>
      {stage === 'lineup' ? (
        <div
          className="f3-broadcast__lineup-names"
          style={{ '--names': players.length } as CSSProperties}
        >
          {players.map((player) => (
            <span key={player.id}>{player.name}</span>
          ))}
        </div>
      ) : (
        <>
          <h2>{ROUND_NAMES[part]}</h2>
          <p>{stakesCopy(part, vox)}</p>
        </>
      )}
    </div>
  )
}

export default function FinalThreeCompetitionBroadcast(props: FinalThreeCompetitionBroadcastProps) {
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()
  const game = useAppSelector((state) => state.game)
  const eligible = useAppSelector((state) => shouldPlayCinematic(state, selectIsVipActive(state)))
  const reducedMotion = usePresentationReducedMotion()
  const shortViewport = useSyncExternalStore(subscribeViewport, viewportTooShort, () => false)
  const [initial] = useState(() => ({
    game,
    part: props.part,
    ids: [...props.competitorIds],
    winnerId: props.expectedWinnerId,
    players: props.competitorIds
      .map((id) => game.players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player)),
    premium: eligible && !reducedMotion && !shortViewport,
  }))
  const sceneId = `${initial.game.gameId}:${initial.game.season}:${initial.game.week}:${initial.game.seed}:${initial.part}:${initial.ids.join(':')}`
  const callbacks = useRef(props)
  useLayoutEffect(() => {
    callbacks.current = props
  }, [props])
  const [artwork, setArtwork] = useState<CompetitionBroadcastArtwork | null>(null)
  const [failed, setFailed] = useState(false)
  const [abandoned, setAbandoned] = useState(false)
  const [finished, setFinished] = useState(false)
  const [stage, setStage] = useState<CompetitionBroadcastStage>('establish')
  const completed = useRef(false)
  const elapsed = useRef(0)
  const lease = useRef<number | null>(null)
  const dialog = useRef<HTMLElement>(null)
  const winner = initial.players.find((player) => player.id === initial.winnerId)
  const validCast =
    initial.players.length === initial.ids.length &&
    new Set(initial.ids).size === initial.ids.length &&
    initial.players.length === (initial.part === 1 ? 3 : 2)
  if (initial.premium && !abandoned && (!eligible || reducedMotion || shortViewport))
    setAbandoned(true)
  const premium =
    initial.premium &&
    eligible &&
    !reducedMotion &&
    !shortViewport &&
    !abandoned &&
    !failed &&
    validCast &&
    Boolean(winner)
  const foreground = usePresentationForeground()
  const { isOwner } = usePresentationOwner(
    `final-three-competition:${sceneId}`,
    PRESENTATION_PRIORITY.finale
  )
  const active = isOwner && foreground && !finished && sameGameScope(initial.game, game)
  const activeRef = useRef(active)
  useLayoutEffect(() => {
    activeRef.current = active
    return () => {
      activeRef.current = false
    }
  }, [active])
  const ready = !premium || artwork !== null
  const visibleStage = premium ? stage : 'verdict'
  const revealed = !premium || stage === 'verdict' || stage === 'handoff'
  const vox = initial.game.voxPopuli?.status === 'active'

  const releaseGate = useCallback(() => {
    const current = store.getState().game
    if (
      lease.current !== null &&
      sameGameScope(initial.game, current) &&
      current.spectatorActive?.startedAt === lease.current
    ) {
      dispatch(closeSpectator())
    }
    lease.current = null
  }, [dispatch, initial.game, store])

  const finish = useCallback(() => {
    if (completed.current || !activeRef.current) return
    const current = store.getState().game
    if (!sameGameScope(initial.game, current)) return
    if (current.spectatorActive && current.spectatorActive.startedAt !== lease.current) return
    completed.current = true
    setFinished(true)
    releaseGate()
    callbacks.current.onDone()
  }, [initial.game, releaseGate, store])

  useEffect(() => {
    const current = store.getState().game
    if (!sameGameScope(initial.game, current)) return undefined
    lastLeaseTime = Math.max(Date.now(), lastLeaseTime + 1)
    const startedAt = lastLeaseTime
    dispatch(
      openSpectator({
        competitorIds: initial.ids,
        minigameId: initial.part === 3 ? 'downMemoryLane' : 'finalThreeCircuit',
        expectedWinnerId: winner?.id,
        placement: 'fullscreen',
        startedAt,
      })
    )
    if (store.getState().game.spectatorActive?.startedAt === startedAt) lease.current = startedAt
    return releaseGate
  }, [dispatch, initial, releaseGate, store, winner?.id])

  useEffect(() => {
    if (!premium) return undefined
    const abort = new AbortController()
    const watchdog = window.setTimeout(() => {
      abort.abort()
      setFailed(true)
    }, 10_000)
    void prepareCompetitionBroadcastArtwork(initial.players, abort.signal).then(
      (assets) => {
        if (!abort.signal.aborted) {
          window.clearTimeout(watchdog)
          setArtwork(assets)
        }
      },
      () => {
        if (!abort.signal.aborted) {
          window.clearTimeout(watchdog)
          setFailed(true)
        }
      }
    )
    return () => {
      window.clearTimeout(watchdog)
      abort.abort()
    }
  }, [initial.players, premium])

  useEffect(() => {
    callbacks.current.onPlayAvailabilityChange?.(!premium)
  }, [premium])

  useFinalThreeCompetitionAudio(sceneId, visibleStage, active && ready && premium)

  useEffect(() => {
    if (!active || !ready || !premium) return undefined
    let previous = performance.now()
    let frame = 0
    const tick = (now: number) => {
      if (completed.current) return
      elapsed.current += Math.max(0, now - previous)
      previous = now
      const next = competitionBroadcastStageAt(initial.part, elapsed.current)
      setStage((current) => (current === next ? current : next))
      if (elapsed.current >= competitionBroadcastDuration(initial.part)) {
        finish()
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [active, finish, initial.part, premium, ready])

  useEffect(() => {
    if (!active) return undefined
    const handlePlay = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      finish()
    }
    window.addEventListener('ui:playPressed', handlePlay, { capture: true })
    return () => window.removeEventListener('ui:playPressed', handlePlay, { capture: true })
  }, [active, finish])

  useEffect(() => {
    if (!active) return undefined
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
      }
      if (event.key !== 'Tab') return
      const button = dialog.current?.querySelector<HTMLButtonElement>('.cinematic-skip-button')
      if (button) {
        event.preventDefault()
        button.focus()
      }
    }
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', keyboard, true)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [active, finish])

  const title = `Final Three Part ${initial.part}: ${ROUND_NAMES[initial.part]}`
  const announcement =
    revealed && winner ? `${winner.name} ${resultCopy(initial.part, vox).toLowerCase()}.` : ''

  return createPortal(
    <section
      ref={dialog}
      className={`f3-broadcast${premium ? '' : ' f3-broadcast--static'}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!active || undefined}
      aria-label={title}
      tabIndex={-1}
      hidden={!active}
      data-part={initial.part}
      data-stage={visibleStage}
      data-active={active && ready ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      data-mode={vox ? 'vox' : 'classic'}
      data-winner-id={revealed ? winner?.id : undefined}
    >
      <div className="f3-broadcast__sr-only">
        <p>
          {initial.players.map((player) => player.name).join(', ')}. {stakesCopy(initial.part, vox)}
        </p>
        <p>{viewerCopy(initial.game, initial.part)}.</p>
      </div>
      <p className="f3-broadcast__sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {premium && artwork ? (
        <div className="f3-broadcast__frame" aria-hidden="true">
          <div className="f3-broadcast__camera">
            <div
              className="f3-broadcast__environment"
              style={{ backgroundImage: `url("${artwork.background}")` }}
            />
            <div className="f3-broadcast__night" />
            <div className="f3-broadcast__beam f3-broadcast__beam--left" />
            <div className="f3-broadcast__beam f3-broadcast__beam--right" />
            <div className="f3-broadcast__dust" />
            <div className="f3-broadcast__eye">
              <div className="f3-broadcast__eye-halo" />
              <img src={artwork.eye} alt="" draggable={false} />
            </div>
            <div className="f3-broadcast__monitor">
              <img
                className="f3-broadcast__monitor-frame"
                src={artwork.monitor}
                alt=""
                draggable={false}
              />
              <div className="f3-broadcast__screen">
                <div className="f3-broadcast__glass" />
                <CompetitionMonitor
                  part={initial.part}
                  stage={stage}
                  game={initial.game}
                  players={initial.players}
                  winner={winner}
                />
                <div className="f3-broadcast__glass-sweep" />
              </div>
              <span className="f3-broadcast__monitor-glow" />
            </div>
            <div className="f3-broadcast__cast" data-count={initial.players.length}>
              {initial.players.map((player, index) => (
                <div
                  className={`f3-broadcast__contestant${revealed && winner?.id === player.id ? ' is-winner' : ''}${revealed && winner?.id !== player.id ? ' is-other' : ''}`}
                  key={player.id}
                  data-contestant-id={player.id}
                  style={{ '--index': index, '--count': initial.players.length } as CSSProperties}
                >
                  <div className="f3-broadcast__podium">
                    <i />
                  </div>
                  <div className="f3-broadcast__contestant-light" />
                  <img
                    className="f3-broadcast__reflection"
                    src={artwork.contestants[player.id]}
                    alt=""
                    draggable={false}
                  />
                  <img
                    className="f3-broadcast__cutout"
                    src={artwork.contestants[player.id]}
                    alt=""
                    draggable={false}
                  />
                </div>
              ))}
            </div>
            <div className="f3-broadcast__floor-light" />
            <div
              className="f3-broadcast__mist"
              style={{ backgroundImage: `url("${artwork.mist}")` }}
            />
            <div className="f3-broadcast__vignette" />
          </div>
          <div className="f3-broadcast__network">
            <span />
            THE BIG EYE<span>FINALE NIGHT</span>
          </div>
          <div className="f3-broadcast__lower-third">
            <p>{viewerCopy(initial.game, initial.part)}</p>
            <span>
              {initial.part === 3
                ? 'Down Memory Lane'
                : `Final Three Circuit · Part ${initial.part}`}
            </span>
          </div>
          <div className="f3-broadcast__handoff" />
        </div>
      ) : premium ? (
        <div className="f3-broadcast__loading">
          <span className="f3-broadcast__loading-orbit" />
          <p>Finale night</p>
        </div>
      ) : (
        <div className="f3-broadcast__summary">
          <p className="f3-broadcast__eyebrow">
            Part {initial.part} · {initial.part === 3 ? 'Down Memory Lane' : 'Final Three Circuit'}
          </p>
          {winner ? (
            <>
              <div className="f3-broadcast__summary-portrait">
                <FullSizeCutoutImage player={winner} attire="informal" alt="" />
              </div>
              <h2>{winner.name}</h2>
              <p>{resultCopy(initial.part, vox)}</p>
            </>
          ) : (
            <>
              <h2>Result ready</h2>
              <p>Continue to receive the official result.</p>
            </>
          )}
          <p className="f3-broadcast__summary-viewer">{viewerCopy(initial.game, initial.part)}</p>
        </div>
      )}
      <CinematicSkipButton
        ariaLabel={
          premium
            ? 'Skip this competition broadcast; the result stays the same'
            : 'Continue after the competition result'
        }
        label={premium ? 'Skip' : 'Continue'}
        onClick={finish}
      />
    </section>,
    document.body
  )
}
