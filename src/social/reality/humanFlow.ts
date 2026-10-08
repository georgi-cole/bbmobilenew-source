import type { AppDispatch, RootState } from '../../store/store'
import type { ExecuteActionResult } from '../SocialManeuvers'
import { executeAction, executeGroupAction, getActionById } from '../SocialManeuvers'
import {
  applyEnergyDelta,
  applyInfoDelta,
  applyInfluenceDelta,
  replaceRealityDomain,
  replaceRealitySimulation,
  updateRelationship,
} from '../socialSlice'
import { ALLIANCE_TAG } from '../socialAlliance'
import { getEffectiveSocialMode } from '../socialMode'
import { resolveActionTargetMode } from '../socialActions'
import { normalizeActionCosts } from '../smExecNormalize'
import {
  createInitialRealitySimulationState,
  deriveRealitySimulationSeed,
} from '../realitySimulation'
import { getRealityActionContract, type RealityActorSnapshot } from './actionContract'
import { runRealityOpportunity } from './orchestrator'
import {
  findRealityAllianceForConsultation,
  holdRealityAllianceStrategyMeeting,
} from './relationshipForms'
import type { RealityAlliance } from './types'
import { getRealityModeAdapter } from './modeAdapters'
import { applyRealityRelationshipChange } from './relationships'
import type { RealityContext } from './types'
import { getCupidPartnerId } from '../../features/twists/cupidArrow'
import {
  chooseAiEvictionVote,
  getEligibleNominationTargets,
  getEligibleReplacementNominees,
  getNominationTargetScore,
  getSafetyRelationshipScore,
} from '../../store/gameSlice'
import { shouldDepressionShockRefuseConversation } from '../../features/twists/depressionShock'
import { validateSocialExecution } from '../socialExecutionGuard'
import { isLohReplacementPending } from '../lohReplacementWindow'
import {
  createInitialPregnancyStoryState,
  estimateFinalThreeDay,
  getLatestAttempt,
  getLatestCarrierAttempt,
  getActivePregnancyAttempt,
  getPregnancyEligibility,
  shouldLeakPregnancyNews,
  revealPaternityResult,
  revealPregnancyTest,
  shouldAcceptPregnancyAttempt,
  startPregnancyAttempt,
} from './pregnancy'
import {
  addTvEvent,
  markPregnancyReactions,
  recordPregnancyNewsShare,
  revealPregnancyNewsLeak,
  revealPaternityResult as revealPaternityResultAction,
  revealPregnancyTest as revealPregnancyTestAction,
  startPregnancyAttempt as startPregnancyAttemptAction,
} from '../../store/gameSlice'

export interface HumanRealityActionInput {
  actorId: string
  targetId: string
  targetIds?: string[]
  actionId: string
  consultationScope?: 'selected' | 'alliance'
  consultationAllianceId?: string
  subjectId?: string
  costOverride?: { energy: number; influence: number; info: number }
}

const PHASE_REPETITION_SUCCESS_CHANCES = [0.8, 0.5, 0.25] as const
const INFORMATION_REPETITION_SUCCESS_CHANCES = [1, 0.75, 0.3] as const

function getEffectiveHumanResources(state: RootState, actorId: string) {
  const actor = state.game.players.find((player) => player.id === actorId)
  const weekend = state.game.weekendInterlude
  if (weekend?.active && actor?.isUser) return weekend.wallet
  return {
    energy: state.social.energyBank[actorId] ?? 0,
    influence: state.social.influenceBank[actorId] ?? 0,
    info: state.social.infoBank[actorId] ?? 0,
  }
}

function getWeekendActivityPhase(state: RootState): string {
  return state.game.weekendInterlude?.active
    ? `weekend_day_${state.game.weekendInterlude.weekendDay}`
    : state.game.phase
}

function getHumanRepetitionSuccessChances(actionId: string): readonly number[] | null {
  const legacyAction = getActionById(actionId)
  if (legacyAction?.kind === 'intel_gain' && legacyAction.targetMode !== 'none') {
    return INFORMATION_REPETITION_SUCCESS_CHANCES
  }
  const contract = getRealityActionContract(actionId)
  if (
    contract?.purposes.includes('BOND') &&
    !contract.purposes.includes('COMMITMENT') &&
    !contract.purposes.includes('ROMANCE')
  ) {
    return PHASE_REPETITION_SUCCESS_CHANCES
  }
  return null
}

function getPhaseRepetitionChance(
  state: RootState,
  input: HumanRealityActionInput
): number | undefined {
  const successChances = getHumanRepetitionSuccessChances(input.actionId)
  if (!successChances) return undefined
  const priorAttempts = (state.social.actionHistory ?? []).filter(
    (entry) =>
      entry.actorId === input.actorId &&
      entry.targetId === input.targetId &&
      entry.actionId === input.actionId &&
      entry.week === state.game.week &&
      entry.phase === getWeekendActivityPhase(state)
  ).length
  return successChances[priorAttempts] ?? 0.02
}

function isDangerWarningDiscovered(state: RootState, input: HumanRealityActionInput): boolean {
  const source = [
    state.game.seed,
    state.game.week,
    state.game.lohId,
    input.actorId,
    input.targetId,
    input.actionId,
  ].join('|')
  let hash = 0x811c9dc5
  for (const character of source) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000 < 0.35
}

function buildActors(state: RootState): Record<string, RealityActorSnapshot> {
  return Object.fromEntries(
    state.game.players.map((player) => {
      const roles = [player.status]
      if (state.game.lohId === player.id && !roles.includes('loh')) roles.push('loh')
      if (state.game.posWinnerId === player.id && !roles.includes('pos')) roles.push('pos')
      return [
        player.id,
        {
          id: player.id,
          name: player.name,
          isHuman: player.isUser === true,
          active: player.status !== 'evicted' && player.status !== 'jury',
          roles,
          resources: player.isUser
            ? getEffectiveHumanResources(state, player.id)
            : {
                energy: state.social.energyBank[player.id] ?? 0,
                influence: state.social.influenceBank[player.id] ?? 0,
                info: state.social.infoBank[player.id] ?? 0,
              },
        },
      ]
    })
  )
}

function buildContext(state: RootState): RealityContext {
  const actors = buildActors(state)
  const mode = getRealityModeAdapter(state.game.mode, state.game.publicModeEnabled === true)
  return {
    day: state.game.week ?? 1,
    phase: getWeekendActivityPhase(state),
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
    romanceEnabled: state.settings.gameUX.romanceStorylines,
  }
}

function result(
  success: boolean,
  summary: string,
  newEnergy: number,
  delta = 0,
  label = success ? 'Resolved' : 'Unavailable',
  score = 0
): ExecuteActionResult {
  return { success, summary, newEnergy, delta, label, score }
}

function activeRomanceForPregnancy(state: RootState, actorId: string, targetId: string): boolean {
  const dramaArc = state.social.dramaNetwork.arcs.some(
    (arc) =>
      arc.status === 'active' &&
      arc.type === 'romance' &&
      ['established', 'climax'].includes(arc.stage) &&
      arc.participantIds.includes(actorId) &&
      arc.participantIds.includes(targetId)
  )
  const realityRomance = Object.values(state.social.reality.romances ?? {}).some(
    (romance) =>
      (romance.status === 'MUTUAL' ||
        romance.status === 'ACTIVE' ||
        romance.status === 'STRAINED') &&
      romance.participantIds.includes(actorId) &&
      romance.participantIds.includes(targetId)
  )
  return dramaArc || realityRomance
}

function executePregnancyFlow(
  state: RootState,
  input: HumanRealityActionInput,
  dispatch: AppDispatch,
  costs: { energy: number; influence: number; info: number }
): ExecuteActionResult | null {
  const isPregnancyAction = [
    'try_for_baby',
    'pregnancy_test',
    'pregnancy_test_self',
    'paternity_test_self',
    'share_pregnancy_news',
  ].includes(input.actionId)
  if (!isPregnancyAction) return null

  const actor = state.game.players.find((player) => player.id === input.actorId)
  if (!actor) {
    return result(
      false,
      'The player profile is unavailable.',
      state.social.energyBank[input.actorId] ?? 0
    )
  }

  const pregnancyStory = state.game.pregnancyStory ?? createInitialPregnancyStoryState()
  const activeCount = state.game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  ).length
  const finalThreeDay = estimateFinalThreeDay(state.game.week, activeCount, state.game.phase)

  if (input.actionId === 'share_pregnancy_news') {
    const pregnancy = getActivePregnancyAttempt(pregnancyStory, actor.id)
    const recipientIds = [...new Set(input.targetIds ?? [input.targetId])].filter(
      (id) => id && id !== actor.id
    )
    if (!pregnancy || !pregnancy.resultKnown || pregnancy.status !== 'POSITIVE') {
      return result(false, 'You need a confirmed pregnancy before sharing the news.', 0)
    }
    if (pregnancy.pregnancyPublicRevealed) {
      return result(false, 'The pregnancy news is already public.', 0)
    }
    if (recipientIds.length === 0) {
      return result(false, 'Choose at least one active housemate to tell.', 0)
    }
    const alreadyTold = new Set(pregnancy.pregnancyNewsSharedWithIds ?? [])
    if (recipientIds.some((id) => alreadyTold.has(id))) {
      return result(false, 'You have already shared this news with that housemate.', 0)
    }

    const leakerId = recipientIds.find((recipientId) => {
      const loyalty = state.social.reality.relationships[recipientId]?.[actor.id]?.loyalty ?? 50
      return shouldLeakPregnancyNews({
        seed: state.game.seed,
        day: state.game.week,
        attemptId: pregnancy.attemptId,
        recipientId,
        loyalty,
      })
    })
    dispatch(
      recordPregnancyNewsShare({
        attemptId: pregnancy.attemptId,
        recipientIds,
        currentDay: state.game.week,
      })
    )
    dispatch(applyEnergyDelta({ playerId: actor.id, delta: -costs.energy }))

    for (const recipientId of recipientIds) {
      const leaked = recipientId === leakerId
      dispatch(
        updateRelationship({
          source: actor.id,
          target: recipientId,
          delta: leaked ? -8 : 5,
          ...(leaked ? { tags: ['betrayal'] } : {}),
          actionSource: 'manual',
        })
      )
      if (!leaked) {
        dispatch(
          updateRelationship({
            source: recipientId,
            target: actor.id,
            delta: 3,
            actionSource: 'system',
          })
        )
      }
    }

    if (leakerId) {
      const leakerName =
        state.game.players.find((player) => player.id === leakerId)?.name ?? leakerId
      const carrierName =
        state.game.players.find((player) => player.id === pregnancy.carrierId)?.name ?? actor.name
      dispatch(
        revealPregnancyNewsLeak({
          attemptId: pregnancy.attemptId,
          leakerId,
          currentDay: state.game.week,
        })
      )
      dispatch(
        addTvEvent({
          text: `Hub leak: ${leakerName} shared ${carrierName}'s private pregnancy news. The secret is out.`,
          type: 'social',
          major: 'pregnancy_secret_leaked',
          source: 'system',
          channels: ['tv', 'dr'],
          meta: { pregnancyAttemptId: pregnancy.attemptId, forceOnTv: true },
        })
      )
      return {
        ...result(
          true,
          `${leakerName} leaked your pregnancy news. The Hub knows, and your trust with them has been damaged.`,
          (state.social.energyBank[actor.id] ?? 0) - costs.energy,
          -8,
          'Leaked'
        ),
        targetDeltas: Object.fromEntries(recipientIds.map((id) => [id, id === leakerId ? -8 : 5])),
      }
    }

    const recipientNames = recipientIds.map(
      (id) => state.game.players.find((player) => player.id === id)?.name ?? id
    )
    return {
      ...result(
        true,
        `You shared the pregnancy news privately with ${recipientNames.join(', ')}. Their loyalty determines whether they keep it secret.`,
        (state.social.energyBank[actor.id] ?? 0) - costs.energy,
        5,
        'Shared privately'
      ),
      targetDeltas: Object.fromEntries(recipientIds.map((id) => [id, 5])),
    }
  }

  if (input.actionId === 'paternity_test_self') {
    const eligibility = getPregnancyEligibility({
      actor,
      target: actor,
      currentDay: state.game.week,
      story: pregnancyStory,
      reality: state.social.reality,
      action: 'PATERNITY_TEST_SELF',
    })
    if (!eligibility.eligible) {
      return result(false, eligibility.reason, state.social.energyBank[input.actorId] ?? 0)
    }
    const resolved = revealPaternityResult(pregnancyStory, actor.id)
    if (!resolved.attempt || !resolved.fatherId) {
      return result(
        false,
        'There is no paternity result to reveal.',
        state.social.energyBank[input.actorId] ?? 0
      )
    }
    dispatch(revealPaternityResultAction({ carrierId: actor.id }))
    const father =
      state.game.players.find((player) => player.id === resolved.fatherId)?.name ??
      resolved.fatherId
    return result(
      true,
      `Paternity result: ${father} is the biological father. The result remains private until the public reveal.`,
      state.social.energyBank[input.actorId] ?? 0,
      0,
      'Paternity confirmed'
    )
  }

  if (input.actionId === 'pregnancy_test_self') {
    const eligibility = getPregnancyEligibility({
      actor,
      target: actor,
      currentDay: state.game.week,
      story: pregnancyStory,
      reality: state.social.reality,
      action: 'PREGNANCY_TEST_SELF',
    })
    if (!eligibility.eligible) {
      return result(false, eligibility.reason, state.social.energyBank[input.actorId] ?? 0)
    }
    const attempt = getLatestCarrierAttempt(pregnancyStory, actor.id)
    if (!attempt) {
      return result(
        false,
        'There is no saved pregnancy attempt to test.',
        state.social.energyBank[input.actorId] ?? 0
      )
    }
    const resolved = revealPregnancyTest(pregnancyStory, {
      attemptId: attempt.attemptId,
      currentDay: state.game.week,
    })
    if (resolved.result.tooEarly) {
      const copy = resolved.result.conceptualOnly
        ? 'It is too close to Final 3 for a conclusive result this season.'
        : `Too early to tell. A conclusive result is expected on Day ${resolved.result.availableDay}.`
      return result(false, copy, state.social.energyBank[input.actorId] ?? 0, 0, 'Too early')
    }
    dispatch(
      revealPregnancyTestAction({ attemptId: attempt.attemptId, currentDay: state.game.week })
    )
    const revealed = resolved.result.attempt
    if (!revealed) {
      return result(
        false,
        'That pregnancy attempt is no longer available.',
        state.social.energyBank[input.actorId] ?? 0
      )
    }
    if (!revealed.reactionsTriggered) {
      dispatch(markPregnancyReactions({ attemptId: revealed.attemptId, kind: 'reactions' }))
    }
    const ambiguous = (revealed.plausibleFatherIds?.length ?? 0) > 1
    return result(
      true,
      revealed.status === 'POSITIVE'
        ? `Positive. You are pregnant. The result is private for now.${ambiguous ? ' Paternity is not yet certain.' : ''}`
        : 'Negative. The result is attached to this attempt and will not change.',
      state.social.energyBank[input.actorId] ?? 0,
      revealed.status === 'POSITIVE' ? 10 : 3,
      revealed.status === 'POSITIVE' ? 'Positive' : 'Negative'
    )
  }

  const target = state.game.players.find((player) => player.id === input.targetId)
  if (!target) {
    return result(
      false,
      input.actionId === 'pregnancy_test'
        ? 'Choose the pregnancy carrier.'
        : 'Choose a housemate for this story.',
      state.social.energyBank[input.actorId] ?? 0
    )
  }

  const relationshipScore =
    state.social.relationships[input.actorId]?.[input.targetId]?.affinity ?? 0
  const action = input.actionId === 'pregnancy_test' ? 'PREGNANCY_TEST' : 'TRY_FOR_A_BABY'
  const eligibility = getPregnancyEligibility({
    actor,
    target,
    currentDay: state.game.week,
    story: pregnancyStory,
    reality: state.social.reality,
    romanceActive: activeRomanceForPregnancy(state, input.actorId, input.targetId),
    relationshipScore,
    action,
  })
  if (!eligibility.eligible) {
    return result(false, eligibility.reason, state.social.energyBank[input.actorId] ?? 0)
  }

  if (action === 'TRY_FOR_A_BABY') {
    if (eligibility.needsHumanRoleChoice) {
      return result(
        false,
        'Choose how this pregnancy storyline applies to you first.',
        state.social.energyBank[input.actorId] ?? 0
      )
    }
    const accepted = shouldAcceptPregnancyAttempt({
      target,
      proposer: actor,
      prospectivePartnerId: target.id,
      story: pregnancyStory,
      relationshipScore,
      seed: state.game.seed,
      day: state.game.week,
    })
    if (!accepted) {
      return result(
        false,
        `${target.name} declined. This has to be a mutual decision.`,
        state.social.energyBank[input.actorId] ?? 0,
        0,
        'Declined'
      )
    }
    const started = startPregnancyAttempt(pregnancyStory, {
      actor,
      target,
      currentDay: state.game.week,
      story: pregnancyStory,
      reality: state.social.reality,
      romanceActive: true,
      relationshipScore,
      seed: state.game.seed,
      accepted: true,
      finalThreeDay,
    })
    if (!started.attempt) {
      return result(false, started.reason, state.social.energyBank[input.actorId] ?? 0)
    }
    dispatch(
      startPregnancyAttemptAction({
        actor,
        target,
        currentDay: state.game.week,
        story: pregnancyStory,
        reality: state.social.reality,
        romanceActive: true,
        relationshipScore,
        seed: state.game.seed,
        accepted: true,
        finalThreeDay,
        attemptId: started.attempt.attemptId,
      })
    )
    dispatch(applyEnergyDelta({ playerId: input.actorId, delta: -costs.energy }))
    if (costs.influence) {
      dispatch(applyInfluenceDelta({ playerId: input.actorId, delta: -costs.influence }))
    }
    if (costs.info) dispatch(applyInfoDelta({ playerId: input.actorId, delta: -costs.info }))
    dispatch(
      updateRelationship({
        source: actor.id,
        target: target.id,
        delta: 5,
        tags: ['romance'],
        actionSource: 'manual',
      })
    )
    dispatch(
      updateRelationship({
        source: target.id,
        target: actor.id,
        delta: 5,
        tags: ['romance'],
        actionSource: 'system',
      })
    )
    return result(
      true,
      started.attempt.resultAvailableDay == null
        ? `${target.name} agreed. The attempt happened too close to Final 3 for a conclusive in-season result.`
        : `${target.name} agreed. Testing opens tomorrow; a conclusive result is expected on Day ${started.attempt.resultAvailableDay}.`,
      (state.social.energyBank[input.actorId] ?? 0) - costs.energy,
      5,
      'Accepted'
    )
  }

  const attempt = getLatestAttempt(pregnancyStory, input.actorId, input.targetId)
  if (!attempt) {
    return result(
      false,
      'There is no saved pregnancy attempt to test.',
      state.social.energyBank[input.actorId] ?? 0
    )
  }
  const resolved = revealPregnancyTest(pregnancyStory, {
    attemptId: attempt.attemptId,
    currentDay: state.game.week,
  })
  if (resolved.result.tooEarly) {
    const copy = resolved.result.conceptualOnly
      ? 'It is too close to Final 3 for a conclusive result this season.'
      : `Too early to tell. A conclusive result is expected on Day ${resolved.result.availableDay}.`
    return result(false, copy, state.social.energyBank[input.actorId] ?? 0, 0, 'Too early')
  }

  dispatch(revealPregnancyTestAction({ attemptId: attempt.attemptId, currentDay: state.game.week }))
  const revealed = resolved.result.attempt
  if (!revealed) {
    return result(
      false,
      'That pregnancy attempt is no longer available.',
      state.social.energyBank[input.actorId] ?? 0
    )
  }

  if (resolved.result.changed) {
    dispatch(
      updateRelationship({
        source: actor.id,
        target: target.id,
        delta: revealed.status === 'POSITIVE' ? 10 : 3,
        actionSource: 'manual',
      })
    )
    dispatch(
      updateRelationship({
        source: target.id,
        target: actor.id,
        delta: revealed.status === 'POSITIVE' ? 10 : 3,
        actionSource: 'system',
      })
    )
  }
  if (!revealed.reactionsTriggered) {
    dispatch(markPregnancyReactions({ attemptId: revealed.attemptId, kind: 'reactions' }))
  }

  const carrierName =
    state.game.players.find((player) => player.id === revealed.carrierId)?.name ?? target.name
  const ambiguous = (revealed.plausibleFatherIds?.length ?? 0) > 1
  const publicRevealCopy =
    revealed.pregnancyPublicRevealDay == null
      ? ' The result stays private for the rest of this season because the scheduled reveal would fall at Final 3.'
      : ` The result is private today; the Hub reveal is scheduled for Day ${revealed.pregnancyPublicRevealDay}.`
  const paternityRevealCopy =
    ambiguous && revealed.paternityRevealDay != null
      ? ` Paternity is uncertain and is scheduled to be revealed on Day ${revealed.paternityRevealDay}.`
      : ''
  return result(
    true,
    revealed.status === 'POSITIVE'
      ? `Positive. ${carrierName} is pregnant.${publicRevealCopy}${paternityRevealCopy}`
      : 'Negative. The result is attached to this attempt and will not change.',
    state.social.energyBank[input.actorId] ?? 0,
    revealed.status === 'POSITIVE' ? 10 : 3,
    revealed.status === 'POSITIVE' ? 'Positive' : 'Negative'
  )
}

function playerName(state: RootState, playerId: string | null | undefined): string {
  if (!playerId) return 'that nominee'
  return (
    state.game.players.find(
      (player) => player.id === playerId || (playerId === 'user' && player.isUser)
    )?.name ?? 'that nominee'
  )
}

interface AllianceConsultationPlan {
  allianceId: string
  attendeeIds: string[]
  targetIds: string[]
  fallbackTargetIds: string[]
  planIds: string[]
  agenda: string
  summary: string
  excusedAbsentIds: string[]
  memberPlanBeliefs: Record<string, string[]>
}

function activeAllianceAdvisors(
  state: RootState,
  alliance: RealityAlliance,
  actorId: string
): string[] {
  const activeIds = new Set(
    state.game.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )
  return alliance.memberIds.filter((id) => id !== actorId && activeIds.has(id))
}

function nominationConsultationCandidates(state: RootState, actorId: string) {
  return getEligibleNominationTargets(state.game, actorId)
}

function isAllianceProtectedGameUnit(
  state: RootState,
  alliance: RealityAlliance,
  playerId: string
): boolean {
  if (alliance.memberIds.includes(playerId)) return true
  const cupidPartnerId = getCupidPartnerId(state.game, playerId)
  return cupidPartnerId !== null && alliance.memberIds.includes(cupidPartnerId)
}

function summarizeAlliancePreferences(
  state: RootState,
  preferences: Array<{ advisorId: string; targetId: string; score: number }>,
  label: string,
  excludedPlanTargetIds: ReadonlySet<string> = new Set()
): {
  summary: string
  targetIds: string[]
  fallbackTargetIds: string[]
  hasConsensus: boolean
  preferenceByAdvisor: Record<string, string>
} {
  const counts = new Map<string, { votes: number; score: number }>()
  for (const preference of preferences) {
    if (excludedPlanTargetIds.has(preference.targetId)) continue
    const current = counts.get(preference.targetId) ?? { votes: 0, score: 0 }
    current.votes += 1
    current.score += preference.score
    counts.set(preference.targetId, current)
  }
  const ordered = [...counts.entries()].sort(
    (left, right) =>
      right[1].votes - left[1].votes ||
      right[1].score - left[1].score ||
      left[0].localeCompare(right[0])
  )
  const primary = ordered[0]
  const fallback = ordered[1]
  const primaryId = primary?.[0]
  const topVotes = primary?.[1].votes ?? 0
  const hasConsensus =
    preferences.length >= 2 && topVotes >= 2 && topVotes / Math.max(1, preferences.length) > 0.5
  const fallbackId = hasConsensus && fallback && fallback[1].votes >= 2 ? fallback[0] : undefined
  const preferenceByAdvisor = Object.fromEntries(
    preferences.map((preference) => [preference.advisorId, preference.targetId])
  )
  const lines = preferences
    .slice(0, 4)
    .map(
      (preference) =>
        `${playerName(state, preference.advisorId)} → ${playerName(state, preference.targetId)}`
    )
    .join(' · ')
  const consensus =
    hasConsensus && primaryId
      ? `${label}: ${playerName(state, primaryId)}${
          fallbackId ? ` · backup ${playerName(state, fallbackId)}` : ''
        }`
      : preferences.length === 1 && primaryId
        ? `${label}: ${playerName(state, preferences[0].advisorId)} recommends ${playerName(
            state,
            primaryId
          )}; no group decision`
        : `${label}: split; no alliance decision`
  return {
    summary: lines ? `${lines}. ${consensus}.` : `${consensus}.`,
    targetIds: hasConsensus && primaryId ? [primaryId] : [],
    fallbackTargetIds: fallbackId ? [fallbackId] : [],
    hasConsensus,
    preferenceByAdvisor,
  }
}

function summarizeAllianceSlate(
  state: RootState,
  preferences: Array<{ advisorId: string; targetId: string; score: number }>,
  decisionLabel: string,
  seatCount: number
): {
  summary: string
  targetIds: string[]
  fallbackTargetIds: string[]
  preferenceByAdvisor: Record<string, string>
} {
  const counts = new Map<string, { votes: number; score: number }>()
  for (const preference of preferences) {
    const current = counts.get(preference.targetId) ?? { votes: 0, score: 0 }
    current.votes += 1
    current.score += preference.score
    counts.set(preference.targetId, current)
  }
  const ranked = [...counts.entries()].sort(
    (left, right) =>
      right[1].votes - left[1].votes ||
      right[1].score - left[1].score ||
      left[0].localeCompare(right[0])
  )
  const targetIds = ranked.slice(0, Math.max(1, seatCount)).map(([id]) => id)
  const fallbackTargetIds = ranked.slice(targetIds.length, targetIds.length + 1).map(([id]) => id)
  const preferenceByAdvisor = Object.fromEntries(
    preferences
      .filter(
        (preference, index, entries) =>
          entries.findIndex((candidate) => candidate.advisorId === preference.advisorId) === index
      )
      .map((preference) => [preference.advisorId, preference.targetId])
  )
  const names = targetIds.map((id) => playerName(state, id))
  const recommendationsByAdvisor = new Map<string, string[]>()
  for (const preference of preferences) {
    const recommendations = recommendationsByAdvisor.get(preference.advisorId) ?? []
    if (!recommendations.includes(preference.targetId)) recommendations.push(preference.targetId)
    recommendationsByAdvisor.set(preference.advisorId, recommendations)
  }
  const recommendationLines = [...recommendationsByAdvisor.entries()]
    .slice(0, 4)
    .map(
      ([advisorId, targetIds]) =>
        `${playerName(state, advisorId)} → ${targetIds.map((id) => playerName(state, id)).join(', ')}`
    )
    .join(' · ')
  const slotLabel = decisionLabel.toLowerCase().includes('nomination')
    ? 'nomination spots'
    : 'exit spots'
  const slate = names.length > 0 ? names.join(', ') : 'no eligible targets yet'
  const slotProgress = `${targetIds.length} of ${seatCount} ${slotLabel} planned`
  return {
    summary: `${decisionLabel}: ${slate} (${slotProgress})${fallbackTargetIds.length ? ` · next option ${playerName(state, fallbackTargetIds[0])}` : ''}${recommendationLines ? `; member reads: ${recommendationLines}` : ''}`,
    targetIds,
    fallbackTargetIds,
    preferenceByAdvisor,
  }
}

function buildConsultationSlateBeliefs(
  attendeeIds: readonly string[],
  actorId: string,
  read: {
    targetIds: string[]
    fallbackTargetIds: string[]
    preferenceByAdvisor: Record<string, string>
  }
): Record<string, string[]> {
  const slateIds = new Set(read.targetIds)
  return Object.fromEntries(
    attendeeIds.map((memberId) => {
      const preference = read.preferenceByAdvisor[memberId]
      const beliefs = [
        ...read.targetIds.map((targetId) => `target:${targetId}`),
        ...read.fallbackTargetIds.map((targetId) => `fallback:${targetId}`),
      ]
      if (memberId !== actorId && preference && !slateIds.has(preference)) {
        beliefs.push(`preference:${preference}`)
      }
      return [memberId, beliefs]
    })
  )
}

function buildConsultationMemberPlanBeliefs(
  attendeeIds: readonly string[],
  actorId: string,
  read: {
    targetIds: string[]
    fallbackTargetIds: string[]
    preferenceByAdvisor: Record<string, string>
  }
): Record<string, string[]> {
  const consensusTarget = read.targetIds[0]
  const fallbackTarget = read.fallbackTargetIds[0]
  return Object.fromEntries(
    attendeeIds.map((memberId) => {
      if (memberId === actorId) {
        return [
          memberId,
          [
            ...(consensusTarget ? [`target:${consensusTarget}`] : []),
            ...(fallbackTarget ? [`fallback:${fallbackTarget}`] : []),
          ],
        ]
      }
      const preference = read.preferenceByAdvisor[memberId]
      if (!preference) return [memberId, []]
      if (preference === consensusTarget) return [memberId, [`target:${preference}`]]
      if (preference === fallbackTarget) return [memberId, [`fallback:${preference}`]]
      return [
        memberId,
        [...(consensusTarget ? [`aware:${consensusTarget}`] : []), `preference:${preference}`],
      ]
    })
  )
}

function getAllianceConsultationAgenda(
  state: RootState,
  actorId: string
): AllianceConsultationPlan['agenda'] {
  const actorIsLoh =
    state.game.lohId === actorId || getCupidPartnerId(state.game, state.game.lohId) === actorId
  const actorHasSafety =
    state.game.posWinnerId === actorId ||
    getCupidPartnerId(state.game, state.game.posWinnerId) === actorId
  const nomineesExist = state.game.nomineeIds.length > 0

  if (actorIsLoh && ['loh_results', 'social_1', 'nominations'].includes(state.game.phase)) {
    return 'nominations'
  }
  if (
    actorHasSafety &&
    ['pos_results', 'pos_ceremony'].includes(state.game.phase) &&
    nomineesExist
  ) {
    return 'safety'
  }
  if (
    state.game.voxPopuli?.status !== 'active' &&
    nomineesExist &&
    ['nomination_results', 'pos_results', 'pos_ceremony'].includes(state.game.phase)
  ) {
    return 'block_strategy'
  }
  if (
    state.game.voxPopuli?.status !== 'active' &&
    nomineesExist &&
    ['pos_ceremony_results', 'social_2', 'live_vote'].includes(state.game.phase)
  ) {
    return 'eviction_vote'
  }
  return 'strategy'
}

function buildAllianceConsultationPlan(
  state: RootState,
  alliance: RealityAlliance,
  actorId: string,
  requestedAdvisorIds?: readonly string[]
): AllianceConsultationPlan | null {
  const availableAdvisors = activeAllianceAdvisors(state, alliance, actorId)
  const requested = requestedAdvisorIds ? new Set(requestedAdvisorIds) : null
  const advisors = requested
    ? availableAdvisors.filter((advisorId) => requested.has(advisorId))
    : availableAdvisors
  if (advisors.length === 0) return null
  const attendeeIds = [actorId, ...advisors]
  const attendeeSet = new Set(attendeeIds)
  // A scoped consultation is a private subset meeting. Members who were not
  // invited are not treated as having skipped an alliance meeting.
  const excusedAbsentIds = alliance.memberIds.filter((id) => !attendeeSet.has(id))
  const agenda = getAllianceConsultationAgenda(state, actorId)
  const nominees = state.game.players.filter((player) => state.game.nomineeIds.includes(player.id))

  if (agenda === 'nominations') {
    const candidates = nominationConsultationCandidates(state, actorId).filter(
      (candidate) => !isAllianceProtectedGameUnit(state, alliance, candidate.id)
    )
    if (candidates.length === 0) return null
    const nominationSeats = state.game.doubleEviction?.weekActive ? 3 : 2
    const preferences = advisors.flatMap((advisorId) => {
      const ranked = candidates
        .filter((candidate) => candidate.id !== advisorId)
        .map((candidate) => ({
          advisorId,
          targetId: candidate.id,
          score: getNominationTargetScore(state.game, advisorId, candidate),
        }))
        .sort(
          (left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId)
        )
      return ranked.slice(0, nominationSeats)
    })
    const read = summarizeAllianceSlate(state, preferences, 'Nomination slate', nominationSeats)
    return {
      allianceId: alliance.id,
      attendeeIds,
      targetIds: read.targetIds,
      fallbackTargetIds: read.fallbackTargetIds,
      planIds: [
        ...read.targetIds.map((id) => `target:${id}`),
        ...read.fallbackTargetIds.map((id) => `fallback:${id}`),
      ],
      agenda: 'nominations',
      summary: `Nomination huddle — ${read.summary}`,
      excusedAbsentIds,
      memberPlanBeliefs: buildConsultationSlateBeliefs(attendeeIds, actorId, read),
    }
  }

  if (agenda === 'safety') {
    const preferences = advisors
      .map((advisorId) => {
        const ranked = nominees
          .map((nominee) => ({
            advisorId,
            targetId: nominee.id,
            score: getSafetyRelationshipScore(state.game, advisorId, nominee),
          }))
          .sort(
            (left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId)
          )
        return ranked[0]
      })
      .filter((entry): entry is { advisorId: string; targetId: string; score: number } =>
        Boolean(entry)
      )
    const read = summarizeAlliancePreferences(state, preferences, 'Safety preference')
    const replacements = getEligibleReplacementNominees(state.game).filter(
      (candidate) => !isAllianceProtectedGameUnit(state, alliance, candidate.id)
    )
    const replacementPreferences = advisors
      .map((advisorId) => {
        const ranked = replacements
          .filter((candidate) => candidate.id !== advisorId)
          .map((candidate) => ({
            advisorId,
            targetId: candidate.id,
            score: getNominationTargetScore(state.game, advisorId, candidate),
          }))
          .sort(
            (left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId)
          )
        return ranked[0]
      })
      .filter((entry): entry is { advisorId: string; targetId: string; score: number } =>
        Boolean(entry)
      )
    const canonicalBackupId =
      state.game.lohSocialPlan?.week === state.game.week &&
      state.game.lohSocialPlan.lohId === state.game.lohId
        ? state.game.lohSocialPlan.backupTargetId
        : null
    if (
      state.game.lohId &&
      canonicalBackupId &&
      replacements.some((candidate) => candidate.id === canonicalBackupId)
    ) {
      const lohReplacementPreference = replacementPreferences.find(
        (preference) => preference.advisorId === state.game.lohId
      )
      const canonicalBackup = replacements.find((candidate) => candidate.id === canonicalBackupId)
      if (lohReplacementPreference && canonicalBackup) {
        lohReplacementPreference.targetId = canonicalBackupId
        lohReplacementPreference.score = getNominationTargetScore(
          state.game,
          state.game.lohId,
          canonicalBackup
        )
      }
    }
    const replacementRead = summarizeAlliancePreferences(
      state,
      replacementPreferences,
      'Replacement consensus'
    )
    const replacement = replacementRead.targetIds[0] ?? null
    const fallbackTargetIds = replacement ? [replacement] : [...alliance.fallbackTargetIds]
    const planIds = [
      ...alliance.currentTargetIds.map((id) => `target:${id}`),
      ...fallbackTargetIds.map((id) => `fallback:${id}`),
      ...(read.targetIds[0] ? [`save:${read.targetIds[0]}`] : []),
    ]
    const memberPlanBeliefs = Object.fromEntries(
      attendeeIds.map((memberId) => {
        if (memberId === actorId) {
          return [
            memberId,
            [
              ...(read.targetIds[0] ? [`save:${read.targetIds[0]}`] : []),
              ...(replacement ? [`fallback:${replacement}`] : []),
            ],
          ]
        }
        const savePreference = read.preferenceByAdvisor[memberId]
        const replacementPreference = replacementRead.preferenceByAdvisor[memberId]
        return [
          memberId,
          [
            ...(savePreference ? [`save:${savePreference}`] : []),
            ...(replacementPreference
              ? [
                  replacementPreference === replacement
                    ? `fallback:${replacementPreference}`
                    : `replacement_preference:${replacementPreference}`,
                ]
              : []),
          ],
        ]
      })
    )
    return {
      allianceId: alliance.id,
      attendeeIds,
      targetIds: [...alliance.currentTargetIds],
      fallbackTargetIds,
      planIds,
      agenda: 'safety',
      summary: `Safety huddle — ${read.summary} ${replacementRead.summary}`,
      excusedAbsentIds,
      memberPlanBeliefs,
    }
  }

  if (agenda === 'block_strategy' || agenda === 'eviction_vote') {
    const nomineeIds = nominees
      .filter((nominee) => !isAllianceProtectedGameUnit(state, alliance, nominee.id))
      .map((nominee) => nominee.id)
    if (nomineeIds.length === 0) return null
    const preferences = advisors.flatMap((advisorId) => {
      const targetId = chooseAiEvictionVote(
        state.game,
        advisorId,
        nomineeIds,
        (state.game.seed ?? 0) ^ state.game.week
      )
      const firstChoice = nomineeIds.find((id) => id === targetId)
      const recommendations = firstChoice ? [firstChoice] : []
      if (state.game.doubleEviction?.weekActive) {
        const additionalChoices = nomineeIds
          .filter((id) => id !== firstChoice)
          .map((id) => ({
            id,
            score: getNominationTargetScore(
              state.game,
              advisorId,
              state.game.players.find((player) => player.id === id)!
            ),
          }))
          .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
          .slice(0, 1)
          .map((choice) => choice.id)
        recommendations.push(...additionalChoices)
      }
      return recommendations.map((recommendationId, index) => ({
        advisorId,
        targetId: recommendationId,
        score:
          index === 0
            ? 1
            : getNominationTargetScore(
                state.game,
                advisorId,
                state.game.players.find((player) => player.id === recommendationId)!
              ),
      }))
    })
    const read =
      agenda === 'eviction_vote' && state.game.doubleEviction?.weekActive
        ? summarizeAllianceSlate(state, preferences, 'Double eviction vote plan', 2)
        : summarizeAlliancePreferences(
            state,
            preferences,
            agenda === 'eviction_vote' ? 'Vote consensus' : 'Current block',
            new Set(alliance.memberIds)
          )
    return {
      allianceId: alliance.id,
      attendeeIds,
      targetIds: read.targetIds,
      fallbackTargetIds: read.fallbackTargetIds,
      planIds: [
        ...read.targetIds.map((id) => `target:${id}`),
        ...read.fallbackTargetIds.map((id) => `fallback:${id}`),
      ],
      agenda,
      summary: `${agenda === 'eviction_vote' ? 'Eviction huddle' : 'Block strategy'} — ${read.summary}`,
      excusedAbsentIds,
      memberPlanBeliefs:
        agenda === 'eviction_vote' && state.game.doubleEviction?.weekActive
          ? buildConsultationSlateBeliefs(attendeeIds, actorId, read)
          : buildConsultationMemberPlanBeliefs(attendeeIds, actorId, read),
    }
  }

  const candidates = nominationConsultationCandidates(state, actorId).filter(
    (candidate) => !isAllianceProtectedGameUnit(state, alliance, candidate.id)
  )
  if (candidates.length === 0) return null
  const preferences = advisors
    .map((advisorId) => {
      const ranked = candidates
        .filter((candidate) => candidate.id !== advisorId)
        .map((candidate) => ({
          advisorId,
          targetId: candidate.id,
          score: getNominationTargetScore(state.game, advisorId, candidate),
        }))
        .sort(
          (left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId)
        )
      return ranked[0]
    })
    .filter((entry): entry is { advisorId: string; targetId: string; score: number } =>
      Boolean(entry)
    )
  const read = summarizeAlliancePreferences(
    state,
    preferences,
    'Strategic read',
    new Set(alliance.memberIds)
  )
  return {
    allianceId: alliance.id,
    attendeeIds,
    targetIds: read.targetIds,
    fallbackTargetIds: read.fallbackTargetIds,
    planIds: [
      ...read.targetIds.map((id) => `target:${id}`),
      ...read.fallbackTargetIds.map((id) => `fallback:${id}`),
    ],
    agenda: 'strategy',
    summary: `Strategy huddle — ${read.summary}`,
    excusedAbsentIds,
    memberPlanBeliefs: buildConsultationMemberPlanBeliefs(attendeeIds, actorId, read),
  }
}

/**
 * A Cupid pair does not share a single opinion, but they are unusually likely
 * to compare notes.  Let a meaningful one-on-one interaction lightly colour
 * the human's connection with the other half of that pair.
 */
function applyCupidPartnerRipple(
  dispatch: AppDispatch,
  state: RootState,
  actorId: string,
  targetIds: readonly string[],
  targetDeltas: Record<string, number> | undefined,
  fallbackDelta: number
): string | null {
  if (!state.game.cupidArrow || targetIds.length === 0) return null
  const targetSet = new Set(targetIds)
  const echoedPartnerIds = new Set<string>()

  for (const targetId of targetIds) {
    const partnerId = getCupidPartnerId(state.game, targetId)
    if (
      !partnerId ||
      partnerId === actorId ||
      targetSet.has(partnerId) ||
      echoedPartnerIds.has(partnerId)
    ) {
      continue
    }
    const directDelta = targetDeltas?.[targetId] ?? fallbackDelta
    if (!Number.isFinite(directDelta) || Math.abs(directDelta) < 2) continue
    const echoDelta = Math.sign(directDelta) * Math.max(1, Math.round(Math.abs(directDelta) * 0.35))
    dispatch(
      updateRelationship({
        source: actorId,
        target: partnerId,
        delta: echoDelta,
        tags: ['cupid_ripple'],
        actionSource: 'manual',
      })
    )
    dispatch(
      updateRelationship({
        source: partnerId,
        target: actorId,
        delta: Math.sign(echoDelta) * Math.max(1, Math.round(Math.abs(echoDelta) * 0.5)),
        tags: ['cupid_ripple'],
        actionSource: 'manual',
      })
    )
    echoedPartnerIds.add(partnerId)
  }

  if (echoedPartnerIds.size === 0) return null
  const names = [...echoedPartnerIds].map((id) => playerName(state, id))
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * Keep LOH-target dialogue tied to the persisted canonical nomination plan.
 * The legacy social action can still decide whether the LOH discloses anything,
 * but it no longer gets to invent a different target from affinity alone.
 */
function buildLohConsultationSummary(
  state: RootState,
  input: HumanRealityActionInput,
  fallback: string
): string {
  if (input.actionId !== 'ask_loh_target' || state.game.lohId !== input.targetId) return fallback

  const plan =
    state.game.lohSocialPlan?.week === state.game.week &&
    state.game.lohSocialPlan.lohId === state.game.lohId
      ? state.game.lohSocialPlan
      : null
  if (!plan) return fallback

  // Respect genuine refusal/repetition outcomes. Canonical strategy should fix
  // contradictory names, not turn a failed intel action into free information.
  if (
    /shut the conversation down|already answered|kept (?:their|the) plan deliberately vague/i.test(
      fallback
    )
  ) {
    return fallback
  }

  const nominees = state.game.nomineeIds.filter((id) =>
    state.game.players.some(
      (player) => player.id === id && player.status !== 'evicted' && player.status !== 'jury'
    )
  )
  const replacementPending = isLohReplacementPending(state.game)
  const finalBlockLocked =
    !replacementPending &&
    ['pos_ceremony_results', 'social_2', 'live_vote'].includes(state.game.phase)
  const actorHoldsSafety =
    state.game.posWinnerId === input.actorId ||
    getCupidPartnerId(state.game, state.game.posWinnerId) === input.actorId
  const safetyDecisionOpen =
    actorHoldsSafety && ['pos_results', 'pos_ceremony'].includes(state.game.phase)

  if (finalBlockLocked && nominees.length > 0) {
    const lockedTargetId =
      (plan.currentTargetId && nominees.includes(plan.currentTargetId)
        ? plan.currentTargetId
        : null) ?? nominees[0]
    const lockedTarget = playerName(state, lockedTargetId)
    const replacementId =
      plan.backupTargetId &&
      plan.backupTargetId !== lockedTargetId &&
      nominees.includes(plan.backupTargetId)
        ? plan.backupTargetId
        : null
    if (replacementId) {
      return `The block is locked. ${lockedTarget} is my main target; ${playerName(
        state,
        replacementId
      )} is on the block as the replacement.`
    }
    return `The block is locked. ${lockedTarget} is my main target, and that is who I want eliminated.`
  }

  if (safetyDecisionOpen && nominees.length > 0) {
    if (nominees.includes(input.actorId)) {
      const backupId =
        plan.backupTargetId && !nominees.includes(plan.backupTargetId) ? plan.backupTargetId : null
      return backupId
        ? `Obviously save yourself. I am leaning toward ${playerName(state, backupId)} as the replacement.`
        : 'Obviously save yourself. I am keeping the replacement to myself for now.'
    }
    const currentTargetId =
      (plan.currentTargetId && nominees.includes(plan.currentTargetId)
        ? plan.currentTargetId
        : null) ?? nominees[0]
    const backupId =
      plan.backupTargetId && !nominees.includes(plan.backupTargetId) ? plan.backupTargetId : null

    // The Safety holder chooses whether a replacement seat exists. Asking them
    // to create a route that puts *them* on the block is neither actionable nor
    // believable strategy. Keep the underlying plan private and advise them to
    // hold instead of presenting a self-destructive ambush as LOH advice.
    if (backupId === input.actorId) {
      return `Do not use it. I had a backup in mind, but I am not asking you to put yourself at risk.`
    }

    if (backupId) {
      const saveId = nominees.find((id) => id !== currentTargetId) ?? nominees[0]
      return `Use it on ${playerName(state, saveId)}. Let's open the seat and spring an ambush on ${playerName(
        state,
        backupId
      )}.`
    }
    return `No—do not use it. I want the nominations to stay the same, with ${playerName(
      state,
      currentTargetId
    )} as the target.`
  }

  const disclosedTargetId =
    plan.disclosedTargetByPlayerId?.[input.actorId] ?? plan.backupTargetId ?? plan.currentTargetId
  const disclosureOutcome = plan.disclosureOutcomeByPlayerId?.[input.actorId]
  if (disclosureOutcome === 'vague')
    return `${playerName(state, state.game.lohId)} kept the replacement plan vague.`
  if (!disclosedTargetId) return fallback

  const disclosedName = playerName(state, disclosedTargetId)
  if (disclosureOutcome === 'false') {
    return replacementPending
      ? `${disclosedName} is the name I am willing to give you for the open replacement seat.`
      : `${disclosedName} is the name I am willing to give you if Safety opens the block.`
  }
  if (nominees.includes(disclosedTargetId)) {
    return `${disclosedName} is my current target. That is who I want the pressure on.`
  }
  if (plan.backupTargetId === disclosedTargetId && disclosedTargetId !== plan.currentTargetId) {
    const mainTarget = plan.currentTargetId
      ? playerName(state, plan.currentTargetId)
      : 'the current nominee'
    return replacementPending
      ? `Safety opened a seat. I am considering ${disclosedName} as the backup nominee. ${mainTarget} remains my main target.`
      : `${disclosedName} is the replacement nominee if Safety opens the block. ${mainTarget} remains my main target.`
  }
  return `Right now, ${disclosedName} is the person I am watching most closely.`
}

export function executeHumanRealityAction(input: HumanRealityActionInput) {
  return (dispatch: AppDispatch, getState: () => RootState): ExecuteActionResult => {
    const state = getState()
    const action = getActionById(input.actionId)
    const effectiveResources = getEffectiveHumanResources(state, input.actorId)
    const energy = effectiveResources.energy
    if (!action) return result(false, 'Unknown action', energy)
    if (['proposeAlliance', 'ally', 'break_alliance'].includes(input.actionId)) {
      if ((input.targetIds?.length ?? 1) > 1)
        return result(
          false,
          'Choose one partner for a personal pact, or use Your Alliances to agree a group roster.',
          energy
        )
      return executeAction(input.actorId, input.targetId, input.actionId, { source: 'manual' })
    }

    const dramaMode = getEffectiveSocialMode(state) === 'drama'
    const actionTargetMode = resolveActionTargetMode(action, dramaMode)
    const requestedTargetIds = input.targetIds ?? [input.targetId]
    const targetIds =
      actionTargetMode === 'none'
        ? []
        : [...new Set(requestedTargetIds.filter((targetId) => Boolean(targetId)))]
    const resolvedRequiredTargetStatus = dramaMode
      ? (action.dramaRequiredTargetStatus ?? action.requiredTargetStatus)
      : action.requiredTargetStatus
    const isPrimaryBatch = actionTargetMode === 'primary' && targetIds.length > 1
    const batchCompatible =
      actionTargetMode === 'primary' &&
      !resolvedRequiredTargetStatus &&
      input.actionId !== 'proposeAlliance' &&
      input.actionId !== 'consult_alliance'

    if (isPrimaryBatch && !batchCompatible) {
      return result(
        false,
        'This action can only target one housemate at a time.',
        energy,
        0,
        'Invalid selection'
      )
    }

    const executionState = {
      game: state.game,
      settings: state.settings,
      vip: state.vip,
      social: state.social,
    }
    if (isPrimaryBatch) {
      for (const targetId of targetIds) {
        const eligibility = validateSocialExecution(executionState, {
          action,
          actorId: input.actorId,
          targetIds: [targetId],
          subjectId: input.subjectId,
          requireCompleteSelection: true,
        })
        if (!eligibility.eligible) {
          return result(false, eligibility.reason, energy, 0, 'Unavailable')
        }
      }
    } else {
      const eligibility = validateSocialExecution(executionState, {
        action,
        actorId: input.actorId,
        targetIds,
        subjectId: input.subjectId,
        requireCompleteSelection: true,
      })
      if (!eligibility.eligible) {
        return result(false, eligibility.reason, energy, 0, 'Unavailable')
      }
    }

    const baseExecutionCosts = normalizeActionCosts(
      action,
      actionTargetMode === 'multi' ? targetIds.length : actionTargetMode === 'none' ? 0 : 1,
      dramaMode
    )
    const defaultExecutionCosts = isPrimaryBatch
      ? {
          energy: baseExecutionCosts.energy * targetIds.length,
          influence: baseExecutionCosts.influence * targetIds.length,
          info: baseExecutionCosts.info * targetIds.length,
        }
      : baseExecutionCosts
    const requestedExecutionCosts = input.costOverride ?? defaultExecutionCosts

    // During Depression Shock, a housemate may simply shut the conversation
    // down. Resolve this before affordability/execution so a refusal costs the
    // human no energy, influence or information.
    if (
      shouldDepressionShockRefuseConversation({
        gameId: state.game.gameId,
        week: state.game.week,
        actorId: input.actorId,
        targetIds,
        actionId: input.actionId,
      })
    ) {
      const targetNames = targetIds
        .filter((targetId) => targetId !== input.actorId)
        .map(
          (targetId) =>
            state.game.players.find((player) => player.id === targetId)?.name ?? targetId
        )
      const subject = targetNames.length === 1 ? targetNames[0] : 'The housemates'
      return result(
        false,
        `${subject} refused to talk right now. The mood in the House is too low.`,
        energy,
        0,
        'Refused'
      )
    }

    // Classic is a complete, independent social ruleset. It must never create
    // premium Reality events, causal memories, or simulation traces.
    if (!dramaMode) {
      const mode = actionTargetMode
      if (mode === 'multi') {
        return executeGroupAction(input.actorId, targetIds, input.actionId, {
          source: 'manual',
          costOverride: requestedExecutionCosts,
        })
      }
      if (targetIds.length > 1) {
        return targetIds
          .map((targetId, index) =>
            executeAction(input.actorId, targetId, input.actionId, {
              source: 'manual',
              subjectId: input.subjectId,
              waiveCosts: index > 0,
              costOverride:
                index === 0 ? requestedExecutionCosts : { energy: 0, influence: 0, info: 0 },
            })
          )
          .reduce<ExecuteActionResult>(
            (combined, entry, index) => ({
              success: combined.success || entry.success,
              summary:
                index === targetIds.length - 1
                  ? `Reached ${targetIds.length} housemates.`
                  : combined.summary,
              newEnergy: entry.newEnergy,
              delta: (combined.delta * index + entry.delta) / Math.max(1, index + 1),
              label: entry.label,
              score: (combined.score * index + entry.score) / Math.max(1, index + 1),
              targetDeltas: {
                ...(combined.targetDeltas ?? {}),
                [targetIds[index]]: entry.delta,
              },
            }),
            result(false, '', energy)
          )
      }
      const classicResult = executeAction(
        input.actorId,
        mode === 'none' ? input.actorId : input.targetId,
        input.actionId,
        {
          source: 'manual',
          subjectId: input.subjectId,
          costOverride: requestedExecutionCosts,
        }
      )
      return {
        ...classicResult,
        summary: buildLohConsultationSummary(getState(), input, classicResult.summary),
      }
    }

    const contract = getRealityActionContract(input.actionId)
    if (!contract) return result(false, 'Unknown action', energy)

    if (input.actionId === 'proposeAlliance' && input.targetId) {
      const alreadyProposedThisPhase = state.social.reality.events.some(
        (event) =>
          event.day === state.game.week &&
          event.phase === getWeekendActivityPhase(state) &&
          event.actorId === input.actorId &&
          event.actionId === 'proposeAlliance' &&
          event.targetIds.includes(input.targetId)
      )
      if (alreadyProposedThisPhase) {
        const targetName =
          state.game.players.find((player) => player.id === input.targetId)?.name ?? 'them'
        return result(
          false,
          `You already approached ${targetName} about an alliance this phase. Give the conversation time before trying again.`,
          energy,
          0,
          'Already approached'
        )
      }
    }

    const consultationAlliance =
      input.actionId === 'consult_alliance' && input.targetId
        ? input.consultationAllianceId
          ? (() => {
              const alliance = state.social.reality.alliances[input.consultationAllianceId]
              return alliance &&
                (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
                alliance.memberIds.includes(input.actorId) &&
                alliance.memberIds.includes(input.targetId)
                ? alliance
                : null
            })()
          : findRealityAllianceForConsultation(state.social.reality, input.actorId, input.targetId)
        : null
    if (input.actionId === 'consult_alliance' && !consultationAlliance) {
      return result(false, 'You do not share an active alliance with that housemate.', energy)
    }
    const selectedConsultationAdvisorIds =
      input.actionId === 'consult_alliance' && input.consultationScope === 'selected'
        ? targetIds
        : undefined
    if (consultationAlliance && selectedConsultationAdvisorIds) {
      const allShareThisAlliance = selectedConsultationAdvisorIds.every((advisorId) =>
        consultationAlliance.memberIds.includes(advisorId)
      )
      if (!allShareThisAlliance) {
        return result(
          false,
          'Selected allies must all belong to the same alliance with you.',
          energy,
          0,
          'Invalid consultation group'
        )
      }
    }
    if (consultationAlliance) {
      const agenda = getAllianceConsultationAgenda(state, input.actorId)
      const invitedIds = selectedConsultationAdvisorIds
        ? [input.actorId, ...selectedConsultationAdvisorIds]
        : [input.actorId, ...activeAllianceAdvisors(state, consultationAlliance, input.actorId)]
      const invited = new Set(invitedIds)
      const alreadyMet = state.social.reality.events.some(
        (event) =>
          event.type === 'ALLIANCE_STRATEGY_MEETING' &&
          event.day === state.game.week &&
          event.phase === getWeekendActivityPhase(state) &&
          event.reason.startsWith(`strategy_meeting:${consultationAlliance.id}:${agenda}:`) &&
          event.participantIds.length === invited.size &&
          event.participantIds.every((participantId) => invited.has(participantId))
      )
      if (alreadyMet) {
        return result(
          false,
          'You already held an alliance huddle on this decision today.',
          energy,
          0,
          'Already consulted'
        )
      }
    }
    const executionTargetIds = consultationAlliance
      ? selectedConsultationAdvisorIds
        ? activeAllianceAdvisors(state, consultationAlliance, input.actorId).filter((id) =>
            selectedConsultationAdvisorIds.includes(id)
          )
        : activeAllianceAdvisors(state, consultationAlliance, input.actorId)
      : targetIds
    if (consultationAlliance && executionTargetIds.length === 0) {
      return result(false, 'No active alliance member is available for a huddle.', energy)
    }
    const consultationPlan = consultationAlliance
      ? buildAllianceConsultationPlan(
          state,
          consultationAlliance,
          input.actorId,
          selectedConsultationAdvisorIds
        )
      : null
    if (consultationAlliance && !consultationPlan) {
      return result(
        false,
        'There is no useful alliance strategy question to resolve right now.',
        energy
      )
    }

    // The Reality contract stores a representative one-target price. Dynamic
    // multi-target actions (notably Group Chat) must be checked against their
    // full atomic price before the causal Reality domain is allowed to mutate.
    // Otherwise a large group action could create memories/relationship effects
    // and only discover afterward that the player could not afford it.
    const executionCosts = requestedExecutionCosts
    const influence = effectiveResources.influence
    const info = effectiveResources.info
    if (
      energy < executionCosts.energy ||
      influence < executionCosts.influence ||
      info < executionCosts.info
    ) {
      return result(false, 'Insufficient resources. Nothing was spent.', energy, 0, 'Unavailable')
    }

    const pregnancyResult = executePregnancyFlow(state, input, dispatch, executionCosts)
    if (pregnancyResult) return pregnancyResult

    const direction =
      executionTargetIds.length === 0
        ? 'SELF'
        : executionTargetIds.length > 1
          ? 'GROUP'
          : 'HUMAN_TO_AI'
    let simulation = state.social.realitySimulation
    if (!simulation.rng) {
      simulation = createInitialRealitySimulationState(
        deriveRealitySimulationSeed(state.game.seed ?? 0, state.game.gameId ?? '')
      )
    }
    const context = buildContext(state)
    const orchestration = runRealityOpportunity({
      domain: state.social.reality,
      simulation,
      opportunity: {
        actorId: input.actorId,
        direction,
        context,
        actors: buildActors(state),
        candidates: [
          {
            action: contract,
            targetIds: executionTargetIds,
            subjectId: input.subjectId,
            // An active alliance huddle is a convened group meeting. Disagreement
            // belongs in each member's strategic read, not in a random refusal by
            // whichever member the player tapped to identify the alliance.
            acceptanceChanceOverride: consultationAlliance
              ? 1
              : getPhaseRepetitionChance(state, input),
          },
        ],
      },
    })
    if (!orchestration.event) {
      dispatch(replaceRealityDomain(orchestration.domain))
      dispatch(replaceRealitySimulation(orchestration.simulation))
      const reason =
        orchestration.response?.kind === 'COUNTER'
          ? 'They made a counteroffer.'
          : orchestration.selectedActionId
            ? 'They were not ready to resolve that conversation.'
            : orchestration.simulation.trace.at(-1)?.reason === 'no_eligible_candidate'
              ? 'That action is not valid in this situation.'
              : 'No action was selected.'
      return result(false, reason, energy, 0, orchestration.response?.kind ?? 'Unavailable')
    }
    const resolved = orchestration.event.outcome !== 'FAILURE'
    // Compatibility "success" is intentionally stricter than "the conversation
    // produced a Reality event". COUNTERED and PARTIAL outcomes still cost the
    // action and remain in Reality memory, but they must not receive full legacy
    // success rewards or trigger success-only downstream adapters.
    const resolvedAsSuccess = orchestration.event.outcome === 'SUCCESS'
    const targetCompatibilitySucceeded = (targetId: string): boolean => {
      const targetResponse = orchestration.targetResponses?.find(
        (entry) => entry.targetId === targetId
      )?.response
      return targetResponse
        ? targetResponse.accepted || contract.purposes.includes('CONFLICT')
        : resolvedAsSuccess
    }
    let allianceConsultationSummary: string | null = null
    if (resolvedAsSuccess && consultationPlan) {
      holdRealityAllianceStrategyMeeting(orchestration.domain, {
        allianceId: consultationPlan.allianceId,
        callerId: input.actorId,
        attendeeIds: consultationPlan.attendeeIds,
        targetIds: consultationPlan.targetIds,
        fallbackTargetIds: consultationPlan.fallbackTargetIds,
        planIds: consultationPlan.planIds,
        agenda: consultationPlan.agenda,
        at: { day: state.game.week, phase: state.game.phase },
        sourceEventId: orchestration.event.id,
        excusedAbsentIds: consultationPlan.excusedAbsentIds,
        memberPlanBeliefs: consultationPlan.memberPlanBeliefs,
      })
      allianceConsultationSummary = consultationPlan.summary
    }
    const dangerWarningDiscovered =
      resolved &&
      input.actionId === 'warn_about_danger' &&
      Boolean(state.game.lohId) &&
      state.game.lohId !== input.actorId &&
      isDangerWarningDiscovered(state, input)
    if (dangerWarningDiscovered && state.game.lohId) {
      applyRealityRelationshipChange(orchestration.domain, {
        sourceId: state.game.lohId,
        targetId: input.actorId,
        deltas: { trust: -7, warmth: -4, suspicion: 9, resentment: 4, familiarity: 2 },
        day: state.game.week,
        phase: state.game.phase,
        eventId: `warning-discovered:${state.game.week}:${input.actorId}:${input.targetId}`,
        anchor: 'negative',
      })
    }
    const compatibility = consultationAlliance
      ? executeAction(input.actorId, input.targetId, input.actionId, {
          source: 'manual',
          subjectId: input.subjectId,
          outcome: resolvedAsSuccess ? 'success' : 'failure',
          repetitionAlreadyResolved: true,
          costOverride: executionCosts,
        })
      : direction === 'GROUP' && actionTargetMode === 'multi'
        ? executeGroupAction(input.actorId, executionTargetIds, input.actionId, {
            source: 'manual',
            outcome: resolvedAsSuccess ? 'success' : 'failure',
            targetOutcomes: Object.fromEntries(
              executionTargetIds.map((targetId) => [
                targetId,
                targetCompatibilitySucceeded(targetId) ? 'success' : 'failure',
              ])
            ),
            costOverride: executionCosts,
          })
        : direction === 'GROUP'
          ? executionTargetIds
              .map((targetId, index) =>
                executeAction(input.actorId, targetId, input.actionId, {
                  source: 'manual',
                  subjectId: input.subjectId,
                  outcome: targetCompatibilitySucceeded(targetId) ? 'success' : 'failure',
                  repetitionAlreadyResolved: true,
                  waiveCosts: index > 0,
                  costOverride: index === 0 ? executionCosts : { energy: 0, influence: 0, info: 0 },
                })
              )
              .reduce<ExecuteActionResult>(
                (combined, entry, index) => ({
                  success: combined.success || entry.success,
                  summary:
                    index === executionTargetIds.length - 1
                      ? `Reached ${executionTargetIds.length} housemates.`
                      : combined.summary,
                  newEnergy: entry.newEnergy,
                  delta: (combined.delta * index + entry.delta) / Math.max(1, index + 1),
                  label: orchestration.response?.kind ?? entry.label,
                  score: (combined.score * index + entry.score) / Math.max(1, index + 1),
                  targetDeltas: {
                    ...(combined.targetDeltas ?? {}),
                    [executionTargetIds[index]]: entry.delta,
                  },
                }),
                result(false, '', energy)
              )
          : executeAction(
              input.actorId,
              direction === 'SELF' ? input.actorId : input.targetId,
              input.actionId,
              {
                source: 'manual',
                subjectId: input.subjectId,
                outcome: resolvedAsSuccess ? 'success' : 'failure',
                repetitionAlreadyResolved: true,
                costOverride: executionCosts,
              }
            )
    // Legacy execution preserves specialized ceremony copy and existing game
    // adapters. Restore the causal v3 world afterward so its directed result
    // is not counted a second time by the compatibility relationship write.
    dispatch(replaceRealityDomain(orchestration.domain))
    dispatch(replaceRealitySimulation(orchestration.simulation))
    // An accepted human alliance is authoritative in both relationship models.
    // Projecting the Reality domain can otherwise leave one legacy direction
    // just below the threshold used by badges and action eligibility.
    if (resolvedAsSuccess && input.actionId === 'proposeAlliance' && targetIds.length === 1) {
      dispatch(
        updateRelationship({
          source: input.actorId,
          target: input.targetId,
          delta: 0,
          tags: [ALLIANCE_TAG],
          // The compatibility action already recorded the player-authored
          // alliance transition and its one canonical resource reward. This
          // second write only repairs the post-projection legacy affinity/tag
          // representation, so it must not pay the transition a second time.
          actionSource: 'system',
        })
      )
      dispatch(
        updateRelationship({
          source: input.targetId,
          target: input.actorId,
          delta: 0,
          tags: [ALLIANCE_TAG],
          actionSource: 'system',
        })
      )
    }
    const cupidRipplePartnerNames = resolvedAsSuccess
      ? applyCupidPartnerRipple(
          dispatch,
          state,
          input.actorId,
          executionTargetIds,
          compatibility.targetDeltas,
          compatibility.delta
        )
      : null
    const allianceProposalCountered =
      input.actionId === 'proposeAlliance' && orchestration.response?.kind === 'COUNTER'
    let baseSummary = allianceConsultationSummary ?? compatibility.summary
    if (allianceProposalCountered) {
      const targetName =
        state.game.players.find((player) => player.id === input.targetId)?.name ?? 'They'
      baseSummary = `${targetName} made a counteroffer. No alliance was formed yet.`
    } else if (input.actionId === 'warn_about_danger' && resolved) {
      const targetName =
        state.game.players.find((player) => player.id === input.targetId)?.name ?? 'They'
      baseSummary = dangerWarningDiscovered
        ? `${targetName} appreciated the warning, but the LOH found out you leaked the plan.`
        : `${targetName} appreciated the warning and kept your source private.`
    }
    const latestState = getState()
    return {
      ...compatibility,
      summary: `${buildLohConsultationSummary(latestState, input, baseSummary)}${
        cupidRipplePartnerNames
          ? ` The exchange is likely to travel through the Cupid bond to ${cupidRipplePartnerNames}.`
          : ''
      }`,
      label: orchestration.response?.kind ?? compatibility.label,
      score: orchestration.score?.total ?? compatibility.score,
    }
  }
}
