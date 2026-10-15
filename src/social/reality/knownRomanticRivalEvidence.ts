import type { RealityDomainState } from './types'

export interface KnownRomanticRivalEvidence {
  partnerId: string
  evidenceDay: number
  confidence: number
  source: 'witnessed' | 'public' | 'reported' | 'inferred'
}

export type KnownRomanticRivalEvidenceMap = Record<
  string,
  Record<string, KnownRomanticRivalEvidence>
>

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function preferEvidence(
  map: KnownRomanticRivalEvidenceMap,
  observerId: string,
  rivalId: string,
  evidence: KnownRomanticRivalEvidence
): void {
  const current = map[observerId]?.[rivalId]
  if (current && current.confidence >= evidence.confidence) return
  map[observerId] ??= {}
  map[observerId][rivalId] = evidence
}

/**
 * Builds actor-specific evidence for a romantic rival. A private pairing alone
 * is not enough: the actor needs a witnessed/public event or an active belief
 * that names the couple.
 */
export function buildKnownRomanticRivalEvidence(
  domain: RealityDomainState | undefined
): KnownRomanticRivalEvidenceMap {
  const result: KnownRomanticRivalEvidenceMap = {}
  if (!domain) return result

  for (const thread of Object.values(domain.threads)) {
    if (
      thread.type !== 'JEALOUSY' ||
      thread.stage !== 'ROMANTIC_INSECURITY' ||
      thread.status !== 'OPEN'
    ) {
      continue
    }
    const event = domain.events.find((candidate) => candidate.id === thread.triggerEventId)
    const observerId = thread.jealousObserverId ?? thread.participantIds[0]
    if (!observerId) continue
    const witnessed = Boolean(
      event?.witnessIds.includes(observerId) || thread.observerIds.includes(observerId)
    )
    const publicEvidence =
      event?.visibility === 'HOUSE_PUBLIC' || event?.visibility === 'CEREMONY_PUBLIC'
    if (!witnessed && !publicEvidence) continue

    const activeBond = Object.values(domain.romances).find(
      (romance) =>
        romance.status === 'ACTIVE' &&
        romance.participantIds.includes(observerId) &&
        romance.participantIds.some(
          (id) => (thread.participantIds ?? []).includes(id) && id !== observerId
        )
    )
    const partnerId =
      thread.romanticPartnerId ??
      activeBond?.participantIds.find(
        (id) => id !== observerId && thread.participantIds.includes(id)
      )
    const rivalId =
      thread.romanticRivalId ??
      thread.participantIds.find((id) => id !== observerId && id !== partnerId)
    if (!partnerId || !rivalId) continue

    preferEvidence(result, observerId, rivalId, {
      partnerId,
      evidenceDay: event?.day ?? thread.earliest?.day ?? 0,
      confidence: clampConfidence(thread.importance),
      source: publicEvidence ? 'public' : 'witnessed',
    })
  }

  for (const [observerId, beliefs] of Object.entries(domain.beliefsByOwner)) {
    const activePartnerIds = Object.values(domain.romances)
      .filter(
        (romance) => romance.status === 'ACTIVE' && romance.participantIds.includes(observerId)
      )
      .flatMap((romance) => romance.participantIds.filter((id) => id !== observerId))
    if (activePartnerIds.length === 0) continue

    for (const belief of Object.values(beliefs)) {
      if (
        !['SECRET_ROMANCE', 'ROMANCE', 'ROMANTIC_RELATIONSHIP'].includes(belief.propositionType) ||
        belief.status === 'DISPROVEN' ||
        belief.status === 'STALE' ||
        belief.confidence < 0.55
      ) {
        continue
      }
      const partnerId = activePartnerIds.find((id) => belief.subjectIds.includes(id))
      if (!partnerId) continue
      const rivalId = belief.subjectIds.find((id) => id !== partnerId && id !== observerId)
      if (!rivalId) continue
      const supportingMemories = (domain.memoriesByOwner[observerId] ?? []).filter((memory) =>
        belief.supportingMemoryIds.includes(memory.id)
      )
      if (supportingMemories.length === 0) continue
      const sourceTypes = new Set(supportingMemories.map((memory) => memory.sourceType))
      const hasPublicEvidence = supportingMemories.some(
        (memory) => memory.visibility === 'HOUSE_PUBLIC' || memory.visibility === 'CEREMONY_PUBLIC'
      )
      preferEvidence(result, observerId, rivalId, {
        partnerId,
        evidenceDay: belief.lastUpdatedDay,
        confidence: clampConfidence(belief.confidence),
        source: hasPublicEvidence
          ? 'public'
          : sourceTypes.has('HEARSAY')
            ? 'reported'
            : sourceTypes.has('INFERRED')
              ? 'inferred'
              : 'witnessed',
      })
    }
  }

  return result
}
