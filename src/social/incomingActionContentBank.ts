import type { IncomingInteractionType } from './types'

export type IncomingActionStance = 'positive' | 'neutral' | 'negative' | 'dismiss'

export interface IncomingActionContent {
  /** Shared scene family that supplies game context and the relationship effect category. */
  scenarioKey: string
  /** Stable editorial family, also useful for auditing related action routes. */
  family: string
  interactionType: IncomingInteractionType
  openings: readonly string[]
  replies: Record<IncomingActionStance, readonly string[]>
}

/**
 * Static AI-to-player action dialogue. Each action has its own opening and
 * four response-specific reactions; the existing Reality contract still
 * decides legality, costs, and relationship dimensions.
 *
 * 52 inbox-routed actions × 4 response stances = 208 authored action/response pairings.
 * Scene families are shared deliberately, so game-event context and social
 * effect rules stay consistent without duplicating the full scene engine.
 */
export const INCOMING_ACTION_CONTENT_BANK: Record<string, IncomingActionContent> = {
  compliment: {
    scenarioKey: 'generic_check_in',
    family: 'rapport',
    interactionType: 'compliment',
    openings: [
      'You made that look easy, {player}. I wanted to say so before the room moved on.',
      'You had a good moment today, {player}. It deserved a proper compliment.',
    ],
    replies: {
      positive: [
        'They laugh and return the compliment without turning it into a pitch.',
        'They seem glad the moment became something shared between you.',
      ],
      neutral: [
        'They accept the compliment, then let the conversation settle there.',
        'They take the kind words at face value and keep the game out of it.',
      ],
      negative: [
        'They hear the doubt in your answer and stop trying to make it warm.',
        'They let the compliment drop, unsure whether you meant to make fun of them.',
      ],
      dismiss: [
        'They give a small nod and leave the moment behind.',
        'They let you move on, though the opening for an easy connection closes.',
      ],
    },
  },
  whisper: {
    scenarioKey: 'generic_gossip',
    family: 'intel',
    interactionType: 'gossip',
    openings: [
      'I heard something in a side conversation, {player}. I want to check it with you before it travels.',
      'There is a quiet piece of Hub talk you should hear from me first.',
    ],
    replies: {
      positive: [
        'They share the lead, while making clear it is still unconfirmed.',
        'They trust you with one more detail, but keep the source protected.',
      ],
      neutral: [
        'They give you the outline and wait to see whether you will act on it.',
        'They keep the source to themself and leave the claim open for checking.',
      ],
      negative: [
        'They stop sharing details and decide you do not want to be involved.',
        'They hear the challenge and hold the rest of the story back.',
      ],
      dismiss: [
        'They take the hint and carry the lead to someone else.',
        'They leave the rumor unshared rather than force it into the conversation.',
      ],
    },
  },
  group_chat: {
    scenarioKey: 'social_momentum_notice',
    family: 'group_dynamics',
    interactionType: 'other',
    openings: [
      'A few of us are comparing notes, {player}. Come in, challenge the read, or just listen.',
      'The room is trading versions of the week. I wanted you to have a place in that conversation.',
    ],
    replies: {
      positive: [
        'They make room for your view and the group has another read to weigh.',
        'They bring you into the exchange instead of deciding the story without you.',
      ],
      neutral: [
        'They let you listen without demanding a position.',
        'They keep the conversation open and wait to see which details hold up.',
      ],
      negative: [
        'They accept the challenge and let the group test the claim.',
        'They defend their read, but do not turn the disagreement personal.',
      ],
      dismiss: [
        'They carry on without you and leave your position out of the group read.',
        'They let you step away; the conversation keeps moving around you.',
      ],
    },
  },
  build_quiet_bond: {
    scenarioKey: 'relationship_friendship_check_in',
    family: 'bond',
    interactionType: 'check_in',
    openings: [
      'Can we steal a quiet minute, {player}? I would rather hear your real read than the room’s version.',
      'I like talking with you when there is no audience. How are you actually doing?',
    ],
    replies: {
      positive: [
        'They share something more personal and let the quiet moment deepen the bond.',
        'They feel heard and trust you with a more honest answer.',
      ],
      neutral: [
        'They appreciate the time, though they keep the conversation light.',
        'They leave with a calmer read of you, but no new promise between you.',
      ],
      negative: [
        'They respect the space you asked for and stop pressing for closeness.',
        'They hear the boundary and keep future conversations more guarded.',
      ],
      dismiss: [
        'They leave the private moment unfinished and let you have your space.',
        'They return to the group without turning the declined conversation into a grievance.',
      ],
    },
  },
  share_personal_story: {
    scenarioKey: 'relationship_confidant_check_in',
    family: 'bond',
    interactionType: 'check_in',
    openings: [
      'I want to tell you something about me, {player}, without making it a game move.',
      'There is a part of my story I have not shared around the Hub. I thought you might understand.',
    ],
    replies: {
      positive: [
        'They open up in return and the conversation becomes genuinely mutual.',
        'They trust you with a detail they had been keeping to themself.',
      ],
      neutral: [
        'They finish the story without asking you to match its depth.',
        'They appreciate that you listened, though they keep the connection measured.',
      ],
      negative: [
        'They stop before sharing more and keep the rest private.',
        'They hear that this is not the moment for you and draw the conversation closed.',
      ],
      dismiss: [
        'They let the story end there and do not ask you to carry it.',
        'They change the subject and keep the personal detail to themself.',
      ],
    },
  },
  proposeAlliance: {
    scenarioKey: 'week_start_alliance_lock',
    family: 'commitment',
    interactionType: 'alliance_proposal',
    openings: [
      'I trust the way we have been working, {player}. Are you ready to make it a real pact?',
      'The Hub is getting harder to read. I would rather face it with you as a declared partner.',
    ],
    replies: {
      positive: [
        'They are relieved you said yes and want to agree on what the pact means next.',
        'They treat your acceptance as a real commitment and ask to compare plans.',
      ],
      neutral: [
        'They give you time, but want to revisit the offer before the next decision.',
        'They keep the possibility open without counting it as an alliance yet.',
      ],
      negative: [
        'They accept the refusal and stop treating the pact as available.',
        'They take the no plainly and begin planning without your protection.',
      ],
      dismiss: [
        'They close the offer and leave without assuming either of you owes the other.',
        'They take the silence as an answer for now and move on.',
      ],
    },
  },
  consult_alliance: {
    scenarioKey: 'alliance_reassurance',
    family: 'commitment',
    interactionType: 'check_in',
    openings: [
      'Our alliance needs one clear read before the next decision. Where do you stand, {player}?',
      'I want the alliance view before I make a move. Tell me what the group is missing.',
    ],
    replies: {
      positive: [
        'They share the alliance read and make room for your concern.',
        'They feel the group is still working together and compare the next step with you.',
      ],
      neutral: [
        'They record your uncertainty without mistaking it for a commitment.',
        'They keep the discussion practical and leave the choice open.',
      ],
      negative: [
        'They hear that you do not want to follow the group read and hold their own position.',
        'They accept your objection and take the disagreement back to the alliance.',
      ],
      dismiss: [
        'They finish the discussion without a shared read from you.',
        'They leave the alliance question unresolved and ask another member.',
      ],
    },
  },
  protect: {
    scenarioKey: 'alliance_reassurance',
    family: 'protection',
    interactionType: 'deal_offer',
    openings: [
      'Your name has heat on it, {player}. I can help keep it off you if we can trust each other.',
      'I can put my vote or power behind you when it matters. I want to know if we are on the same side.',
    ],
    replies: {
      positive: [
        'They agree to stand by the protection offer and ask what support you need.',
        'They treat your acceptance as a real understanding, with the game decision still ahead.',
      ],
      neutral: [
        'They leave the promise open until they know what you need from them.',
        'They accept the hesitation and avoid claiming a deal was made.',
      ],
      negative: [
        'They withdraw the offer rather than promise something you do not want.',
        'They stop counting on your trust and keep their protection to themself.',
      ],
      dismiss: [
        'They let the offer expire without treating silence as a yes.',
        'They move on without making a promise or asking you to return one.',
      ],
    },
  },
  betray: {
    scenarioKey: 'betrayal_warning',
    family: 'betrayal',
    interactionType: 'warning',
    openings: [
      'I am still in the pact, but I am making a move that cuts against it. You deserve to hear that from me.',
      'I chose my game over our deal on this one, {player}. I will not pretend you should be fine with it.',
    ],
    replies: {
      positive: [
        'They are surprised you heard them out, but know the alliance still needs repairing.',
        'They explain the choice without asking you to call it harmless.',
      ],
      neutral: [
        'They accept that you are reserving judgment until you see what the move costs.',
        'They keep the details factual and leave the trust question unresolved.',
      ],
      negative: [
        'They hear the anger and accept that the pact may not survive this move.',
        'They defend their decision, but understand you now have reason to doubt them.',
      ],
      dismiss: [
        'They leave without a repair and expect the betrayal to speak for itself.',
        'They stop asking for a reaction and let the alliance fracture in silence.',
      ],
    },
  },
  reassure: {
    scenarioKey: 'relationship_repair_follow_up',
    family: 'repair',
    interactionType: 'check_in',
    openings: [
      'You have had a lot on your plate, {player}. I wanted you to know I am still here.',
      'I can tell the Hub has been getting to you. You do not have to handle all of it alone.',
    ],
    replies: {
      positive: [
        'They hear the support and let some of the pressure out.',
        'They feel less alone and tell you what has actually been weighing on them.',
      ],
      neutral: [
        'They appreciate the check-in without asking you to solve the problem.',
        'They accept the kindness and keep the rest of the conversation practical.',
      ],
      negative: [
        'They stop offering comfort and respect the distance you set.',
        'They hear that you do not want to get involved and keep their feelings private.',
      ],
      dismiss: [
        'They let you go without making the check-in a debt.',
        'They hold onto the support they offered and leave you to your own space.',
      ],
    },
  },
  apologize: {
    scenarioKey: 'relationship_repair_follow_up',
    family: 'repair',
    interactionType: 'check_in',
    openings: [
      'I owe you an apology, {player}. I handled that badly, and I want to own it.',
      'I have replayed what I said. It landed unfairly, and I am sorry.',
    ],
    replies: {
      positive: [
        'They accept the apology and offer a small opening to rebuild trust.',
        'They appreciate that you named the harm without asking them to forget it.',
      ],
      neutral: [
        'They hear you, but wait to see whether your next move matches the apology.',
        'They accept the words without calling the issue fixed.',
      ],
      negative: [
        'They recognise you are not ready to accept the apology and stop pressing.',
        'They leave the repair attempt open but do not ask you to reassure them.',
      ],
      dismiss: [
        'They let the apology stand without demanding an answer.',
        'They give you room and accept that this conversation cannot finish the repair.',
      ],
    },
  },
  share_intel: {
    scenarioKey: 'generic_gossip',
    family: 'intel',
    interactionType: 'gossip',
    openings: [
      'I have a piece of information that could help your next move, {player}. Do you want it?',
      'I can trade you a useful lead, but I want to know it will not go straight back to the source.',
    ],
    replies: {
      positive: [
        'They share the lead and make clear which part is still only hearsay.',
        'They trust you with the information and ask you to keep its source quiet.',
      ],
      neutral: [
        'They give you the broad outline but hold back the identifying detail.',
        'They leave the trade open until they know what you can safely share back.',
      ],
      negative: [
        'They keep the information rather than hand it over to someone who doubts them.',
        'They hear the pushback and decide the exchange is too risky.',
      ],
      dismiss: [
        'They take the lead elsewhere without making a scene.',
        'They close the exchange; no information changes hands.',
      ],
    },
  },
  rumor: {
    scenarioKey: 'generic_gossip',
    family: 'rumour',
    interactionType: 'warning',
    openings: [
      'I keep hearing the same claim about {subject}. It is not proof, but the pattern is getting hard to ignore.',
      'People are repeating a story about {subject}; I want to know whether you have seen anything that backs it up.',
    ],
    replies: {
      positive: [
        'They compare what they have heard, while keeping the claim marked as unverified.',
        'They add what they know but do not present rumor as proof.',
      ],
      neutral: [
        'They leave the story open and suggest watching for something that confirms it.',
        'They give you the source chain they know, with gaps clearly left in it.',
      ],
      negative: [
        'They stop the rumor from spreading through you and reconsider their own read.',
        'They hear you defend {subject} and agree not to repeat the claim as fact.',
      ],
      dismiss: [
        'They let the claim die in this conversation rather than force it on you.',
        'They move on without asking you to carry an unverified story.',
      ],
    },
  },
  startFight: {
    scenarioKey: 'targeted_snark',
    family: 'conflict',
    interactionType: 'snide_remark',
    openings: [
      'I am done acting like we are fine, {player}. Say what you have to say to my face.',
      'You crossed a line with me, and I want this out in the open now.',
    ],
    replies: {
      positive: [
        'They lower their voice when you answer directly, though the grievance remains.',
        'They take your response as a chance to stop the fight from becoming a spectacle.',
      ],
      neutral: [
        'They keep the disagreement focused on the move that started it.',
        'They accept that you will not match their volume and let the argument cool.',
      ],
      negative: [
        'They answer the challenge, and the conflict is now mutual.',
        'They take your pushback as confirmation that neither of you is backing down.',
      ],
      dismiss: [
        'They are left arguing with the empty space you gave them.',
        'They let you walk away, but the dispute remains unresolved.',
      ],
    },
  },
  confront: {
    scenarioKey: 'targeted_snark',
    family: 'conflict',
    interactionType: 'snide_remark',
    openings: [
      'Something about your recent moves does not add up to me, {player}. Can we be direct?',
      'I want to ask you about the way you handled that decision before I make up my mind.',
    ],
    replies: {
      positive: [
        'They answer the question instead of turning it into another accusation.',
        'They appreciate the directness and explain what bothered them.',
      ],
      neutral: [
        'They give you their read, but keep the trust question open.',
        'They accept your measured answer and wait to see what you do next.',
      ],
      negative: [
        'They hear the denial as a challenge and stand by their concern.',
        'They push back once, then stop pretending the disagreement is small.',
      ],
      dismiss: [
        'They drop the confrontation for now and keep their own counsel.',
        'They stop pressing, though the unanswered question remains between you.',
      ],
    },
  },
  favor_request: {
    scenarioKey: 'alliance_reassurance',
    family: 'reciprocity',
    interactionType: 'deal_offer',
    openings: [
      'I am calling in a small favour, {player}. I would not ask if it did not matter this week.',
      'I helped you when the numbers were tight. Can I ask you to return that now?',
    ],
    replies: {
      positive: [
        'They accept your help and are clear about what they will owe in return.',
        'They treat the favour as a real exchange and agree on the immediate ask.',
      ],
      neutral: [
        'They give you time to decide without claiming the favour is settled.',
        'They leave the request open and wait for a clearer answer.',
      ],
      negative: [
        'They accept the refusal and stop counting your help as available.',
        'They withdraw the request rather than turn the favour into an argument.',
      ],
      dismiss: [
        'They take the hint and look for another person to ask.',
        'They leave without a promise or a debt between you.',
      ],
    },
  },
  pitch_target: {
    scenarioKey: 'alliance_nomination_pitch',
    family: 'nomination',
    interactionType: 'warning',
    openings: [
      'I think {subject} is the cleanest nomination for this week. Here is why I am bringing it to you.',
      'Several of us are uneasy about {subject}. Will you hear the case before the slate is set?',
    ],
    replies: {
      positive: [
        'They lay out their case against {subject}, while leaving the nomination decision with the LOH.',
        'They take your openness as permission to share the reasons behind the target.',
      ],
      neutral: [
        'They answer your questions but do not mistake listening for a vote.',
        'They keep the pitch alive and ask you to judge the evidence yourself.',
      ],
      negative: [
        'They accept that you will not back the target without stronger grounds.',
        'They hear you defend {subject} and stop treating you as support for the pitch.',
      ],
      dismiss: [
        'They take the nomination case to someone else.',
        'They leave without claiming the LOH has made a decision.',
      ],
    },
  },
  suggest_replacement: {
    scenarioKey: 'alliance_safety_pitch',
    family: 'safety',
    interactionType: 'warning',
    openings: [
      'If Safety is used, I think {subject} is the fairest replacement option. Can I explain?',
      'The block may change tonight. I want you to consider {subject} before locking a backup.',
    ],
    replies: {
      positive: [
        'They explain the backup case and leave the final replacement choice with the power holder.',
        'They appreciate the hearing, but know you have not promised the nomination.',
      ],
      neutral: [
        'They keep the pitch conditional on Safety being used.',
        'They share their reasoning and wait for the board to change before pressing further.',
      ],
      negative: [
        'They hear your objection and stop treating {subject} as a shared choice.',
        'They accept that you will not support the replacement plan.',
      ],
      dismiss: [
        'They take the suggestion to another person with a say in the decision.',
        'They leave the replacement question open rather than claim agreement.',
      ],
    },
  },
  ask_use_safety: {
    scenarioKey: 'nominee_veto_pitch',
    family: 'safety',
    interactionType: 'deal_offer',
    openings: [
      'You hold Safety, and I am on the block. Would you use it to save {subject}?',
      'I need to ask before the ceremony: is there a path for you to use Safety on me?',
    ],
    replies: {
      positive: [
        'They hear a real commitment and stop searching for another saver.',
        'They thank you and begin planning around the Safety promise you made.',
      ],
      neutral: [
        'They understand you are still weighing it and keep working other options.',
        'They take the answer as open, not as a promise to use the power.',
      ],
      negative: [
        'They accept the refusal and turn to a different path off the block.',
        'They stop counting your Safety as part of their survival plan.',
      ],
      dismiss: [
        'They leave without a promise and keep campaigning elsewhere.',
        'They take the silence as no commitment and seek another conversation.',
      ],
    },
  },
  ask_safety_plan: {
    scenarioKey: 'hoh_safety_request',
    family: 'safety',
    interactionType: 'check_in',
    openings: [
      'You hold Safety, {player}. What are you leaning toward before the ceremony?',
      'I need to know how you are reading the block before the power changes it.',
    ],
    replies: {
      positive: [
        'They tell you which option they currently favour and what could change their mind.',
        'They share a candid read, while keeping the final Safety choice theirs.',
      ],
      neutral: [
        'They give you a broad answer without promising a specific move.',
        'They explain what they are weighing and keep the decision open.',
      ],
      negative: [
        'They decide to keep their Safety plan private for now.',
        'They hear the pressure in the question and give you less detail.',
      ],
      dismiss: [
        'They leave the decision to the power holder and stop asking for a preview.',
        'They let the subject drop rather than force a premature promise.',
      ],
    },
  },
  ask_hold_safety: {
    scenarioKey: 'hoh_safety_request',
    family: 'safety',
    interactionType: 'deal_offer',
    openings: [
      'I am asking you to leave the nominations where they are, {player}. Can we keep the slate intact?',
      'If Safety stays unused, the current block stands. I want to know whether you can agree to that.',
    ],
    replies: {
      positive: [
        'They agree to leave the nominations intact, subject to the rules and the final ceremony.',
        'They treat your answer as support for holding the block, not a promise beyond it.',
      ],
      neutral: [
        'They leave room to decide when the ceremony arrives.',
        'They accept that you have not committed to hold the power.',
      ],
      negative: [
        'They hear you reserve the right to use Safety and keep planning for a changed block.',
        'They stop counting on the nominations staying fixed.',
      ],
      dismiss: [
        'They take the decision back to their own plan without your commitment.',
        'They leave the Safety question unresolved.',
      ],
    },
  },
  warn_about_danger: {
    scenarioKey: 'betrayal_warning',
    family: 'warning',
    interactionType: 'warning',
    openings: [
      'The LOH has your name in their plan, {player}. I thought you should hear it before the room changes.',
      'I saw enough to believe you may be in danger. I do not want you blindsided at the ceremony.',
    ],
    replies: {
      positive: [
        'They share the warning and help you separate what they know from what they suspect.',
        'They tell you what they saw and encourage you to verify it before acting.',
      ],
      neutral: [
        'They give you the details they can stand behind and leave the rest uncertain.',
        'They keep the warning narrow rather than dress a guess up as proof.',
      ],
      negative: [
        'They stop pressing the warning when you question their motive.',
        'They accept that you do not trust the source and leave you to check it yourself.',
      ],
      dismiss: [
        'They leave the warning with you and do not chase an answer.',
        'They stop carrying the message before it becomes another rumour.',
      ],
    },
  },
  ask_why_nominated: {
    scenarioKey: 'nominee_understands_loh',
    family: 'nomination',
    interactionType: 'nomination_plea',
    openings: [
      'You put me on the block. I need to hear why from you, not from the rest of the Hub.',
      'I am trying to understand the nomination. Was it strategy, or did I do something to you?',
    ],
    replies: {
      positive: [
        'They explain the choice and acknowledge that it still put you at risk.',
        'They tell you the reason without asking you to like the decision.',
      ],
      neutral: [
        'They give you the strategic explanation, but keep some details close.',
        'They answer plainly and leave you to decide whether the reason holds up.',
      ],
      negative: [
        'They refuse to soften the nomination and tell you to campaign elsewhere.',
        'They stand by the move, even knowing it costs them trust with you.',
      ],
      dismiss: [
        'They end the explanation and leave the nomination between you.',
        'They stop asking for understanding and return to managing their own week.',
      ],
    },
  },
  ask_loh_target: {
    scenarioKey: 'alliance_nomination_pitch',
    family: 'nomination',
    interactionType: 'gossip',
    openings: [
      'You are LOH, {player}. Who is actually on your mind for the block?',
      'I would rather hear your nomination read from you than chase hallway guesses.',
    ],
    replies: {
      positive: [
        'They share the name they are considering and what could still change it.',
        'They give you their current target, while making clear the slate is not locked.',
      ],
      neutral: [
        'They describe the factors they are weighing without naming a final choice.',
        'They tell you the plan is still moving and offer no false certainty.',
      ],
      negative: [
        'They keep the target private after you press them.',
        'They hear the question as a way to steer them and hold their read back.',
      ],
      dismiss: [
        'They let the question pass and keep their nomination plan to themself.',
        'They stop the conversation before revealing a name.',
      ],
    },
  },
  ask_nomination_advice: {
    scenarioKey: 'alliance_nomination_pitch',
    family: 'nomination',
    interactionType: 'check_in',
    openings: [
      'I have to set the slate, {player}. Who would you put up, and what am I missing?',
      'I want your nomination advice before I lock a move that changes the whole week.',
    ],
    replies: {
      positive: [
        'They give you a name and the reason behind it, not just a convenient target.',
        'They share their read and accept that the final nomination is yours.',
      ],
      neutral: [
        'They offer a cautious read without pretending they know every alliance.',
        'They point to the risk factors and leave the decision open.',
      ],
      negative: [
        'They refuse to give you an easy target to use against them later.',
        'They keep their advice to themself after sensing the question is a test.',
      ],
      dismiss: [
        'They let the moment pass and do not put a name on your slate.',
        'They leave you to make the nomination call without their recommendation.',
      ],
    },
  },
  ask_player_opinion: {
    scenarioKey: 'generic_gossip',
    family: 'intel',
    interactionType: 'gossip',
    openings: [
      'What is your honest read on {subject}, {player}? I want your view, not the Hub consensus.',
      'You have spent time with {subject}. Is there something about them I should understand?',
    ],
    replies: {
      positive: [
        'They share a personal read on {subject} and separate it from what they have only heard.',
        'They tell you what they have observed firsthand and flag the rest as uncertain.',
      ],
      neutral: [
        'They give you a careful answer without making a claim they cannot back up.',
        'They describe the impression, but keep their private history with {subject} to themself.',
      ],
      negative: [
        'They decline to turn their relationship with {subject} into gossip.',
        'They hear the question as fishing and give you no usable quote.',
      ],
      dismiss: [
        'They let the question go and keep their read of {subject} private.',
        'They change the subject rather than discuss someone who is not in the room.',
      ],
    },
  },
  warn_about_player: {
    scenarioKey: 'betrayal_warning',
    family: 'warning',
    interactionType: 'warning',
    openings: [
      'I am uneasy about {subject}, and I want you to know why before it affects our side.',
      'I noticed a pattern around {subject}. I trust you enough to share the concern, not call it proof.',
    ],
    replies: {
      positive: [
        'They give you the specific behaviour behind the warning and mark what remains uncertain.',
        'They share their concern about {subject} without asking you to accept it on faith.',
      ],
      neutral: [
        'They keep the warning measured and suggest watching for another signal.',
        'They admit which part is observation and which part is their interpretation.',
      ],
      negative: [
        'They stop pushing the warning and let you protect your own relationship with {subject}.',
        'They accept that you do not share the concern and avoid repeating it as fact.',
      ],
      dismiss: [
        'They leave the concern with you and do not ask you to act on it.',
        'They drop the subject rather than try to recruit you into a feud.',
      ],
    },
  },
  rally_votes_against: {
    scenarioKey: 'alliance_vote_pitch',
    family: 'eviction_vote',
    interactionType: 'warning',
    openings: [
      'I am lining up votes against {subject}. Where do you stand before the numbers settle?',
      'The vote plan is moving toward {subject}. I want your answer before I count you in.',
    ],
    replies: {
      positive: [
        'They count your support for the plan, while knowing each person still casts their own vote.',
        'They coordinate the next check-in without claiming the eviction is guaranteed.',
      ],
      neutral: [
        'They know you are still weighing it and keep working other votes.',
        'They leave your ballot uncounted and ask what information would help you decide.',
      ],
      negative: [
        'They take your opposition seriously and stop counting you as part of the vote.',
        'They accept that you will not join the plan against {subject}.',
      ],
      dismiss: [
        'They leave to ask another voter and do not put your name on the count.',
        'They carry on without your commitment.',
      ],
    },
  },
  flirt: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'compliment',
    openings: [
      'I keep noticing the way we find each other in a crowded room, {player}. Is that just me?',
      'There is a spark when we talk. I wanted to see if you feel it too.',
    ],
    replies: {
      positive: [
        'They smile and let the chemistry grow without pretending it is a promise.',
        'They are pleased you feel it too and suggest finding another quiet moment.',
      ],
      neutral: [
        'They keep the mood light and leave the question open.',
        'They take your answer gently and do not push the connection further.',
      ],
      negative: [
        'They accept the boundary and stop flirting.',
        'They seem a little disappointed, but keep the exchange respectful.',
      ],
      dismiss: [
        'They let the moment pass and leave you room to choose later.',
        'They move on without asking you to explain your silence.',
      ],
    },
  },
  private_flirt: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'compliment',
    openings: [
      'I like this side of us better when the room is not listening, {player}.',
      'Can we keep this between us for now? I want to see where the spark goes without the Hub narrating it.',
    ],
    replies: {
      positive: [
        'They lean into the private chemistry and keep the moment between you.',
        'They are glad you want to explore this away from the group.',
      ],
      neutral: [
        'They accept the private boundary and do not ask for a label.',
        'They keep the exchange warm, but let the next step wait.',
      ],
      negative: [
        'They hear that you want to keep things platonic and respect it.',
        'They step back without turning your boundary into a scene.',
      ],
      dismiss: [
        'They drop the subject and give you the privacy you asked for.',
        'They let the moment end without pushing for a signal.',
      ],
    },
  },
  late_night_talk: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'check_in',
    openings: [
      'Everyone else is asleep, and I keep thinking about what we have not said yet.',
      'I wanted one honest conversation without the daytime noise, {player}.',
    ],
    replies: {
      positive: [
        'They open up about what the connection means to them.',
        'They stay with the conversation and share a more vulnerable thought.',
      ],
      neutral: [
        'They appreciate the quiet without asking the moment to become more.',
        'They keep the talk gentle and let the night do the rest.',
      ],
      negative: [
        'They accept that the late-night closeness is too much for you right now.',
        'They give you space and do not treat the boundary as rejection of everything.',
      ],
      dismiss: [
        'They let the conversation end and return quietly to bed.',
        'They do not chase you for an answer once you close the moment.',
      ],
    },
  },
  cuddle: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'deal_offer',
    openings: [
      'Would you be comfortable staying close for a while, {player}? No pressure if not.',
      'I could use a quiet moment beside you. Are you in the mood for that?',
    ],
    replies: {
      positive: [
        'They settle beside you and let the closeness feel easy and mutual.',
        'They relax into the moment, checking that you are both comfortable.',
      ],
      neutral: [
        'They keep a little space and let the moment remain affectionate but unhurried.',
        'They accept your slower pace and do not press for more.',
      ],
      negative: [
        'They respect the no and make the room feel comfortable again.',
        'They step back without making you manage their disappointment.',
      ],
      dismiss: [
        'They leave the invitation open and return to the group.',
        'They let the quiet moment pass without asking for an explanation.',
      ],
    },
  },
  kiss_under_covers: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'deal_offer',
    openings: [
      'I want to kiss you, but only if you want that too, {player}.',
      'There is a moment here if we both want it. Can I kiss you?',
    ],
    replies: {
      positive: [
        'They share the kiss and keep checking that you are comfortable.',
        'They meet you gently, then let the moment stop where you want it to.',
      ],
      neutral: [
        'They accept the hesitation and do not turn it into pressure.',
        'They keep the chemistry quiet and wait for a clearer signal another time.',
      ],
      negative: [
        'They take your no seriously and step back at once.',
        'They respect the boundary without asking you to soften it.',
      ],
      dismiss: [
        'They let the moment pass without following you for an answer.',
        'They change the subject and leave the choice with you.',
      ],
    },
  },
  pool_makeout: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'deal_offer',
    openings: [
      'The pool has everyone looking the other way for a minute. Would you want to steal one with me?',
      'I am feeling bold, but I only want to make a move if you are completely into it.',
    ],
    replies: {
      positive: [
        'They share the moment and stay attentive to your comfort.',
        'They take the risk together, then check that you are both happy with it.',
      ],
      neutral: [
        'They keep the flirtation light and leave the invitation open.',
        'They accept your caution and do not turn a maybe into a yes.',
      ],
      negative: [
        'They back off immediately and keep the rest of the afternoon easy.',
        'They respect the no and let the pool moment end there.',
      ],
      dismiss: [
        'They let the chance pass without trying to create another one.',
        'They move on and leave you in control of whether to revisit it.',
      ],
    },
  },
  spend_night: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'deal_offer',
    openings: [
      'Would you want to spend the night together, {player}? We can stop at any point.',
      'I want to be close tonight, but only if it feels right for both of us.',
    ],
    replies: {
      positive: [
        'They agree to be close and make sure the choice stays mutual.',
        'They share the night without treating it as a promise about tomorrow.',
      ],
      neutral: [
        'They accept your hesitation and leave the decision for another night.',
        'They keep the connection warm without asking you to commit now.',
      ],
      negative: [
        'They respect your answer and give you space without resentment.',
        'They accept the boundary and let the night stay separate.',
      ],
      dismiss: [
        'They let the invitation go without following you for a reason.',
        'They end the conversation gently and leave the choice with you.',
      ],
    },
  },
  try_for_baby: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'deal_offer',
    openings: [
      'I want to talk about trying for a baby, {player}. This has to be a choice we both want.',
      'This would change our lives. Can we talk honestly about whether we are ready to try?',
    ],
    replies: {
      positive: [
        'They hear your yes as permission to discuss the choice, not as a decision already made.',
        'They are relieved you will talk it through and ask to confirm every practical step together.',
      ],
      neutral: [
        'They accept that this needs more thought and make no attempt without a clear yes.',
        'They let the question stay open until you are both sure.',
      ],
      negative: [
        'They respect your no and do not revisit the idea without you bringing it up.',
        'They accept the boundary; no attempt is made.',
      ],
      dismiss: [
        'They drop the subject and leave the decision entirely with you.',
        'They wait for you to reopen the conversation, with no action taken.',
      ],
    },
  },
  share_pregnancy_news: {
    scenarioKey: 'relationship_confidant_check_in',
    family: 'pregnancy',
    interactionType: 'check_in',
    openings: [
      'I want you to hear this from me: the pregnancy is confirmed. I am ready to share it with you.',
      'I have news that changes things, {player}. I want to tell you privately before the Hub finds out.',
    ],
    replies: {
      positive: [
        'They share the moment with you and ask how you want to handle the news.',
        'They trust you with the news and make clear it remains yours to share.',
      ],
      neutral: [
        'They tell you what they know without asking you to react a certain way.',
        'They give you time to take in the news and keep the moment private.',
      ],
      negative: [
        'They accept your need for space and do not share more than you asked.',
        'They hear the discomfort and wait for you to decide what support you want.',
      ],
      dismiss: [
        'They let the conversation end and keep the news private for now.',
        'They give you space rather than turning the disclosure into an argument.',
      ],
    },
  },
  go_public: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'check_in',
    openings: [
      'I am ready to stop pretending this connection is nothing. How would you feel about being open?',
      'The Hub has probably guessed by now. I would rather decide together whether we make it public.',
    ],
    replies: {
      positive: [
        'They agree to be open about the relationship and face the Hub together.',
        'They feel ready to let people know, while agreeing you will choose how to share it.',
      ],
      neutral: [
        'They keep the relationship private until you both agree on the timing.',
        'They accept your uncertainty and do not announce anything.',
      ],
      negative: [
        'They respect your wish for privacy and do not make the relationship public.',
        'They hear that you are not ready and step back from the announcement.',
      ],
      dismiss: [
        'They leave the question undecided; nothing is announced.',
        'They let the moment pass without telling the Hub.',
      ],
    },
  },
  end_romance: {
    scenarioKey: 'relationship_frustration_follow_up',
    family: 'romance',
    interactionType: 'check_in',
    openings: [
      'I do not want to keep calling this a romance, {player}. We need to end that part honestly.',
      'This connection has changed for me. I want to be clear instead of letting you guess.',
    ],
    replies: {
      positive: [
        'They accept your honesty and agree to treat the relationship as over.',
        'They hear you clearly and ask to keep the rest of the bond respectful.',
      ],
      neutral: [
        'They take time to process and do not pretend the ending is mutual yet.',
        'They keep the conversation civil while deciding what distance they need.',
      ],
      negative: [
        'They tell you plainly that the ending hurts, then stop arguing for the romance.',
        'They disagree with how it ended but accept that you have made your choice.',
      ],
      dismiss: [
        'They let the conversation end without another attempt to change your mind.',
        'They leave the relationship unresolved emotionally, but do not keep pursuing you.',
      ],
    },
  },
  break_alliance: {
    scenarioKey: 'relationship_frustration_follow_up',
    family: 'commitment',
    interactionType: 'check_in',
    openings: [
      'I am ending our alliance, {player}. The deal no longer fits how we are playing.',
      'I cannot keep making plans as your ally. I want to tell you directly before I act on it.',
    ],
    replies: {
      positive: [
        'They accept the split and agree to keep the fallout private.',
        'They hear the decision and close the pact without adding another grievance.',
      ],
      neutral: [
        'They ask what changes immediately and leave the answer clear.',
        'They accept that the alliance is ending, but reserve judgment on what comes next.',
      ],
      negative: [
        'They take the ending as a betrayal and make no effort to hide their anger.',
        'They push back once, then recognise the pact is no longer real.',
      ],
      dismiss: [
        'They let the alliance end without a final negotiation.',
        'They walk away and begin planning outside the pact.',
      ],
    },
  },
  ride_or_die: {
    scenarioKey: 'relationship_friendship_check_in',
    family: 'loyalty',
    interactionType: 'check_in',
    openings: [
      'You have shown up for me, {player}. I want you to know I will do the same when it counts.',
      'I am choosing your side when the room gets difficult. I hope you know that means something.',
    ],
    replies: {
      positive: [
        'They make the loyalty mutual and talk through how to protect each other.',
        'They take your answer as trust and offer to stand with you at the next hard choice.',
      ],
      neutral: [
        'They keep the gesture sincere without demanding a matching promise.',
        'They accept that trust is earned over time and leave the offer open.',
      ],
      negative: [
        'They stop offering unconditional loyalty and keep their options open.',
        'They accept that you do not want to depend on them.',
      ],
      dismiss: [
        'They let the gesture stand without asking you to return it.',
        'They move on without turning loyalty into a debt.',
      ],
    },
  },
  risk_the_vibe: {
    scenarioKey: 'relationship_romance_check_in',
    family: 'romance',
    interactionType: 'compliment',
    openings: [
      'Maybe I am reading this wrong, but I want to risk asking: is there something between us?',
      'I would rather be a little awkward than keep guessing about the vibe, {player}.',
    ],
    replies: {
      positive: [
        'They are glad you asked and let the attraction become a real conversation.',
        'They confirm the spark without rushing into a label.',
      ],
      neutral: [
        'They take the uncertainty gently and leave the question open.',
        'They keep things friendly while you both work out what the feeling means.',
      ],
      negative: [
        'They accept your answer and keep the relationship platonic.',
        'They stop testing the chemistry and respect your read.',
      ],
      dismiss: [
        'They let the question pass without asking you to explain.',
        'They move on and leave the possibility untouched.',
      ],
    },
  },
  break_bromance: {
    scenarioKey: 'relationship_frustration_follow_up',
    family: 'loyalty',
    interactionType: 'check_in',
    openings: [
      'I do not think we are ride-or-die anymore, {player}. I want to stop pretending the pact is solid.',
      'We have changed, and I cannot keep calling this a brotherhood when we do not trust each other.',
    ],
    replies: {
      positive: [
        'They accept the distance and agree to end the pact without a public scene.',
        'They hear the truth and stop asking you to perform loyalty you do not feel.',
      ],
      neutral: [
        'They let the friendship cool while leaving room for a later repair.',
        'They keep things civil, but stop treating you as their closest partner.',
      ],
      negative: [
        'They take the breakup personally and name the move that broke their trust.',
        'They are hurt, but do not try to force a friendship you have ended.',
      ],
      dismiss: [
        'They let the conversation end without another appeal.',
        'They walk away and begin moving through the Hub on their own.',
      ],
    },
  },
  plant_lie: {
    scenarioKey: 'generic_gossip',
    family: 'deception',
    interactionType: 'gossip',
    openings: [
      'I have a story about {subject} that could move the room. I need to know if you will carry it.',
      'There is a version of events that would put pressure on {subject}. I am asking you to help me plant it.',
    ],
    replies: {
      positive: [
        'They share the false story and know you are taking a risk by helping spread it.',
        'They explain the lie they want repeated and make clear it could be traced back to both of you.',
      ],
      neutral: [
        'They leave the story unspoken until you decide whether the risk is worth it.',
        'They tell you enough to understand the plan, but no rumor is carried yet.',
      ],
      negative: [
        'They stop the lie from spreading through you and look for another route.',
        'They hear your refusal and keep the false story to themself.',
      ],
      dismiss: [
        'They drop the plan with you and do not treat silence as agreement.',
        'They take the rumor elsewhere without involving you.',
      ],
    },
  },
  trade_secrets: {
    scenarioKey: 'trade_secrets_offer',
    family: 'intel',
    interactionType: 'deal_offer',
    openings: [
      'I can trade you a private lead, {player}. What do you have that is worth the exchange?',
      'I have one piece of information I can share if we both bring something real to the table.',
    ],
    replies: {
      positive: [
        'They exchange the available lead and keep the source chain clear.',
        'They share one useful fact and receive the information you offered in return.',
      ],
      neutral: [
        'They hear each other out, but neither side gives up information yet.',
        'They leave the trade open until both of you are comfortable with the terms.',
      ],
      negative: [
        'They keep their information rather than trade under pressure.',
        'They accept that you are not willing to give up a lead.',
      ],
      dismiss: [
        'They end the offer without an exchange.',
        'They leave the information with its current owner.',
      ],
    },
  },
  expose_secret: {
    scenarioKey: 'betrayal_warning',
    family: 'exposure',
    interactionType: 'warning',
    openings: [
      'I know something private about {subject}, and I am considering making it public. You should know before it lands.',
      'The secret involving {subject} is close to coming out. I want your read before I expose it.',
    ],
    replies: {
      positive: [
        'They reveal what they know and explain why they believe the secret matters to the game.',
        'They share the evidence they have and let you judge whether exposure is justified.',
      ],
      neutral: [
        'They hold the secret for now and leave the decision open.',
        'They give you the context without publishing anything yet.',
      ],
      negative: [
        'They agree not to expose it through you and reconsider the harm it could cause.',
        'They hear your objection and keep the information private for now.',
      ],
      dismiss: [
        'They take the decision elsewhere and do not ask you to carry it.',
        'They leave the secret untouched in this conversation.',
      ],
    },
  },
  stir_rivalry: {
    scenarioKey: 'targeted_snark',
    family: 'conflict',
    interactionType: 'snide_remark',
    openings: [
      'I want to see whether {subject} is really as secure as they act. Will you help me put pressure on them?',
      'There is a rivalry waiting to happen with {subject}. I am asking you to make the tension visible.',
    ],
    replies: {
      positive: [
        'They create a pointed exchange and know the rivalry may now draw an audience.',
        'They take your willingness as a green light to challenge {subject} openly.',
      ],
      neutral: [
        'They keep the provocation subtle and wait for a clearer opening.',
        'They test the mood without claiming you joined the rivalry.',
      ],
      negative: [
        'They stop trying to recruit you into a personal feud.',
        'They hear your objection and keep the conflict from widening.',
      ],
      dismiss: [
        'They drop the idea and leave {subject} out of this exchange.',
        'They let the rivalry stay unspoken for now.',
      ],
    },
  },
  public_callout: {
    scenarioKey: 'targeted_snark',
    family: 'conflict',
    interactionType: 'snide_remark',
    openings: [
      'I am going to challenge your version where the Hub can hear it, {player}.',
      'People deserve to hear why I think your move does not add up. I am saying it openly.',
    ],
    replies: {
      positive: [
        'They lower the heat when you answer plainly, though they do not retract the accusation.',
        'They take your response seriously and let the public challenge end there.',
      ],
      neutral: [
        'They keep the disagreement on the facts and stop short of another jab.',
        'They accept that you will not play to the audience and let the moment cool.',
      ],
      negative: [
        'They answer back and the disagreement becomes a public rivalry.',
        'They take your pushback as a reason to keep the callout going.',
      ],
      dismiss: [
        'They are left speaking to the room after you walk away.',
        'They let the challenge hang, with no private resolution between you.',
      ],
    },
  },
  repair_bond: {
    scenarioKey: 'relationship_repair_follow_up',
    family: 'repair',
    interactionType: 'check_in',
    openings: [
      'We have both carried this long enough, {player}. Would you consider a truce?',
      'I want to stop feeding the rivalry. We do not have to trust each other overnight to begin repairing it.',
    ],
    replies: {
      positive: [
        'They accept the first step and agree to stop escalating the old conflict.',
        'They let the temperature drop and leave room to rebuild trust slowly.',
      ],
      neutral: [
        'They agree to pause the feud, but keep their guard up.',
        'They accept a truce for now without calling the relationship repaired.',
      ],
      negative: [
        'They stop asking for a reset and accept the conflict is still active.',
        'They hear that you are not ready and give you distance.',
      ],
      dismiss: [
        'They let the repair attempt pass without pushing again.',
        'They leave the old grievance unresolved and stop pursuing a truce.',
      ],
    },
  },
  ally: {
    scenarioKey: 'week_start_alliance_lock',
    family: 'commitment',
    interactionType: 'alliance_proposal',
    openings: [
      'Our games could work together, {player}. Want to make that official?',
      'I would rather face this week with you beside me. Are you open to a pact?',
    ],
    replies: {
      positive: [
        'They accept the pact and start comparing what each of you is promising.',
        'They treat the yes as a real alliance and ask to align on the next decision.',
      ],
      neutral: [
        'They keep the offer open until you are ready to name the terms.',
        'They accept the pause without counting you as an ally yet.',
      ],
      negative: [
        'They accept the refusal and look for another partner.',
        'They close the offer and stop planning around you.',
      ],
      dismiss: [
        'They let the pact offer end without treating silence as consent.',
        'They move on without making an alliance.',
      ],
    },
  },
  nominate: {
    scenarioKey: 'nomination_aftershock',
    family: 'nomination',
    interactionType: 'nomination_plea',
    openings: [
      'I am thinking about putting your name on the block, {player}. Tell me what I am missing.',
      'Your name is in my nomination plan. I wanted to give you a chance to answer me directly.',
    ],
    replies: {
      positive: [
        'They hear your case and agree to weigh it before locking the slate.',
        'They acknowledge the stakes and leave the nomination decision open for now.',
      ],
      neutral: [
        'They take in your argument without promising your safety.',
        'They explain what concerns remain and keep the decision theirs.',
      ],
      negative: [
        'They stand by the nomination plan and accept the relationship cost.',
        'They make clear that your pushback has not changed the target.',
      ],
      dismiss: [
        'They stop the conversation and continue planning the nomination.',
        'They leave without offering you a reason to expect a different decision.',
      ],
    },
  },
  vote_rally: {
    scenarioKey: 'alliance_vote_pitch',
    family: 'eviction_vote',
    interactionType: 'warning',
    openings: [
      'I am organising votes against you, {player}. I wanted to give you a chance to hear it directly.',
      'Your name is the target in my vote plan. I am not going to pretend otherwise.',
    ],
    replies: {
      positive: [
        'They explain the vote plan without promising that every voter will follow it.',
        'They give you the current count and leave room for the numbers to change.',
      ],
      neutral: [
        'They tell you what they know and keep the final vote uncertain.',
        'They answer carefully without handing over every name.',
      ],
      negative: [
        'They accept your challenge and stand by the vote plan.',
        'They stop trying to make the target sound personal and focus on the numbers.',
      ],
      dismiss: [
        'They leave to secure the remaining votes without you.',
        'They close the conversation and keep their ballot plan to themself.',
      ],
    },
  },
}

export function getIncomingActionContent(
  actionId: string | undefined
): IncomingActionContent | undefined {
  return actionId ? INCOMING_ACTION_CONTENT_BANK[actionId] : undefined
}

export function getIncomingActionPairingCount(): number {
  return Object.values(INCOMING_ACTION_CONTENT_BANK).reduce(
    (count, entry) => count + Object.keys(entry.replies).length,
    0
  )
}

function replaceActionTokens(text: string, playerName: string, subjectName?: string): string {
  return text.replaceAll('{player}', playerName).replaceAll('{subject}', subjectName ?? 'them')
}

export function pickIncomingActionOpening(
  actionId: string,
  seed: number,
  playerName: string,
  subjectName?: string
): { text: string; familyId: string; variantId: string } | null {
  const content = getIncomingActionContent(actionId)
  if (!content || content.openings.length === 0) return null
  const index = Math.abs(seed) % content.openings.length
  return {
    text: replaceActionTokens(
      content.openings[index] ?? content.openings[0] ?? '',
      playerName,
      subjectName
    ),
    familyId: `${actionId}:${content.family}`,
    variantId: `${actionId}:${content.family}:${index}`,
  }
}

export function pickIncomingActionReply(input: {
  actionId: string
  stance: IncomingActionStance
  seed: number
  playerName: string
  subjectName?: string
  recentLines?: readonly string[]
}): string | null {
  const content = getIncomingActionContent(input.actionId)
  const lines = content?.replies[input.stance]
  if (!lines?.length) return null
  const startIndex = Math.abs(input.seed) % lines.length
  const recentLines = new Set(
    input.recentLines?.map((line) => line.replace(/^["“]|["”]$/g, '').trim()) ?? []
  )
  for (let offset = 0; offset < lines.length; offset += 1) {
    const candidate = replaceActionTokens(
      lines[(startIndex + offset) % lines.length] ?? lines[0] ?? '',
      input.playerName,
      input.subjectName
    )
    if (!recentLines.has(candidate)) return candidate
  }
  return replaceActionTokens(
    lines[startIndex] ?? lines[0] ?? '',
    input.playerName,
    input.subjectName
  )
}
