import { createDraft, finishDraft } from 'immer'
import type { AppDispatch, RootState } from '../store/store'
import { getEligibleNominationTargets } from '../store/gameSlice'
import { adoptConsensualFacade } from '../store/lohNominationPlanning'
import { createIncomingInteraction } from './incomingInteractionFactory'
import { isIncomingInteractionActionable } from './socialRuntimeConfig'
import { appendRealityEvent } from './reality/events'
import { expireRealityFacadeAgreements } from './reality/facadeAgreements'
import type { RealityFacadeAgreement } from './reality/types'
import { getSocialPersonality } from './socialPersonalityBank'
import { seededUnit } from './socialStrategyShared'
import {
  applyEnergyDelta,
  applyInfluenceDelta,
  commitRealityDomainUpdate,
  pushIncomingInteraction,
  recordSocialAction,
  resolveIncomingInteraction,
} from './socialSlice'
import type { IncomingInteraction, IncomingInteractionResponseType } from './types'

export const FACADE_NEGOTIATION_SCENARIO = 'facade_nomination_request'

export function facadeNominationWasUsed(
  state: RootState,
  agreement: RealityFacadeAgreement
): boolean {
  // Standard social play keeps the official block in GameState rather than
  // authoring Reality ceremony events. Both formats must resolve the agreement.
  const recorded = [
    state.game.currentWeekNominationRecord,
    state.game.lastWeekNominationRecord,
  ].some(
    (record) =>
      record?.week === agreement.day &&
      record.lohId === agreement.lohId &&
      record.nomineeIds.includes(agreement.facadeId)
  )
  return (
    recorded ||
    state.social.reality.events.some(
      (event) =>
        event.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
        event.day === agreement.day &&
        event.actorId === agreement.lohId &&
        event.tags.includes(`consented_nominee:${agreement.facadeId}`)
    )
  )
}

function liveFacadeWindow(state: RootState): boolean {
  const game = state.game
  return (
    game.mode !== 'survival' &&
    game.voxPopuli?.status !== 'active' &&
    game.cupidArrow?.status !== 'active' &&
    !game.coLohIds?.length &&
    !game.doubleEviction?.weekActive &&
    !game.weekendInterlude?.active &&
    !game.publicModeEnabled &&
    !(game.depressionShock?.activeDay ?? 0) &&
    ['social_1', 'nominations'].includes(game.phase)
  )
}

function recordFacadeEvent(
  state: RootState['social']['reality'],
  agreement: RealityFacadeAgreement,
  phase: string
): void {
  appendRealityEvent(state, {
    day: agreement.day,
    phase,
    type: `FACADE_AGREEMENT_${agreement.status}`,
    actorId: agreement.lohId,
    targetIds: [agreement.facadeId],
    participantIds: [agreement.lohId, agreement.facadeId],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: agreement.status === 'ACCEPTED' ? 'SUCCESS' : 'SYSTEM',
    reason: 'A nomination conversation; consent never guarantees Safety or the eviction vote.',
    tags: ['FACADE', agreement.status],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: false,
  })
}

/** A pawn judges the offer from their own trust and relationships, not hidden vote totals. */
export function aiFacadeAcceptanceChance(
  state: RootState,
  lohId: string,
  facadeId: string
): number {
  const edge = state.social.reality.relationships[facadeId]?.[lohId]
  if (!edge || edge.trust < 6 || edge.resentment >= 35 || edge.suspicion >= 45) return 0
  const alive = state.game.players.filter((player) => !['evicted', 'jury'].includes(player.status))
  if (alive.length <= 6) return 0
  const support = alive.filter(
    (player) =>
      player.id !== lohId &&
      player.id !== facadeId &&
      (state.social.reality.relationships[facadeId]?.[player.id]?.trust ?? 0) >= 15
  ).length
  const personality = getSocialPersonality(facadeId)
  return Math.max(
    0.08,
    Math.min(
      0.78,
      0.18 +
        edge.trust * 0.004 +
        edge.loyalty * 0.002 +
        Math.min(3, support) * 0.055 +
        personality.riskTolerance * 0.14 -
        edge.suspicion * 0.003
    )
  )
}

/** One optional, paid negotiation per LOH/day. Never silently enrolls a human pawn. */
export function runAiFacadeNegotiation(dispatch: AppDispatch, getState: () => RootState): void {
  const state = getState()
  const expired = Object.values(state.social.reality.facadeAgreements).some(
    (agreement) =>
      agreement.day < state.game.week && ['ACCEPTED', 'PROPOSED'].includes(agreement.status)
  )
  if (expired) {
    const domain = createDraft(state.social.reality)
    for (const agreement of Object.values(domain.facadeAgreements)) {
      if (agreement.day >= state.game.week || agreement.status !== 'ACCEPTED') continue
      const used = facadeNominationWasUsed(state, agreement)
      const nominee = state.game.players.find((player) => player.id === agreement.facadeId)
      if (used && nominee) {
        // A failed pawn arrangement is not proof that the LOH betrayed anyone.
        agreement.status = ['evicted', 'jury'].includes(nominee.status) ? 'FAILED' : 'FULFILLED'
        recordFacadeEvent(domain, agreement, state.game.phase)
      }
    }
    expireRealityFacadeAgreements(domain, state.game.week)
    dispatch(
      commitRealityDomainUpdate({ domain: finishDraft(domain), changedRelationshipPairs: [] })
    )
  }
  if (!liveFacadeWindow(state) || state.game.week < 2) return
  const { game, social } = state
  const loh = game.players.find((player) => player.id === game.lohId)
  const plan = game.lohNominationPlan
  if (
    !loh ||
    loh.isUser ||
    !plan ||
    plan.week !== game.week ||
    plan.lohId !== loh.id ||
    plan.status !== 'planned' ||
    Object.values(social.reality.facadeAgreements).some(
      (agreement) => agreement.day === game.week && agreement.lohId === loh.id
    )
  )
    return
  if ((social.energyBank[loh.id] ?? 0) < 1 || (social.influenceBank[loh.id] ?? 0) < 1) return
  const initiative = 0.35 + getSocialPersonality(loh.id).strategicCalculation * 0.35
  if (seededUnit(game.seed, `facade-initiative:${game.week}:${loh.id}`) > initiative) return

  const candidates = getEligibleNominationTargets(game, loh.id)
    .filter(
      (player) =>
        player.id !== plan.targetId &&
        player.id !== plan.backupTargetId &&
        player.id !== game.posWinnerId
    )
    .map((player) => {
      const edge = social.reality.relationships[loh.id]?.[player.id]
      return {
        player,
        score:
          (edge?.trust ?? 0) * 0.4 +
          (edge?.warmth ?? 0) * 0.2 +
          (plan.pawnIds.includes(player.id) ? 8 : 0) -
          ((player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)) * 5,
      }
    })
    .filter(({ player }) => player.isUser || aiFacadeAcceptanceChance(state, loh.id, player.id) > 0)
    .sort((a, b) => b.score - a.score || a.player.id.localeCompare(b.player.id))
  const candidate = candidates[0]?.player
  if (!candidate) return
  if (
    candidate.isUser &&
    (social.incomingInteractions ?? []).filter(
      (entry) => !entry.resolved && isIncomingInteractionActionable(entry)
    ).length >= 4
  )
    return
  const id = `ai-facade:${game.week}:${loh.id}:${candidate.id}`
  const agreement: RealityFacadeAgreement = {
    id,
    day: game.week,
    lohId: loh.id,
    facadeId: candidate.id,
    intendedEvicteeId: plan.targetId,
    stage: 'INITIAL_NOMINATION',
    status: 'PROPOSED',
    voluntary: true,
    sourceInteractionId: id,
  }
  const domain = createDraft(getState().social.reality)
  if (!candidate.isUser)
    agreement.status =
      seededUnit(game.seed, `facade-consent:${id}`) <
      aiFacadeAcceptanceChance(state, loh.id, candidate.id)
        ? 'ACCEPTED'
        : 'DECLINED'
  domain.facadeAgreements[id] = agreement
  recordFacadeEvent(domain, agreement, game.phase)
  dispatch(applyEnergyDelta({ playerId: loh.id, delta: -1 }))
  dispatch(applyInfluenceDelta({ playerId: loh.id, delta: -1 }))
  dispatch(commitRealityDomainUpdate({ domain: finishDraft(domain), changedRelationshipPairs: [] }))
  dispatch(
    recordSocialAction({
      entry: {
        actionId: 'negotiate_facade',
        actorId: loh.id,
        targetId: candidate.id,
        cost: 1,
        costs: { energy: 1, influence: 1, info: 0 },
        delta: 0,
        outcome: 'success',
        newEnergy: getState().social.energyBank[loh.id] ?? 0,
        timestamp: Date.now(),
        week: game.week,
        phase: game.phase,
        source: 'system',
        narrative: candidate.isUser
          ? 'Asked for a voluntary façade arrangement; no consent yet.'
          : `A voluntary façade discussion was ${agreement.status.toLowerCase()}. The nominee remains at risk.`,
      },
    })
  )
  if (agreement.status === 'ACCEPTED')
    dispatch(
      adoptConsensualFacade({
        lohId: loh.id,
        facadeId: candidate.id,
        intendedEvicteeId: plan.targetId,
      })
    )
  if (candidate.isUser) {
    const targetName =
      game.players.find((player) => player.id === plan.targetId)?.name ?? 'my target'
    dispatch(
      pushIncomingInteraction(
        createIncomingInteraction({
          id,
          fromId: loh.id,
          type: 'deal_offer',
          week: game.week,
          phase: game.phase,
          mode: game.dramaSocialMode ? 'drama' : 'normal',
          responsePolicy: 'required',
          deadlinePhase: 'nominations',
          text: `I want ${targetName} out. Would you agree to take a nomination seat as a façade nominee? You would still face real eviction risk; I cannot promise Safety or other people's votes. You can say no.`,
          payload: {
            scenarioKey: FACADE_NEGOTIATION_SCENARIO,
            facadeAgreementId: id,
            subjectId: plan.targetId,
            subjectName: targetName,
            dedupeGroup: FACADE_NEGOTIATION_SCENARIO,
          },
        })
      )
    )
  }
}

export function resolveAiFacadeReply(
  dispatch: AppDispatch,
  getState: () => RootState,
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType
): boolean {
  if (interaction.payload?.scenarioKey !== FACADE_NEGOTIATION_SCENARIO) return false
  const state = getState()
  const agreementId = interaction.payload?.facadeAgreementId
  const agreement =
    typeof agreementId === 'string' ? state.social.reality.facadeAgreements[agreementId] : undefined
  const human = state.game.players.find((player) => player.isUser)
  if (
    !agreement ||
    agreement.status !== 'PROPOSED' ||
    agreement.facadeId !== human?.id ||
    agreement.lohId !== interaction.fromId
  ) {
    const text = 'This façade offer is no longer available. No new agreement was made.'
    dispatch(
      resolveIncomingInteraction({
        interactionId: interaction.id,
        resolvedWith: 'neutral',
        outcomeText: text,
        receipt: { kind: 'gameplay', text },
        resolvedAt: Date.now(),
        resolvedWeek: state.game.week,
      })
    )
    return true
  }
  const live =
    liveFacadeWindow(state) &&
    agreement.day === state.game.week &&
    state.game.lohId === agreement.lohId &&
    state.game.lohNominationPlan?.targetId === agreement.intendedEvicteeId
  const accepted = live && responseType === 'accept'
  const domain = createDraft(state.social.reality)
  domain.facadeAgreements[agreement.id].status = accepted
    ? 'ACCEPTED'
    : !live || responseType === 'ignore'
      ? 'EXPIRED'
      : 'DECLINED'
  recordFacadeEvent(domain, domain.facadeAgreements[agreement.id], state.game.phase)
  dispatch(commitRealityDomainUpdate({ domain: finishDraft(domain), changedRelationshipPairs: [] }))
  if (accepted)
    dispatch(
      adoptConsensualFacade({
        lohId: agreement.lohId,
        facadeId: agreement.facadeId,
        intendedEvicteeId: agreement.intendedEvicteeId!,
      })
    )
  const text = accepted
    ? 'You agreed to be a façade nominee for this ceremony. You can still be evicted.'
    : 'No façade agreement was made. The LOH still controls nominations, and your silence was not consent.'
  dispatch(
    resolveIncomingInteraction({
      interactionId: interaction.id,
      resolvedWith: responseType,
      outcomeText: text,
      receipt: { kind: 'gameplay', text },
      resolvedAt: Date.now(),
      resolvedWeek: state.game.week,
    })
  )
  return true
}
