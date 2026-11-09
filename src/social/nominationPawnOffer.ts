import { getCupidPartnerId, isSameCupidPair } from '../features/twists/cupidArrow'
import { isVoxPopuliActive } from '../features/twists/voxPopuli'
import { getEligibleNominationTargets } from '../store/gameSlice'
import type { GameState } from '../types'
import { isBeforeInitialNominations } from './lohConsultationCopy'
import { getActiveFacadeAgreement } from './reality/facadeAgreements'
import type { RealityFacadeAgreement } from './reality/types'
import { getInquiryAttempts, getInquiryTopicKey, NOMINATION_PAWN_OFFER } from './socialInquiry'
import type { SocialState } from './types'

export function getPawnNominationAuthority(
  game: GameState,
  actorId: string,
  volunteerId: string
): string | null {
  const open =
    isBeforeInitialNominations(game.phase) ||
    (game.phase === 'nomination_results' &&
      (game.awaitingNominations || game.awaitingCoLohNomination))
  const actor = game.players.find((player) => player.id === actorId)
  if (
    !open ||
    game.mode !== 'classic' ||
    isVoxPopuliActive(game) ||
    game.weekendInterlude?.active ||
    game.coLohNomineeByCoLohId?.[actorId] ||
    game.nomineeIds.includes(volunteerId) ||
    !actor?.isUser ||
    actor.status === 'evicted' ||
    actor.status === 'jury'
  ) {
    return null
  }
  const lohId = game.coLohIds?.length
    ? game.coLohIds.includes(actorId)
      ? actorId
      : null
    : game.lohId === actorId || isSameCupidPair(game, actorId, game.lohId)
      ? game.lohId
      : null
  if (!lohId) return null

  const volunteer = game.players.find((player) => player.id === volunteerId)
  if (!volunteer || volunteer.status === 'evicted' || volunteer.status === 'jury') return null
  const partnerId = getCupidPartnerId(game, volunteerId)
  const eligible = getEligibleNominationTargets(game, lohId)
  return eligible.some(({ id }) => id === volunteerId || id === partnerId) ? lohId : null
}

/** Reassure can confirm the player's own live, private nomination conversation. */
export function getPendingNominationPawnOffer(
  game: GameState,
  social: Pick<SocialState, 'inquiryHistory' | 'reality'>,
  actorId: string,
  volunteerId: string
): RealityFacadeAgreement | null {
  const topicKey = getInquiryTopicKey('ask_nomination_advice', undefined, game.week)
  const offer = getInquiryAttempts(social.inquiryHistory, actorId, volunteerId, topicKey).find(
    (answer) =>
      answer.kind === 'NOMINATION_ADVICE' &&
      answer.day === game.week &&
      answer.tone === 'CANDID' &&
      answer.answerTargetIds.length === 1 &&
      answer.answerTargetIds[0] === volunteerId &&
      // Older saves recorded the authored line and target, with no typed flag.
      (answer.volunteeredAsPawn ?? answer.answerText === NOMINATION_PAWN_OFFER)
  )
  if (!offer) return null

  const lohId = getPawnNominationAuthority(game, actorId, volunteerId)
  const stage = 'INITIAL_NOMINATION'
  if (!lohId || getActiveFacadeAgreement(social.reality, lohId, volunteerId, game.week, stage))
    return null

  return {
    id: `facade:${offer.id}`,
    day: game.week,
    lohId,
    facadeId: volunteerId,
    stage,
    status: 'ACCEPTED',
    voluntary: true,
    sourceInteractionId: offer.id,
  }
}
