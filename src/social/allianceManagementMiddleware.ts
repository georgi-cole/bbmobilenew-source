import { evaluateAllianceAutonomy } from './reality/allianceAutonomy'
import type { Middleware } from '@reduxjs/toolkit'
import type { RootState } from '../store/store'
import { allianceManagementContext } from './allianceManagementActions'
import { advanceAllianceRequests } from './reality/allianceManagement'
import { isCurrentAlliance } from './reality/allianceIdentity'
import { normalizeRealityDomainState } from './reality/state'
import { recordSocialAction, replaceRealityDomain } from './socialSlice'
import { hasCanonicalLiveAlliance } from './relationshipSemantics'

export const allianceManagementMiddleware: Middleware = (api) => (next) => (action) => {
  const beforeState = api.getState() as RootState
  const result = next(action)
  const type = (action as { type?: string }).type
  if (type === 'game/advance') {
    const state = api.getState() as RootState
    const context = allianceManagementContext(state)
    const domain = normalizeRealityDomainState(state.social.reality)
    advanceAllianceRequests(domain, context)
    evaluateAllianceAutonomy(domain, context)
    if (JSON.stringify(domain) !== JSON.stringify(state.social.reality))
      api.dispatch(replaceRealityDomain(domain))
  }
  if (
    [
      'social/replaceRealityDomain',
      'social/commitRealityOutcome',
      'social/commitRealityDomainUpdate',
      'social/renameRealityAllianceRecord',
      'social/reconcileRealityBattleBackReturn',
      'social/recordRealityCeremony',
    ].includes(type ?? '')
  ) {
    const state = api.getState() as RootState
    api.dispatch({ type: 'game/syncStrategicRelationships', payload: state.social.relationships })
    api.dispatch({
      type: 'game/syncStrategicAlliances',
      payload: Object.values(state.social.reality.alliances)
        .filter(isCurrentAlliance)
        .map((entry) => ({
          id: entry.id,
          memberIds: [...entry.memberIds],
          leaderIds: [...entry.leaderIds],
          status: entry.status,
          cohesion: entry.cohesion,
          fractureRisk: entry.fractureRisk,
          currentTargetIds: [...entry.currentTargetIds],
          fallbackTargetIds: [...entry.fallbackTargetIds],
          memberCommitment: { ...entry.memberCommitment },
          memberPerceivedStatus: { ...entry.memberPerceivedStatus },
          memberPlanBeliefs: { ...entry.memberPlanBeliefs },
          infiltratorIds: [...entry.infiltratorIds],
        })),
    })
    const oldEventIds = new Set(beforeState.social.reality.events.map((entry) => entry.id))
    const membershipEvent = state.social.reality.events.some(
      (entry) =>
        !oldEventIds.has(entry.id) &&
        [
          'ALLIANCE_FORMED',
          'ALLIANCE_MEMBER_RECRUITED',
          'ALLIANCE_MEMBER_LEFT',
          'ALLIANCE_MEMBER_EXPELLED',
          'ALLIANCE_ENDED',
        ].includes(entry.type)
    )
    if (membershipEvent) {
      for (const human of state.game.players.filter((player) => player.isUser)) {
        const gained: string[] = []
        const lost: string[] = []
        for (const player of state.game.players) {
          if (player.id === human.id) continue
          const before = hasCanonicalLiveAlliance(beforeState.social.reality, human.id, player.id)
          const after = hasCanonicalLiveAlliance(state.social.reality, human.id, player.id)
          if (!before && after) gained.push(player.id)
          if (before && !after) lost.push(player.id)
        }
        for (const [actionId, targetIds] of [
          ['proposeAlliance', gained],
          ['break_alliance', lost],
        ] as const) {
          if (!targetIds.length) continue
          api.dispatch(
            recordSocialAction({
              entry: {
                actionId,
                actorId: human.id,
                targetId: targetIds[0],
                targetIds: [...targetIds],
                cost: 0,
                delta: 0,
                outcome: 'success',
                newEnergy: state.social.energyBank[human.id] ?? 0,
                timestamp: Date.now(),
                week: state.game.week,
                phase: state.game.phase,
                source: 'system',
                narrative:
                  actionId === 'proposeAlliance'
                    ? 'An agreed alliance commitment is now active.'
                    : 'The last alliance connection through the selected commitment has ended.',
              },
            })
          )
        }
      }
    }
  }
  return result
}
