import {
  getCompetitionSeasonState,
  getDefaultCompetitionProfile,
  getMinigameAiModelForGame,
  simulateMinigameAiScore,
} from '../ai/competition'
import { simulateQuickTapVipAiRace } from '../minigames/quickTapRace/vip/quickTapVipLogic'
import {
  applyCompetitionIntentToScore,
  decideCompetitionIntent,
} from '../social/intelligenceSystem'
import { hasEffectiveStoreEntitlement } from '../vip/effectiveEntitlements'
import { setPendingChallenge } from './challengeSlice'
import type { AppDispatch, RootState } from './store'

/** Restore an unfinished edition using the same contestants, draw and seed. */
export const reconcileQuickTapChallenge =
  (useCachedAccess = false) =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const root = getState()
    const pending = root.challenge.pending
    if (!pending?.needsEditionReconciliation) return true
    if (pending.game.key !== 'quickTap' && pending.game.key !== 'quickTapSeasons') return true
    // A temporary empty entitlement during startup/restore must not downgrade a save.
    // After a failed check the player may explicitly continue with cached access.
    if (root.vip.status !== 'ready' && !useCachedAccess) return false
    const variant = hasEffectiveStoreEntitlement(root.vip, 'premiumChallenges') ? 'vip' : 'classic'
    if (pending.quickTapVariant === variant) {
      dispatch(setPendingChallenge({ ...pending, needsEditionReconciliation: false }))
      return true
    }

    const game = root.game
    const identityMode =
      game.mode === 'survival'
        ? 'survival'
        : game.voxPopuli?.status === 'active'
          ? 'vox_populi'
          : game.cupidArrow?.status === 'active'
            ? 'cupid'
            : 'classic'
    const model = getMinigameAiModelForGame(pending.game)
    const aiScores: Record<string, number> = {}
    const competitionIntents = { ...pending.competitionIntents }
    pending.participants.forEach((id, index) => {
      const player = game.players.find((candidate) => candidate.id === id)
      if (player?.isUser) return
      const profile = player?.competitionProfile ?? getDefaultCompetitionProfile()
      const intent =
        competitionIntents[id] ??
        decideCompetitionIntent(pending.seed, id, player?.aiGameIdentity, {
          mode: identityMode,
          day: game.week,
          phase: game.phase,
          prizeType: pending.prizeType,
          playerStatus: player?.status,
          forcedWinner: false,
        })
      competitionIntents[id] = intent
      if (variant === 'vip') {
        aiScores[id] = simulateQuickTapVipAiRace({
          seed: pending.seed,
          playerId: id,
          profile,
          mode: pending.game.key === 'quickTapSeasons' ? 'seasons' : 'race',
        }).score
      } else {
        const timeLimitMs = pending.game.timeLimitMs > 0 ? pending.game.timeLimitMs : undefined
        const score = simulateMinigameAiScore({
          gameKey: pending.game.key,
          minigameModel: model,
          seed: pending.seed,
          playerId: id,
          participantIndex: index,
          profile,
          seasonState: getCompetitionSeasonState(game.competitionSeasonStateByPlayerId, id),
          aiGameIdentity: player?.aiGameIdentity,
          identityMode,
          timeLimitMs,
          timeLimitSeconds: timeLimitMs ? timeLimitMs / 1000 : undefined,
        })
        aiScores[id] = applyCompetitionIntentToScore(score, model, intent, pending.seed, id)
      }
    })
    dispatch(
      setPendingChallenge({
        ...pending,
        quickTapVariant: variant,
        aiScores,
        aiTiebreakers: undefined,
        forcedWinnerId: undefined,
        competitionIntents,
        needsEditionReconciliation: false,
        phase: 'rules',
        editionChangeNotice: pending.quickTapVariant
          ? `Your available edition has changed. This unfinished challenge will restart in the ${variant === 'vip' ? 'premium' : 'standard'} edition so everyone plays by the same rules. No retry is used.`
          : 'This saved challenge has been updated. Everyone will restart with matching rules and scoring. No retry is used.',
      })
    )
    return true
  }
