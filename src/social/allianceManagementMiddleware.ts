import { evaluateAllianceAutonomy } from './reality/allianceAutonomy'
import type { Middleware } from '@reduxjs/toolkit'
import type { RootState } from '../store/store'
import { allianceManagementContext } from './allianceManagementActions'
import { advanceAllianceRequests } from './reality/allianceManagement'
import { isCurrentAlliance } from './reality/allianceIdentity'
import { normalizeRealityDomainState } from './reality/state'
import { recordSocialAction, replaceRealityDomain } from './socialSlice'
import { hasCanonicalLiveAlliance } from './relationshipSemantics'
import { canSeeAllianceRequest } from './reality/allianceManagement'
import type { RealityAllianceRequest } from './reality/types'

function allianceRequestUpdateNarrative(
  request: RealityAllianceRequest,
  state: RootState,
  viewerId: string
): string {
  const name = (id: string | undefined) =>
    id ? (state.game.players.find((player) => player.id === id)?.name ?? id) : 'the invitee'
  const allianceName = request.allianceId
    ? (state.social.reality.alliances[request.allianceId]?.name ?? request.name ?? 'the alliance')
    : (request.name ?? 'the alliance')
  const candidateName = name(request.candidateId)
  const viewerIsCandidate = request.candidateId === viewerId
  const voteSummary = viewerIsCandidate ? undefined : request.voteSummary

  if (request.status === 'CONSENT')
    return `${voteSummary ? `${voteSummary} ` : ''}${allianceName} approved inviting ${candidateName}. The invitation is now with ${candidateName}; they have not joined yet.`
  if (request.status === 'ACCEPTED')
    return `${voteSummary ? `${voteSummary} ` : ''}${request.reason ?? `${candidateName} accepted and joined ${allianceName}.`}`
  if (request.status === 'DECLINED')
    return `${voteSummary ? `${voteSummary} ` : ''}${request.reason ?? `The invitation decision for ${candidateName} was declined.`}`.trim()
  if (request.status === 'EXPIRED')
    return `${voteSummary ? `${voteSummary} ` : ''}The invitation decision for ${candidateName} expired. ${request.reason ?? ''}`.trim()
  if (request.status === 'INVALIDATED')
    return `${voteSummary ? `${voteSummary} ` : ''}The invitation to ${candidateName} could not go ahead. ${request.reason ?? ''}`.trim()
  return `${voteSummary ? `${voteSummary} ` : ''}The invitation to ${candidateName} was withdrawn. ${request.reason ?? ''}`.trim()
}

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

    const previousRequests = beforeState.social.reality.allianceManagement?.requests ?? {}
    for (const request of Object.values(state.social.reality.allianceManagement?.requests ?? {})) {
      const previous = previousRequests[request.id]
      if (
        request.kind !== 'ADMIT' ||
        !previous ||
        previous.status === request.status ||
        !['CONSENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'INVALIDATED', 'WITHDRAWN'].includes(
          request.status
        )
      )
        continue

      for (const human of state.game.players.filter((player) => player.isUser)) {
        if (!canSeeAllianceRequest(request, human.id)) continue
        const candidateId = request.candidateId ?? request.proposerId
        api.dispatch(
          recordSocialAction({
            entry: {
              actionId: 'alliance_admit_result',
              actorId: human.id,
              targetId: candidateId,
              targetIds: [candidateId],
              cost: 0,
              delta: 0,
              outcome:
                request.status === 'ACCEPTED' || request.status === 'CONSENT'
                  ? 'success'
                  : 'failure',
              label: request.status === 'CONSENT' ? 'Group approved' : 'Decision recorded',
              newEnergy: state.social.energyBank[human.id] ?? 0,
              timestamp: Date.now(),
              week: state.game.week,
              phase: state.game.phase,
              source: 'system',
              narrative: allianceRequestUpdateNarrative(request, state, human.id),
            },
          })
        )
      }
    }
  }
  return result
}
