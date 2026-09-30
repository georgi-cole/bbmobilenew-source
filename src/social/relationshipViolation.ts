/**
 * Canonical social-cost evaluator for ceremonial decisions.  It intentionally
 * deals in relationship facts rather than whether the human is involved, so
 * the same result is usable by manual actions and AI simulation.
 */
export type RelationshipViolationClassification =
  | 'NONE'
  | 'RELATIONSHIP_HURT'
  | 'BROKEN_PROMISE'
  | 'BETRAYAL'

export interface FacadeAgreementContext {
  status: 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'FULFILLED' | 'FAILED' | 'BROKEN' | 'EXPIRED'
  lohId: string
  facadeId: string
  stage: 'INITIAL_NOMINATION' | 'REPLACEMENT'
}

export interface RelationshipViolationInput {
  actorId: string
  targetId: string
  actionType: 'NOMINATION' | 'VOTE' | 'SAFETY_ABANDON' | 'SOCIAL_BETRAYAL'
  /** Tags from both directed relationship edges. */
  relationshipTags: readonly string[]
  /** Legal alternatives for this exact decision, not merely all houseguests. */
  eligibleAlternatives?: readonly { id: string; relationshipTags: readonly string[] }[]
  promiseBroken?: boolean
  facadeAgreement?: FacadeAgreementContext | null
  explicitDefection?: boolean
}

export interface RelationshipViolation {
  classification: RelationshipViolationClassification
  severity: number
  reasons: string[]
  forcedChoice: boolean
  consentProtected: boolean
  violatedBondTier: 0 | 1 | 2 | 3
}

const ALLY_TAGS = new Set(['alliance', 'primary_alliance', 'ride_or_die', 'romance', 'bromance'])

function bondTier(tags: readonly string[]): 0 | 1 | 2 | 3 {
  if (tags.some((tag) => tag === 'ride_or_die' || tag === 'romance')) return 3
  if (tags.includes('primary_alliance')) return 2
  if (tags.some((tag) => tag === 'alliance' || tag === 'bromance')) return 1
  return 0
}

function isAlly(tags: readonly string[]): boolean {
  return tags.some((tag) => ALLY_TAGS.has(tag))
}

export function evaluateRelationshipViolation(
  input: RelationshipViolationInput
): RelationshipViolation {
  const tier = bondTier(input.relationshipTags)
  const reasons: string[] = []
  const acceptedFacade =
    input.facadeAgreement?.status === 'ACCEPTED' &&
    input.facadeAgreement.lohId === input.actorId &&
    input.facadeAgreement.facadeId === input.targetId &&
    input.actionType === 'NOMINATION'
  if (acceptedFacade) {
    return {
      classification: 'NONE',
      severity: 0,
      reasons: ['accepted_facade'],
      forcedChoice: false,
      consentProtected: true,
      violatedBondTier: tier,
    }
  }

  if (input.explicitDefection || input.actionType === 'SOCIAL_BETRAYAL') {
    return {
      classification: 'BETRAYAL',
      severity: 0.82,
      reasons: ['explicit_defection'],
      forcedChoice: false,
      consentProtected: false,
      violatedBondTier: tier,
    }
  }
  if (input.promiseBroken) {
    return {
      classification: tier > 0 ? 'BETRAYAL' : 'BROKEN_PROMISE',
      severity: tier > 0 ? 0.72 : 0.42,
      reasons: ['broken_promise'],
      forcedChoice: false,
      consentProtected: false,
      violatedBondTier: tier,
    }
  }
  if (!isAlly(input.relationshipTags)) {
    return {
      classification: 'RELATIONSHIP_HURT',
      severity: 0.16,
      reasons: ['no_formal_protection'],
      forcedChoice: false,
      consentProtected: false,
      violatedBondTier: 0,
    }
  }

  const hasAlternativeContext = input.eligibleAlternatives !== undefined
  const alternatives = input.eligibleAlternatives ?? []
  const nonAlliedAlternativeExists = alternatives.some(
    (alternative) => alternative.id !== input.targetId && !isAlly(alternative.relationshipTags)
  )
  const comparableChoiceExists = alternatives.some(
    (alternative) =>
      alternative.id !== input.targetId && bondTier(alternative.relationshipTags) >= tier
  )
  const weakerProtectedAlternativeExists = alternatives.some(
    (alternative) =>
      alternative.id !== input.targetId &&
      isAlly(alternative.relationshipTags) &&
      bondTier(alternative.relationshipTags) < tier
  )
  // Older call sites without a legal-choice snapshot retain the conservative
  // historical outcome. A forced-choice exemption is only safe when the
  // evaluator has the complete legal set for that ceremony.
  const forcedChoice = hasAlternativeContext && !nonAlliedAlternativeExists

  if (forcedChoice && !weakerProtectedAlternativeExists) {
    reasons.push('forced_choice')
    return {
      classification: 'RELATIONSHIP_HURT',
      severity: comparableChoiceExists ? 0.14 : 0.2,
      reasons,
      forcedChoice: true,
      consentProtected: false,
      violatedBondTier: tier,
    }
  }
  if (tier >= 3 && weakerProtectedAlternativeExists) reasons.push('stronger_bond_bypassed')
  else reasons.push('protected_ally_harmed')
  return {
    classification: 'BETRAYAL',
    severity: tier >= 3 && weakerProtectedAlternativeExists ? 0.78 : 0.48 + tier * 0.06,
    reasons,
    forcedChoice,
    consentProtected: false,
    violatedBondTier: tier,
  }
}
