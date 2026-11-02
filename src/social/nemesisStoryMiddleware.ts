import type { Middleware } from '@reduxjs/toolkit'
import { createDraft, finishDraft } from 'immer'
import { addTvEvent } from '../store/gameSlice'
import type { RootState } from '../store/store'
import { advanceNemesisNarrative } from './reality/nemesisNarrative'
import { getEffectiveSocialMode } from './socialMode'
import { commitRealityDomainUpdate } from './socialSlice'

const PHASE_ACTIONS = new Set(['game/advance', 'game/setPhase', 'game/forcePhase'])

/**
 * Keep Nemesis scenes independent of random AI ticks and incoming-message caps.
 * Each phase transition can deliver one grounded, persisted storyline beat,
 * including the reveal of an antagonist who left before their next encounter.
 */
export const nemesisStoryMiddleware: Middleware = (api) => (next) => (action) => {
  const type = (action as { type?: string } | null)?.type
  if (!type || !PHASE_ACTIONS.has(type)) return next(action)

  const before = api.getState() as RootState
  const result = next(action)
  const after = api.getState() as RootState
  if (before.game.phase === after.game.phase && before.game.week === after.game.week) return result
  if (getEffectiveSocialMode(after) !== 'drama') return result
  if (after.game.mode === 'survival' || after.game.weekendInterlude?.active) return result

  const human = after.game.players.find((player) => player.isUser)
  if (!human) return result
  // A juror can still watch the season. The narrative reducer will close the
  // antagonist only at a valid end-of-day/endgame transition, never inject
  // ordinary social scenes after the player has left.
  if (
    !after.social.reality ||
    !Object.values(after.social.reality.relationshipAutonomy.nemeses).some(
      (nemesis) =>
        nemesis.targetId === human.id &&
        !nemesis.revealEventId &&
        (nemesis.status === 'ACTIVE' ||
          (nemesis.status === 'RECONCILED' && nemesis.reconciledAt !== undefined))
    )
  ) {
    return result
  }

  const domainDraft = createDraft(after.social.reality)
  const beats = advanceNemesisNarrative(domainDraft, {
    humanId: human.id,
    day: after.game.week,
    phase: after.game.phase,
    playerNames: Object.fromEntries(after.game.players.map((player) => [player.id, player.name])),
    activePlayerIds: new Set(
      after.game.players
        .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
        .map((player) => player.id)
    ),
  })
  const domain = finishDraft(domainDraft)
  if (!beats.length) return result

  // Save the story state before queuing its broadcast. Repeated Play presses,
  // route remounts and save hydration cannot replay already-recorded beats.
  api.dispatch(
    commitRealityDomainUpdate({
      domain,
      projectAllRelationships: true,
    })
  )
  for (const beat of beats) {
    api.dispatch(
      addTvEvent({
        text: beat.text,
        type: 'social',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          phase: after.game.phase,
          week: after.game.week,
          broadcastLevel: 'minor',
          broadcastDelivery: 'next',
          forceOnTv: true,
          nemesisStory: beat.kind,
          nemesisEventId: beat.eventId,
          nemesisObjectiveId: beat.objectiveId,
        },
      })
    )
  }
  return result
}
