import {
  createInitialBigEyeState,
  resolveBigEyeTurn,
  type BigEyeAction,
  type BigEyeConversationState,
  type BigEyeIntent,
} from '../bb/confessionalBigEye'
import { directLocalBigEyeReply, updateLocalBigEyeMemory } from '../bb/localBigEyeDirector'
import {
  buildBigEyeComprehensionFrame,
  updateConversationStateFromFrame,
  type BigEyeComprehensionFrame,
} from '../bb/confessionalComprehension'
import { getSecretMissionEasterEggByIntent } from '../bb/secretMissionEasterEggs'
import { assessLocalConfessionalInput } from '../bb/localConfessionalSafety'
import { apiUrl } from '../utils/apiBase'

export type BigEyeEmotion =
  | 'watchful'
  | 'probing'
  | 'amused'
  | 'stern'
  | 'cold'
  | 'empathetic'
  | 'suspicious'

export type BigEyeEyeState = 'steady' | 'narrow' | 'pulse' | 'soften' | 'glitch'
export type BigEyeDelivery = 'measured' | 'clipped' | 'hushed' | 'dry' | 'gentle' | 'severe'

export interface BigEyePerformance {
  emotion: BigEyeEmotion
  intensity: number
  eyeState: BigEyeEyeState
  delivery: BigEyeDelivery
  pauseBeforeMs: number
}

export interface BigEyeHistoryTurn {
  role: 'user' | 'bb'
  text: string
}

export interface BigEyeWorldContext {
  season: number
  week: number
  phase: string
  playerStatus: string
  leaderName: string | null
  nomineeNames: string[]
  safetyWinnerName: string | null
  remainingHousemates: string[]
  playerStats: {
    leaderWins: number
    safetyWins: number
    timesNominated: number
  }
  closestRelationships: Array<{
    name: string
    affinity: number
    tags: string[]
  }>
  /** Formal alliances the human player is actually a member of. */
  alliances?: Array<{
    id: string
    name: string | null
    memberNames: string[]
    status: string
  }>
  /** Grounded recent eviction names from the current game/feed when available. */
  recentEvictedNames?: string[]
  recentPublicEvents: string[]
}

export interface BigBrotherPayload {
  diaryText: string
  playerName?: string
  phase?: string
  seed?: number
  state?: BigEyeConversationState
  history?: BigEyeHistoryTurn[]
  memorySummary?: string
  world?: BigEyeWorldContext
  /** Skip the ordinary generative director when another reply path (for example VIP) owns this turn. */
  skipDirector?: boolean
}

export interface BigBrotherResponse {
  text: string
  reason: BigEyeIntent
  intent: BigEyeIntent
  nextState: BigEyeConversationState
  delayMs: number
  action?: BigEyeAction
  memorySummary: string
  performance: BigEyePerformance
  source: 'ai' | 'offline'
  /** False when a deterministic authored/knowledge turn should not consume a VIP credit. */
  vipEligible: boolean
}

export type { BigEyeConversationState, BigEyeAction, BigEyeIntent }
export { createInitialBigEyeState }

export type BigEyeTurnRoute = 'authored' | 'deterministic' | 'generative'

export interface BigEyeTurnAnalysis {
  detectedIntent: BigEyeIntent
  semanticIntent: BigEyeIntent
  frame: BigEyeComprehensionFrame
  route: BigEyeTurnRoute
  authoredFlow: boolean
  deterministicIntelligence: boolean
  directorEligible: boolean
  wouldRequestDirector: boolean
  vipEligible: boolean
  hasEasterEgg: boolean
  action?: BigEyeAction
  delayMs: number
  baseNextState: BigEyeConversationState
  localText: string
  localMemorySummary: string
  nextLocalState: BigEyeConversationState
}

const DIRECTOR_TIMEOUT_MS = 22000

export function isBigEyeGenerativeDirectorEnabled(): boolean {
  // The standard Confessional is intentionally local-only. Character tuning is
  // published as GitHub-hosted data, but player dialogue never requires a model
  // request, token allowance, account, or backend database.
  return false
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function offlinePerformance(
  intent: BigEyeIntent,
  mood: BigEyeConversationState['mood']
): BigEyePerformance {
  if (
    intent === 'fear' ||
    intent === 'help_request' ||
    intent === 'overwhelmed' ||
    intent === 'sadness'
  ) {
    return {
      emotion: 'empathetic',
      intensity: 0.58,
      eyeState: 'soften',
      delivery: 'gentle',
      pauseBeforeMs: 850,
    }
  }
  if (intent === 'insult' || intent === 'betrayal') {
    return {
      emotion: 'cold',
      intensity: 0.78,
      eyeState: 'narrow',
      delivery: 'clipped',
      pauseBeforeMs: 720,
    }
  }
  if (intent === 'strategy' || intent === 'alliance' || intent === 'winner_prediction') {
    return {
      emotion: 'probing',
      intensity: 0.64,
      eyeState: 'pulse',
      delivery: 'measured',
      pauseBeforeMs: 900,
    }
  }
  if (intent === 'compliment' || intent === 'love_confession') {
    return {
      emotion: 'amused',
      intensity: 0.48,
      eyeState: 'pulse',
      delivery: 'dry',
      pauseBeforeMs: 620,
    }
  }
  if (mood === 'cold') {
    return {
      emotion: 'stern',
      intensity: 0.66,
      eyeState: 'narrow',
      delivery: 'severe',
      pauseBeforeMs: 760,
    }
  }
  return {
    emotion: 'watchful',
    intensity: 0.46,
    eyeState: 'steady',
    delivery: 'measured',
    pauseBeforeMs: 700,
  }
}

function isPerformance(value: unknown): value is BigEyePerformance {
  if (!value || typeof value !== 'object') return false
  const performance = value as Partial<BigEyePerformance>
  return (
    ['watchful', 'probing', 'amused', 'stern', 'cold', 'empathetic', 'suspicious'].includes(
      performance.emotion ?? ''
    ) &&
    ['steady', 'narrow', 'pulse', 'soften', 'glitch'].includes(performance.eyeState ?? '') &&
    ['measured', 'clipped', 'hushed', 'dry', 'gentle', 'severe'].includes(
      performance.delivery ?? ''
    ) &&
    typeof performance.intensity === 'number' &&
    typeof performance.pauseBeforeMs === 'number'
  )
}

interface DirectorResponse {
  text?: unknown
  memorySummary?: unknown
  performance?: unknown
  available?: unknown
}

async function requestDirectorReply(
  payload: BigBrotherPayload,
  intent: BigEyeIntent,
  comprehension: BigEyeComprehensionFrame
): Promise<DirectorResponse | null> {
  if (!isBigEyeGenerativeDirectorEnabled()) return null

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), DIRECTOR_TIMEOUT_MS)
  try {
    const response = await fetch(apiUrl('/api/ai/bigbrother'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diaryText: payload.diaryText,
        playerName: payload.playerName,
        phase: payload.phase,
        seed: payload.seed,
        intent,
        comprehension,
        history: payload.history?.slice(-12),
        memorySummary: payload.memorySummary?.slice(0, 1800) ?? '',
        world: payload.world,
      }),
      signal: controller.signal,
    })

    if (!response.ok) return null
    const result = (await response.json()) as DirectorResponse
    return result.available === false ? null : result
  } catch {
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export function analyzeBigEyeTurn(payload: BigBrotherPayload): BigEyeTurnAnalysis {
  const state = payload.state ?? createInitialBigEyeState()
  const reply = resolveBigEyeTurn(payload.diaryText, payload, state)
  const frame = buildBigEyeComprehensionFrame({
    text: payload.diaryText,
    intent: reply.intent,
    state,
    world: payload.world,
    memorySummary: payload.memorySummary,
  })
  const semanticIntent = frame.primaryIntent
  const discoveredEgg = getSecretMissionEasterEggByIntent(reply.intent)
  const authoredFlow = Boolean(
    reply.action || state.lastQuestion || reply.nextState.lastQuestion || discoveredEgg
  )
  const deterministicIntelligence = Boolean(
    frame.knowledgeQuery ||
    frame.contradiction ||
    frame.speechAct === 'challenge_request' ||
    frame.speechAct === 'prediction' ||
    frame.speechAct === 'answer' ||
    frame.speechAct === 'agreement' ||
    frame.speechAct === 'disagreement' ||
    frame.speechAct === 'clarification' ||
    frame.speechAct === 'target_declaration'
  )
  const directorEligible = !authoredFlow && !deterministicIntelligence
  const route: BigEyeTurnRoute = authoredFlow
    ? 'authored'
    : deterministicIntelligence
      ? 'deterministic'
      : 'generative'

  const localText = authoredFlow
    ? reply.text
    : directLocalBigEyeReply({
        diaryText: payload.diaryText,
        playerName: payload.playerName,
        seed: payload.seed,
        intent: semanticIntent,
        state,
        history: payload.history,
        memorySummary: payload.memorySummary,
        world: payload.world,
        frame,
      }) || reply.text

  const localMemorySummary = updateLocalBigEyeMemory({
    diaryText: payload.diaryText,
    playerName: payload.playerName,
    seed: payload.seed,
    intent: semanticIntent,
    state,
    history: payload.history,
    memorySummary: payload.memorySummary,
    world: payload.world,
    frame,
  })
  const nextLocalState = updateConversationStateFromFrame(reply.nextState, frame, localText)

  return {
    detectedIntent: reply.intent,
    semanticIntent,
    frame,
    route,
    authoredFlow,
    deterministicIntelligence,
    directorEligible,
    wouldRequestDirector:
      directorEligible && !payload.skipDirector && isBigEyeGenerativeDirectorEnabled(),
    vipEligible: directorEligible,
    hasEasterEgg: Boolean(discoveredEgg),
    action: reply.action,
    delayMs: reply.delayMs,
    baseNextState: reply.nextState,
    localText,
    localMemorySummary,
    nextLocalState,
  }
}

export async function generateBigBrotherReply(
  payload: BigBrotherPayload
): Promise<BigBrotherResponse> {
  const localSafety = assessLocalConfessionalInput({
    diaryText: payload.diaryText,
    history: payload.history,
  })
  if (localSafety) {
    const state = payload.state ?? createInitialBigEyeState()
    return {
      text: localSafety.text,
      reason: localSafety.intent,
      intent: localSafety.intent,
      nextState: state,
      delayMs: 420,
      memorySummary: payload.memorySummary ?? '',
      performance: offlinePerformance(localSafety.intent, state.mood),
      source: 'offline',
      vipEligible: false,
    }
  }
  const analysis = analyzeBigEyeTurn(payload)
  const directed = analysis.wouldRequestDirector
    ? await requestDirectorReply(payload, analysis.semanticIntent, analysis.frame)
    : null
  const directedText = typeof directed?.text === 'string' ? directed.text.trim() : ''
  const spokenText = directedText || analysis.localText
  const directedMemory =
    typeof directed?.memorySummary === 'string' ? directed.memorySummary.trim().slice(0, 900) : ''
  const memorySummary = directedMemory
    ? [
        directedMemory,
        ...analysis.localMemorySummary
          .split('\n')
          .filter((line) => /^(Belief|Intent|Dependency|Prediction|Concern|Topic) — /.test(line)),
      ]
        .filter(Boolean)
        .slice(-12)
        .join('\n')
        .slice(0, 1800)
    : analysis.localMemorySummary

  const nextState =
    directedText.length > 0
      ? updateConversationStateFromFrame(analysis.baseNextState, analysis.frame, spokenText)
      : analysis.nextLocalState
  const performance = isPerformance(directed?.performance)
    ? {
        ...directed.performance,
        intensity: clamp(directed.performance.intensity, 0, 1),
        pauseBeforeMs: clamp(Math.round(directed.performance.pauseBeforeMs), 250, 2400),
      }
    : offlinePerformance(analysis.semanticIntent, nextState.mood)

  return {
    text: spokenText,
    reason: analysis.semanticIntent,
    intent: analysis.semanticIntent,
    nextState,
    delayMs: analysis.delayMs,
    action: analysis.action,
    memorySummary,
    performance,
    source: directedText ? 'ai' : 'offline',
    vipEligible: analysis.vipEligible,
  }
}
