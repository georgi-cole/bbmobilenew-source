import { isMissionBackupProtected, isMissionOpeningProtected } from '../bb/missionPowers'
import { isBellaHeirImmune } from '../features/twists/bellasWill'
import { isSameCupidPair } from '../features/twists/cupidArrow'
import { canPlayerTargetPlayer, getCanonicalVoterId } from '../store/criticalGameRules'
import type { GameState } from '../types'
import {
  compareIncomingClock,
  getScheduledIncomingInteractionClock,
} from './incomingInteractionDeadline'
import {
  getIncomingInteractionValidityRule,
  type IncomingInteractionValidityRule,
} from './incomingInteractionValidityBank'
import { INCOMING_INTEL_LEAD } from './incomingIntelLead'
import { isLohReplacementPending } from './lohReplacementWindow'
import type { IncomingInteraction, ScheduledIncomingInteraction } from './types'
import type { RealityDomainState } from './reality/types'
import {
  arePlayersEligibleForCurrentUse,
  isRealityFactEligibleForCurrentUse,
} from './intelligenceEligibility'

interface InteractionValidityPlayer {
  id: string
  status: string
  isUser?: boolean
}

export interface InteractionValidityGameState extends Partial<
  Pick<
    GameState,
    | 'aiReplacementStep'
    | 'awaitingHumanVote'
    | 'awaitingMissionImmunityOffer'
    | 'batteryLowVoteEffects'
    | 'bellaWill'
    | 'coLohNomineeByCoLohId'
    | 'coLohReplacementOwnerId'
    | 'lastHohCompFinisherId'
    | 'missionPowers'
    | 'povSavedId'
    | 'publicModeEnabled'
    | 'replacementNeeded'
    | 'storeNominationProtections'
    | 'twinShockResolution'
  >
> {
  phase?: string
  week?: number
  mode?: string
  lohId?: string | null
  coLohIds?: string[] | null
  awaitingNominations?: boolean
  awaitingCoLohNomination?: boolean
  votes?: Record<string, string>
  posWinnerId?: string | null
  nomineeIds?: string[]
  tiedNomineeIds?: string[] | null
  awaitingTieBreak?: boolean
  awaitingPosTieBreak?: boolean
  replacementNomineeIds?: string[]
  doubleEviction?: { weekActive?: boolean }
  lohNominationPlan?: {
    week?: number
    lohId?: string | null
    revision?: number
    isDoubleElimination?: boolean
  } | null
  awaitingPovDecision?: boolean
  awaitingPovSaveTarget?: boolean
  specialVeto?: {
    activeType?: string | null
    awaitingHolderReplacement?: boolean
    awaitingCoupReplacement1?: boolean
    awaitingCoupReplacement2?: boolean
    coupReplacement1Id?: string | null
    awaitingVipSecondUseDecision?: boolean
    awaitingVipSecondSaveTarget?: boolean
  }
  voxPopuliActive?: boolean
  voxPopuli?: { status?: string } | null
  povProtectedIds?: string[]
  cupidArrow?: {
    status?: 'inactive' | 'scheduled' | 'active' | 'broken'
    pairs?: Array<{ memberIds: [string, string] }>
  }
  weekendInterlude?: {
    active?: boolean
    finaleWeekend?: boolean
    stage?: string
    weekendNumber?: number | null
    afterDay?: number
    weekendDay?: number
  } | null
  players?: InteractionValidityPlayer[]
}

function getScenarioKey(interaction: IncomingInteraction): string | null {
  return typeof interaction.payload?.scenarioKey === 'string'
    ? interaction.payload.scenarioKey
    : null
}

const ALLIANCE_STRATEGY_SCENARIOS = new Set([
  'alliance_nomination_pitch',
  'alliance_vox_ballot_pitch',
  'alliance_safety_pitch',
  'alliance_vote_pitch',
  'alliance_power_nomination_huddle',
  'alliance_power_safety_huddle',
])

const NOMINATION_BLOCK_BOUND_SCENARIOS = new Set([
  'nominee_campaign',
  'post_veto_campaign',
  'live_vote_pitch',
  'alliance_vote_pitch',
  'safety_holder_consults_loh',
  'loh_consults_safety_holder',
  'safety_plan_inquiry',
  'safety_hold_request',
])

function violatesNominationBlockContext(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState,
  linkedNomineeIds?: readonly string[]
): boolean {
  const scenarioKey = getScenarioKey(interaction)
  if (!scenarioKey) return false
  const directVote = getIncomingInteractionValidityRule(scenarioKey)?.directDecision === 'vote'
  const snapshot =
    interaction.payload?.nominationBlockIds ??
    interaction.payload?.nomineeIds ??
    (directVote ? linkedNomineeIds : undefined)
  const changed =
    Array.isArray(snapshot) &&
    snapshot.every((id): id is string => typeof id === 'string') &&
    (snapshot.length !== (game.nomineeIds ?? []).length ||
      snapshot.some((id) => !(game.nomineeIds ?? []).includes(id)))
  if ((directVote || NOMINATION_BLOCK_BOUND_SCENARIOS.has(scenarioKey)) && changed) return true
  if (scenarioKey === 'alliance_vote_pitch') {
    const subjectId = interaction.payload?.subjectId
    return typeof subjectId !== 'string' || !(game.nomineeIds ?? []).includes(subjectId)
  }
  return false
}

function violatesLohNominationPlanContext(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState
): boolean {
  if (getScenarioKey(interaction) !== 'alliance_power_nomination_huddle') return false
  const snapshot = interaction.payload?.lohNominationPlanSnapshot
  if (!snapshot || typeof snapshot !== 'object') return false

  const planSnapshot = snapshot as Record<string, unknown>
  if (
    typeof planSnapshot.week !== 'number' ||
    typeof planSnapshot.lohId !== 'string' ||
    typeof planSnapshot.revision !== 'number'
  ) {
    return true
  }

  const currentPlan = game.lohNominationPlan
  return Boolean(
    !currentPlan ||
    currentPlan.week !== planSnapshot.week ||
    currentPlan.lohId !== planSnapshot.lohId ||
    (currentPlan.isDoubleElimination === true) !== (game.doubleEviction?.weekActive === true) ||
    (currentPlan.revision ?? 1) !== planSnapshot.revision
  )
}

function isAllianceProtectedGameUnit(
  game: InteractionValidityGameState,
  allianceMemberIds: readonly string[],
  playerId: string
): boolean {
  if (allianceMemberIds.includes(playerId)) return true
  if (game.cupidArrow?.status !== 'active') return false
  const pair = game.cupidArrow.pairs?.find((entry) => entry.memberIds.includes(playerId))
  const partnerId = pair?.memberIds.find((id) => id !== playerId)
  return partnerId !== undefined && allianceMemberIds.includes(partnerId)
}

function violatesRealityAllianceContext(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState,
  reality?: RealityDomainState
): boolean {
  if (!reality || !ALLIANCE_STRATEGY_SCENARIOS.has(getScenarioKey(interaction) ?? '')) return false

  const allianceId =
    typeof interaction.payload?.allianceId === 'string' ? interaction.payload.allianceId : null
  const human = humanPlayer(game)
  if (!allianceId || !human) return true

  const alliance = reality.alliances[allianceId]
  if (
    !alliance ||
    (alliance.status !== 'ACTIVE' && alliance.status !== 'PROBATIONARY') ||
    !alliance.memberIds.includes(interaction.fromId) ||
    !alliance.memberIds.includes(human.id)
  ) {
    return true
  }

  const subjectIds = [
    interaction.payload?.subjectId,
    interaction.payload?.secondarySubjectId,
  ].filter((value): value is string => typeof value === 'string')
  if (
    subjectIds.some((subjectId) => {
      const subject = getPlayer(game, subjectId)
      return !subject || isEvictedOrGone(subject)
    })
  ) {
    return true
  }
  if (
    subjectIds
      .filter(
        (id) =>
          !['alliance_safety_pitch', 'alliance_power_safety_huddle'].includes(
            getScenarioKey(interaction) ?? ''
          ) || id === interaction.payload?.secondarySubjectId
      )
      .some((subjectId) => isAllianceProtectedGameUnit(game, alliance.memberIds, subjectId))
  ) {
    return true
  }

  const scenarioKey = getScenarioKey(interaction)
  const groupAgenda =
    scenarioKey === 'alliance_power_nomination_huddle'
      ? 'nominations'
      : scenarioKey === 'alliance_power_safety_huddle'
        ? 'safety'
        : null
  if (groupAgenda) {
    const day = game.week ?? interaction.createdWeek
    const alreadyMet = reality.events.some(
      (event) =>
        event.type === 'ALLIANCE_STRATEGY_MEETING' &&
        event.day === day &&
        event.reason.startsWith(`strategy_meeting:${alliance.id}:${groupAgenda}:`)
    )
    if (alreadyMet) return true
  }

  return false
}

function getPlayer(
  game: InteractionValidityGameState,
  playerId: string
): InteractionValidityPlayer | null {
  return game.players?.find((player) => player.id === playerId) ?? null
}

function isEvictedOrGone(player: InteractionValidityPlayer | null): boolean {
  if (!player) return false
  return player.status === 'evicted' || player.status === 'jury'
}

function isFinaleReunionGuestMessage(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState,
  sender: InteractionValidityPlayer | null
): boolean {
  const weekend = game.weekendInterlude
  return Boolean(
    getScenarioKey(interaction) === 'finale_reunion_guest' &&
    weekend?.active === true &&
    weekend.finaleWeekend === true &&
    weekend.weekendDay === 2 &&
    weekend.stage === 'finale_reunion_social' &&
    interaction.payload?.weekendDay === weekend.weekendDay &&
    (interaction.payload?.weekendNumber ?? null) === (weekend.weekendNumber ?? null) &&
    interaction.payload?.weekendAfterDay === weekend.afterDay &&
    sender &&
    isEvictedOrGone(sender)
  )
}

function isNominee(game: InteractionValidityGameState, playerId: string): boolean {
  // Status is a presentation/history field and can legitimately lag the live
  // block (for example, a former nominee who won Safety). Strategic dialogue
  // must only use the canonical ceremony result.
  return (game.nomineeIds ?? []).includes(playerId)
}

function sharesOffice(
  game: InteractionValidityGameState,
  officeHolderId: string | null,
  playerId: string
): boolean {
  return officeHolderId === playerId || isSameCupidPair(game, officeHolderId, playerId)
}

function isCurrentLoh(game: InteractionValidityGameState, playerId: string): boolean {
  if (game.voxPopuliActive || game.voxPopuli?.status === 'active') return false
  if (game.coLohIds?.length) return game.coLohIds.includes(playerId)
  if (game.lohId !== undefined) return sharesOffice(game, game.lohId, playerId)
  return getPlayer(game, playerId)?.status.includes('loh') === true
}

function isEligibleVoter(game: InteractionValidityGameState, playerId: string): boolean {
  const player = getPlayer(game, playerId)
  return Boolean(
    player &&
    !isEvictedOrGone(player) &&
    !game.voxPopuliActive &&
    game.voxPopuli?.status !== 'active' &&
    !isNominee(game, playerId) &&
    !isCurrentLoh(game, playerId)
  )
}

function holdsSafety(game: InteractionValidityGameState, playerId: string): boolean {
  const player = getPlayer(game, playerId)
  if (game.posWinnerId !== undefined) return sharesOffice(game, game.posWinnerId, playerId)
  return player?.status.includes('pos') === true
}

function humanPlayer(game: InteractionValidityGameState): InteractionValidityPlayer | null {
  return game.players?.find((player) => player.isUser) ?? null
}

function isHumanHoh(game: InteractionValidityGameState): boolean {
  const human = humanPlayer(game)
  if (!human) return false
  return isCurrentLoh(game, human.id)
}

function isHumanVetoActionable(game: InteractionValidityGameState): boolean {
  const human = humanPlayer(game)
  if (!human || !holdsSafety(game, human.id)) return false
  if (game.awaitingPovDecision || game.awaitingPovSaveTarget) return true
  return (
    (game.phase === 'pos_results' || game.phase === 'pos_ceremony') &&
    (game.nomineeIds?.length ?? 0) > 0 &&
    !isNominee(game, human.id)
  )
}

export function isIncomingInteractionPhaseAllowed(
  interaction: IncomingInteraction,
  phase: string
): boolean {
  const rule = getIncomingInteractionValidityRule(getScenarioKey(interaction))
  return (
    (!rule?.allowedPhases || rule.allowedPhases.includes(phase)) &&
    !rule?.invalidPhases?.includes(phase)
  )
}

function isNominationSetup(game: InteractionValidityGameState): boolean {
  return (
    ['loh_results', 'social_1', 'nominations'].includes(game.phase ?? '') ||
    (game.phase === 'nomination_results' &&
      (game.awaitingNominations === true || game.awaitingCoLohNomination === true))
  )
}

function isSafetyChoicePending(game: InteractionValidityGameState): boolean {
  const power = game.specialVeto
  return Boolean(
    game.awaitingPovDecision ||
    game.awaitingPovSaveTarget ||
    game.awaitingMissionImmunityOffer ||
    game.missionPowers?.safetyIntent ||
    power?.awaitingHolderReplacement ||
    power?.awaitingCoupReplacement1 ||
    power?.awaitingCoupReplacement2 ||
    power?.awaitingVipSecondUseDecision ||
    power?.awaitingVipSecondSaveTarget
  )
}

function safetyHolderNamesReplacement(game: InteractionValidityGameState): boolean {
  return game.specialVeto?.activeType === 'diamond' || game.specialVeto?.activeType === 'coup'
}

function canDiscussReplacement(game: InteractionValidityGameState, humanId: string): boolean {
  if (isNominationSetup(game)) return false
  if (game.phase === 'pos_ceremony_results') {
    if (game.missionPowers?.decision?.kind === 'backupTarget') return true
    if (isLohReplacementPending(game)) {
      return game.coLohReplacementOwnerId
        ? sharesOffice(game, game.coLohReplacementOwnerId, humanId)
        : isCurrentLoh(game, humanId)
    }
    if (!isSafetyChoicePending(game)) return false
  } else if (!game.nomineeIds?.length) {
    return false
  }
  const holdsPower = holdsSafety(game, humanId)
  return holdsPower || (!safetyHolderNamesReplacement(game) && isCurrentLoh(game, humanId))
}

function isDirectDecisionTargetEligible(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState,
  humanId: string,
  decision: NonNullable<IncomingInteractionValidityRule['directDecision']>
): boolean {
  const subjectId = interaction.payload?.subjectId
  if (
    typeof subjectId !== 'string' ||
    subjectId === humanId ||
    subjectId === interaction.fromId ||
    !arePlayersEligibleForCurrentUse([subjectId], game.players ?? [])
  ) {
    return false
  }
  if (decision === 'vote')
    return isNominee(game, subjectId) && canPlayerTargetPlayer(game, humanId, subjectId)

  const holderChooses = decision === 'replacement' && safetyHolderNamesReplacement(game)
  const canNominateLoh = holderChooses && game.specialVeto?.activeType === 'coup'
  const chooserId =
    decision === 'nomination'
      ? ((game.coLohIds?.includes(humanId) ? humanId : game.lohId) ?? humanId)
      : holderChooses
        ? game.posWinnerId
        : (game.coLohReplacementOwnerId ?? game.lohId)
  if (
    (!canNominateLoh && isCurrentLoh(game, subjectId)) ||
    (decision === 'replacement' && holdsSafety(game, subjectId)) ||
    !canPlayerTargetPlayer(game, chooserId, subjectId)
  ) {
    return false
  }
  const week = game.week ?? interaction.createdDay ?? interaction.createdWeek
  const protectionState = { ...game, week, players: game.players ?? [] }
  const blockedIds = [
    ...(game.nomineeIds ?? []),
    ...(game.povProtectedIds ?? []),
    ...(game.storeNominationProtections ?? [])
      .filter((protection) => protection.week === week)
      .map((protection) => protection.targetId),
  ]
  if (game.povSavedId) blockedIds.push(game.povSavedId)
  if (canNominateLoh && game.specialVeto?.coupReplacement1Id) {
    blockedIds.push(game.specialVeto.coupReplacement1Id)
  }
  if (
    decision === 'nomination' &&
    game.publicModeEnabled &&
    !game.doubleEviction?.weekActive &&
    game.lastHohCompFinisherId
  ) {
    blockedIds.push(game.lastHohCompFinisherId)
  }
  return (
    !blockedIds.some((id) => sharesOffice(game, id, subjectId)) &&
    !isBellaHeirImmune(protectionState, subjectId) &&
    !(decision === 'nomination'
      ? isMissionOpeningProtected(protectionState, subjectId)
      : isMissionBackupProtected(protectionState, subjectId))
  )
}

function isDirectDecisionAvailable(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState,
  rule: IncomingInteractionValidityRule,
  decision: NonNullable<IncomingInteractionValidityRule['directDecision']>
): boolean {
  const human = humanPlayer(game)
  if (
    !human ||
    !getPlayer(game, interaction.fromId) ||
    game.voxPopuliActive ||
    game.voxPopuli?.status === 'active' ||
    game.weekendInterlude?.active ||
    (game.week !== undefined && game.week !== (interaction.createdDay ?? interaction.createdWeek))
  ) {
    return false
  }
  if (decision === 'nomination') {
    const chooserId = rule.senderMustBeHoh ? interaction.fromId : human.id
    if (!isNominationSetup(game) || game.coLohNomineeByCoLohId?.[chooserId]) return false
  }
  if (decision === 'replacement' && !canDiscussReplacement(game, human.id)) return false
  if (decision === 'vote') {
    if (
      !game.nomineeIds?.length ||
      isSafetyChoicePending(game) ||
      game.replacementNeeded ||
      (game.aiReplacementStep ?? 0) > 0 ||
      game.missionPowers?.decision?.kind === 'backupTarget'
    ) {
      return false
    }
    if (rule.humanMustBeEligibleVoter) {
      const hasVoteBlackout =
        game.cupidArrow?.status !== 'active' &&
        !game.doubleEviction?.weekActive &&
        game.batteryLowVoteEffects?.[human.id]?.type === 'skipVote'
      const hasLockedBallot =
        game.phase === 'live_vote' &&
        (game.awaitingHumanVote === false ||
          Object.keys(game.votes ?? {}).some((key) =>
            sharesOffice(game, getCanonicalVoterId(key), human.id)
          ))
      if (hasVoteBlackout || hasLockedBallot) return false
    } else if (!canPlayerTargetPlayer(game, interaction.fromId, human.id)) {
      return false
    }
  }
  return (
    !rule.requiresDecisionTarget ||
    isDirectDecisionTargetEligible(interaction, game, human.id, decision)
  )
}

function violatesDeclarativeRule(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState
): boolean {
  if (
    getScenarioKey(interaction) === 'alliance_vox_ballot_pitch' &&
    (game.voxPopuliActive === true || game.voxPopuli?.status === 'active')
  ) {
    return true
  }
  const rule = getIncomingInteractionValidityRule(getScenarioKey(interaction))
  if (!rule) return false

  const senderIsRoleBound =
    rule.senderMustBeNominee !== undefined ||
    rule.senderMustBeReplacementNominee !== undefined ||
    rule.senderMustBeHoh === true ||
    rule.senderMustHoldSafety === true ||
    rule.senderMustBeEligibleVoter === true
  if (senderIsRoleBound && !getPlayer(game, interaction.fromId)) return true

  const phase = game.phase ?? ''
  if (!isIncomingInteractionPhaseAllowed(interaction, phase)) return true
  if (
    rule.directDecision &&
    !isDirectDecisionAvailable(interaction, game, rule, rule.directDecision)
  )
    return true
  if (rule.nominationWindow === 'setup' && !isNominationSetup(game)) return true
  if (rule.nominationWindow === 'aftermath' && isNominationSetup(game)) return true

  if (
    rule.senderMustBeNominee !== undefined &&
    isNominee(game, interaction.fromId) !== rule.senderMustBeNominee
  ) {
    return true
  }
  if (
    rule.senderMustBeReplacementNominee !== undefined &&
    (game.replacementNomineeIds ?? []).includes(interaction.fromId) !==
      rule.senderMustBeReplacementNominee
  ) {
    return true
  }
  if (rule.senderMustBeHoh && !isCurrentLoh(game, interaction.fromId)) return true
  if (rule.senderMustHoldSafety && !holdsSafety(game, interaction.fromId)) return true
  if (rule.senderMustBeEligibleVoter && !isEligibleVoter(game, interaction.fromId)) return true
  if (rule.humanMustBeHoh !== undefined && isHumanHoh(game) !== rule.humanMustBeHoh) return true
  if (rule.humanMustHoldSafety && !isHumanVetoActionable(game)) return true
  if (rule.humanMustBeOffBlock) {
    const human = humanPlayer(game)
    if (!human || isNominee(game, human.id)) return true
  }
  if (rule.humanMustBeNominee) {
    const human = humanPlayer(game)
    if (!human || !isNominee(game, human.id)) return true
  }
  if (rule.humanMustBeEligibleVoter) {
    const human = humanPlayer(game)
    if (!human || !isEligibleVoter(game, human.id) || game.votes?.[human.id]) return true
  }
  if (rule.humanMustBreakTie) {
    const human = humanPlayer(game)
    const tiedIds = game.tiedNomineeIds ?? []
    if (
      !human ||
      !game.awaitingTieBreak ||
      !tiedIds.includes(interaction.fromId) ||
      (game.awaitingPosTieBreak
        ? game.posWinnerId !== human.id
        : game.lohId !== human.id && !human.status.includes('loh'))
    ) {
      return true
    }
  }

  if (rule.subjectMustBeInHouse) {
    const subjectId = interaction.payload?.subjectId
    if (typeof subjectId !== 'string') return true
    const subject = getPlayer(game, subjectId)
    if (!subject || isEvictedOrGone(subject)) return true
  }

  return false
}

export function isIncomingInteractionInvalidated(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState,
  reality?: RealityDomainState
): boolean {
  if (game.mode === 'survival') return true
  const sender = getPlayer(game, interaction.fromId)
  const human = humanPlayer(game)
  const activePlayers = (game.players ?? []).filter((player) => !isEvictedOrGone(player))
  const temporaryReunionGuest = isFinaleReunionGuestMessage(interaction, game, sender)
  const linkedId = interaction.payload?.realityInteractionId
  const linked = typeof linkedId === 'string' ? reality?.interactions[linkedId] : undefined
  if (typeof linkedId === 'string' && reality) {
    if (
      linked?.status !== 'AWAITING_HUMAN' ||
      linked.actorId !== interaction.fromId ||
      (human && !linked.targetIds.includes(human.id)) ||
      !arePlayersEligibleForCurrentUse(linked.targetIds, game.players ?? [])
    )
      return true
  }
  // Production interactions always have a roster sender, but scheduler tests
  // and migrated saves can contain legacy/unknown IDs. Do not discard those
  // solely because the current roster cannot resolve the sender. Role-bound
  // scenarios above still require an actual sender at creation and delivery.
  if (sender && isEvictedOrGone(sender) && !temporaryReunionGuest) return true
  if (human && isEvictedOrGone(human)) return true
  if (human && interaction.fromId === human.id) return true
  if (activePlayers.length <= 2) return true

  const namedSubjectIds = [
    interaction.payload?.subjectId,
    interaction.payload?.secondarySubjectId,
  ].filter((id): id is string => typeof id === 'string')
  if (!arePlayersEligibleForCurrentUse(namedSubjectIds, game.players ?? [])) return true

  const intelFactId = interaction.payload?.intelFactId
  const intelFact = typeof intelFactId === 'string' ? reality?.facts[intelFactId] : undefined
  if (reality && getScenarioKey(interaction) === INCOMING_INTEL_LEAD && !intelFact) return true
  if (intelFact && !isRealityFactEligibleForCurrentUse(intelFact, game.players ?? [])) return true

  if (
    interaction.payload?.originActionId === 'nominate' &&
    human &&
    (game.posWinnerId === human.id ||
      game.povProtectedIds?.includes(human.id) ||
      human.status.includes('pos'))
  ) {
    return true
  }

  return (
    violatesDeclarativeRule(interaction, game) ||
    violatesNominationBlockContext(interaction, game, linked?.contextSnapshot?.atRiskActorIds) ||
    violatesLohNominationPlanContext(interaction, game) ||
    violatesRealityAllianceContext(interaction, game, reality)
  )
}

export function isScheduledIncomingInteractionInvalidated(
  entry: ScheduledIncomingInteraction,
  game: InteractionValidityGameState,
  reality?: RealityDomainState
): boolean {
  const at = {
    day: game.week ?? entry.interaction.createdWeek,
    phase: game.phase ?? entry.interaction.createdPhase ?? 'week_start',
  }
  const scheduled = getScheduledIncomingInteractionClock(entry, at)
  const awaitingDelivery = compareIncomingClock(at, scheduled) < 0
  if (
    awaitingDelivery &&
    getIncomingInteractionValidityRule(getScenarioKey(entry.interaction))?.directDecision
  ) {
    // A future slot needs a suitable phase. Power holders, ballots and open
    // decisions are checked against today's state now and again on delivery.
    return (
      scheduled.day !== at.day ||
      !isIncomingInteractionPhaseAllowed(entry.interaction, scheduled.phase) ||
      isIncomingInteractionInvalidated(entry.interaction, game, reality)
    )
  }
  const validationGame = awaitingDelivery
    ? {
        ...game,
        phase: scheduled.phase,
        awaitingNominations: game.awaitingNominations || isNominationSetup(game),
      }
    : game
  return isIncomingInteractionInvalidated(entry.interaction, validationGame, reality)
}

export function collectInvalidIncomingInteractionIds({
  incomingInteractions,
  scheduledIncomingInteractions,
  game,
  reality,
}: {
  incomingInteractions: IncomingInteraction[]
  scheduledIncomingInteractions: ScheduledIncomingInteraction[]
  game: InteractionValidityGameState
  reality?: RealityDomainState
}): string[] {
  const ids = new Set<string>()

  for (const interaction of incomingInteractions) {
    if (!interaction.resolved && isIncomingInteractionInvalidated(interaction, game, reality)) {
      ids.add(interaction.id)
    }
  }

  for (const entry of scheduledIncomingInteractions) {
    if (isScheduledIncomingInteractionInvalidated(entry, game, reality)) {
      ids.add(entry.interaction.id)
    }
  }

  return [...ids]
}
