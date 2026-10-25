import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { MinigameSession, Player } from '../../../types'
import { useAppDispatch, useAppSelector } from '../../../store/hooks'
import { completeMinigame } from '../../../store/gameSlice'
import { SoundManager } from '../../../services/sound/SoundManager'
import type { CompetitionSkillProfile } from '../../../ai/competition/types'
import type { GenericMinigameProps } from '../../reactComponents'
import {
  VIP_SEASONS,
  QUICK_TAP_VIP_BREAK_MS,
  advanceQuickTapVipState,
  applyQuickTapVipTap,
  claimQuickTapVipBox,
  createQuickTapVipOffers,
  createQuickTapVipScoreState,
  getQuickTapVipClock,
  getQuickTapVipProgressAt,
  quickTapVipDurationMs,
  quickTapVipRoundMs,
  quickTapVipSeasonAt,
  quickTapVipTapValueAt,
  rerollQuickTapVipSeason,
  resolveQuickTapVipBox,
  simulateQuickTapVipAiRace,
  type QuickTapVipBooster,
  type QuickTapVipMode,
  type TapSeason,
} from './quickTapVipLogic'
import './QuickTapRaceVip.css'

type Props = GenericMinigameProps & {
  session?: MinigameSession
  players?: Player[]
  mode?: QuickTapVipMode
}
type Entry = {
  id: string
  name: string
  isHuman: boolean
  score: number
  rawTaps: number
  roundScore: number
}
type Clock = ReturnType<typeof getQuickTapVipClock>
type View = {
  clock: Clock
  entries: Entry[]
  season: TapSeason | null
  tapValue: number
  effect: string | null
  effectLeft: number
  effectGood: boolean
  stillness: boolean
  score: number
  roundScores: number[]
  offerIndex: number | null
  rerollUsed: boolean
  phaseKey: number
}
const EMPTY_PLAYERS: Player[] = []
const DEFAULT_TAP_PROFILE: Partial<CompetitionSkillProfile> = {
  physical: 50,
  mental: 50,
  nerve: 50,
  consistency: 50,
}
const BASE = `${import.meta.env.BASE_URL}assets/minigames/`
const SEASONS: TapSeason[] = ['spring', 'summer', 'autumn', 'winter']
const numberText = (value: number) =>
  Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
const cue = (key: string) => {
  void SoundManager.play(`minigame:${key}`)
}

function paintArena(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  now: number,
  lastTap: number,
  season: TapSeason | null,
  stop: boolean,
  reduced: boolean
) {
  ctx.clearRect(0, 0, width, height)
  const cx = width / 2,
    cy = height / 2,
    r = Math.min(width, height) * 0.36
  const pulse = Math.max(0, 1 - (now - lastTap) / 240)
  const color = stop ? '#acdcf1' : season ? VIP_SEASONS[season].color : '#efc878'
  ctx.strokeStyle = color
  for (let ring = 0; ring < 3; ring++) {
    ctx.globalAlpha = 0.12 + pulse * 0.35 - ring * 0.025
    ctx.lineWidth = ring === 0 ? 2 : 1
    ctx.beginPath()
    ctx.arc(cx, cy, r + ring * 14 + pulse * (ring + 1) * 5, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (!reduced) {
    for (let i = 0; i < 18; i++) {
      const t = now / 1000,
        x = (((i * 73.73 + Math.sin(t * 0.5 + i) * 12) % width) + width) % width
      const y = (i * 41 + t * (season === 'summer' ? -18 : 15 + (i % 5)) + height * 10) % height
      ctx.globalAlpha = 0.18 + (i % 4) * 0.1
      ctx.fillStyle = color
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(t * 0.3 + i)
      if (season === 'autumn' || season === 'spring') {
        ctx.beginPath()
        ctx.ellipse(0, 0, 2, 5, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(-1, -1, season === 'winter' ? 3 : 2, season === 'winter' ? 3 : 2)
      }
      ctx.restore()
    }
  }
  ctx.globalAlpha = 1
}

export default function QuickTapRaceVip({
  session,
  players = EMPTY_PLAYERS,
  participants,
  participantIds,
  seed,
  autoStart = false,
  onFinish,
  mode = 'race',
}: Props) {
  const dispatch = useAppDispatch()
  const storePlayers = useAppSelector((state) => state.game.players)
  const roster = players.length ? players : storePlayers
  const [run] = useState(() => ({ seed: session?.seed ?? seed ?? 424242, mode }))
  const roundMs = quickTapVipRoundMs(run.mode),
    duration = quickTapVipDurationMs(run.mode)
  const contestants = useMemo(() => {
    const ids = session?.participants ?? participantIds ?? participants?.map((p) => p.id) ?? ['you']
    return ids.map((id, index) => {
      const host = participants?.find((p) => p.id === id),
        player = roster.find((p) => p.id === id)
      return {
        id,
        name: host?.name ?? player?.name ?? (index === 0 ? 'You' : `AI ${index}`),
        isHuman: host?.isHuman ?? player?.isUser ?? index === 0,
        profile: (player ? (player.competitionProfile ?? DEFAULT_TAP_PROFILE) : undefined) as
          | Partial<CompetitionSkillProfile>
          | undefined,
      }
    })
  }, [session?.participants, participantIds, participants, roster])
  const offers = useMemo(() => createQuickTapVipOffers(run.seed, run.mode), [run])
  const aiRaces = useMemo(
    () =>
      new Map(
        contestants
          .filter((p) => !p.isHuman)
          .map((p) => [
            p.id,
            simulateQuickTapVipAiRace({
              seed: run.seed,
              mode: run.mode,
              playerId: p.id,
              profile: p.profile,
              offers,
            }),
          ])
      ),
    [contestants, offers, run]
  )
  const [initialState] = useState(() => createQuickTapVipScoreState(run.seed, run.mode))
  const runtime = useRef(initialState)
  const displayedSeason = useRef(quickTapVipSeasonAt(initialState, 0))
  const startedAt = useRef<number | null>(null)
  const lastWall = useRef(0),
    lastTap = useRef(-1000),
    pointers = useRef(new Set<number>())
  const ended = useRef(false),
    committed = useRef(false),
    lastEvent = useRef(''),
    lastUi = useRef(0)
  const canvas = useRef<HTMLCanvasElement>(null),
    tapButton = useRef<HTMLButtonElement>(null)
  const scoreElement = useRef<HTMLElement>(null),
    clockElement = useRef<HTMLElement>(null),
    tapsElement = useRef<HTMLElement>(null)
  const finishContext = useRef({ session, onFinish })
  const [phase, setPhase] = useState<'countdown' | 'playing' | 'results'>(
    autoStart ? 'playing' : 'countdown'
  )
  const [countdown, setCountdown] = useState(3)
  const [view, setView] = useState<View>({
    clock: getQuickTapVipClock(0, run.mode),
    entries: [],
    season: quickTapVipSeasonAt(initialState, 0),
    tapValue: quickTapVipTapValueAt(initialState, 0),
    effect: null,
    effectLeft: 0,
    effectGood: true,
    stillness: false,
    score: 0,
    roundScores: [0, 0, 0],
    offerIndex: null,
    rerollUsed: false,
    phaseKey: 0,
  })
  const [reveal, setReveal] = useState<{
    booster: QuickTapVipBooster
    key: number
    until: number
  } | null>(null)
  const [finalEntries, setFinalEntries] = useState<Entry[]>([])
  const [finalRoundScores, setFinalRoundScores] = useState<number[]>([0, 0, 0])
  useEffect(() => {
    finishContext.current = { session, onFinish }
  }, [session, onFinish])

  const entriesAt = useCallback(
    (atMs: number, round: number): Entry[] =>
      contestants
        .map((p) => {
          if (p.isHuman)
            return {
              ...p,
              score: runtime.current.score,
              rawTaps: runtime.current.rawTaps,
              roundScore: runtime.current.roundScores[round],
            }
          const ai = aiRaces.get(p.id),
            point = ai ? getQuickTapVipProgressAt(ai.progress, atMs) : null
          const start = ai
            ? getQuickTapVipProgressAt(ai.progress, round * roundMs - 0.001).score
            : 0
          return {
            ...p,
            score: point?.score ?? 0,
            rawTaps: point?.rawTaps ?? 0,
            roundScore: (point?.score ?? 0) - start,
          }
        })
        .sort((a, b) => b.score - a.score || b.rawTaps - a.rawTaps || a.id.localeCompare(b.id)),
    [contestants, aiRaces, roundMs]
  )

  const readClock = useCallback(() => {
    const wall =
      startedAt.current === null ? 0 : Math.max(lastWall.current, Date.now() - startedAt.current)
    lastWall.current = wall
    return getQuickTapVipClock(wall, run.mode)
  }, [run.mode])

  const registerTap = useCallback(() => {
    if (phase !== 'playing' || ended.current) return
    const clock = readClock()
    if (clock.intermission || clock.finished) return
    runtime.current = applyQuickTapVipTap(runtime.current, clock.elapsedMs)
    lastTap.current = performance.now()
  }, [phase, readClock])

  const claimBox = useCallback(() => {
    if (phase !== 'playing' || ended.current) return
    const clock = readClock()
    if (clock.intermission || clock.finished) return
    const offer = offers.find(
      (item) =>
        clock.elapsedMs >= item.opensAtMs &&
        clock.elapsedMs < item.closesAtMs &&
        !runtime.current.usedOfferIndexes.includes(item.index)
    )
    if (!offer) return
    const previous = runtime.current
    const booster = resolveQuickTapVipBox(
      run.seed,
      offer.index,
      quickTapVipSeasonAt(previous, clock.elapsedMs)
    )
    const next = claimQuickTapVipBox(previous, offer, clock.elapsedMs)
    if (next === previous) return
    runtime.current = next
    setReveal({ booster, key: offer.index, until: Date.now() + 1500 })
    cue(booster.good ? 'quicktap_booster' : 'quicktap_half_tap')
    lastUi.current = 0
  }, [phase, readClock, offers, run.seed])

  const changeSeason = useCallback(() => {
    if (phase !== 'playing' || ended.current) return
    const clock = readClock()
    if (clock.intermission || clock.finished) return
    const next = rerollQuickTapVipSeason(runtime.current, clock.elapsedMs)
    if (next !== runtime.current) {
      runtime.current = next
      lastUi.current = 0
      cue('quicktap_booster')
    }
  }, [phase, readClock])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))
      )
        return
      if (event.code === 'Digit1') {
        event.preventDefault()
        claimBox()
      } else if (event.code === 'KeyR' && run.mode === 'seasons') {
        event.preventDefault()
        changeSeason()
      } else if (event.code === 'Space' || event.code === 'Enter') {
        if (target instanceof HTMLButtonElement && target !== tapButton.current) return
        event.preventDefault()
        registerTap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [registerTap, claimBox, changeSeason, run.mode])

  useEffect(() => {
    if (run.mode !== 'seasons') return
    for (const season of SEASONS) {
      const image = new Image()
      image.src = `${BASE}quick-tap-seasons-vip/${season}.webp`
      if (typeof image.decode === 'function') void image.decode().catch(() => undefined)
    }
  }, [run.mode])

  useEffect(() => {
    let raf = 0,
      countdownStart: number | null = null,
      previousCountdown = 3
    const ctx = canvas.current?.getContext('2d') ?? null
    let width = 0,
      height = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const resize = () => {
      if (!canvas.current) return
      const rect = canvas.current.getBoundingClientRect(),
        dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      width = rect.width
      height = rect.height
      canvas.current.width = Math.round(width * dpr)
      canvas.current.height = Math.round(height * dpr)
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const observer = new ResizeObserver(resize)
    if (canvas.current) observer.observe(canvas.current)
    resize()
    const frame = (now: number) => {
      if (ended.current) return
      if (phase === 'countdown') {
        countdownStart ??= Date.now()
        const left = 3 - Math.floor((Date.now() - countdownStart) / 1000)
        if (left !== previousCountdown) {
          previousCountdown = left
          setCountdown(Math.max(1, left))
        }
        if (left <= 0) {
          setPhase('playing')
          return
        }
      } else {
        startedAt.current ??= Date.now()
        const clock = readClock()
        runtime.current = advanceQuickTapVipState(runtime.current, clock.elapsedMs)
        const current = runtime.current,
          season = clock.intermission
            ? displayedSeason.current
            : quickTapVipSeasonAt(current, Math.min(duration - 1, clock.elapsedMs))
        if (!clock.intermission) displayedSeason.current = season
        const value = quickTapVipTapValueAt(current, clock.elapsedMs)
        if (scoreElement.current) scoreElement.current.textContent = numberText(current.score)
        if (clockElement.current)
          clockElement.current.textContent = (clock.roundLeftMs / 1000).toFixed(1)
        if (tapsElement.current) tapsElement.current.textContent = `${current.rawTaps} taps`
        if (tapButton.current)
          tapButton.current.style.transform =
            now - lastTap.current < 75 ? 'scale(.965)' : 'scale(1)'
        const eventKey = clock.intermission
          ? `break:${clock.round}`
          : `${clock.round}:${season ?? 'race'}`
        if (eventKey !== lastEvent.current) {
          if (lastEvent.current)
            cue(
              clock.intermission
                ? 'gb_new_turn'
                : season === 'winter'
                  ? 'quicktap_half_tap'
                  : 'quicktap_booster'
            )
          lastEvent.current = eventKey
          lastUi.current = 0
        }
        if (now - lastUi.current >= 100) {
          lastUi.current = now
          const offer = !clock.intermission
            ? offers.find(
                (item) =>
                  clock.elapsedMs >= item.opensAtMs &&
                  clock.elapsedMs < item.closesAtMs &&
                  !current.usedOfferIndexes.includes(item.index)
              )
            : null
          const effect = current.activeEffect
          setView({
            clock,
            entries: entriesAt(clock.elapsedMs, clock.round),
            season,
            tapValue: value,
            effect: effect?.booster.short ?? null,
            effectLeft: effect ? Math.max(0, effect.endsAtMs - clock.elapsedMs) : 0,
            effectGood: effect?.booster.good ?? true,
            stillness: effect?.booster.id === 'stillness',
            score: current.score,
            roundScores: current.roundScores,
            offerIndex: offer?.index ?? null,
            rerollUsed: current.usedRerollRounds.includes(clock.round),
            phaseKey: run.mode === 'seasons' ? Math.floor(clock.elapsedMs / 7000) : clock.round,
          })
          setReveal((previous) => (previous && Date.now() >= previous.until ? null : previous))
        }
        if (ctx && !clock.intermission)
          paintArena(ctx, width, height, now, lastTap.current, season, value < 0, reduced)
        if (clock.finished) {
          ended.current = true
          setFinalEntries(entriesAt(duration, 2))
          setFinalRoundScores(current.roundScores)
          setPhase('results')
          cue('gb_winner')
          return
        }
      }
      raf = requestAnimationFrame(frame)
    }
    if (phase !== 'results') raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [phase, readClock, duration, entriesAt, offers, run.mode])

  const commitCompletion = () => {
    if (committed.current || !finalEntries.length) return
    committed.current = true
    const rawResults = Object.fromEntries(finalEntries.map((entry) => [entry.id, entry.score]))
    const humanScore = finalEntries.find((entry) => entry.isHuman)?.score ?? 0
    const winnerId = finalEntries[0].id,
      lastPlaceId = finalEntries[finalEntries.length - 1].id
    const context = finishContext.current
    if (context.session)
      dispatch(completeMinigame({ humanScore, rawResults, winnerId, lastPlaceId }))
    else
      context.onFinish?.(humanScore, undefined, {
        rawValue: humanScore,
        rawResults,
        authoritativeWinnerId: winnerId,
        authoritativeLastPlaceId: lastPlaceId,
        authoritativeRankedIds: finalEntries.map((entry) => entry.id),
      })
  }

  const humanEntry = view.entries.find((entry) => entry.isHuman)
  const rank = Math.max(1, view.entries.findIndex((entry) => entry.isHuman) + 1)
  const leaders = view.entries.slice(0, 3)
  if (humanEntry && !leaders.some((entry) => entry.isHuman))
    leaders[leaders.length - 1] = humanEntry
  const season = view.season,
    seasonInfo = season ? VIP_SEASONS[season] : null
  const stop = view.tapValue < 0 || view.stillness
  const rootStyle = { '--qtr-accent': seasonInfo?.color ?? '#f2cc79' } as CSSProperties
  const title = run.mode === 'seasons' ? 'Quick Tap Seasons' : 'Quick Tap Race'
  const background = (
    <div className="qtr-vip__backdrops" aria-hidden="true">
      {run.mode === 'seasons' ? (
        SEASONS.map((item) => (
          <img
            key={item}
            src={`${BASE}quick-tap-seasons-vip/${item}.webp`}
            className={season === item ? 'is-current' : ''}
            alt=""
            draggable={false}
          />
        ))
      ) : (
        <img className="is-current" src={`${BASE}quick-tap-vip/pulse-chamber.webp`} alt="" />
      )}
    </div>
  )
  const standings = (entries: Entry[], round = false) => (
    <ol className="qtr-vip__standings" aria-label={round ? 'Round standings' : 'Final standings'}>
      {entries.map((entry, index) => (
        <li key={entry.id} className={entry.isHuman ? 'is-you' : ''}>
          <span className="qtr-vip__place">{index + 1}</span>
          <span className="qtr-vip__person">
            {entry.name}
            {entry.isHuman && <small>YOU</small>}
          </span>
          <span className="qtr-vip__standing-taps">{entry.rawTaps} taps</span>
          <strong>{numberText(round ? entry.roundScore : entry.score)}</strong>
        </li>
      ))}
    </ol>
  )

  const stage = (
    <main
      className={`qtr-vip qtr-vip--${run.mode} qtr-vip--${phase}${stop ? ' is-stop' : ''}${reveal && !reveal.booster.good ? ' has-handicap' : ''}`}
      style={rootStyle}
      data-testid="quick-tap-vip"
      data-mode={run.mode}
      data-round={view.clock.round + 1}
      data-season={season ?? 'none'}
    >
      {background}
      <div className="qtr-vip__scrim" />
      <header className="qtr-vip__header">
        <div>
          <p className="qtr-vip__eyebrow">THE BIG EYE · VIP</p>
          <h1>{title}</h1>
        </div>
        <span className="qtr-vip__round-label">
          ROUND {view.clock.round + 1}
          <small> / 3</small>
        </span>
      </header>
      {phase === 'results' ? (
        <section className="qtr-vip__final">
          <div className="qtr-vip__victory-mark" aria-hidden="true">
            ✦
          </div>
          <p className="qtr-vip__eyebrow">THE FINAL PULSE</p>
          <h2>
            {finalEntries[0]?.isHuman
              ? 'The Eye is yours.'
              : `${finalEntries[0]?.name ?? 'The leader'} takes the crown.`}
          </h2>
          <p className="qtr-vip__final-score">
            {numberText(finalEntries.find((entry) => entry.isHuman)?.score ?? 0)}
            <small>YOUR POINTS · 3 ROUNDS</small>
          </p>
          <div className="qtr-vip__round-totals">
            {finalRoundScores.map((score, index) => (
              <span key={index}>
                R{index + 1}
                <strong>{numberText(score)}</strong>
              </span>
            ))}
          </div>
          {standings(finalEntries)}
          <button className="qtr-vip__continue" onClick={commitCompletion}>
            Continue
          </button>
        </section>
      ) : (
        <>
          <section className="qtr-vip__hud" aria-label="Race status">
            <div>
              <span className="qtr-vip__eyebrow">TOTAL POINTS</span>
              <strong ref={scoreElement} data-testid="vip-score">
                0
              </strong>
              <small ref={tapsElement}>0 taps</small>
            </div>
            <div className={`qtr-vip__clock${view.clock.roundLeftMs <= 5000 ? ' is-urgent' : ''}`}>
              <span className="qtr-vip__eyebrow">SECONDS</span>
              <strong ref={clockElement}>{roundMs / 1000}</strong>
              <small>
                {rank} / {contestants.length}
              </small>
            </div>
            <div className="qtr-vip__meter">
              <span style={{ transform: `scaleX(${view.clock.roundLeftMs / roundMs})` }} />
            </div>
          </section>
          <section className="qtr-vip__leaders" aria-label="Live leaders">
            {leaders.map((entry) => (
              <div key={entry.id} className={entry.isHuman ? 'is-you' : ''}>
                <span>{entry.isHuman ? 'YOU' : entry.name}</span>
                <strong>{numberText(entry.score)}</strong>
              </div>
            ))}
          </section>
          {seasonInfo ? (
            <section className="qtr-vip__season-status">
              <div key={`${view.phaseKey}:${season}`} className="qtr-vip__season-name">
                <span>{seasonInfo.glyph}</span>
                <div>
                  <strong>{seasonInfo.label}</strong>
                  <small>
                    {seasonInfo.value < 0
                      ? 'STOP · −1 per tap'
                      : `${seasonInfo.value} ${seasonInfo.value === 1 ? 'point' : 'points'} per tap`}
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="qtr-vip__change"
                disabled={view.rerollUsed || phase !== 'playing' || view.clock.intermission}
                onClick={changeSeason}
                aria-keyshortcuts="R"
              >
                {view.rerollUsed ? 'Change used' : 'Change season'}
                <small>{view.rerollUsed ? 'Resets next round' : 'Random · 1 per round'}</small>
              </button>
            </section>
          ) : (
            <div className="qtr-vip__race-caption">A little speed. A little nerve.</div>
          )}
          <section className="qtr-vip__arena" aria-label="Tap arena">
            <canvas ref={canvas} aria-hidden="true" />
            <div
              className={`qtr-vip__weather-seal${stop ? ' is-frozen' : ''}`}
              key={`${view.phaseKey}:${season}:${view.clock.round}`}
              aria-hidden="true"
            >
              {seasonInfo?.glyph ?? '✧'}
            </div>
            <div
              className={`qtr-vip__effect${!view.effectGood ? ' is-bad' : ''}`}
              aria-live="polite"
            >
              {view.effect ? (
                <>
                  {view.effect}
                  <small>{(view.effectLeft / 1000).toFixed(1)}s</small>
                </>
              ) : (
                <>{stop ? 'Let the cold pass.' : 'Charge the Eye.'}</>
              )}
            </div>
            <button
              ref={tapButton}
              className="qtr-vip__tap-control"
              type="button"
              aria-label={
                stop
                  ? 'Tap the Eye. Current taps lose points or cancel Stillness.'
                  : 'Tap the Eye to score points'
              }
              disabled={phase !== 'playing' || view.clock.intermission}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return
                event.preventDefault()
                if (pointers.current.has(event.pointerId)) return
                pointers.current.add(event.pointerId)
                registerTap()
              }}
              onPointerUp={(event) => pointers.current.delete(event.pointerId)}
              onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
              onPointerLeave={(event) => pointers.current.delete(event.pointerId)}
              onClick={(event) => {
                if (event.detail === 0) registerTap()
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <img src={`${BASE}quick-tap-vip/eye-tap-control.webp`} alt="" draggable={false} />
              <span>
                {stop ? 'STOP' : 'TAP'}
                <small>
                  {view.stillness
                    ? 'Stay still for the bonus'
                    : `${view.tapValue > 0 ? '+' : ''}${view.tapValue} per tap`}
                </small>
              </span>
            </button>
            {reveal && (
              <div
                key={reveal.key}
                className={`qtr-vip__reveal${reveal.booster.good ? ' is-good' : ' is-bad'}`}
                role="status"
              >
                <span>{reveal.booster.glyph}</span>
                <strong>{reveal.booster.short}</strong>
                <small>{reveal.booster.name}</small>
              </div>
            )}
          </section>
          <footer className="qtr-vip__offer-slot">
            {view.offerIndex !== null && phase === 'playing' && !view.clock.intermission ? (
              <button
                className="qtr-vip__mystery"
                type="button"
                onClick={claimBox}
                aria-label="Grab mystery box. May contain a reward or handicap."
                aria-keyshortcuts="1"
              >
                <span className="qtr-vip__mystery-cube" aria-hidden="true">
                  ?
                </span>
                <span>
                  <strong>MYSTERY BOX</strong>
                  <small>Reward or risk · tap to grab</small>
                </span>
                <kbd>1</kbd>
              </button>
            ) : (
              <p>
                {run.mode === 'seasons'
                  ? 'Read the weather. Trust your instinct.'
                  : 'Trust your rhythm. Risk the mystery.'}
              </p>
            )}
          </footer>
          {phase === 'countdown' && (
            <div className="qtr-vip__curtain">
              <p className="qtr-vip__eyebrow">READY YOUR HAND</p>
              <strong className="qtr-vip__countdown" key={countdown}>
                {countdown}
              </strong>
              <p>{title} · 3 rounds</p>
            </div>
          )}
          {view.clock.intermission && (
            <section className="qtr-vip__curtain qtr-vip__intermission">
              <p className="qtr-vip__eyebrow">ROUND {view.clock.round + 1} SEALED</p>
              <h2>Take a breath.</h2>
              <div className="qtr-vip__break-score">
                <strong>{numberText(view.roundScores[view.clock.round])}</strong>
                <span>ROUND POINTS</span>
              </div>
              <p>
                Total {numberText(view.score)} · Position {rank} / {contestants.length}
              </p>
              {standings(view.entries.slice(0, 5))}
              <div className="qtr-vip__next-round">
                Round {view.clock.round + 2}
                <strong>{Math.max(1, Math.ceil(view.clock.breakLeftMs / 1000))}</strong>
              </div>
              <div className="qtr-vip__break-meter">
                <span
                  style={{
                    transform: `scaleX(${view.clock.breakLeftMs / QUICK_TAP_VIP_BREAK_MS})`,
                  }}
                />
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
  return createPortal(stage, document.body)
}
