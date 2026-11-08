export interface IncomingInteractionValidityRule {
  senderMustBeNominee?: boolean
  senderMustBeReplacementNominee?: boolean
  senderMustBeHoh?: boolean
  senderMustHoldSafety?: boolean
  senderMustBeEligibleVoter?: boolean
  humanMustBeHoh?: boolean
  humanMustHoldSafety?: boolean
  humanMustBeOffBlock?: boolean
  /** Current-block guard; intentionally never derives from a stale status tag. */
  humanMustBeNominee?: boolean
  humanMustBeEligibleVoter?: boolean
  humanMustBreakTie?: boolean
  nominationWindow?: 'setup' | 'aftermath'
  subjectMustBeInHouse?: boolean
  /** Direct conversations use the current decision, without alliance membership. */
  directDecision?: 'nomination' | 'replacement' | 'vote'
  requiresDecisionTarget?: boolean
  allowedPhases?: readonly string[]
  invalidPhases?: readonly string[]
}

/**
 * Pure-data validity rules keyed by scenario. These can be moved to validated
 * live config later without changing the evaluator or message components.
 */
export const INCOMING_INTERACTION_VALIDITY_BANK: Record<string, IncomingInteractionValidityRule> = {
  nominee_veto_pitch: {
    senderMustBeNominee: true,
    humanMustHoldSafety: true,
    allowedPhases: ['pos_results', 'pos_ceremony', 'pos_ceremony_results'],
  },
  nominee_hoh_plea: {
    senderMustBeNominee: false,
    humanMustBeHoh: true,
    nominationWindow: 'setup',
    allowedPhases: ['loh_results', 'social_1', 'nominations', 'nomination_results'],
  },
  background_nominate_human: {
    senderMustBeHoh: true,
    humanMustBeHoh: false,
    humanMustBeOffBlock: true,
    nominationWindow: 'setup',
    allowedPhases: ['loh_results', 'social_1', 'nominations'],
  },
  direct_nomination_pitch: {
    directDecision: 'nomination',
    humanMustBeHoh: true,
    requiresDecisionTarget: true,
    allowedPhases: ['loh_results', 'social_1', 'nominations', 'nomination_results'],
  },
  loh_target_inquiry: {
    directDecision: 'nomination',
    humanMustBeHoh: true,
    allowedPhases: ['loh_results', 'social_1', 'nominations', 'nomination_results'],
  },
  nomination_advice_inquiry: {
    directDecision: 'nomination',
    senderMustBeHoh: true,
    allowedPhases: ['loh_results', 'social_1', 'nominations', 'nomination_results'],
  },
  direct_replacement_pitch: {
    directDecision: 'replacement',
    requiresDecisionTarget: true,
    allowedPhases: [
      'nomination_results',
      'pre_veto_public_save',
      'pos_comp_announcement',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
      'pos_ceremony_results',
    ],
  },
  direct_vote_pitch: {
    directDecision: 'vote',
    humanMustBeEligibleVoter: true,
    requiresDecisionTarget: true,
    allowedPhases: ['pos_ceremony_results', 'social_2', 'live_vote'],
  },
  vote_rally_warning: {
    directDecision: 'vote',
    humanMustBeNominee: true,
    allowedPhases: ['pos_ceremony_results', 'social_2', 'live_vote'],
  },
  nomination_aftershock: {
    senderMustBeNominee: true,
    nominationWindow: 'aftermath',
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  nominee_campaign: {
    senderMustBeNominee: true,
    humanMustBeOffBlock: true,
    humanMustBeEligibleVoter: true,
    allowedPhases: ['social_2', 'live_vote'],
  },
  post_veto_campaign: {
    senderMustBeNominee: true,
    humanMustBeOffBlock: true,
    humanMustBeEligibleVoter: true,
    allowedPhases: ['social_2', 'live_vote'],
  },
  live_vote_pitch: {
    senderMustBeNominee: true,
    humanMustBeOffBlock: true,
    humanMustBeEligibleVoter: true,
    allowedPhases: ['live_vote'],
  },
  tie_break_campaign: {
    senderMustBeNominee: true,
    humanMustBreakTie: true,
    allowedPhases: ['eviction_results'],
  },
  post_veto_gratitude: {
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  hoh_safety_request: {
    senderMustBeNominee: false,
    humanMustBeHoh: true,
    nominationWindow: 'setup',
    allowedPhases: ['loh_results', 'social_1', 'nominations', 'nomination_results'],
  },
  allied_loh_plan_check_in: {
    senderMustBeNominee: false,
    humanMustBeHoh: true,
    nominationWindow: 'setup',
    allowedPhases: ['loh_results', 'social_1', 'nominations', 'nomination_results'],
  },
  co_nominee_check_in: {
    senderMustBeNominee: true,
    humanMustBeNominee: true,
    allowedPhases: ['social_2', 'live_vote'],
  },
  safety_plan_inquiry: {
    humanMustHoldSafety: true,
    allowedPhases: ['pos_results', 'pos_ceremony', 'pos_ceremony_results'],
  },
  safety_hold_request: {
    senderMustBeHoh: true,
    humanMustHoldSafety: true,
    allowedPhases: ['pos_results', 'pos_ceremony', 'pos_ceremony_results'],
  },
  safety_holder_consults_loh: {
    senderMustHoldSafety: true,
    humanMustBeHoh: true,
    allowedPhases: ['pos_results', 'pos_ceremony'],
  },
  loh_consults_safety_holder: {
    senderMustBeHoh: true,
    humanMustHoldSafety: true,
    allowedPhases: ['pos_results', 'pos_ceremony', 'pos_ceremony_results'],
  },
  nominee_understands_loh: {
    senderMustBeNominee: true,
    humanMustBeHoh: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  unavoidable_nominee_reaction: {
    senderMustBeNominee: true,
    humanMustBeHoh: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  automatic_nominee_reaction: {
    senderMustBeNominee: true,
    nominationWindow: 'aftermath',
    allowedPhases: ['nomination_results'],
  },
  nominee_confronts_loh: {
    senderMustBeNominee: true,
    humanMustBeHoh: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  replacement_nominee_reacts_to_loh: {
    senderMustBeNominee: true,
    senderMustBeReplacementNominee: true,
    humanMustBeHoh: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  alliance_nomination_pitch: {
    humanMustBeHoh: true,
    nominationWindow: 'setup',
    subjectMustBeInHouse: true,
    allowedPhases: ['loh_results', 'social_1', 'nominations'],
  },
  alliance_vox_ballot_pitch: {
    subjectMustBeInHouse: true,
    allowedPhases: ['social_1', 'nominations'],
  },
  alliance_safety_pitch: {
    humanMustHoldSafety: true,
    subjectMustBeInHouse: true,
    allowedPhases: ['pos_results'],
  },
  alliance_vote_pitch: {
    senderMustBeEligibleVoter: true,
    humanMustBeEligibleVoter: true,
    subjectMustBeInHouse: true,
    allowedPhases: ['social_2', 'live_vote'],
  },
  alliance_power_nomination_huddle: {
    senderMustBeHoh: true,
    nominationWindow: 'setup',
    subjectMustBeInHouse: true,
    allowedPhases: ['loh_results', 'social_1', 'nominations'],
  },
  alliance_power_safety_huddle: {
    senderMustHoldSafety: true,
    subjectMustBeInHouse: true,
    allowedPhases: ['pos_results'],
  },
  protection_deal: {
    senderMustBeHoh: true,
    humanMustBeOffBlock: true,
    allowedPhases: ['loh_results', 'social_1', 'nominations'],
  },
  protection_deal_future_vote: {
    senderMustHoldSafety: true,
    humanMustBeNominee: true,
    allowedPhases: ['pos_results', 'pos_ceremony'],
  },
  betrayal_warning: {
    subjectMustBeInHouse: true,
  },
  player_nominated_support: {
    humanMustBeNominee: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  player_nominated_tension: {
    humanMustBeNominee: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  generic_gossip: {
    subjectMustBeInHouse: true,
  },
}

export function getIncomingInteractionValidityRule(
  scenarioKey: string | null
): IncomingInteractionValidityRule | null {
  return scenarioKey ? (INCOMING_INTERACTION_VALIDITY_BANK[scenarioKey] ?? null) : null
}
