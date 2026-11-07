import type { Middleware } from '@reduxjs/toolkit'
import { getSavePersistenceDiagnostics } from '../../store/saveStatePersistence'

const SAMPLE_LIMIT = 3_000
const FRAME_GAP_THRESHOLD_MS = 24
const INPUT_SAMPLE_LIMIT = 20
const STATE_SAMPLE_INTERVAL = 50

export type GamePerformanceSample =
  | { kind: 'frame-gap'; atMs: number; durationMs: number }
  | { kind: 'long-task'; atMs: number; durationMs: number; name: string }
  | { kind: 'input-response'; atMs: number; durationMs: number; input: string }
  | { kind: 'redux-action'; atMs: number; durationMs: number; action: string }
  | { kind: 'store-update'; atMs: number; durationMs: number; action: string }
  | {
      kind: 'middleware-step'
      atMs: number
      durationMs: number
      action: string
      middleware: string
    }
  | { kind: 'phase-step'; atMs: number; durationMs: number; action: string; step: string }
  | {
      kind: 'react-render'
      atMs: number
      durationMs: number
      baseDurationMs: number
      component: string
      phase: string
    }
  | {
      kind: 'state-growth'
      atMs: number
      counts: {
        tvFeed: number
        gameHistory: number
        realityInteractions: number
        realityFacts: number
        realityBeliefs: number
      }
    }

export interface GamePerformanceSnapshot {
  enabled: boolean
  hidden: boolean
  totalSamples: number
  samples: GamePerformanceSample[]
  juryEvents: JuryPerformanceEvent[]
  metrics: {
    frameGapP95Ms: number | null
    inputResponseP95Ms: number | null
    reduxActionP95Ms: number | null
  }
  save: ReturnType<typeof getSavePersistenceDiagnostics>
}

export interface JuryPerformanceEvent {
  atMs: number
  name: string
  detail: Record<string, string | number | boolean | null>
}

declare global {
  interface Window {
    __bbGamePerformance?: {
      snapshot: () => GamePerformanceSnapshot
      clear: () => void
      stop: () => void
    }
  }
}

let enabled = false
let totalSamples = 0
let sampleIndex = 0
let actionCount = 0
let frameId: number | null = null
let previousFrameAt: number | null = null
let samples: Array<GamePerformanceSample | undefined> = Array(SAMPLE_LIMIT)
const pendingInputs = new Set<number>()
let listenersInstalled = false
let longTaskObserver: PerformanceObserver | null = null
const JURY_EVENT_LIMIT = 256
let juryEvents: JuryPerformanceEvent[] = []

export function isGamePerformanceDiagnosticsEnabled(): boolean {
  return enabled
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function isVisible(): boolean {
  return typeof document === 'undefined' || !document.hidden
}

function record(sample: GamePerformanceSample): void {
  if (!enabled || !isVisible()) return
  samples[sampleIndex] = sample
  sampleIndex = (sampleIndex + 1) % SAMPLE_LIMIT
  totalSamples += 1
}

export function recordGamePerformanceMarker(
  name: string,
  detail: JuryPerformanceEvent['detail'] = {}
): void {
  if (!enabled || !isVisible()) return
  juryEvents.push({ atMs: now(), name, detail })
  if (juryEvents.length > JURY_EVENT_LIMIT) juryEvents.shift()
}

export function recordGameRender(
  component: string,
  phase: string,
  actualDurationMs: number,
  baseDurationMs: number,
  _startTime: number,
  commitTime: number
): void {
  record({
    kind: 'react-render',
    atMs: commitTime,
    durationMs: actualDurationMs,
    baseDurationMs,
    component,
    phase,
  })
}

function recordFrame(timestamp: number): void {
  if (!enabled || !isVisible()) {
    frameId = null
    previousFrameAt = null
    return
  }
  if (previousFrameAt !== null) {
    const gap = timestamp - previousFrameAt
    if (gap >= FRAME_GAP_THRESHOLD_MS) {
      record({ kind: 'frame-gap', atMs: timestamp, durationMs: gap })
    }
  }
  previousFrameAt = timestamp
  frameId = window.requestAnimationFrame(recordFrame)
}

function stopFrameSampling(): void {
  if (frameId !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(frameId)
  }
  frameId = null
  previousFrameAt = null
  pendingInputs.forEach((id) => window.cancelAnimationFrame(id))
  pendingInputs.clear()
}

function measureInputResponse(input: string): void {
  if (!enabled || !isVisible() || pendingInputs.size >= INPUT_SAMPLE_LIMIT) return
  const startedAt = now()
  const firstId = window.requestAnimationFrame(() => {
    pendingInputs.delete(firstId)
    if (!enabled || !isVisible() || pendingInputs.size >= INPUT_SAMPLE_LIMIT) return
    const secondId = window.requestAnimationFrame((timestamp) => {
      pendingInputs.delete(secondId)
      record({ kind: 'input-response', atMs: timestamp, durationMs: timestamp - startedAt, input })
    })
    pendingInputs.add(secondId)
  })
  pendingInputs.add(firstId)
}

function currentStateCounts(
  value: unknown
): Extract<GamePerformanceSample, { kind: 'state-growth' }>['counts'] {
  const state = value as {
    game?: { tvFeed?: unknown[]; history?: unknown[] }
    social?: {
      reality?: {
        interactions?: Record<string, unknown>
        facts?: Record<string, unknown>
        beliefsByOwner?: Record<string, Record<string, unknown>>
      }
    }
  }
  const reality = state.social?.reality
  return {
    tvFeed: state.game?.tvFeed?.length ?? 0,
    gameHistory: state.game?.history?.length ?? 0,
    realityInteractions: Object.keys(reality?.interactions ?? {}).length,
    realityFacts: Object.keys(reality?.facts ?? {}).length,
    realityBeliefs: Object.values(reality?.beliefsByOwner ?? {}).reduce(
      (total, beliefs) => total + Object.keys(beliefs).length,
      0
    ),
  }
}

export function recordGamePerformanceAction(
  action: string,
  durationMs: number,
  state: unknown
): void {
  if (!enabled || !isVisible()) return
  const atMs = now()
  record({ kind: 'redux-action', atMs, durationMs, action })
  actionCount += 1
  if (actionCount % STATE_SAMPLE_INTERVAL === 0) {
    record({ kind: 'state-growth', atMs, counts: currentStateCounts(state) })
  }
}

/** Time a synchronous phase operation only in an opted-in diagnostic run. */
export function measureGamePerformanceStep<T>(step: string, work: () => T): T {
  if (!enabled || !isVisible()) return work()
  const startedAt = now()
  try {
    return work()
  } finally {
    record({
      kind: 'phase-step',
      atMs: now(),
      durationMs: Math.max(0, now() - startedAt),
      action: 'game/advance',
      step,
    })
  }
}

function actionName(action: unknown): string {
  return typeof action === 'object' && action && 'type' in action ? String(action.type) : 'unknown'
}

function recordFinaleStateChange(before: unknown, after: unknown, action: string): void {
  const previous = before as {
    game?: { phase?: string; week?: number; seasonFinale?: { phase?: string } | null }
    finale?: { revealedCount?: number; awaitingHumanJurorId?: string | null; isComplete?: boolean }
  }
  const next = after as typeof previous
  const oldGame = previous.game
  const newGame = next.game
  const oldFinale = previous.finale
  const newFinale = next.finale
  const changed =
    oldGame?.phase !== newGame?.phase ||
    oldGame?.seasonFinale?.phase !== newGame?.seasonFinale?.phase ||
    oldFinale?.revealedCount !== newFinale?.revealedCount ||
    oldFinale?.awaitingHumanJurorId !== newFinale?.awaitingHumanJurorId ||
    oldFinale?.isComplete !== newFinale?.isComplete
  const relevant =
    oldGame?.phase?.startsWith('final3') ||
    newGame?.phase?.startsWith('final3') ||
    oldGame?.phase?.startsWith('jury') ||
    newGame?.phase?.startsWith('jury') ||
    Boolean(oldGame?.seasonFinale || newGame?.seasonFinale)
  if (!changed || !relevant) return
  recordGamePerformanceMarker('redux-finale-transition', {
    action,
    day: newGame?.week ?? 0,
    fromPhase: oldGame?.phase ?? '',
    phase: newGame?.phase ?? '',
    fromPresentation: oldGame?.seasonFinale?.phase ?? '',
    presentation: newGame?.seasonFinale?.phase ?? '',
    revealed: newFinale?.revealedCount ?? 0,
    awaitingHuman: newFinale?.awaitingHumanJurorId ?? '',
    complete: newFinale?.isComplete ?? false,
  })
}

export function getGamePerformanceSnapshot(): GamePerformanceSnapshot {
  const ordered =
    totalSamples <= SAMPLE_LIMIT
      ? samples.slice(0, totalSamples)
      : [...samples.slice(sampleIndex), ...samples.slice(0, sampleIndex)]
  const currentSamples = ordered.filter(
    (sample): sample is GamePerformanceSample => sample !== undefined
  )
  const percentile95 = (kind: GamePerformanceSample['kind']): number | null => {
    const values = currentSamples
      .filter(
        (sample): sample is Extract<GamePerformanceSample, { durationMs: number }> =>
          'durationMs' in sample && sample.kind === kind
      )
      .map((sample) => sample.durationMs)
      .sort((left, right) => left - right)
    return values.length === 0 ? null : values[Math.ceil(values.length * 0.95) - 1]
  }
  return {
    enabled,
    hidden: !isVisible(),
    totalSamples,
    samples: currentSamples,
    juryEvents: [...juryEvents],
    metrics: {
      frameGapP95Ms: percentile95('frame-gap'),
      inputResponseP95Ms: percentile95('input-response'),
      reduxActionP95Ms: percentile95('redux-action'),
    },
    save: getSavePersistenceDiagnostics(),
  }
}

export function clearGamePerformanceSamples(): void {
  samples = Array(SAMPLE_LIMIT)
  sampleIndex = 0
  totalSamples = 0
  actionCount = 0
  juryEvents = []
}

export function startGamePerformanceDiagnostics(forceEnable = false): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  const optedIn =
    forceEnable || new URLSearchParams(window.location.search).get('debugPerformance') === '1'
  if (!optedIn) return false
  if (enabled) return true
  enabled = true
  window.__bbGamePerformance = Object.freeze({
    snapshot: getGamePerformanceSnapshot,
    clear: clearGamePerformanceSamples,
    stop: stopGamePerformanceDiagnostics,
  })
  if (!listenersInstalled) {
    window.addEventListener('pointerdown', () => measureInputResponse('pointer'), {
      capture: true,
      passive: true,
    })
    window.addEventListener('keydown', () => measureInputResponse('keyboard'), { capture: true })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopFrameSampling()
      else if (frameId === null) {
        previousFrameAt = null
        frameId = window.requestAnimationFrame(recordFrame)
      }
    })
    window.addEventListener('pagehide', stopGamePerformanceDiagnostics)
    listenersInstalled = true
  }
  if (!document.hidden) frameId = window.requestAnimationFrame(recordFrame)
  if (
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        record({
          kind: 'long-task',
          atMs: entry.startTime,
          durationMs: entry.duration,
          name: entry.name,
        })
      }
    })
    longTaskObserver.observe({ entryTypes: ['longtask'] })
  }
  return true
}

export function stopGamePerformanceDiagnostics(): void {
  if (!enabled) return
  stopFrameSampling()
  longTaskObserver?.disconnect()
  longTaskObserver = null
  enabled = false
}

export const gamePerformanceMiddleware: Middleware = (api) => (next) => (action) => {
  if (!enabled || !isVisible()) return next(action)
  const previousState = api.getState()
  const startedAt = now()
  const result = next(action)
  const actionType = actionName(action)
  const nextState = api.getState()
  recordGamePerformanceAction(actionType, Math.max(0, now() - startedAt), nextState)
  recordFinaleStateChange(previousState, nextState, actionType)
  return result
}

/** The tail sample measures the reducer and synchronous store subscribers. */
export const gameStoreUpdatePerformanceMiddleware: Middleware = () => (next) => (action) => {
  if (!enabled || !isVisible()) return next(action)
  const startedAt = now()
  const result = next(action)
  record({
    kind: 'store-update',
    atMs: now(),
    durationMs: Math.max(0, now() - startedAt),
    action: actionName(action),
  })
  return result
}

/** Attribute phase-advance time to one middleware without including its downstream chain. */
export function profileGameMiddleware(name: string, middleware: Middleware): Middleware {
  // Do not add another dispatch wrapper to normal gameplay.
  if (
    typeof window === 'undefined' ||
    new URLSearchParams(window.location.search).get('debugPerformance') !== '1'
  ) {
    return middleware
  }

  return (api) => (next) => {
    let activeScope: { downstreamMs: number } | null = null
    const invoke = middleware(api)((innerAction) => {
      const scope = activeScope
      if (!scope) return next(innerAction)
      const startedAt = now()
      try {
        return next(innerAction)
      } finally {
        scope.downstreamMs += Math.max(0, now() - startedAt)
      }
    })

    return (action) => {
      if (!enabled || !isVisible() || actionName(action) !== 'game/advance') {
        return invoke(action)
      }
      const previousScope = activeScope
      const scope = { downstreamMs: 0 }
      activeScope = scope
      const startedAt = now()
      try {
        return invoke(action)
      } finally {
        const finishedAt = now()
        activeScope = previousScope
        record({
          kind: 'middleware-step',
          atMs: finishedAt,
          durationMs: Math.max(0, finishedAt - startedAt - scope.downstreamMs),
          action: 'game/advance',
          middleware: name,
        })
      }
    }
  }
}
