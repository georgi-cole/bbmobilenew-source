import { getSocialMotivePreferences } from '../socialDecisionPreferences'
import { getSocialPersonality } from '../socialPersonalityBank'
import type { AllianceManagementContext } from './allianceManagement'
import type { RealityDomainState } from './types'

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

/** Observer-specific, bounded invitation preferences. This is neither consent
 * nor a claim that an ally will protect the actor or control the audience. */
export function evaluateAllianceStrategicFit(
  state: RealityDomainState,
  context: AllianceManagementContext,
  actorId: string,
  partnerIds: readonly string[]
) {
  const format = context.strategicMode?.format
  const neutral = {
    modifier: 0,
    tactical: false,
    reason: '',
    factors: { survival: 0, reliability: 0, audienceConcern: 0, fear: 0 },
  }
  if (format !== 'classic' && format !== 'vox') return neutral
  const partners = [...new Set(partnerIds)].filter((id) => id !== actorId)
  if (!partners.length) return neutral
  const identity = context.identityByActorId?.[actorId]
  const motives = getSocialMotivePreferences(actorId, identity)
  const personality = getSocialPersonality(actorId)
  const edges = partners.map((id) => state.relationships[actorId]?.[id])
  const fear = Math.max(...edges.map((edge) => clamp((edge?.fear ?? 0) / 100)))
  const trust = edges.reduce((sum, edge) => sum + (edge?.trust ?? 0), 0) / partners.length
  const atRisk = context.atRiskActorIds?.includes(actorId) === true
  const concentratedPower =
    format === 'classic' && partners.some((id) => context.strategicMode?.powers.lohIds.includes(id))
  const survival =
    (atRisk ? 0.045 : 0) +
    fear * (0.035 + motives.fear * 0.055) +
    (concentratedPower && atRisk ? 0.06 * (identity?.survivalFocus ?? 0.5) : 0)
  const promises = Object.values(state.promises).filter(
    (promise) =>
      partners.includes(promise.promisorId) &&
      (promise.beneficiaryIds.includes(actorId) ||
        promise.witnessIds.includes(actorId) ||
        promise.visibility === 'HOUSE_PUBLIC' ||
        promise.visibility === 'CEREMONY_PUBLIC')
  )
  const reliability =
    Math.min(2, promises.filter((p) => p.status === 'KEPT').length) * 0.025 -
    Math.min(2, promises.filter((p) => p.status === 'BROKEN').length) *
      (0.035 + motives.loyalty * 0.035)
  // Public conflict can make association costly without proving who was right.
  // Never infer misconduct from low approval or an unwitnessed private scene.
  const publicConflict = state.events
    .slice(-80)
    .some(
      (event) =>
        event.day <= context.at.day &&
        event.day >= context.at.day - 3 &&
        partners.includes(event.actorId ?? '') &&
        ['startFight', 'public_callout'].includes(event.actionId ?? '') &&
        (event.visibility === 'HOUSE_PUBLIC' || event.visibility === 'CEREMONY_PUBLIC') &&
        (event.participantIds.includes(actorId) || event.witnessIds.includes(actorId)) &&
        event.outcome !== 'IGNORED' &&
        event.outcome !== 'FAILURE'
    )
  const audienceConcern =
    format === 'vox' && publicConflict
      ? (identity?.audienceFocus ?? 0.5) *
        (0.055 + motives.loyalty * 0.14) *
        (1 - personality.deceptionComfort * 0.45) *
        (1 - fear * 0.45)
      : 0
  const modifier = clamp(survival + reliability - audienceConcern, -0.2, 0.18)
  if (!Number.isFinite(modifier)) return neutral
  const tactical = trust < 0 && survival > 0.045
  const reason =
    audienceConcern > survival + 0.02
      ? 'I saw the public conflict. I need clear limits before tying my game to yours.'
      : tactical
        ? 'Working together could reduce my immediate risk, but it does not repair our personal trust.'
        : reliability < -0.03
          ? 'The broken commitments I know about make this agreement harder to rely on.'
          : atRisk
            ? 'Mutual support could help with my nomination risk, but nobody can guarantee my survival.'
            : ''
  return { modifier, tactical, reason, factors: { survival, reliability, audienceConcern, fear } }
}
