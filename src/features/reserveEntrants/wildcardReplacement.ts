import type { GameState, Player } from '../../types'
import { getById } from '../../data/houseguests'
import { RESERVE_WILDCARD_IDS, type ReserveWildcardId } from '../../data/reserveHouseguests'
import { mulberry32 } from '../../store/rng'

export const WILDCARD_ARRIVAL_CHANCE = 0.5
/** The last numbered day on which an event may open a reserve opportunity. */
export const WILDCARD_LAST_TRIGGER_DAY = 10

export interface WildcardAdmissionEligibility {
  eligible: boolean
  reason: string
  displacedPlayer?: Player
  rosterIndex?: number
}

const WILDCARD_QA_QUEUE_PHASES: ReadonlySet<GameState['phase']> = new Set([
  'week_start',
  'loh_comp_announcement',
  'loh_comp',
  'loh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pre_veto_public_save',
  'pos_comp_announcement',
  'pos_comp',
  'pos_results',
  'pos_ceremony',
  'pos_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'week_end',
])

/** Make one deterministic, saveable season roll; this is never rerolled on reload. */
export function chooseWildcardOpportunity(
  seed: number
): { status: 'selected'; playerId: ReserveWildcardId } | { status: 'none' } {
  const roll = mulberry32((seed ^ 0x57494c44) >>> 0)
  if (roll() >= WILDCARD_ARRIVAL_CHANCE) return { status: 'none' }
  const index = Math.min(
    RESERVE_WILDCARD_IDS.length - 1,
    Math.floor(roll() * RESERVE_WILDCARD_IDS.length)
  )
  return { status: 'selected', playerId: RESERVE_WILDCARD_IDS[index] }
}

function exitOrderByPlayerId(game: GameState): Map<string, number> {
  const order = new Map<string, number>()
  for (const event of game.history ?? []) {
    if (event.type !== 'seasonExit' || typeof event.data.playerId !== 'string') continue
    const id = event.data.playerId
    if (!order.has(id)) order.set(id, order.size)
  }
  return order
}

/**
 * Return the first eligible eliminated roster occupant. Committed exit order
 * wins when both records are present; older saves fall back to exit day and
 * then the original player-array order.
 */
export function getEarliestWildcardSlot(game: GameState): {
  player: Player
  rosterIndex: number
} | null {
  const occupiedSlots = new Set(
    (game.wildcardAdmissions ?? []).map((entry) => entry.displacedPlayerId)
  )
  const exitOrder = exitOrderByPlayerId(game)
  const candidates = game.players
    .map((player, rosterIndex) => ({ player, rosterIndex }))
    .filter(
      ({ player }) =>
        player.status === 'evicted' &&
        !player.isUser &&
        !occupiedSlots.has(player.id) &&
        !game.wildcardAdmissions?.some((entry) => entry.playerId === player.id) &&
        !(game.history ?? []).some(
          (event) =>
            ['tribunal_joined', 'tribunal_member_added'].includes(event.type) &&
            event.data.playerId === player.id
        )
    )

  candidates.sort((left, right) => {
    const leftOrder = exitOrder.get(left.player.id)
    const rightOrder = exitOrder.get(right.player.id)
    if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    const dayDiff =
      (left.player.evictedAtWeek ?? Number.MAX_SAFE_INTEGER) -
      (right.player.evictedAtWeek ?? Number.MAX_SAFE_INTEGER)
    if (dayDiff !== 0) return dayDiff
    if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return left.rosterIndex - right.rosterIndex
  })

  return candidates[0] ?? null
}

export function getWildcardAdmissionEligibility(
  game: GameState,
  wildcardId: string,
  options: { ignoreArrivalTimingForQa?: boolean } = {}
): WildcardAdmissionEligibility {
  const profile = getById(wildcardId)
  if (!RESERVE_WILDCARD_IDS.includes(wildcardId as ReserveWildcardId) || !profile?.avatar) {
    return { eligible: false, reason: 'This wildcard does not have a complete reserve profile.' }
  }
  if (game.wildcardAdmissions?.length) {
    return { eligible: false, reason: 'A reserve entrant has already joined this season.' }
  }
  if (game.players.some((player) => player.id === wildcardId)) {
    return { eligible: false, reason: `${profile.name} has already appeared this season.` }
  }
  if (game.mode === 'survival' || game.expansionMode != null) {
    return {
      eligible: false,
      reason: 'Reserve entrants are available in standard Classic seasons only.',
    }
  }
  if (
    game.cupidArrow?.status === 'scheduled' ||
    game.cupidArrow?.status === 'active' ||
    game.voxPopuli?.status === 'scheduled' ||
    game.voxPopuli?.status === 'active'
  ) {
    return { eligible: false, reason: 'This season has a separate format or arrival story.' }
  }

  const startingCastSize = game.cfg?.tribunalStartingCastSize ?? game.players.length
  if (startingCastSize !== 16) {
    return {
      eligible: false,
      reason: 'Reserve entrants are limited to standard 16-player seasons.',
    }
  }
  const opportunity = game.wildcardOpportunity
  if (
    !options.ignoreArrivalTimingForQa &&
    (opportunity?.status !== 'pending' ||
      opportunity.arrivalDay !== game.week ||
      opportunity.triggerDay == null ||
      opportunity.arrivalDay !== opportunity.triggerDay + 1 ||
      game.phase !== 'week_start' ||
      game.weekendInterlude?.active)
  ) {
    return {
      eligible: false,
      reason: 'A reserve entrant can join only at the start of the day after a qualifying event.',
    }
  }
  if (
    !options.ignoreArrivalTimingForQa &&
    opportunity?.triggerDay != null &&
    opportunity.triggerDay > WILDCARD_LAST_TRIGGER_DAY
  ) {
    return {
      eligible: false,
      reason: 'Reserve entries are limited to events in the first half of the season.',
    }
  }
  if (
    game.players.some((player) => player.status === 'jury') ||
    game.tribunalPhaseAnnounced === true
  ) {
    return { eligible: false, reason: 'Tribunal membership has already begun.' }
  }
  if (
    game.twinShockConsumed !== true &&
    game.players.some((player) => player.id === 'lia' || player.id === 'lia_ali')
  ) {
    return {
      eligible: false,
      reason: 'Resolve the separate Twin Shock story before a reserve entry.',
    }
  }

  const activeCount = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  ).length
  if (activeCount < 10) {
    return { eligible: false, reason: 'At least 10 active incumbents must remain before entry.' }
  }

  const slot = getEarliestWildcardSlot(game)
  if (!slot) {
    return { eligible: false, reason: 'There is no eligible pre-Tribunal roster slot to reuse.' }
  }

  return {
    eligible: true,
    reason: 'Ready to enter through the earliest eligible eliminated player’s slot.',
    displacedPlayer: slot.player,
    rosterIndex: slot.rosterIndex,
  }
}

/** Explain and validate the QA-only next-day queue control. */
export function getWildcardQaQueueEligibility(
  game: GameState,
  wildcardId: string
): WildcardAdmissionEligibility {
  if (game.wildcardOpportunity?.status === 'pending') {
    return {
      eligible: false,
      reason: `A reserve is already queued for Day ${game.wildcardOpportunity.arrivalDay}.`,
    }
  }
  if (game.wildcardOpportunity?.status === 'admitted') {
    return { eligible: false, reason: 'A reserve has already entered this season.' }
  }
  if (!WILDCARD_QA_QUEUE_PHASES.has(game.phase)) {
    return {
      eligible: false,
      reason: 'Queue from a numbered game day to schedule entry at the following day start.',
    }
  }
  if (game.week > WILDCARD_LAST_TRIGGER_DAY) {
    return {
      eligible: false,
      reason: `QA reserve entry is available through Day ${WILDCARD_LAST_TRIGGER_DAY} only.`,
    }
  }
  return getWildcardAdmissionEligibility(game, wildcardId, { ignoreArrivalTimingForQa: true })
}

/**
 * Keep the roster at its configured visual size while retaining every distinct
 * competitor and their history in GameState.players.
 */
export function getPresentedRosterPlayers(game: GameState): Player[] {
  const admissions = game.wildcardAdmissions ?? []
  if (admissions.length === 0) return game.players

  const playerById = new Map(game.players.map((player) => [player.id, player]))
  const entrantByDisplacedId = new Map(
    admissions.map((entry) => [entry.displacedPlayerId, entry.playerId])
  )
  const entrantIds = new Set(admissions.map((entry) => entry.playerId))

  return game.players.flatMap((player) => {
    const entrantId = entrantByDisplacedId.get(player.id)
    if (entrantId) {
      const entrant = playerById.get(entrantId)
      return entrant ? [entrant] : []
    }
    return entrantIds.has(player.id) ? [] : [player]
  })
}
