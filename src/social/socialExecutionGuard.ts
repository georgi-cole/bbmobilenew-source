import type { PlayerStatus } from '../types'
import { evaluateSocialActionEligibility } from './socialActionEligibility'
import { resolveActionTargetMode, type SocialActionDefinition } from './socialActions'
import { getEffectiveSocialMode } from './socialMode'
import type { DramaSocialNetwork, RelationshipsMap } from './types'
import type { RealityDomainState } from './reality/types'
import { isActionAllowedForRealityPreset } from './socialActionManager'
import type { PregnancyStoryState } from './reality/pregnancy'
import { hasRealityActionCooldown } from './reality/actionContract'
import { getSocialRulesPhase } from './reality/clock'

interface SocialExecutionState {
  game?: {
    phase?: string
    week?: number
    dramaSocialMode?: boolean
    nomineeIds?: string[]
    players?: Array<{
      id: string
      status: string
      isUser?: boolean
      age?: number
      sex?: string
      reproductiveProfile?: {
        canBecomePregnant?: boolean
        canCausePregnancy?: boolean
      }
      aiGameIdentity?: import('../ai/aiGameIdentity').AiGameIdentity
    }>
    pregnancyStory?: PregnancyStoryState
    voxPopuli?: { status?: 'inactive' | 'scheduled' | 'active' | 'complete' } | null
    weekendInterlude?: { active: true; weekendDay: 1 | 2 } | null
  }
  settings?: { gameUX?: { dramaMode?: boolean; realityModePreset?: string } }
  vip?: {
    isActive?: boolean
    entitlements?: { dramaMode?: boolean }
  }
  social?: {
    relationships?: RelationshipsMap
    dramaNetwork?: DramaSocialNetwork
    reality?: RealityDomainState
  }
}

const WEEKEND_BLOCKED_ACTION_IDS = new Set([
  'pitch_target',
  'suggest_replacement',
  'ask_use_safety',
  'ask_safety_plan',
  'ask_hold_safety',
  'ask_loh_target',
  'rally_votes_against',
  'vote_rally',
  'nominate',
  'try_for_baby',
  'pregnancy_test',
  'pregnancy_test_self',
  'paternity_test_self',
  'share_pregnancy_news',
])

export interface SocialExecutionSelection {
  action: SocialActionDefinition
  actorId: string
  targetIds?: readonly string[]
  subjectId?: string
  requireCompleteSelection?: boolean
  allowAIOnly?: boolean
  allowPrimaryBatch?: boolean
}

/**
 * One caller-facing gate shared by UI and AI. SocialManeuvers keeps its own
 * affordability and mutation guards; this function prevents stale or invalid
 * selections from ever reaching it in either Normal or Drama mode.
 */
export function validateSocialExecution(
  state: SocialExecutionState,
  selection: SocialExecutionSelection
) {
  if (state.game?.weekendInterlude?.active && selection.action.id === 'ask_nemesis_reason') {
    return { eligible: false, reason: 'This conversation must happen during regular Social time.' }
  }
  if (state.game?.weekendInterlude?.active && WEEKEND_BLOCKED_ACTION_IDS.has(selection.action.id)) {
    return {
      eligible: false,
      reason: 'Weekend free time does not support ceremony-specific or timed pregnancy actions.',
    }
  }
  if (state.game?.voxPopuli?.status === 'active' && selection.action.unavailableInVox) {
    return { eligible: false, reason: 'This action does not apply to Vox Populi rules.' }
  }
  const realityPreset = state.settings?.gameUX?.realityModePreset
  if (realityPreset && !isActionAllowedForRealityPreset(selection.action, realityPreset)) {
    return { eligible: false, reason: 'Unavailable for the selected Reality intensity.' }
  }
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const targetMode = resolveActionTargetMode(selection.action, dramaMode)
  const targetIds = targetMode === 'none' ? [] : [...new Set(selection.targetIds ?? [])]
  const primaryBatch =
    selection.allowPrimaryBatch && targetMode === 'primary' && targetIds.length > 1
  const requiredTargetStatus = dramaMode
    ? (selection.action.dramaRequiredTargetStatus ?? selection.action.requiredTargetStatus)
    : selection.action.requiredTargetStatus
  if (
    primaryBatch &&
    (requiredTargetStatus ||
      ['proposeAlliance', 'consult_alliance', 'ask_nemesis_reason'].includes(selection.action.id))
  ) {
    return { eligible: false, reason: 'This action can only target one hubmate at a time.' }
  }
  const activityPhase = state.game?.weekendInterlude?.active
    ? `weekend_day_${state.game.weekendInterlude.weekendDay}`
    : state.game?.phase
  const players = state.game?.players ?? []
  const actor = players.find((player) => player.id === selection.actorId)
  const selections = primaryBatch ? targetIds.map((targetId) => [targetId]) : [targetIds]
  for (const selectedTargets of selections) {
    const eligibility = evaluateSocialActionEligibility({
      action: selection.action,
      actorId: selection.actorId,
      targetIds: selectedTargets,
      subjectId: selection.subjectId,
      phase: activityPhase ? getSocialRulesPhase(activityPhase) : undefined,
      week: state.game?.week,
      players,
      nomineeIds: state.game?.nomineeIds,
      actorStatus: actor?.status as PlayerStatus | undefined,
      primaryTargetStatus: selectedTargets.length
        ? (players.find((player) => player.id === selectedTargets[0])?.status as
            | PlayerStatus
            | undefined)
        : null,
      relationships: state.social?.relationships,
      dramaNetwork: state.social?.dramaNetwork,
      reality: state.social?.reality,
      pregnancyStory: state.game?.pregnancyStory,
      dramaMode,
      requireCompleteSelection: selection.requireCompleteSelection ?? true,
      allowAIOnly: selection.allowAIOnly ?? false,
    })
    if (!eligibility.eligible) return eligibility
  }
  if (
    dramaMode &&
    actor?.isUser &&
    selection.action.id !== 'consult_alliance' &&
    (targetMode === 'none' || targetIds.length > 1) &&
    activityPhase &&
    state.game?.week !== undefined &&
    hasRealityActionCooldown(state.social?.reality, selection.actorId, selection.action.id, {
      day: state.game.week,
      phase: activityPhase,
    })
  ) {
    return { eligible: false, reason: 'You already used this move this phase.' }
  }
  return { eligible: true, reason: '' }
}

export function createDeterministicSocialRandom(seedParts: readonly unknown[]): () => number {
  let state =
    seedParts
      .map((part) => String(part ?? ''))
      .join('|')
      .split('')
      .reduce(
        (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
        0x9e3779b9
      ) >>> 0

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}
