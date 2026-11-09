export type ChoiceLabels = readonly [string, string, string, string]

/** Nomination aftermath openings can be emotional, strategic, or grateful; keep
 * the choices tied to the intent of the actual incoming line. */
export const SCENE_FAMILY_CHOICES: Record<string, ChoiceLabels> = {
  na_processing: [
    'Comfort them',
    'Ask what would help',
    'Keep it focused on the game',
    'Give them space',
  ],
  na_trust_check: [
    'Reassure them',
    'Compare vote reads',
    'Keep your position private',
    'Leave it there',
  ],
  na_strategic: [
    'Share what you know',
    'Compare reads',
    'Protect your own game',
    'End the conversation',
  ],
  na_followup: [
    'Tell them you meant it',
    'Ask how they are holding up',
    'Keep things game-focused',
    'Wrap up the check-in',
  ],
}

/** Explicit choices for what the housemate actually asked to do. */
export const ROMANCE_ACTION_CHOICES: Readonly<Record<string, ChoiceLabels>> = {
  flirt: ['Flirt back', 'Keep it playful', 'Keep this friendly', 'Change the subject'],
  private_flirt: [
    'Explore the spark privately',
    'Keep it friendly for now',
    'Keep this platonic',
    'End the moment',
  ],
  late_night_talk: [
    'Stay and talk',
    'Keep the conversation light',
    'Ask for some space',
    'Say goodnight',
  ],
  cuddle: [
    'Yes, let’s cuddle',
    'Sit together without cuddling',
    'No, I’d like some space',
    'Leave it for another time',
  ],
  kiss_under_covers: [
    'Yes, you can kiss me',
    'I’m interested, but wait',
    'No, I don’t want to kiss',
    'End the moment',
  ],
  pool_makeout: [
    'Yes, let’s kiss in the pool',
    'Stay and talk by the pool',
    'No, I don’t want to kiss',
    'Head back inside',
  ],
  spend_night: [
    'Yes, let’s spend the night together',
    'Stay and talk a while',
    'No, I want to sleep separately',
    'Say goodnight',
  ],
  try_for_baby: [
    'Talk about whether we’re ready',
    'Say I need more time',
    'Say I don’t want to try',
    'Leave the discussion for later',
  ],
  go_public: [
    'Yes, let’s tell the Hub',
    'Talk about the timing first',
    'Keep the relationship private',
    'Drop it for now',
  ],
  risk_the_vibe: [
    'Say I feel the spark too',
    'Say I’m still figuring it out',
    'Say I see us as friends',
    'Change the subject',
  ],
}

/** Background actions that ask something materially different from their shared scene. */
export const BACKGROUND_ACTION_CHOICES: Readonly<
  Record<string, { labels: ChoiceLabels; opensWithQuestion?: boolean }>
> = {
  share_intel: {
    labels: [
      'Hear the lead in private',
      'Ask how reliable it is',
      'Decline the exchange',
      'End the exchange',
    ],
  },
  rumor: {
    labels: [
      'Compare what we’ve heard',
      'Wait for corroboration',
      'Challenge the claim',
      'Leave the rumour there',
    ],
  },
  plant_lie: {
    labels: [
      'Hear the plan without joining',
      'Ask why they want to plant it',
      'Refuse to spread it',
      'Walk away',
    ],
    opensWithQuestion: true,
  },
  expose_secret: {
    labels: [
      'Ask what they actually know',
      'Ask who could be hurt',
      'Ask them to keep it private',
      'Stay out of it',
    ],
    opensWithQuestion: true,
  },
  apologize: {
    labels: [
      'Accept their apology',
      'Acknowledge it and ask for time',
      'Say I’m not ready to accept it',
      'End the conversation',
    ],
  },
  repair_bond: {
    labels: [
      'Agree to try a truce',
      'Ask what they would change',
      'Say I’m not ready for a truce',
      'Take some space',
    ],
  },
  reassure: {
    labels: [
      'Tell them what’s weighing on me',
      'Thank them and keep it brief',
      'Ask for some space',
      'End the check-in',
    ],
  },
  ask_safety_plan: {
    labels: [
      'Talk through the options',
      'Say I’m still deciding',
      'Keep my Safety plan private',
      'End the conversation',
    ],
    opensWithQuestion: true,
  },
  ask_hold_safety: {
    labels: [
      'Promise to leave Safety unused',
      'Keep the decision open',
      'Say I may still use Safety',
      'End the discussion',
    ],
  },
  ask_loh_target: {
    labels: [
      'Discuss what I’m weighing',
      'Ask why they want to know',
      'Keep my slate private',
      'End the discussion',
    ],
    opensWithQuestion: true,
  },
  ask_nomination_advice: {
    labels: [
      'Talk through possible nominees',
      'Ask what they’re weighing',
      'Keep my read private',
      'End the discussion',
    ],
    opensWithQuestion: true,
  },
  pitch_target: {
    labels: [
      'Back the nomination recommendation',
      'Ask what makes them a target',
      'Push back on that nomination',
      'End the pitch',
    ],
  },
  suggest_replacement: {
    labels: [
      'Back that choice as a backup',
      'Ask why they’d be a good replacement',
      'Oppose that backup choice',
      'End the Safety discussion',
    ],
  },
  rally_votes_against: {
    labels: [
      'Back their case for eviction',
      'Ask why they’re rallying votes',
      'Say I won’t back that vote',
      'End the vote discussion',
    ],
  },
  vote_rally: {
    labels: [
      'Ask how much support they have',
      'Ask why they targeted me',
      'Tell them I’ll remember this',
      'End the conversation',
    ],
    opensWithQuestion: true,
  },
}

export const SCENE_CHOICES: Record<string, readonly ChoiceLabels[]> = {
  private_intel_lead: [
    [
      'Thank them for the lead',
      'Ask how they heard it',
      'Say you’re unconvinced',
      'Leave it there',
    ],
  ],
  week_start_ally_check_in: [
    ['Share your read', 'Ask what changed', 'Keep your cards close', 'Leave it for later'],
    ['Reassure them', 'Talk through the week', 'Set a little distance', 'Change the subject'],
  ],
  week_start_enemy_gossip: [
    ['Compare notes', 'Hear them out', 'Call it fishing', 'Do not bite'],
    ['Ask who is talking', 'Keep it vague', 'Challenge the angle', 'End the chat'],
  ],
  week_start_alliance_lock: [
    ['Make it official', 'Ask for their plan', 'Keep it informal', 'Play it off'],
    ['Offer a real pact', 'Test the details', 'Say it is too soon', 'Leave it hanging'],
  ],
  hoh_congratulations: [
    ['Thank them warmly', 'Keep it light', 'Question the timing', 'Move on'],
    ['Share the moment', 'Accept the compliment', 'Call it strategy', 'Cut it short'],
  ],
  safety_win_congratulations: [
    ['Thank them genuinely', 'Keep it casual', 'Deflect the praise', 'Get back to the game'],
    ['Celebrate together', 'Nod and listen', 'Ask what they want', 'Change the subject'],
  ],
  player_nominated_support: [
    ['Let them in', 'Ask what they need', 'Keep your guard up', 'End the talk'],
    ['Thank them for checking', 'Talk it through', 'Say you are fine', 'Step away'],
  ],
  player_nominated_tension: [
    ['Ask for honesty', 'Keep it controlled', 'Call out the tension', 'Walk away'],
    ['Try to reset', 'Hear their read', 'Draw a boundary', 'Leave it there'],
  ],
  competition_low_finish_support: [
    ['Accept the support', 'Laugh it off', 'Say you do not need it', 'Move on'],
    ['Be honest about it', 'Keep it breezy', 'Question the concern', 'End the chat'],
  ],
  competition_low_finish_taunt: [
    ['Defuse it', 'Give them nothing', 'Fire back', 'Walk away'],
    ['Laugh without agreeing', 'Hold your composure', 'Name the cheap shot', 'Leave them talking'],
  ],
  social_momentum_notice: [
    ['Compare what they saw', 'Listen carefully', 'Reject the read', 'Keep it private'],
    ['Ask for specifics', 'Play it cool', 'Say they are overreaching', 'End the chat'],
  ],
  hoh_safety_request: [
    [
      'Promise to keep them off the block',
      'Ask what they are offering',
      'Set a clear limit',
      'End the pitch',
    ],
    [
      'Give my word they’ll stay off the block',
      'Keep it noncommittal',
      'Tell them it is unlikely',
      'Send them away',
    ],
  ],
  background_nominate_human: [
    [
      'Explain why I’m worth keeping',
      'Ask why I’m on their slate',
      'Challenge their reasoning',
      'End the conversation',
    ],
  ],
  nominee_hoh_plea: [
    ['Offer safety', 'Ask for their case', 'Explain the risk', 'Close the meeting'],
    ['Give them your word', 'Listen without promising', 'State your reasons', 'End the talk'],
  ],
  nominee_veto_pitch: [
    [
      'Promise to use Safety on them',
      'Ask what changes',
      'Refuse to commit',
      'End the conversation',
    ],
    ['Promise the power', 'Hear their plan', 'Keep your move private', 'Walk away'],
  ],
  nominee_campaign: [
    ['Give them hope', 'Hear the campaign', 'Tell them where you stand', 'Leave it there'],
    ['Ask what they need', 'Keep your options open', 'Say you cannot help', 'End the chat'],
  ],
  co_nominee_check_in: [
    ['Compare vote reads', 'Reassure the bond', 'Protect your own game', 'End the check-in'],
    ['Share what you heard', 'Keep it measured', 'Create some distance', 'Leave it there'],
  ],
  nomination_aftershock: [
    ['Acknowledge the hurt', 'Explain carefully', 'Stand by the move', 'End the talk'],
    ['Offer a path back', 'Hear their anger', 'Keep it strategic', 'Walk away'],
  ],
  nominee_understands_loh: [
    ['Explain the decision', 'Hear them out', 'Keep it strictly strategic', 'End the talk'],
    ['Own the move', 'Ask what they need', 'Refuse to apologize', 'Give them space'],
  ],
  unavoidable_nominee_reaction: [
    ['Acknowledge the rule', 'Discuss Safety and votes', 'Say you cannot help', 'Give them space'],
    [
      'Confirm there was no alternative',
      'Plan their next move',
      'Keep your distance',
      'End the talk',
    ],
  ],
  automatic_nominee_reaction: [
    ['Acknowledge the rule', 'Hear how they feel', 'Talk next steps', 'Give them space'],
    ['Keep it factual', 'Ask what they need now', 'Focus on Safety', 'End the talk'],
  ],
  nominee_confronts_loh: [
    ['Meet the anger honestly', 'Explain the calculation', 'Push back too', 'Walk away'],
    ['Own the fallout', 'Keep your voice calm', 'Refuse the accusation', 'End the confrontation'],
  ],
  replacement_nominee_reacts_to_loh: [
    ['Explain the backup plan', 'Hear their reaction', 'Stand by the choice', 'End the talk'],
    ['Acknowledge the blow', 'Keep it factual', 'Refuse to justify it', 'Give them space'],
  ],
  post_veto_gratitude: [
    ['Share the relief', 'Accept their thanks', 'Call in the favor', 'Change the subject'],
    ['Celebrate together', 'Say it was nothing', 'Keep score', 'Move on'],
  ],
  post_veto_campaign: [
    ['Hear their new plan', 'Keep it measured', 'Tell them you cannot help', 'End the campaign'],
    ['Offer a little hope', 'Ask what changed', 'Keep your distance', 'Close the talk'],
  ],
  live_vote_pitch: [
    ['Promise your vote', 'Ask for their case', 'Tell them no', 'Avoid an answer'],
    ['Commit to keep them', 'Keep your options open', 'Choose the other side', 'End the pitch'],
  ],
  tie_break_campaign: [
    [
      'I will use my deciding vote to keep you',
      'Make your case',
      'I am voting you out',
      'End the pitch',
    ],
  ],
  trade_secrets_offer: [
    ['Take the trade', 'Hear the offer', 'Keep your information close', 'End the conversation'],
  ],
  protection_deal: [['Take the deal', 'Ask for time', 'Refuse clearly', 'End the pitch']],
  protection_deal_future_vote: [
    ['Take the deal', 'Ask for time', 'Refuse clearly', 'End the pitch'],
  ],
  survivor_gratitude: [
    ['Share the moment', 'Accept the thanks', 'Remind them who helped', 'Move on'],
    ['Strengthen the bond', 'Keep it modest', 'Call in a favor', 'Change the subject'],
  ],
  betrayal_warning: [
    ['Compare notes', 'Ask for proof', 'Question their motive', 'Bury it for now'],
    ['Take it seriously', 'Watch quietly', 'Defend your ally', 'Refuse the drama'],
  ],
  ignored_warning: [
    ['Give them time', 'Ask what they need', 'Set a boundary', 'End the chat'],
    [
      'Acknowledge the distance',
      'Keep it brief',
      'Say they are reading too much in',
      'Leave it there',
    ],
  ],
  targeted_snark: [
    ['Ask what they mean', 'Stay unreadable', 'Call it out', 'Walk away'],
    ['Defuse the jab', 'Keep your cool', 'Push back directly', 'Let it die'],
  ],
  season_provocateur: [
    ['Hear them out, guardedly', 'Ask what set them off', 'Push back directly', 'Walk away'],
    ['Keep your composure', 'Ask them to be specific', 'Draw a hard boundary', 'End the exchange'],
  ],
  alliance_reassurance: [
    ['Reassure them', 'Compare your plans', 'Set a boundary', 'End the check-in'],
    ['Reassure them', 'Ask what changed', 'Set a boundary', 'End the check-in'],
  ],
  generic_gossip: [
    ['Ask for the source', 'Listen only', 'Protect the target', 'Stop the rumour'],
    ['Trade a little intel', 'Ask who else knows', 'Challenge the story', 'Change the subject'],
  ],
  generic_check_in: [
    ['Be honest', 'Ask them back', 'Keep some distance', 'Wrap it up'],
    ['Let them in', 'Keep it light', 'Set a boundary', 'Leave it there'],
  ],
  relationship_friendship_check_in: [
    ['Let them in', 'Ask how they are', 'Keep it friendly', 'Leave it for now'],
  ],
  relationship_alliance_follow_up: [
    ['Work together', 'Ask for time', 'Do not pitch me again', 'End the talk'],
  ],
  relationship_romance_check_in: [
    ['See where this goes', 'Keep it light', 'Keep this platonic', 'Leave it for now'],
  ],
  relationship_confidant_check_in: [
    ['Hear them out', 'Ask for context', 'Do not confide in me', 'Change the subject'],
  ],
  relationship_frustration_follow_up: [
    ['Talk it through', 'Ask for time', 'Do not push this', 'Walk away'],
  ],
  relationship_repair_follow_up: [
    ['Try to repair it', 'Take some space', 'Keep your distance', 'End the talk'],
  ],
}
