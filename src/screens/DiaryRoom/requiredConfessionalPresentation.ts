import { calculateRequiredDoubleEvictionSlots } from '../../features/twists/doubleEvictionTieUtils'
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import type { GameState } from '../../types'
import {
  getConfessionalDecisionKey,
  getConfessionalInteractionId,
} from '../../store/confessionalDecisionSelectors'
import { getConfessionalPowerName } from './confessionalPowerName'
import { isCupidArrowActive } from '../../features/twists/cupidArrow'

export type RequiredConfessionalTone = 'private' | 'strategic' | 'danger' | 'power'

export interface RequiredConfessionalPresentation {
  key: string
  eyebrow: string
  title: string
  prompt: string
  consequence: string
  confirmLabel: string
  confirmation: string
  stepLabel?: string
  tone: RequiredConfessionalTone
  returnCue: string
}

export function getRequiredConfessionalPresentation(
  decision: ActiveConfessionalDecision,
  game: GameState
): RequiredConfessionalPresentation {
  const survival = game.mode === 'survival'
  const dayLabel = survival
    ? `SURVIVAL PROTOCOL · DAY ${decision.week}`
    : `PRIVATE CEREMONY · DAY ${decision.week}`
  const powerName = getConfessionalPowerName(game)
  const tiedIds = game.tiedNomineeIds ?? game.nomineeIds
  const key = decision.interactionId
    ? getConfessionalDecisionKey(decision)
    : getConfessionalInteractionId(game, decision.type)

  switch (decision.type) {
    case 'nominations': {
      const isVoxPopuli = game.voxPopuli?.status === 'active'
      const human = game.players.find(
        (player) =>
          player.isUser && player.status !== 'evicted' && player.status !== 'jury'
      )
      const activeCount = game.players.filter(
        (player) => player.status !== 'evicted' && player.status !== 'jury'
      ).length
      const isVoxFinalFour = isVoxPopuli && activeCount === 4
      const voxExcludedIds = new Set(
        [
          human?.id,
          isVoxFinalFour ? null : (game.voxPopuli?.immunityWinnerId ?? game.lohId),
          game.voxPopuli?.autoNomineeId ?? game.lastHohCompFinisherId,
        ].filter((id): id is string => Boolean(id))
      )
      const voxEligibleCount = game.players.filter(
        (player) =>
          player.status !== 'evicted' &&
          player.status !== 'jury' &&
          !voxExcludedIds.has(player.id)
      ).length
      const required = isVoxPopuli
        ? Math.min(isVoxFinalFour ? 1 : 2, voxEligibleCount)
        : game.doubleEviction?.weekActive
          ? 3
          : 2
      return {
        key,
        eyebrow: dayLabel,
        title: isVoxPopuli
          ? 'Secret Nomination Ballot'
          : survival
            ? 'Nomination Protocol'
            : 'Nomination Decision',
        prompt: isVoxPopuli
          ? isVoxFinalFour
            ? 'Cast one secret nomination vote. Last place is already on the block, and nobody has immunity today.'
            : `Privately choose ${required === 1 ? 'the eligible housemate' : 'two housemates'} to nominate. You cannot choose yourself, today’s immunity winner, or the last-place nominee.`
          : survival
          ? `Select ${required} contestants for elimination consideration.`
          : `Choose the ${required === 1 ? 'player' : required === 2 ? 'two players' : `${required} players`} you want to nominate. Your choices remain private until you return to the house.`,
        consequence: isVoxPopuli
          ? isVoxFinalFour
            ? 'The highest total joins the last-place housemate on the block. A tie expands the block.'
            : 'Only the aggregate totals will be revealed. Everyone tied at the qualifying cutoff is nominated.'
          : survival
          ? 'The selected contestants will enter the next elimination cycle.'
          : 'Your nominations will be revealed publicly after you leave the Confessional.',
        confirmLabel: isVoxPopuli ? 'Seal secret ballot' : 'Confirm nominations',
        confirmation: isVoxPopuli ? 'Your secret ballot is sealed.' : 'Your nominations are locked.',
        tone: 'strategic',
        returnCue: 'nomination_ceremony',
      }
    }
    case 'eviction_vote':
      return {
        key,
        eyebrow: dayLabel,
        title: isCupidArrowActive(game)
          ? 'Joint Pair Vote'
          : survival
            ? 'Elimination Vote'
            : 'Live Eviction Vote',
        prompt: isCupidArrowActive(game)
          ? 'Choose one nominated pair. You and your partner cast this decision together; your joint ballot counts as two votes.'
          : survival
            ? 'Select the contestant you want removed from the current run.'
            : 'Choose who you want to eliminate. Your private vote is final once sealed.',
        consequence: 'Once confirmed, this vote cannot be changed.',
        confirmLabel: 'Seal eviction vote',
        confirmation: 'Your eviction vote is sealed.',
        tone: 'danger',
        returnCue: 'live_vote',
      }
    case 'double_vote_offer':
      return {
        key,
        eyebrow: dayLabel,
        title: 'Double Vote Available',
        prompt: 'You have a stored Double Vote. Decide whether to activate it for this eviction.',
        consequence: 'Using it now spends the power and gives you two votes in the next step.',
        confirmLabel: 'Confirm power decision',
        confirmation: 'Your Double Vote decision is recorded.',
        stepLabel: 'Power decision · Step 1 of 2',
        tone: 'power',
        returnCue: 'double_vote',
      }
    case 'double_vote':
      return {
        key,
        eyebrow: dayLabel,
        title: 'Cast Two Eviction Votes',
        prompt: 'Choose your two eviction votes. You may place both votes on one nominee or split them.',
        consequence: 'Both votes will be submitted together and cannot be changed afterward.',
        confirmLabel: 'Seal both votes',
        confirmation: 'Both eviction votes are sealed.',
        stepLabel: 'Power decision · Step 2 of 2',
        tone: 'danger',
        returnCue: 'live_vote',
      }
    case 'mission_immunity_offer': {
      const duration = game.secretMission?.reward?.durationDays ?? 1
      return {
        key,
        eyebrow: dayLabel,
        title: 'Secret Immunity',
        prompt: `You hold ${duration}-day secret immunity. Decide whether to activate it now.`,
        consequence:
          'Activating it changes the Safety Ceremony immediately. Saving it keeps the reward available until expiry.',
        confirmLabel: 'Confirm immunity decision',
        confirmation: 'Your immunity decision is recorded.',
        tone: 'power',
        returnCue: 'safety_ceremony',
      }
    }
    case 'pos_decision':
      return {
        key,
        eyebrow: dayLabel,
        title: `${powerName} Decision`,
        prompt: `Do you want to use ${powerName} during this ceremony?`,
        consequence:
          'If you activate the power, you will continue directly to the required target selections.',
        confirmLabel: 'Confirm power decision',
        confirmation: `${powerName} decision recorded.`,
        stepLabel: 'Safety decision · Step 1',
        tone: 'power',
        returnCue: 'safety_ceremony',
      }
    case 'vip_second_use':
      return {
        key,
        eyebrow: dayLabel,
        title: 'Double Trouble · Second Use',
        prompt: 'Decide whether to activate Double Trouble a second time in this ceremony.',
        consequence:
          'Activating it will require you to save another nominee before the ceremony can continue.',
        confirmLabel: 'Confirm second-use decision',
        confirmation: 'Your second-use decision is recorded.',
        stepLabel: 'Safety decision · Continue',
        tone: 'power',
        returnCue: 'safety_ceremony',
      }
    case 'pos_save_target':
      return {
        key,
        eyebrow: dayLabel,
        title: game.specialVeto?.awaitingVipSecondSaveTarget
          ? 'Choose the Second Save'
          : 'Choose Who to Save',
        prompt: game.specialVeto?.awaitingVipSecondSaveTarget
          ? 'Select the second nominee you want to remove from danger.'
          : `Select the nominee you want to save with ${powerName}.`,
        consequence: 'This player will be removed from the block when the ceremony resumes.',
        confirmLabel: 'Confirm save target',
        confirmation: 'Your save target is locked.',
        stepLabel: 'Safety decision · Target selection',
        tone: 'strategic',
        returnCue: 'safety_save_ceremony',
      }
    case 'replacement_nominee':
      return {
        key,
        eyebrow: dayLabel,
        title: game.specialVeto?.awaitingCoupReplacement1
          ? 'Name the First Replacement'
          : game.specialVeto?.awaitingCoupReplacement2
            ? 'Name the Second Replacement'
            : 'Name a Replacement Nominee',
        prompt: 'Select the eligible housemate who will take the open place on the block.',
        consequence: 'The replacement will be revealed publicly when you return to the house.',
        confirmLabel: 'Confirm replacement',
        confirmation: 'Your replacement nominee is locked.',
        stepLabel: 'Safety decision · Replacement',
        tone: 'danger',
        returnCue: 'replacement_ceremony',
      }
    case 'tie_break': {
      const required = game.doubleEviction?.weekActive
        ? calculateRequiredDoubleEvictionSlots(tiedIds.length, Boolean(game.pendingEviction))
        : 1
      return {
        key,
        eyebrow: dayLabel,
        title: required > 1 ? 'Break the Elimination Tie' : 'Cast the Deciding Vote',
        prompt:
          required > 1
            ? `The vote is tied. Select the ${required} players you want eliminated.`
            : game.awaitingPosTieBreak
              ? 'As the Power of Safety holder, you must break the tie and choose who is eliminated.'
              : 'The house vote is tied. Choose the nominee whose game will end.',
        consequence:
          'Your decision directly determines the elimination result and cannot be changed.',
        confirmLabel: required > 1 ? 'Confirm eliminations' : 'Seal deciding vote',
        confirmation: 'The tie-break decision is sealed.',
        tone: 'danger',
        returnCue: 'eviction_results',
      }
    }
    case 'twin_shock': {
      const stage = game.twinShock?.promptStage
      return {
        key,
        eyebrow: dayLabel,
        title: 'Private Story Session',
        prompt:
          stage === 'day4_initial'
            ? 'I need to ask you something. Have you noticed anything off about Lia?'
            : stage === 'day4_detail'
              ? 'What exactly have you noticed?'
              : stage === 'day5_final'
                ? 'Last time, I asked whether you had noticed anything off about Lia. I will ask one last time: what do you think is going on?'
                : stage === 'day5_give_up'
                  ? 'Say that you give up, and I will tell you the secret.'
                  : stage === 'secret_lost'
                    ? 'As Lia is no longer in the House, her secret will remain unrevealed. You are free to leave.'
                    : 'The Big Eye has called you in for a private conversation.',
        consequence: 'Give the Big Eye a clear answer to continue the story.',
        confirmLabel: 'Send response',
        confirmation: 'Your answer is recorded.',
        tone: 'private',
        returnCue: 'story_session',
      }
    }
    default:
      return {
        key,
        eyebrow: dayLabel,
        title: 'Private Decision',
        prompt: 'The Big Eye is waiting for your decision.',
        consequence: 'Complete the decision before returning to the game.',
        confirmLabel: 'Confirm decision',
        confirmation: 'Your decision is recorded.',
        tone: 'private',
        returnCue: 'game',
      }
  }
}
