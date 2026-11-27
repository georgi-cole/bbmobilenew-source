import type { GameState } from '../types'
import {
  compareIncomingClock,
  getIncomingDeadline,
  isIncomingInteractionOverdue,
} from './incomingInteractionDeadline'
import { isIncomingInteractionInvalidated } from './incomingInteractionValidity'
import type { RealityDomainState } from './reality/types'
import { getIncomingSocialModuleAvailability } from './socialModuleAvailability'
import { getIncomingInteractionResponsePolicy } from './socialRuntimeConfig'
import type { IncomingInteraction } from './types'

interface IncomingDecisionState {
  game: GameState
  social?: {
    incomingInteractions?: readonly IncomingInteraction[]
    reality?: RealityDomainState
  }
}

export function isCurrentIncomingConversation(
  state: IncomingDecisionState,
  interaction: IncomingInteraction
): boolean {
  const { game, social } = state
  const now = { day: game.week, phase: game.phase }
  return (
    !interaction.resolved &&
    (interaction.createdDay ?? interaction.createdWeek) <= game.week &&
    !isIncomingInteractionOverdue(interaction, now) &&
    !isIncomingInteractionInvalidated(interaction, game, social?.reality)
  )
}

export function isRequiredIncomingDecision(
  state: IncomingDecisionState,
  interaction: IncomingInteraction
): boolean {
  const { game } = state
  return (
    getIncomingInteractionResponsePolicy(interaction) === 'required' &&
    isCurrentIncomingConversation(state, interaction) &&
    (interaction.payload?.pactTimeRequested !== true ||
      compareIncomingClock(
        { day: game.week, phase: game.phase },
        getIncomingDeadline(interaction)
      ) >= 0)
  )
}

export function selectRequiredIncomingDecision(
  state: IncomingDecisionState
): IncomingInteraction | null {
  const { game, social } = state
  if (
    !social?.incomingInteractions?.length ||
    game.phase === 'season_start' ||
    game.phase === 'jury' ||
    game.phase === 'jury_announcement' ||
    game.phase === 'jury_cinematic' ||
    game.seasonFinale ||
    (game.voteResults && !game.awaitingTieBreak) ||
    game.evictionOverlayPlayerId ||
    game.weekendInterlude?.reunionDepartureActive ||
    !getIncomingSocialModuleAvailability(game).canOpen
  ) {
    return null
  }
  return (
    social.incomingInteractions.find((interaction) =>
      isRequiredIncomingDecision(state, interaction)
    ) ?? null
  )
}
