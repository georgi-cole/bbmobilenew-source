import { compareSocialClock } from './clock'
import { getCurrentPact, isCurrentAlliance } from './allianceIdentity'
import type {
  RealityClock,
  RealityDebt,
  RealityDomainState,
  RealityPromise,
  RealitySecret,
  RealityThread,
} from './types'
import { recordGroundedScandalFromSecret } from './relationshipAutonomy'
import { adjustRealityAllianceCommitment } from './relationshipForms'

export function compareRealityClock(left: RealityClock, right: RealityClock): number {
  return compareSocialClock(left, right)
}

export function upsertRealityPromise(state: RealityDomainState, promise: RealityPromise): void {
  promise = {
    ...promise,
    originatingAllianceId:
      promise.originatingAllianceId ??
      (typeof promise.scope.allianceId === 'string'
        ? promise.scope.allianceId
        : promise.beneficiaryIds.length === 1
          ? getCurrentPact(state, promise.promisorId, promise.beneficiaryIds[0])?.id
          : undefined),
  }
  state.promises[promise.id] = promise
  for (const beneficiaryId of promise.beneficiaryIds) {
    const edge = state.relationships[promise.promisorId]?.[beneficiaryId]
    if (edge && !edge.activePromiseIds.includes(promise.id)) edge.activePromiseIds.push(promise.id)
  }
}

function applyPromiseAllianceConsequence(
  state: RealityDomainState,
  promise: RealityPromise,
  status: 'KEPT' | 'BROKEN' | 'VOID'
): void {
  if (status === 'VOID') return
  const stakeWeight = 0.5 + Math.max(0, Math.min(1, promise.stakes)) * 0.5
  const beneficiariesByAlliance = new Map<string, string[]>()

  for (const beneficiaryId of promise.beneficiaryIds) {
    const alliance = promise.originatingAllianceId
      ? state.alliances[promise.originatingAllianceId]
      : undefined
    if (
      !isCurrentAlliance(alliance) ||
      !alliance.memberIds.includes(promise.promisorId) ||
      !alliance.memberIds.includes(beneficiaryId)
    )
      continue
    beneficiariesByAlliance.set(alliance.id, [
      ...(beneficiariesByAlliance.get(alliance.id) ?? []),
      beneficiaryId,
    ])
  }

  for (const [allianceId, beneficiaryIds] of beneficiariesByAlliance) {
    adjustRealityAllianceCommitment(
      state,
      allianceId,
      promise.promisorId,
      (status === 'KEPT' ? 0.035 : -0.07) * stakeWeight
    )
    for (const beneficiaryId of [...new Set(beneficiaryIds)]) {
      adjustRealityAllianceCommitment(
        state,
        allianceId,
        beneficiaryId,
        (status === 'KEPT' ? 0.02 : -0.03) * stakeWeight
      )
    }
  }
}

export function resolveRealityPromise(
  state: RealityDomainState,
  promiseId: string,
  status: 'KEPT' | 'BROKEN' | 'VOID',
  at: RealityClock,
  eventId: string,
  options: { skipAllianceConsequence?: boolean } = {}
): RealityPromise | null {
  const promise = state.promises[promiseId]
  if (
    !promise ||
    (promise.status !== 'ACTIVE' && !(status === 'VOID' && promise.status === 'PROPOSED'))
  )
    return null
  promise.status = status
  promise.resolvedAt = at
  promise.resolutionEventId = eventId
  for (const beneficiaryId of promise.beneficiaryIds) {
    const edge = state.relationships[promise.promisorId]?.[beneficiaryId]
    if (edge) edge.activePromiseIds = edge.activePromiseIds.filter((id) => id !== promise.id)
  }
  if (!options.skipAllianceConsequence) applyPromiseAllianceConsequence(state, promise, status)
  return promise
}

export function overdueRealityPromises(
  state: RealityDomainState,
  now: RealityClock
): RealityPromise[] {
  return Object.values(state.promises).filter(
    (promise) =>
      promise.status === 'ACTIVE' &&
      promise.deadline !== undefined &&
      compareRealityClock(promise.deadline, now) < 0
  )
}

export function upsertRealityDebt(state: RealityDomainState, debt: RealityDebt): void {
  state.debts[debt.id] = debt
  const edge = state.relationships[debt.debtorId]?.[debt.creditorId]
  if (edge && !edge.activeDebtIds.includes(debt.id)) edge.activeDebtIds.push(debt.id)
}

export function upsertRealitySecret(state: RealityDomainState, secret: RealitySecret): void {
  state.secrets[secret.id] = {
    ...secret,
    ownerIds: [...new Set(secret.ownerIds)],
    knowerIds: [...new Set(secret.knowerIds)],
    suspectedByIds: [...new Set(secret.suspectedByIds)],
  }
  recordGroundedScandalFromSecret(state, secret.id)
}

export function upsertRealityThread(state: RealityDomainState, thread: RealityThread): void {
  state.threads[thread.id] = {
    ...thread,
    participantIds: [...new Set(thread.participantIds)],
    observerIds: [...new Set(thread.observerIds)],
    continuationActionIds: [...new Set(thread.continuationActionIds)],
  }
}

export function expireRealityThreads(state: RealityDomainState, now: RealityClock): string[] {
  const expiredIds: string[] = []
  for (const thread of Object.values(state.threads)) {
    if (
      thread.status === 'OPEN' &&
      thread.deadline &&
      compareRealityClock(thread.deadline, now) < 0
    ) {
      thread.status = 'EXPIRED'
      expiredIds.push(thread.id)
    }
  }
  return expiredIds
}
