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
const TAP_HEAT_COLORS = ['#66d6e3', '#66e0d1', '#f0cf79', '#ffa45b', '#ff875d', '#ff7955']
const TAP_SPARK_BATCHES = 8
const TAP_SPARKS_PER_BATCH = 6
const CLASSIC_SPARKS_PER_TAP = 4
const TAP_SPARK_COUNT = TAP_SPARK_BATCHES * TAP_SPARKS_PER_BATCH
const CLASSIC_HEAT_EMOJIS = ['✨', '✨', '⚡', '🔥', '🔥', '💥']
const TAP_SPARK_ORIGINS = [
  [10, 25],
  [50, 7],
  [90, 25],
  [92, 72],
  [50, 93],
  [8, 72],
] as const
const CLASSIC_SPARK_FLIGHTS: readonly [number, number, number][] = [
  [-78, -52, -32],
  [0, -90, 0],
  [78, -52, 32],
  [96, 24, 70],
  [0, 84, 155],
  [-96, 24, -70],
]
const SEASON_PARTICLE_ASSETS: Record<TapSeason, string> = {
  spring: 'spring-bird.webp',
  summer: 'summer-sun.webp',
  autumn: 'autumn-leaf.webp',
  winter: 'winter-snowflake.webp',
}
const SEASON_SPARK_FLIGHTS: Record<TapSeason, readonly [number, number, number][]> = {
  spring: [
    [-92, -56, -38],
    [0, -108, 0],
    [92, -56, 38],
    [108, 12, 54],
    [30, -88, 16],
    [-108, 12, -54],
  ],
  summer: [
    [-82, -80, -24],
    [0, -112, 0],
    [82, -80, 24],
    [96, -68, 38],
    [28, -116, 0],
    [-96, -68, -38],
  ],
  autumn: [
    [-90, 48, -120],
    [-18, -58, 88],
    [90, 48, 128],
    [108, 72, 178],
    [18, 102, 220],
    [-108, 70, -168],
  ],
  winter: [
    [-86, -55, -72],
    [-18, -108, 42],
    [86, -55, 82],
    [104, 12, 136],
    [26, 98, 160],
    [-104, 12, -120],
  ],
}
const numberText = (value: number) =>
  Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
const cue = (key: string) => {
  void SoundManager.play(`minigame:${key}`)
}

function playReusableAnimation(
  element: HTMLElement,
  animationRef: { current: Animation | null },
  keyframes: Keyframe[],
  timing: { duration: number; easing: string; fill: 'both' }
) {
  const animation = animationRef.current
  const effect = animation?.effect as KeyframeEffect | null | undefined
  if (animation && effect && typeof effect.setKeyframes === 'function') {
    effect.setKeyframes(keyframes)
    effect.updateTiming(timing)
    animation.currentTime = 0
    animation.play()
    return
  }
  animation?.cancel()
  animationRef.current = element.animate(keyframes, timing)
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
  const pulse = Math.max(0, 1 - (now - lastTap) / 520)
  const color = stop ? '#acdcf1' : season ? VIP_SEASONS[season].color : '#efc878'
  if (pulse > 0) {
    const shimmerCount = reduced ? 3 : 7
    const shimmerTime = reduced ? 0 : now * 0.0018
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineCap = 'round'
    for (let i = 0; i < shimmerCount; i++) {
      const flicker = 0.45 + (Math.sin(shimmerTime * 2.3 + i * 1.7) + 1) * 0.24
      const angle = (i / shimmerCount) * Math.PI * 2 + shimmerTime
      const radius = r + Math.sin(shimmerTime * 1.8 + i) * (1.5 + pulse * 2.5)
      ctx.globalAlpha = pulse * flicker
      ctx.lineWidth = 0.8 + pulse * flicker * 1.6
      ctx.beginPath()
      ctx.arc(cx, cy, radius, angle, angle + 0.025 + flicker * 0.075)
      ctx.stroke()

      if (i % 2 === 0) {
        const glintAngle = angle + 0.16 + flicker * 0.16
        ctx.globalAlpha = pulse * flicker * 0.82
        ctx.beginPath()
        ctx.arc(
          cx + Math.cos(glintAngle) * radius,
          cy + Math.sin(glintAngle) * radius,
          0.75 + pulse * flicker * 1.5,
          0,
          Math.PI * 2
        )
        ctx.fill()
      }
    }
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
    pointers = useRef(new Set<number>()),
    recentTapTimes = useRef<number[]>([]),
    heatLevel = useRef(0),
    sparkBatch = useRef(0),
    lastChirpAt = useRef(0),
    pressAnimation = useRef<Animation | null>(null),
    glowAnimation = useRef<Animation | null>(null),
    sparkAnimations = useRef<Array<{ current: Animation | null }>>([])
  const ended = useRef(false),
    committed = useRef(false),
    lastEvent = useRef(''),
    lastUi = useRef(0)
  const canvas = useRef<HTMLCanvasElement>(null),
    tapButton = useRef<HTMLButtonElement>(null),
    tapGlow = useRef<HTMLSpanElement>(null),
    tapSparks = useRef<Array<HTMLSpanElement | null>>([])
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
  const captureTapSpark = useCallback((node: HTMLSpanElement | null) => {
    if (!node) return
    tapSparks.current[Number(node.dataset.sparkIndex)] = node
  }, [])
  const tapSparkElements = useMemo(
    () =>
      Array.from({ length: TAP_SPARK_COUNT }, (_, index) => (
        <span
          key={`spark-${index}`}
          ref={captureTapSpark}
          data-spark-index={index}
          className="qtr-vip__tap-spark"
          aria-hidden="true"
        />
      )),
    [captureTapSpark]
  )
  useEffect(() => {
    finishContext.current = { session, onFinish }
  }, [session, onFinish])
  useEffect(() => {
    if (run.mode !== 'seasons') return
    SoundManager.registerDynamic({
      key: 'minigame:qtr_spring_chirp',
      category: 'minigame',
      src: `${BASE}quick-tap-seasons-vip/sounds/spring-chirp.wav`,
      preload: false,
      volume: 0.16,
    })
  }, [run.mode])
  useEffect(
    () => () => {
      pressAnimation.current?.cancel()
      glowAnimation.current?.cancel()
      sparkAnimations.current.forEach((animationRef) => animationRef.current?.cancel())
    },
    []
  )

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

  const updateTapHeat = useCallback((now: number, countTap = false) => {
    const recent = recentTapTimes.current
    if (countTap) recent.push(now)
    while (recent.length && recent[0] < now - 2_000) recent.shift()
    const nextHeat = Math.min(5, Math.floor(recent.length / 2))
    if (nextHeat === heatLevel.current) return
    heatLevel.current = nextHeat
    const button = tapButton.current
    if (button) {
      button.dataset.heatLevel = String(nextHeat)
      button.style.setProperty('--qtr-heat-color', TAP_HEAT_COLORS[nextHeat])
    }
  }, [])

  const playTapFeedback = useCallback(() => {
    const button = tapButton.current
    if (!button || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    if (typeof button.animate === 'function') {
      if (pressAnimation.current) {
        pressAnimation.current.currentTime = 0
        pressAnimation.current.play()
      } else {
        pressAnimation.current = button.animate(
          [
            { transform: 'translate3d(0, 0, 0) scale(1)', offset: 0 },
            { transform: 'translate3d(0, 5px, 0) scale(.96)', offset: 0.24 },
            { transform: 'translate3d(0, -1px, 0) scale(1.015)', offset: 0.66 },
            { transform: 'translate3d(0, 0, 0) scale(1)', offset: 1 },
          ],
          { duration: 210, easing: 'cubic-bezier(.2, .78, .2, 1)' }
        )
      }
    }

    const glow = tapGlow.current
    if (!glow || typeof glow.animate !== 'function') return
    const heat = heatLevel.current
    const glowPower = 0.22 + heat * 0.03
    playReusableAnimation(
      glow,
      glowAnimation,
      [
        {
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(.55)',
        },
        {
          opacity: glowPower,
          transform: 'translate(-50%, -50%) scale(1.05)',
          offset: 0.24,
        },
        {
          opacity: glowPower * 0.38,
          transform: 'translate(-50%, -50%) scale(1.34)',
          offset: 0.52,
        },
        {
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(1.58)',
        },
      ],
      { duration: 460 + heat * 22, easing: 'cubic-bezier(.18, .7, .24, 1)', fill: 'both' }
    )

    const season = run.mode === 'seasons' ? displayedSeason.current : null
    const sparkPower = season ? 0.94 : 0.9
    const sparkDuration = season ? 780 + heat * 18 : 650 + heat * 22
    const batch = sparkBatch.current
    sparkBatch.current = (batch + 1) % TAP_SPARK_BATCHES
    const chirpNow = Date.now()
    if (season === 'spring' && chirpNow - lastChirpAt.current >= 1200) {
      lastChirpAt.current = chirpNow
      cue('qtr_spring_chirp')
    }
    const sparkCount = season ? TAP_SPARK_ORIGINS.length : CLASSIC_SPARKS_PER_TAP
    for (let index = 0; index < sparkCount; index++) {
      const sparkIndex = batch * TAP_SPARKS_PER_BATCH + index
      const spark = tapSparks.current[sparkIndex]
      if (!spark || typeof spark.animate !== 'function') continue
      const spread = 1 + heat * 0.08
      const animationRef =
        sparkAnimations.current[sparkIndex] ??
        (sparkAnimations.current[sparkIndex] = { current: null })
      const rotation = (batch - (TAP_SPARK_BATCHES - 1) / 2) * 3
      const radians = (rotation * Math.PI) / 180
      const sparkSlot = (index + batch) % TAP_SPARK_ORIGINS.length
      const flight = season
        ? SEASON_SPARK_FLIGHTS[season][sparkSlot]!
        : CLASSIC_SPARK_FLIGHTS[sparkSlot]!
      const [dx, dy, endRotation] = flight
      const [originX, originY] = TAP_SPARK_ORIGINS[sparkSlot]!
      spark.style.left = `${originX}%`
      spark.style.top = `${originY}%`
      spark.textContent = season ? '' : CLASSIC_HEAT_EMOJIS[heat]!
      const travelX = dx * Math.cos(radians) - dy * Math.sin(radians)
      const travelY = dx * Math.sin(radians) + dy * Math.cos(radians)
      const mirrorBird = season === 'spring' && travelX < 0 ? 'scaleX(-1) ' : ''
      const startRotation = season === 'autumn' ? -18 : season === 'winter' ? -12 : season ? 0 : -8
      const middleRotation = season === 'autumn' ? endRotation * 0.52 : endRotation * 0.22
      playReusableAnimation(
        spark,
        animationRef,
        [
          {
            opacity: 0,
            visibility: 'visible',
            transform: `translate(-50%, -50%) ${mirrorBird}scale(${season ? 0.52 : 0.58}) rotate(${startRotation}deg)`,
          },
          {
            opacity: sparkPower,
            visibility: 'visible',
            transform: `translate(calc(-50% + ${travelX * spread * 0.34}px), calc(-50% + ${travelY * spread * 0.34}px)) ${mirrorBird}scale(${season ? 1.08 + heat * 0.035 : 1.04 + heat * 0.055}) rotate(${middleRotation + rotation}deg)`,
            offset: 0.22,
          },
          {
            opacity: sparkPower * 0.74,
            transform: `translate(calc(-50% + ${travelX * spread * 0.78}px), calc(-50% + ${travelY * spread * 0.78}px)) ${mirrorBird}scale(${season ? 0.84 : 0.86}) rotate(${endRotation * 0.78 + rotation}deg)`,
            offset: 0.72,
          },
          {
            opacity: 0,
            visibility: 'hidden',
            transform: `translate(calc(-50% + ${travelX * spread * 1.32}px), calc(-50% + ${travelY * spread * 1.32}px)) ${mirrorBird}scale(${season ? 0.52 : 0.56}) rotate(${endRotation + rotation}deg)`,
          },
        ],
        { duration: sparkDuration, easing: 'cubic-bezier(.2, .72, .22, 1)', fill: 'both' }
      )
    }
  }, [run.mode])

  const registerTap = useCallback(() => {
    if (phase !== 'playing' || ended.current) return
    const clock = readClock()
    if (clock.intermission || clock.finished) return
    runtime.current = applyQuickTapVipTap(runtime.current, clock.elapsedMs)
    const now = performance.now()
    updateTapHeat(now, true)
    playTapFeedback()
    lastTap.current = now
  }, [phase, readClock, updateTapHeat, playTapFeedback])

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
        updateTapHeat(now)
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
  }, [phase, readClock, duration, entriesAt, offers, run.mode, updateTapHeat])

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
  const rootStyle = {
    '--qtr-accent': seasonInfo?.color ?? '#f2cc79',
    '--qtr-season-particle': season
      ? `url("${BASE}quick-tap-seasons-vip/particles/${SEASON_PARTICLE_ASSETS[season]}")`
      : 'none',
  } as CSSProperties
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
          <div
            className="qtr-vip__results-scroll"
            role="region"
            aria-label="All final results"
            tabIndex={0}
          >
            {standings(finalEntries)}
          </div>
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
              data-heat-level="0"
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
              <span ref={tapGlow} className="qtr-vip__tap-glow" aria-hidden="true" />
              {tapSparkElements}
              <img src={`${BASE}quick-tap-vip/eye-tap-control-v2.webp`} alt="" draggable={false} />
            </button>
            <div className="qtr-vip__tap-caption" aria-hidden="true">
              {stop ? 'STOP' : 'TAP'}
              <small>
                {view.stillness
                  ? 'Stay still for the bonus'
                  : `${view.tapValue > 0 ? '+' : ''}${view.tapValue} per tap`}
              </small>
            </div>
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
              <div
                className="qtr-vip__results-scroll"
                role="region"
                aria-label="All round results"
                tabIndex={0}
              >
                {standings(view.entries, true)}
              </div>
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
