/**
 * socialAIDriver — budget-aware social decision loop for AI housemates.
 *
 * Normal Mode uses the compact utility policy. Drama Mode first asks the
 * persistent story engine for a candidate, then falls back to the same legal,
 * contextual policy. Every candidate is validated through the shared execution
 * contract before resources or relationships can change.
 */

import { createDraft, finishDraft } from 'immer'
import { chooseActionFor, chooseTargetsFor } from './SocialPolicy'
import { canAfford, executeAction, executeGroupAction, getActionById } from './SocialManeuvers'
import { resolveActionTargetMode } from './socialActions'
import { isAISocialActionVisible } from './socialActionCatalog'
import { normalizeActionCosts } from './smExecNormalize'
import { socialConfig } from './socialConfig'
import {
  applyEnergyDelta,
  applyInfoDelta,
  applyInfluenceDelta,
  commitRealityDomainUpdate,
  commitRealityOutcome,
  recordSocialAction,
  replaceRealitySimulation,
  scheduleIncomingInteraction,
  updateRelationship,
} from './socialSlice'
import {
  assignDeliverySlot,
  buildDeliverySlotCounts,
  buildPendingIncomingInteractions,
  getInteractionDedupeReason,
  getIncomingInteractionPriority,
} from './incomingInteractionScheduler'
import { createIncomingInteraction } from './incomingInteractionFactory'
import { createDeterministicSocialRandom, validateSocialExecution } from './socialExecutionGuard'
import { getPersistentSocialHistory, type SocialStateWithHistory } from './socialHistory'
import { getEffectiveSocialMode } from './socialMode'
import { getSocialResourceEffect } from './socialResourceEconomy'
import { isIncomingInteractionActionable } from './socialRuntimeConfig'
import type {
  DramaSocialNetwork,
  IncomingInteraction,
  IncomingInteractionDeliveryState,
  IncomingInteractionType,
  RelationshipsMap,
  ScheduledIncomingInteraction,
  SocialActionLogEntry,
  SocialMemoryMap,
} from './types'
import type { RealityDomainState } from './reality'
import {
  getRealityActionContract,
  projectRealityAffinity,
  runRealityOpportunity,
  type RealityActorSnapshot,
  type RealityContext,
} from './reality'
import { getRealityModeAdapter } from './reality'
import {
  advanceRelationshipAutonomy,
  getActiveRealityNemesis,
  hasRelationshipBoundary,
  planRelationshipStoryBeat,
  startAutonomousNemesisIfReady,
  type RealityRelationshipIntentKind,
} from './reality'
import {
  createInitialRealitySimulationState,
  deriveRealitySimulationSeed,
  type RealitySimulationState,
} from './realitySimulation'
import { normalizeDramaSocialNetwork } from './dramaModeEngine'
import { chooseUtilityDramaAIMove } from './dramaAIPolicy'
import { SCENARIO_VARIANT_POOLS, getVoiceProfile, pickVariantText } from './interactionVariantBank'
import { allianceIdentityBias, type AiGameIdentity } from '../ai/aiGameIdentity'
import {
  estimateFinalThreeDay,
  getLatestAttempt,
  getPregnancyEligibility,
  isPregnancyResultAvailable,
  revealPregnancyTest,
  shouldAcceptPregnancyAttempt,
  startPregnancyAttempt,
} from './reality/pregnancy'
import {
  markPregnancyReactions,
  revealPregnancyTest as revealPregnancyTestAction,
  startPregnancyAttempt as startPregnancyAttemptAction,
} from '../store/gameSlice'

interface StoreAPI {
  dispatch: (action: unknown) => unknown
  getState: () => unknown
}

interface DriverPlayer {
  id: string
  name: string
  status: string
  isUser?: boolean
  aiGameIdentity?: AiGameIdentity
  age?: number
  sex?: string
  reproductiveProfile?: {
    canBecomePregnant?: boolean
    canCausePregnancy?: boolean
  }
}

interface DriverState {
  game: {
    players: DriverPlayer[]
    seed: number
    week: number
    phase: string
    mode?: 'classic' | 'survival'
    publicModeEnabled?: boolean
    dramaSocialMode?: boolean
    lohId?: string | null
    posWinnerId?: string | null
    nomineeIds?: string[]
    povProtectedIds?: string[]
    pregnancyStory: import('./reality/pregnancy').PregnancyStoryState
  }
  social: {
    energyBank: Record<string, number>
    influenceBank: Record<string, number>
    infoBank: Record<string, number>
    relationships: RelationshipsMap
    socialMemory: SocialMemoryMap
    dramaNetwork: DramaSocialNetwork
    sessionLogs: SocialActionLogEntry[]
    actionHistory?: SocialActionLogEntry[]
    incomingInteractions?: IncomingInteraction[]
    scheduledIncomingInteractions?: ScheduledIncomingInteraction[]
    incomingInteractionDelivery?: IncomingInteractionDeliveryState
    reality: RealityDomainState
    realitySimulation: RealitySimulationState
  }
  settings?: { gameUX?: { dramaMode?: boolean; romanceStorylines?: boolean } }
  vip?: {
    isActive?: boolean
    entitlements?: { dramaMode?: boolean }
  }
}

function buildRealityActors(state: DriverState): Record<string, RealityActorSnapshot> {
  return Object.fromEntries(
    state.game.players.map((actor) => {
      const roles = [actor.status]
      if (state.game.lohId === actor.id && !roles.includes('loh')) roles.push('loh')
      if (state.game.posWinnerId === actor.id && !roles.includes('pos')) roles.push('pos')
      return [
        actor.id,
        {
          id: actor.id,
          isHuman: actor.isUser === true,
          active: actor.status !== 'evicted' && actor.status !== 'jury',
          roles,
          resources: {
            energy: state.social.energyBank[actor.id] ?? 0,
            influence: state.social.influenceBank[actor.id] ?? 0,
            info: state.social.infoBank[actor.id] ?? 0,
          },
        },
      ]
    })
  )
}

function buildRealityContext(state: DriverState): RealityContext {
  const actors = buildRealityActors(state)
  const mode = getRealityModeAdapter(state.game.mode, state.game.publicModeEnabled === true)
  return {
    day: state.game.week ?? 1,
    phase: state.game.phase ?? 'social_1',
    gameMode: mode.gameMode,
    socialIntensity: getEffectiveSocialMode(state) === 'drama' ? 'REALITY' : 'NORMAL',
    audienceMode: mode.audienceMode,
    feedPerspective: 'PLAYER_LIMITED',
    activeActorIds: Object.values(actors)
      .filter((actor) => actor.active)
      .map((actor) => actor.id),
    rolesByActor: Object.fromEntries(Object.values(actors).map((actor) => [actor.id, actor.roles])),
    atRiskActorIds: [...(state.game.nomineeIds ?? [])],
    powerHolderIds: [state.game.lohId, state.game.posWinnerId].filter((id): id is string =>
      Boolean(id)
    ),
    romanceEnabled: state.settings?.gameUX?.romanceStorylines !== false,
  }
}

function executeRealityCandidate(
  state: DriverState,
  player: DriverPlayer,
  candidate: CandidateMove
): boolean {
  if (!_store) return false
  if (
    (candidate.actionId === 'try_for_baby' || candidate.actionId === 'pregnancy_test') &&
    candidate.targetIds[0]
  ) {
    const target = state.game.players.find((entry) => entry.id === candidate.targetIds[0])
    if (!target || !state.game.pregnancyStory) return false
    const relationshipScore = state.social.relationships[player.id]?.[target.id]?.affinity ?? 0
    if (candidate.actionId === 'try_for_baby') {
      const activeCount = state.game.players.filter(
        (entry) => entry.status !== 'evicted' && entry.status !== 'jury'
      ).length
      const finalThreeDay = estimateFinalThreeDay(state.game.week, activeCount, state.game.phase)
      const started = startPregnancyAttempt(state.game.pregnancyStory, {
        actor: player,
        target,
        currentDay: state.game.week,
        story: state.game.pregnancyStory,
        reality: state.social.reality,
        romanceActive: true,
        relationshipScore,
        seed: state.game.seed,
        accepted: true,
        finalThreeDay,
      })
      if (!started.attempt) return false
      _store.dispatch(
        startPregnancyAttemptAction({
          actor: player,
          target,
          currentDay: state.game.week,
          story: state.game.pregnancyStory,
          reality: state.social.reality,
          romanceActive: true,
          relationshipScore,
          seed: state.game.seed,
          accepted: true,
          finalThreeDay,
          attemptId: started.attempt.attemptId,
        })
      )
      const costs = normalizeActionCosts(getActionById('try_for_baby')!, 1, true)
      _store.dispatch(applyEnergyDelta({ playerId: player.id, delta: -costs.energy }))
      _store.dispatch(
        updateRelationship({
          source: player.id,
          target: target.id,
          delta: 5,
          tags: ['romance'],
          actionSource: 'system',
        })
      )
      _store.dispatch(
        updateRelationship({
          source: target.id,
          target: player.id,
          delta: 5,
          tags: ['romance'],
          actionSource: 'system',
        })
      )
      return true
    }
    const latest = getLatestAttempt(state.game.pregnancyStory, player.id, target.id)
    if (!latest) return false
    const resolved = revealPregnancyTest(state.game.pregnancyStory, {
      attemptId: latest.attemptId,
      currentDay: state.game.week,
    })
    if (resolved.result.tooEarly || !resolved.result.attempt) return false
    _store.dispatch(
      revealPregnancyTestAction({ attemptId: latest.attemptId, currentDay: state.game.week })
    )
    const revealed = resolved.result.attempt
    if (resolved.result.changed) {
      _store.dispatch(
        updateRelationship({
          source: player.id,
          target: target.id,
          delta: revealed.pregnant ? 10 : 3,
          actionSource: 'system',
        })
      )
      _store.dispatch(
        updateRelationship({
          source: target.id,
          target: player.id,
          delta: revealed.pregnant ? 10 : 3,
          actionSource: 'system',
        })
      )
    }
    if (!revealed.reactionsTriggered) {
      _store.dispatch(markPregnancyReactions({ attemptId: revealed.attemptId, kind: 'reactions' }))
    }
    return true
  }
  const contract = getRealityActionContract(candidate.actionId)
  if (!contract || !state.social.realitySimulation.rng) return false
  const action = getActionById(candidate.actionId)
  if (!action) return false
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const mode = resolveActionTargetMode(action, dramaMode)
  const direction = mode === 'none' ? 'SELF' : mode === 'multi' ? 'GROUP' : 'AI_TO_AI'
  const beforeAffinities = Object.fromEntries(
    candidate.targetIds.map((targetId) => [
      targetId,
      projectRealityAffinity(state.social.reality.relationships[player.id]?.[targetId]),
    ])
  )
  const result = runRealityOpportunity({
    domain: state.social.reality,
    simulation: state.social.realitySimulation,
    opportunity: {
      actorId: player.id,
      direction,
      context: buildRealityContext(state),
      actors: buildRealityActors(state),
      candidates: [
        {
          action: contract,
          targetIds: candidate.targetIds,
          subjectId: candidate.subjectId,
        },
      ],
    },
  })
  if (!result.event) {
    // A blocked opportunity only advances the bounded simulation trace. Do
    // not replace the full Reality domain unless a pending interaction was
    // actually created.
    if (result.interaction) {
      _store.dispatch(commitRealityDomainUpdate({ domain: result.domain }))
    }
    _store.dispatch(replaceRealitySimulation(result.simulation))
    return false
  }
  if (candidate.relationshipIntent && candidate.targetIds[0]) {
    const outcomeDraft = createDraft(result.domain)
    advanceRelationshipAutonomy(outcomeDraft, {
      ownerId: player.id,
      targetId: candidate.targetIds[0],
      kind: candidate.relationshipIntent,
      at: { day: result.event.day, phase: result.event.phase },
      eventId: result.event.id,
      accepted: result.response?.accepted === true,
      deferred: result.response?.kind === 'QUESTION' || result.response?.kind === 'COUNTER',
    })
    result.domain = finishDraft(outcomeDraft)
  }
  const costs = normalizeActionCosts(action, candidate.targetIds.length, dramaMode)
  const compatibilityOutcome = result.event.outcome === 'SUCCESS' ? 'success' : 'failure'
  const resourceEffect = getSocialResourceEffect(
    action,
    compatibilityOutcome,
    candidate.targetIds.length
  )
  const compatibilityDeltas = Object.fromEntries(
    candidate.targetIds.map((targetId) => [
      targetId,
      projectRealityAffinity(result.domain.relationships[player.id]?.[targetId]) -
        (beforeAffinities[targetId] ?? 0),
    ])
  )
  const deltas = Object.values(compatibilityDeltas)
  const compatibilityDelta =
    deltas.reduce((sum, delta) => sum + delta, 0) / Math.max(1, deltas.length)
  const primaryTargetId = candidate.targetIds[0] ?? player.id
  _store.dispatch(
    commitRealityOutcome({
      domain: result.domain,
      simulation: result.simulation,
      actorId: player.id,
      energyDelta: -costs.energy,
      changedRelationshipPairs: result.changedRelationshipPairs,
      influenceDelta: -costs.influence + resourceEffect.influence,
      infoDelta: -costs.info + resourceEffect.info,
    })
  )
  const latestState = _store.getState() as DriverState
  _store.dispatch(
    recordSocialAction({
      entry: {
        actionId: candidate.actionId,
        actorId: player.id,
        targetId: primaryTargetId,
        targetIds: candidate.targetIds,
        ...(candidate.subjectId ? { subjectId: candidate.subjectId } : {}),
        cost: costs.energy,
        costs,
        delta: compatibilityDelta,
        outcome: compatibilityOutcome,
        newEnergy: latestState.social.energyBank[player.id] ?? 0,
        balancesAfter: {
          energy: latestState.social.energyBank[player.id] ?? 0,
          influence: latestState.social.influenceBank[player.id] ?? 0,
          info: latestState.social.infoBank[player.id] ?? 0,
        },
        timestamp: (state.game.week ?? 1) * 1_000_000 + result.event.sequence,
        week: state.game.week,
        phase: state.game.phase,
        source: 'system',
        ...(resourceEffect.influence !== 0 || resourceEffect.info !== 0
          ? {
              yieldsApplied: {
                ...(resourceEffect.influence !== 0 ? { influence: resourceEffect.influence } : {}),
                ...(resourceEffect.info !== 0 ? { info: resourceEffect.info } : {}),
              },
            }
          : {}),
        score: result.score?.total,
        label: result.response?.kind ?? 'Resolved',
      },
    })
  )
  return true
}

type HumanRouteResult = 'scheduled' | 'deferred' | 'blocked'

interface CandidateMove {
  actionId: string
  targetIds: string[]
  subjectId?: string
  reason: string
  relationshipIntent?: RealityRelationshipIntentKind
}

const MAX_TICKS = () => socialConfig.maxTicksPerPhase

let _store: StoreAPI | null = null
let _timer: ReturnType<typeof setInterval> | null = null
let _running = false
let _tickCount = 0
let _actionsExecuted = 0
let _epoch = 0
let _activePhaseKey: string | null = null
let _cycle: AiTickCycle | null = null
let _cancelScheduledWork: (() => void) | null = null
let _pausedForBackground = false

const CANDIDATE_ATTEMPTS_PER_TICK = 4
const AI_SLICE_BUDGET_MS = 4

interface AiTickCycle {
  epoch: number
  phaseKey: string
  players: DriverPlayer[]
  actionCounts: Record<string, number>
  playerIndex: number
  attempt: number
}

function getPhaseKey(state: DriverState): string {
  const roster = state.game.players
    .map((player) => `${player.id}:${player.status}:${player.isUser === true ? 'human' : 'ai'}`)
    .join(',')
  return [
    state.game.seed ?? '',
    state.game.week ?? '',
    state.game.phase ?? '',
    state.game.mode ?? '',
    state.game.publicModeEnabled === true,
    state.game.dramaSocialMode === true,
    state.game.lohId ?? '',
    state.game.posWinnerId ?? '',
    roster,
  ].join(':')
}

function systemActionCountsThisPhase(state: DriverState): Record<string, number> {
  const history = getPersistentSocialHistory(state.social as SocialStateWithHistory)
  const counts: Record<string, number> = {}
  for (const entry of history) {
    if (
      entry.source === 'system' &&
      entry.week === state.game.week &&
      entry.phase === state.game.phase
    ) {
      counts[entry.actorId] = (counts[entry.actorId] ?? 0) + 1
    }
  }
  return counts
}

function hasAvailableAiWork(
  state: DriverState,
  aiPlayers: readonly DriverPlayer[],
  budgets: Record<string, number>,
  actionCounts = systemActionCountsThisPhase(state)
): boolean {
  return aiPlayers.some(
    (player) =>
      (budgets[player.id] ?? 0) > 0 &&
      (actionCounts[player.id] ?? 0) < socialConfig.maxActionsPerPlayer
  )
}

export function setStore(store: StoreAPI): void {
  if (_store && _store !== store) stop()
  _store = store
}

export function start(): void {
  if (!_store || _running) return

  const state = _store.getState() as DriverState
  const aiPlayers = getAIPlayers(state)
  const budgets = state.social?.energyBank ?? {}
  const actionCounts = systemActionCountsThisPhase(state)
  if (!hasAvailableAiWork(state, aiPlayers, budgets, actionCounts)) return

  _running = true
  _tickCount = 0
  _actionsExecuted = 0
  _epoch += 1
  _activePhaseKey = getPhaseKey(state)

  if (socialConfig.verbose) {
    console.debug(
      '[socialAIDriver] started – AI players:',
      aiPlayers.map((player) => player.id)
    )
  }

  if (typeof document !== 'undefined' && document.hidden) {
    _pausedForBackground = true
    return
  }
  _pausedForBackground = false
  _timer = setInterval(tick, socialConfig.tickIntervalMs)
}

export function stop(): void {
  _running = false
  _epoch += 1
  _cycle = null
  _activePhaseKey = null
  _pausedForBackground = false
  cancelScheduledWork()
  clearTimer()

  if (socialConfig.verbose) {
    console.debug(`[socialAIDriver] stopped – ticks: ${_tickCount}, actions: ${_actionsExecuted}`)
  }
}

export function getStatus(): {
  running: boolean
  tickCount: number
  actionsExecuted: number
} {
  return { running: _running, tickCount: _tickCount, actionsExecuted: _actionsExecuted }
}

export const socialAIDriver = { setStore, start, stop, getStatus }

function getAIPlayers(state: DriverState): DriverPlayer[] {
  return (state.game?.players ?? []).filter(
    (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
  )
}

function clearTimer(): void {
  if (_timer !== null) {
    clearInterval(_timer)
    _timer = null
  }
}

function cancelScheduledWork(): void {
  _cancelScheduledWork?.()
  _cancelScheduledWork = null
}

function scheduleWork(cycle: AiTickCycle): void {
  if (!_running || _pausedForBackground || _cancelScheduledWork) return
  const callback = () => {
    _cancelScheduledWork = null
    processTickSlice(cycle)
  }
  if (typeof requestAnimationFrame === 'function') {
    const frame = requestAnimationFrame(callback)
    _cancelScheduledWork = () => cancelAnimationFrame(frame)
  } else {
    const timeout = setTimeout(callback, 0)
    _cancelScheduledWork = () => clearTimeout(timeout)
  }
}

function isCycleCurrent(cycle: AiTickCycle): boolean {
  if (!_store || !_running || cycle.epoch !== _epoch || cycle !== _cycle) return false
  const currentState = _store.getState() as DriverState
  if (getPhaseKey(currentState) !== cycle.phaseKey) {
    stop()
    return false
  }
  return true
}

function finishTickCycle(cycle: AiTickCycle): void {
  if (!isCycleCurrent(cycle)) return
  _cycle = null
  if (!socialConfig.allowOverspend && _store) {
    const updatedState = _store.getState() as DriverState
    const updatedBudgets = updatedState.social?.energyBank ?? {}
    if (!hasAvailableAiWork(updatedState, cycle.players, updatedBudgets, cycle.actionCounts)) stop()
  }
}

function processTickSlice(cycle: AiTickCycle): void {
  if (!isCycleCurrent(cycle) || !_store) return
  const deadline =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) + AI_SLICE_BUDGET_MS

  while (isCycleCurrent(cycle)) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now >= deadline) {
      scheduleWork(cycle)
      return
    }
    if (cycle.playerIndex >= cycle.players.length) {
      finishTickCycle(cycle)
      return
    }

    const player = cycle.players[cycle.playerIndex]
    const playerState = _store.getState() as DriverState
    if ((playerState.social?.energyBank[player.id] ?? 0) <= 0) {
      cycle.playerIndex += 1
      cycle.attempt = 0
      continue
    }

    if ((cycle.actionCounts[player.id] ?? 0) >= socialConfig.maxActionsPerPlayer) {
      cycle.playerIndex += 1
      cycle.attempt = 0
      continue
    }

    if (cycle.attempt >= CANDIDATE_ATTEMPTS_PER_TICK) {
      cycle.playerIndex += 1
      cycle.attempt = 0
      continue
    }

    const attempt = cycle.attempt
    cycle.attempt += 1
    const freshState = _store.getState() as DriverState
    const currentPlayer = freshState.game.players.find((entry) => entry.id === player.id)
    if (
      !currentPlayer ||
      currentPlayer.isUser ||
      currentPlayer.status === 'evicted' ||
      currentPlayer.status === 'jury'
    ) {
      cycle.playerIndex += 1
      cycle.attempt = 0
      continue
    }
    const candidate = candidateForPlayer(freshState, currentPlayer, attempt)
    if (candidate && executeCandidate(freshState, currentPlayer, candidate)) {
      _actionsExecuted += 1
      cycle.actionCounts[player.id] = (cycle.actionCounts[player.id] ?? 0) + 1
      cycle.playerIndex += 1
      cycle.attempt = 0
    }
  }
}

function onVisibilityChange(): void {
  if (!_running || typeof document === 'undefined') return
  if (document.hidden) {
    _pausedForBackground = true
    clearTimer()
    cancelScheduledWork()
    return
  }

  if (!_pausedForBackground) return
  _pausedForBackground = false
  if (_store && getPhaseKey(_store.getState() as DriverState) !== _activePhaseKey) {
    stop()
    return
  }
  _timer = setInterval(tick, socialConfig.tickIntervalMs)
  if (_cycle) scheduleWork(_cycle)
}

const HUMAN_FACING_ACTION_TYPES: Partial<Record<string, IncomingInteractionType>> = {
  ally: 'alliance_proposal',
  proposeAlliance: 'alliance_proposal',
  compliment: 'compliment',
  protect: 'deal_offer',
  whisper: 'gossip',
  share_intel: 'gossip',
  rumor: 'warning',
  confront: 'snide_remark',
  startFight: 'snide_remark',
  ask_use_safety: 'deal_offer',
  nominate: 'warning',
  group_chat: 'other',
}

const HUMAN_FACING_ACTION_TEXT: Partial<Record<string, string[]>> = {
  ally: [
    'I think our games fit together. I want to make this official—are you in?',
    'The house is splitting, and I would rather have you beside me. Want to work together?',
  ],
  proposeAlliance: [
    'I trust what we have been building. Are you ready to call it an alliance?',
    'I see a real path for us if we commit now. Are you in?',
  ],
  compliment: [
    'You handled the pressure well today. I wanted you to hear that directly from me.',
    'The way you carried yourself today stood out—in a good way.',
  ],
  protect: [
    'I may be able to keep heat off you this week, but I need to know we are working together.',
    'Your name is vulnerable. I can help, if we can trust each other.',
  ],
  whisper: [
    'I heard something privately that could change how you read this week.',
    'There is a quiet conversation happening that you should know about.',
  ],
  share_intel: [
    'I have information that could matter to your next move.',
    'I learned something useful, but I need to know what you will do with it.',
  ],
  rumor: [
    'Your name is coming up more than you may realize. I thought you deserved a warning.',
    'The tone changes when you leave the room. Be careful who you trust.',
  ],
  confront: [
    'We need to clear the air about how you have been moving.',
    'Something between us is not adding up, and I want a direct answer.',
  ],
  startFight: [
    'I am done pretending everything between us is fine.',
    'You crossed a line with me, and I am not letting it slide.',
  ],
  ask_use_safety: [
    'Before the Safety decision, I need to know whether you would use it to help me.',
    'You hold Safety, and that makes this conversation urgent: would you save me?',
  ],
  nominate: [
    'I am considering putting your name in danger this week. Give me a reason not to.',
    'Your name is part of my plan right now, and I wanted to hear what you would say.',
  ],
  group_chat: [
    'A few of us are comparing notes. You can join in, observe, challenge the plan, or keep your distance.',
    'There is a group conversation forming right now. How visible do you want to be in it?',
  ],
}

/**
 * AI background moves still need to arrive as real scenes, not anonymous
 * `background_*` messages. These routes give their copy, player choices, and
 * resolution the same scenario-specific treatment as autonomous interactions.
 */
const HUMAN_FACING_ACTION_SCENARIOS: Partial<Record<string, string>> = {
  ally: 'week_start_alliance_lock',
  proposeAlliance: 'week_start_alliance_lock',
  compliment: 'generic_check_in',
  protect: 'alliance_reassurance',
  whisper: 'generic_gossip',
  share_intel: 'generic_gossip',
  rumor: 'betrayal_warning',
  confront: 'targeted_snark',
  startFight: 'targeted_snark',
  ask_use_safety: 'nominee_veto_pitch',
  nominate: 'nomination_aftershock',
  group_chat: 'social_momentum_notice',
}

export function getHumanFacingActionScenario(actionId: string): string {
  return HUMAN_FACING_ACTION_SCENARIOS[actionId] ?? 'generic_check_in'
}

function pickHumanFacingText(
  actionId: string,
  actorId: string,
  playerName: string,
  week: number,
  phase: string
): { text: string; scenarioKey: string; variantFamilyId: string; variantId: string } {
  const scenarioKey = getHumanFacingActionScenario(actionId)
  const variantFamilies = SCENARIO_VARIANT_POOLS[scenarioKey]
  const variants = HUMAN_FACING_ACTION_TEXT[actionId] ?? ['I wanted to talk to you directly.']
  const random = createDeterministicSocialRandom([actorId, actionId, week, phase])
  if (variantFamilies?.length) {
    const { text, familyId, variantId } = pickVariantText(
      variantFamilies,
      getVoiceProfile(actorId),
      new Set(),
      0,
      random,
      new Set()
    )
    return {
      text: text.replaceAll('{player}', playerName),
      scenarioKey,
      variantFamilyId: familyId,
      variantId,
    }
  }
  const text = variants[Math.floor(random() * variants.length)] ?? variants[0]
  return {
    text,
    scenarioKey,
    variantFamilyId: `legacy_background_${actionId}`,
    variantId: `legacy_background_${actionId}:${variants.indexOf(text)}`,
  }
}

function routeHumanFacingAction(
  actorId: string,
  actionId: string,
  subjectId: string | undefined,
  costs: { energy: number; influence: number; info: number },
  sceneTargetIds?: string[]
): HumanRouteResult {
  if (!_store) return 'blocked'
  const type = HUMAN_FACING_ACTION_TYPES[actionId] ?? 'other'

  const current = _store.getState() as DriverState
  const human = current.game.players.find((player) => player.isUser)
  if (!human) return 'blocked'

  if (actionId === 'nominate') {
    const isProtected =
      current.game.posWinnerId === human.id ||
      current.game.povProtectedIds?.includes(human.id) ||
      human.status.includes('pos')
    const relationship = current.social.relationships[actorId]?.[human.id]
    const isTrustedAlly =
      (relationship?.affinity ?? 0) >= 30 || relationship?.tags.includes('alliance') === true
    if (isProtected || current.game.lohId !== actorId || isTrustedAlly) return 'blocked'
  }

  const week = current.game.week ?? 1
  const phase = current.game.phase
  const deterministicSequence = current.social.reality.nextSequence
  const now = week * 1_000_000 + deterministicSequence
  const scheduled = current.social.scheduledIncomingInteractions ?? []
  const pending = buildPendingIncomingInteractions(
    current.social.incomingInteractions ?? [],
    scheduled
  )
  const directContactsThisWeek = pending.filter(
    (entry) => entry.createdWeek === week && entry.payload?.source === 'background_social'
  ).length
  if (
    directContactsThisWeek >= 2 ||
    pending.filter((entry) => entry.createdWeek === week).length >=
      socialConfig.incomingInteractionConfig.maxPerWeek
  ) {
    return 'deferred'
  }

  const mode = getEffectiveSocialMode(current)
  const content = pickHumanFacingText(actionId, actorId, human.name ?? 'you', week, phase)
  const interaction = createIncomingInteraction({
    id: `ai-action-${actionId}-${actorId}-${deterministicSequence}`,
    fromId: actorId,
    type,
    text: content.text,
    week,
    phase,
    mode,
    payload: {
      originActionId: actionId,
      scenarioKey: content.scenarioKey,
      variantFamilyId: content.variantFamilyId,
      variantId: content.variantId,
      source: 'background_social',
      ...(actionId === 'group_chat' ? { groupScene: true } : {}),
      ...(subjectId ? { subjectId } : {}),
    },
  })
  const priority = getIncomingInteractionPriority(type)
  if (
    getInteractionDedupeReason({
      interaction,
      priority,
      pendingInteractions: pending,
      week,
    })
  ) {
    return 'deferred'
  }

  const deliveredThisPhase =
    current.social.incomingInteractionDelivery?.lastDeliveryPhase === phase &&
    current.social.incomingInteractionDelivery?.lastDeliveryWeek === week
      ? current.social.incomingInteractionDelivery.deliveredThisPhase
      : 0
  const slot = assignDeliverySlot({
    phase,
    week,
    priority,
    slotCounts: buildDeliverySlotCounts(scheduled, phase, week, deliveredThisPhase),
    visibleActiveCount: (current.social.incomingInteractions ?? []).filter(
      (entry) => !entry.resolved && isIncomingInteractionActionable(entry)
    ).length,
  })
  if (!slot) return 'deferred'

  let simulation = current.social.realitySimulation
  if (!simulation.rng) {
    simulation = createInitialRealitySimulationState(
      deriveRealitySimulationSeed(current.game.seed ?? 0, `social:${current.game.week}`)
    )
  }
  const contract = getRealityActionContract(actionId)
  if (!contract) return 'blocked'
  const targetIds = sceneTargetIds?.length ? sceneTargetIds : [human.id]
  const realityResult = runRealityOpportunity({
    domain: current.social.reality,
    simulation,
    opportunity: {
      actorId,
      direction: targetIds.length > 1 ? 'GROUP' : 'AI_TO_HUMAN',
      context: buildRealityContext(current),
      actors: buildRealityActors(current),
      candidates: [{ action: contract, targetIds, subjectId }],
    },
  })
  if (!realityResult.interaction || realityResult.event) return 'blocked'
  interaction.payload ??= {}
  interaction.payload.realityInteractionId = realityResult.interaction.id
  _store.dispatch(commitRealityDomainUpdate({ domain: realityResult.domain }))
  _store.dispatch(replaceRealitySimulation(realityResult.simulation))

  _store.dispatch(applyEnergyDelta({ playerId: actorId, delta: -costs.energy }))
  if (costs.influence > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: -costs.influence }))
  }
  if (costs.info > 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: -costs.info }))
  }
  _store.dispatch(
    scheduleIncomingInteraction({
      interaction,
      priority,
      scheduledAt: now,
      scheduledForWeek: slot.scheduledForWeek,
      scheduledForPhase: slot.scheduledForPhase,
      deliveryReason: slot.deliveryReason,
    })
  )
  return 'scheduled'
}

function groupTargets(state: DriverState, actorId: string, maximum = 3): string[] {
  return state.game.players
    .filter(
      (player) => player.id !== actorId && player.status !== 'evicted' && player.status !== 'jury'
    )
    .sort(
      (left, right) =>
        (state.social.relationships[actorId]?.[right.id]?.affinity ?? 0) -
          (state.social.relationships[actorId]?.[left.id]?.affinity ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, maximum)
    .map((player) => player.id)
}

function relationshipCandidateForPlayer(
  state: DriverState,
  player: DriverPlayer
): CandidateMove | null {
  const at = { day: state.game.week ?? 1, phase: state.game.phase ?? 'social_1' }
  const target = state.game.players
    .filter(
      (candidate) =>
        candidate.id !== player.id &&
        !candidate.isUser &&
        candidate.status !== 'evicted' &&
        candidate.status !== 'jury'
    )
    .map((candidate) => ({
      candidate,
      beat: planRelationshipStoryBeat(state.social.reality, {
        ownerId: player.id,
        targetId: candidate.id,
        at,
      }),
    }))
    .filter((entry): entry is { candidate: DriverPlayer; beat: NonNullable<typeof entry.beat> } =>
      Boolean(entry.beat)
    )
    .sort(
      (left, right) =>
        (state.social.reality.relationshipAutonomy.intents[
          `relationship-intent:${player.id}:${right.candidate.id}:${right.beat.intent}`
        ]?.continuationPressure ?? 0) -
          (state.social.reality.relationshipAutonomy.intents[
            `relationship-intent:${player.id}:${left.candidate.id}:${left.beat.intent}`
          ]?.continuationPressure ?? 0) || left.candidate.id.localeCompare(right.candidate.id)
    )[0]
  if (!target) return null
  const actionId =
    target.beat.intent === 'RECRUIT' || target.beat.intent === 'MAINTAIN_COMMITMENT'
      ? 'proposeAlliance'
      : target.beat.intent === 'EXPLORE_ROMANCE' || target.beat.intent === 'MAINTAIN_ROMANCE'
        ? 'flirt'
        : target.beat.intent === 'CONFRONT' || target.beat.intent === 'SEEK_REASSURANCE'
          ? 'confront'
          : target.beat.intent === 'REPAIR'
            ? 'repair_bond'
            : 'share_personal_story'
  return {
    actionId,
    targetIds: [target.candidate.id],
    reason: `persistent ${target.beat.storyFamily} storyline`,
    relationshipIntent: target.beat.intent,
  }
}

function pregnancyCandidateForPlayer(
  state: DriverState,
  player: DriverPlayer,
  attempt: number
): CandidateMove | null {
  if (attempt !== 0 || !state.game.pregnancyStory) return null
  const candidates = state.game.players
    .filter(
      (candidate) =>
        candidate.id !== player.id &&
        !candidate.isUser &&
        candidate.status !== 'evicted' &&
        candidate.status !== 'jury'
    )
    .map((candidate) => {
      const arc = state.social.dramaNetwork.arcs.find(
        (entry) =>
          entry.status === 'active' &&
          entry.type === 'romance' &&
          ['established', 'climax'].includes(entry.stage) &&
          entry.participantIds.includes(player.id) &&
          entry.participantIds.includes(candidate.id)
      )
      const relationshipScore = state.social.relationships[player.id]?.[candidate.id]?.affinity ?? 0
      const eligibility = getPregnancyEligibility({
        actor: player,
        target: candidate,
        currentDay: state.game.week,
        story: state.game.pregnancyStory,
        reality: state.social.reality,
        romanceActive: Boolean(arc),
        relationshipScore,
      })
      return { candidate, eligibility, relationshipScore }
    })
    .filter((entry) => entry.eligibility.eligible)
    .filter((entry) => {
      if (entry.relationshipScore >= 75) return true
      const identity = entry.candidate.aiGameIdentity
      const highDrama =
        identity?.archetype === 'chaos_agent' ||
        identity?.archetype === 'opportunist' ||
        identity?.temperament === 'impulsive'
      return highDrama && entry.relationshipScore >= 65
    })
    .sort(
      (left, right) =>
        right.relationshipScore - left.relationshipScore ||
        left.candidate.id.localeCompare(right.candidate.id)
    )
  const selected = candidates[0]
  if (!selected) return null
  if (
    !shouldAcceptPregnancyAttempt({
      target: selected.candidate,
      proposer: player,
      prospectivePartnerId: selected.candidate.id,
      story: state.game.pregnancyStory,
      relationshipScore: selected.relationshipScore,
      seed: state.game.seed,
      day: state.game.week,
    })
  ) {
    return null
  }
  return {
    actionId: 'try_for_baby',
    targetIds: [selected.candidate.id],
    reason: 'an established romantic relationship is ready for a life-changing choice',
  }
}

function pregnancyTestCandidateForPlayer(
  state: DriverState,
  player: DriverPlayer,
  attempt: number
): CandidateMove | null {
  if (attempt !== 0 || !state.game.pregnancyStory) return null
  const pending = state.game.pregnancyStory.attempts
    .filter(
      (entry) =>
        entry.status === 'PENDING' &&
        entry.participantIds.includes(player.id) &&
        isPregnancyResultAvailable(entry, state.game.week)
    )
    .sort((left, right) => right.attemptDay - left.attemptDay)[0]
  if (!pending) return null
  const targetId = pending.participantIds.find((id) => id !== player.id)
  if (!targetId) return null
  return {
    actionId: 'pregnancy_test',
    targetIds: [targetId],
    reason: 'the result window has opened',
  }
}

function candidateForPlayer(
  state: DriverState,
  player: DriverPlayer,
  attempt: number
): CandidateMove | null {
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const human = state.game.players.find((candidate) => candidate.isUser)
  const nemesis = human ? getActiveRealityNemesis(state.social.reality, player.id, human.id) : null
  const contactBoundary =
    Boolean(nemesis && human) &&
    hasRelationshipBoundary(state.social.reality, human!.id, player.id, 'MINIMIZE_CONTACT')
  const strategicNemesisAction =
    contactBoundary &&
    nemesis &&
    human &&
    state.game.lohId &&
    state.game.lohId !== human.id &&
    state.game.lohId !== player.id
      ? 'pitch_target'
      : null
  if (contactBoundary && nemesis && !strategicNemesisAction) return null
  const relationshipCandidate =
    dramaMode && attempt === 0 ? relationshipCandidateForPlayer(state, player) : null
  const pregnancyTestCandidate = dramaMode
    ? pregnancyTestCandidateForPlayer(state, player, attempt)
    : null
  const pregnancyCandidate = dramaMode ? pregnancyCandidateForPlayer(state, player, attempt) : null
  const history = getPersistentSocialHistory(state.social as SocialStateWithHistory)
  const dramaMove =
    dramaMode && attempt === 0
      ? chooseUtilityDramaAIMove({
          actorId: player.id,
          players: state.game.players,
          relationships: state.social.relationships,
          memory: state.social.socialMemory,
          network: normalizeDramaSocialNetwork(state.social.dramaNetwork),
          recentActions: history,
          week: state.game.week ?? 0,
          phase: state.game.phase ?? '',
          seed: state.game.seed ?? 0,
          tick: _tickCount,
          lohId: state.game.lohId,
          posWinnerId: state.game.posWinnerId,
          nomineeIds: state.game.nomineeIds,
        })
      : null

  const policyActionId =
    strategicNemesisAction ??
    pregnancyTestCandidate?.actionId ??
    pregnancyCandidate?.actionId ??
    relationshipCandidate?.actionId ??
    dramaMove?.actionId ??
    chooseActionFor(player.id, {
      players: state.game.players,
      relationships: state.social.relationships,
      week: state.game.week,
      seed: state.game.seed,
      phase: state.game.phase,
      decisionIndex: _tickCount * 5 + attempt,
      recentActions: history,
      availableActionIds: Object.keys(socialConfig.actionWeights).filter((candidateId) =>
        isAISocialActionVisible(candidateId, dramaMode ? 'drama' : 'normal')
      ),
    } as Parameters<typeof chooseActionFor>[1])
  const allianceBias = allianceIdentityBias(player.aiGameIdentity)
  const actionId =
    !relationshipCandidate &&
    !pregnancyCandidate &&
    !pregnancyTestCandidate &&
    !dramaMove &&
    allianceBias >= 20 &&
    policyActionId !== 'proposeAlliance' &&
    (_tickCount + attempt + player.id.length) % 5 === 0
      ? 'proposeAlliance'
      : policyActionId
  if (actionId === 'idle') return null

  const action = getActionById(actionId)
  if (!action) return null
  const mode = resolveActionTargetMode(action, dramaMode)
  let targetIds: string[] = []
  let subjectId: string | undefined

  if (mode === 'none') {
    targetIds = []
  } else if (mode === 'multi') {
    targetIds = groupTargets(state, player.id, action.maxTargets ?? 3)
  } else if (strategicNemesisAction && human) {
    targetIds = [state.game.lohId!]
    subjectId = human.id
  } else if (pregnancyTestCandidate) {
    targetIds = pregnancyTestCandidate.targetIds
  } else if (pregnancyCandidate) {
    targetIds = pregnancyCandidate.targetIds
  } else if (relationshipCandidate) {
    targetIds = relationshipCandidate.targetIds
  } else if (dramaMove) {
    targetIds = [dramaMove.targetId]
    subjectId = dramaMove.subjectId
  } else {
    const selected = chooseTargetsFor(player.id, actionId, {
      players: state.game.players,
      relationships: state.social.relationships,
      week: state.game.week,
      seed: state.game.seed,
      phase: state.game.phase,
      decisionIndex: _tickCount * 5 + attempt,
      recentActions: history,
    } as Parameters<typeof chooseTargetsFor>[2])
    targetIds = selected.length > 0 ? [selected[0]] : []
    subjectId = selected[1]
  }

  const eligibility = validateSocialExecution(state, {
    action,
    actorId: player.id,
    targetIds,
    subjectId,
    requireCompleteSelection: true,
    allowAIOnly: true,
  })
  if (!eligibility.eligible) return null

  const costs = normalizeActionCosts(action, targetIds.length, dramaMode)
  if (!canAfford(player.id, costs)) return null

  return {
    actionId,
    targetIds,
    subjectId,
    reason:
      pregnancyTestCandidate?.reason ??
      pregnancyCandidate?.reason ??
      relationshipCandidate?.reason ??
      dramaMove?.reason ??
      `contextual policy attempt ${attempt + 1}`,
    relationshipIntent: relationshipCandidate?.relationshipIntent,
  }
}

function executeCandidate(
  state: DriverState,
  player: DriverPlayer,
  candidate: CandidateMove
): boolean {
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const action = getActionById(candidate.actionId)
  if (!action) return false
  const mode = resolveActionTargetMode(action, dramaMode)
  const costs = normalizeActionCosts(action, candidate.targetIds.length, dramaMode)
  const primaryTargetId = candidate.targetIds[0]
  const primaryTarget = state.game.players.find((target) => target.id === primaryTargetId)

  if (primaryTarget?.isUser && mode !== 'multi') {
    const route = routeHumanFacingAction(
      player.id,
      candidate.actionId,
      candidate.subjectId,
      costs,
      [primaryTarget.id]
    )
    if (route === 'scheduled') return true
    if (route === 'blocked' || route === 'deferred') return false
  }

  if (
    mode === 'multi' &&
    candidate.targetIds.some(
      (targetId) => state.game.players.find((target) => target.id === targetId)?.isUser
    )
  ) {
    const route = routeHumanFacingAction(
      player.id,
      candidate.actionId,
      candidate.subjectId,
      costs,
      candidate.targetIds
    )
    if (route === 'scheduled') return true
    if (route === 'blocked' || route === 'deferred') return false
  }

  if (dramaMode) return executeRealityCandidate(state, player, candidate)

  if (mode === 'multi') {
    return executeGroupAction(player.id, candidate.targetIds, candidate.actionId, {
      source: 'system',
    }).success
  }
  return executeAction(
    player.id,
    mode === 'none' ? player.id : primaryTargetId,
    candidate.actionId,
    {
      source: 'system',
      subjectId: candidate.subjectId,
    }
  ).success
}

function tick(): void {
  if (!_store || !_running || _pausedForBackground) {
    clearTimer()
    return
  }
  // A slow cycle is allowed to finish across multiple browser frames; missed
  // interval callbacks are dropped instead of creating overlapping work.
  if (_cycle) return

  const state = _store.getState() as DriverState
  const phaseKey = getPhaseKey(state)
  if (phaseKey !== _activePhaseKey) {
    stop()
    return
  }
  _tickCount += 1
  const human = state.game.players.find((player) => player.isUser)
  if (getEffectiveSocialMode(state) === 'drama' && human) {
    const draft = createDraft(state.social.reality)
    const nemesis = startAutonomousNemesisIfReady(draft, {
      targetId: human.id,
      candidateIds: state.game.players
        .filter(
          (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
        )
        .map((player) => player.id),
      seed: state.game.seed ?? 0,
      at: { day: state.game.week ?? 1, phase: state.game.phase ?? 'social_1' },
      humanHasPower: state.game.lohId === human.id || state.game.posWinnerId === human.id,
    })
    const nemesisPair = nemesis ? { sourceId: nemesis.ownerId, targetId: nemesis.targetId } : null
    const domain = finishDraft(draft)
    if (nemesisPair) {
      _store.dispatch(
        commitRealityDomainUpdate({
          domain,
          changedRelationshipPairs: [
            nemesisPair,
            { sourceId: nemesisPair.targetId, targetId: nemesisPair.sourceId },
          ],
        })
      )
    }
  }
  const aiPlayers = getAIPlayers(state)
  const budgets = state.social?.energyBank ?? {}
  const actionCounts = systemActionCountsThisPhase(state)

  if (_tickCount >= MAX_TICKS()) {
    stop()
    return
  }
  if (!hasAvailableAiWork(state, aiPlayers, budgets, actionCounts)) {
    stop()
    return
  }

  _cycle = {
    epoch: _epoch,
    phaseKey,
    players: aiPlayers,
    actionCounts,
    playerIndex: 0,
    attempt: 0,
  }
  processTickSlice(_cycle)
}

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>)['__smAutoDriver'] = {
    start,
    stop,
    getStatus,
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onVisibilityChange)
}
