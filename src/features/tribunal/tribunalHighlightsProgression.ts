import {
  advance,
  advanceWeekendDay,
  advanceWeekendSeasonFact,
  aiReplacementRendered,
  beginFinaleReunionSocial,
  beginWeekendDayTransition,
  beginWeekendTribunalGlimpse,
  commitPublicSave,
  completeWeekendInterlude,
  confirmDayStartShock,
  consumeBroadcastEvents,
  continueWeekendFeature,
  dismissEvictionSplash,
  dismissVoteResults,
  finalizeFinal3Decision,
  finalizePendingEviction,
  recordTribunalHighlight,
  resolvePairAwarePublicSave,
  skipWeekendTribunalStream,
  submitDoubleEvictionTieBreak,
  tryActivateBattleBack,
  tryActivatePendingForcedBattleBack,
} from '../../store/gameSlice'
import type { AppDispatch, RootState } from '../../store/store'
import { getClassicEvictionTieBreakerId } from '../../store/criticalGameRules'
import { chooseFinalThreeEvictee } from '../../social/finalThreeDecision'
import { startChallenge } from '../../store/challengeSlice'
import { resolveAiOnlyChallenge } from '../../store/resolveAiOnlyChallenge'
import {
  buildTribunalHighlight,
  isTribunalHighlightsEligible,
  isTribunalVoteReady,
  tribunalRequiresLiveShow,
} from './tribunalHighlights'

export type TribunalProgress =
  | 'advanced'
  | 'eviction'
  | 'vote'
  | 'battle_back'
  | 'attention'
  | 'inactive'

/** One guarded engine step. The caller yields between small batches and can cancel at any time. */
export const stepTribunalHighlights =
  (expectedGameId: string) =>
  (dispatch: AppDispatch, getState: () => RootState): TribunalProgress => {
    const root = getState()
    const game = root.game
    if (game.gameId !== expectedGameId || !isTribunalHighlightsEligible(game)) return 'inactive'
    if (tribunalRequiresLiveShow(game)) return 'battle_back'
    if (isTribunalVoteReady(game)) return 'vote'

    // Never answer a human decision, clear unknown blockers, or resolve a return competition.
    if (
      game.missionPowers?.decision ||
      game.awaitingHumanVote ||
      game.awaitingNominations ||
      game.replacementNeeded ||
      game.awaitingPovDecision ||
      game.awaitingPovSaveTarget ||
      game.awaitingMissionImmunityOffer ||
      game.awaitingVoteDeductionPrompt ||
      game.awaitingDoubleVoteOffer ||
      game.awaitingFinal3Eviction ||
      game.awaitingCoLohNomination ||
      game.democracia?.awaitingHumanVote ||
      game.democracia?.awaitingPublicBreaker ||
      game.favoritePlayer?.active ||
      game.pendingMinigame ||
      game.spectatorActive ||
      game.twinShock?.promptStage ||
      game.twinShock?.pendingRevealAnimation ||
      game.specialVeto?.awaitingHolderReplacement ||
      game.specialVeto?.awaitingCoupReplacement1 ||
      game.specialVeto?.awaitingCoupReplacement2 ||
      game.specialVeto?.awaitingVipSecondUseDecision ||
      game.specialVeto?.awaitingVipSecondSaveTarget
    )
      return 'attention'

    // Double-tie flags also gate AI deciders; use the same authoritative reducer as live play.
    if (game.awaitingTieBreak) {
      const deciderId = getClassicEvictionTieBreakerId(game)
      if (!game.doubleEviction?.weekActive || game.players.find((p) => p.id === deciderId)?.isUser)
        return 'attention'
      const tied = game.tiedNomineeIds ?? game.nomineeIds
      const count = game.pendingEviction ? 1 : Math.min(2, tied.length)
      dispatch(submitDoubleEvictionTieBreak(tied.slice(0, count)))
      return getState().game.awaitingTieBreak ? 'attention' : 'advanced'
    }

    if (root.challenge?.pending) {
      return dispatch(resolveAiOnlyChallenge(root.challenge.pending.id)) ? 'advanced' : 'attention'
    }
    const democraciaLoh =
      game.phase === 'loh_comp' &&
      game.democracia?.active &&
      game.democracia.activatedDay === game.week
    if (['loh_comp', 'pos_comp'].includes(game.phase) && !democraciaLoh) {
      const participants = game.players
        .filter(
          (player) =>
            player.status !== 'evicted' &&
            player.status !== 'jury' &&
            (game.phase !== 'loh_comp' || player.id !== game.prevHohId)
        )
        .map((player) => player.id)
      if (!participants.length) return 'attention'
      dispatch(
        startChallenge(game.seed, participants, {
          prizeType: game.phase === 'pos_comp' ? 'POS' : 'LOH',
        })
      )
      return 'advanced'
    }

    // A recap replaces these presentation cards, while the original log is retained.
    const unseen = game.tvFeed
      .filter((event) => !event.meta?.broadcastConsumed)
      .map((event) => event.id)
    if (unseen.length) dispatch(consumeBroadcastEvents(unseen))

    if (game.dayStartShock) {
      dispatch(confirmDayStartShock())
    } else if (game.pendingEviction) {
      const id = game.pendingEviction.evicteeId
      const highlight = buildTribunalHighlight(game, [id])
      dispatch(finalizePendingEviction(id))
      const after = getState().game
      if (after.pendingEviction?.evicteeId === id) return 'attention'
      dispatch(recordTribunalHighlight(highlight))
      if (after.voteResults) dispatch(dismissVoteResults())
      if (after.evictionSplashId) dispatch(dismissEvictionSplash())
      // Finish the whole double / linked eviction before offering another beat.
      if (after.pendingEviction) return 'advanced'
      if (tribunalRequiresLiveShow(getState().game)) return 'battle_back'
      if (dispatch(tryActivatePendingForcedBattleBack()) || dispatch(tryActivateBattleBack()))
        return 'battle_back'
      return 'eviction'
    } else if (game.awaitingFinal3Plea) {
      const holder = game.players.find((player) => player.id === game.lohId)
      if (!holder || holder.isUser) return 'attention'
      const decision = chooseFinalThreeEvictee({
        holderId: game.lohId,
        holder,
        nominees: game.players.filter((player) => game.nomineeIds.includes(player.id)),
        relationships: game.strategicRelationships,
        alliances: game.strategicAlliances,
        threatReads: game.strategicThreatReadsByActorId,
      })
      if (!decision) return 'attention'
      const highlight = buildTribunalHighlight(game, [decision.player.id])
      dispatch(finalizeFinal3Decision({ hohWinnerId: holder.id, evicteeId: decision.player.id }))
      dispatch(recordTribunalHighlight(highlight))
      return 'eviction'
    } else if (game.weekendInterlude?.active) {
      const weekend = game.weekendInterlude
      if (['intro', 'instructions', 'day_two_intro', 'party'].includes(weekend.stage))
        dispatch(continueWeekendFeature())
      else if (weekend.stage === 'season_so_far') dispatch(advanceWeekendSeasonFact())
      else if (weekend.stage === 'social')
        dispatch(
          weekend.weekendDay === 1 ? beginWeekendDayTransition() : completeWeekendInterlude()
        )
      else if (weekend.stage === 'day_transition') dispatch(advanceWeekendDay())
      else if (weekend.stage === 'tribunal_invitation' && !weekend.tribunalGlimpse)
        dispatch(beginFinaleReunionSocial())
      else if (weekend.stage === 'finale_reunion_social') dispatch(beginWeekendTribunalGlimpse())
      else if (weekend.stage === 'finale_sequester_announcement')
        dispatch(skipWeekendTribunalStream())
      else if (weekend.stage === 'finale_battle_ready') dispatch(completeWeekendInterlude())
      else return 'attention'
    } else if (game.awaitingPublicSave) {
      const result = resolvePairAwarePublicSave(root)
      if (!result.savedId) return 'attention'
      dispatch(commitPublicSave({ savedId: result.savedId }))
    } else if (game.aiReplacementWaiting) dispatch(aiReplacementRendered())
    else if (game.voteResults) dispatch(dismissVoteResults())
    else {
      // Check the real return policy at every post-eviction boundary, including a resumed run.
      if (
        game.phase === 'eviction_results' &&
        (dispatch(tryActivatePendingForcedBattleBack()) || dispatch(tryActivateBattleBack()))
      )
        return 'battle_back'
      dispatch(advance())
    }
    return getState().game === game ? 'attention' : 'advanced'
  }
