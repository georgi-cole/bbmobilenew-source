import { getIncomingInteractionValidityRule } from './incomingInteractionValidityBank'
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

export interface InteractionValidityGameState {
  phase?: string
  week?: number
  lohId?: string | null
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
])

function violatesNominationBlockContext(
  interaction: IncomingInteraction,
  game: InteractionValidityGameState
): boolean {
  const scenarioKey = getScenarioKey(interaction)
  if (!scenarioKey) return false
  const snapshot = interaction.payload?.nominationBlockIds ?? interaction.payload?.nomineeIds
  const changed =
    Array.isArray(snapshot) &&
    snapshot.every((id): id is string => typeof id === 'string') &&
    (snapshot.length !== (game.nomineeIds ?? []).length ||
      snapshot.some((id) => !(game.nomineeIds ?? []).includes(id)))
  if (NOMINATION_BLOCK_BOUND_SCENARIOS.has(scenarioKey) && changed) return true
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

function isCurrentLoh(game: InteractionValidityGameState, playerId: string): boolean {
  if (game.lohId !== undefined) return game.lohId === playerId
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
  return game.posWinnerId === playerId || player?.status.includes('pos') === true
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
  return Boolean(game.awaitingPovDecision || game.awaitingPovSaveTarget)
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
  if (rule.allowedPhases && !rule.allowedPhases.includes(phase)) return true
  if (rule.invalidPhases?.includes(phase)) return true

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
  if (rule.senderMustBeHoh) {
    const sender = getPlayer(game, interaction.fromId)
    if (game.lohId !== interaction.fromId && sender?.status.includes('loh') !== true) return true
  }
  if (rule.senderMustHoldSafety && !holdsSafety(game, interaction.fromId)) return true
  if (rule.senderMustBeEligibleVoter && !isEligibleVoter(game, interaction.fromId)) return true
  if (rule.humanMustBeHoh && !isHumanHoh(game)) return true
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
    if (!human || !isEligibleVoter(game, human.id)) return true
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
  const sender = getPlayer(game, interaction.fromId)
  const human = humanPlayer(game)
  const activePlayers = (game.players ?? []).filter((player) => !isEvictedOrGone(player))
  const temporaryReunionGuest = isFinaleReunionGuestMessage(interaction, game, sender)
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
    violatesNominationBlockContext(interaction, game) ||
    violatesLohNominationPlanContext(interaction, game) ||
    violatesRealityAllianceContext(interaction, game, reality)
  )
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
    if (isIncomingInteractionInvalidated(entry.interaction, game, reality)) {
      ids.add(entry.interaction.id)
    }
  }

  return [...ids]
}
