import { isAction, type Middleware } from '@reduxjs/toolkit'
import type { RootState } from '../../store/store'
import { trackProductEvent } from '../liveOps/productTelemetry'

/** Observe accepted actions; never serialize arbitrary Redux payloads or AI conversations. */
export const gameplayAnalyticsMiddleware: Middleware = (api) => (next) => (action) => {
  if (!isAction(action)) return next(action)
  const before = api.getState() as RootState
  const result = next(action)
  const after = api.getState() as RootState
  if (after.profiles.isGuest || !after.profiles.activeProfileId) return result
  const context = { week: after.game.week, game_mode: after.game.expansionMode ?? after.game.mode }
  if (
    action.type === 'profiles/createProfile' &&
    after.profiles.profiles.length > before.profiles.profiles.length
  )
    trackProductEvent('profile_created')
  if (
    action.type === 'profiles/selectActiveProfile' &&
    after.profiles.activeProfileId !== before.profiles.activeProfileId
  )
    trackProductEvent('profile_selected')
  if (action.type === 'game/resetGame') {
    if (before.game.status === 'active' && before.game.players.length)
      trackProductEvent('season_abandoned', { week: before.game.week, game_mode: before.game.mode })
    if (after.game.players.length) trackProductEvent('season_started', context)
  }
  if (
    action.type === 'challenge/setPendingChallenge' &&
    after.challenge.pending &&
    after.game.players.some(
      (player) => player.isUser && after.challenge.pending?.participants.includes(player.id)
    ) &&
    after.challenge.pending.id !== before.challenge.pending?.id
  )
    trackProductEvent('minigame_started', {
      ...context,
      game_key: after.challenge.pending.game.key,
    })
  if (
    action.type === 'challenge/recordRun' &&
    after.challenge.history[0] !== before.challenge.history[0]
  ) {
    const run = after.challenge.history[0]
    const human = after.game.players.find((player) => player.isUser)
    if (human && run.participants.includes(human.id))
      trackProductEvent('minigame_completed', {
        game_key: run.gameKey,
        partial: run.partial === true,
        won: run.winnerId === human.id,
        score: run.canonicalScores[human.id],
      })
  }
  if (action.type === 'social/recordSocialAction') {
    const entry = after.social.actionHistory?.at(-1)
    const human = after.game.players.find((player) => player.isUser)
    if (
      entry &&
      human &&
      entry.actorId === human.id &&
      after.social.actionHistory !== before.social.actionHistory
    )
      trackProductEvent('social_action', {
        action_id: entry.actionId,
        phase: after.game.phase,
        week: after.game.week,
      })
  }
  if (
    action.type.startsWith('game/') &&
    !action.type.toLowerCase().includes('hydrate') &&
    before.game.status !== 'completed' &&
    after.game.status === 'completed'
  )
    trackProductEvent('season_completed', context)
  return result
}
