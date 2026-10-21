import type { IncomingInteractionResponseType } from './types'

/**
 * The spoken beat that sits between a player's reply and its social fallout.
 *
 * An incoming interaction should not resolve as a hidden relationship number.
 * This small bank gives the other housemate a specific answer, concession or
 * refusal first. The resolver then applies the relationship, memory, reality
 * and promise consequences that follow from that exchange.
 */

export interface IncomingDialogueBeatInput {
  scenarioKey?: string
  variantFamilyId?: string
  responseType: IncomingInteractionResponseType
  responseLabel?: string
  fromName: string
  subjectName?: string
  secondarySubjectName?: string
  seed: number
  recentLines?: readonly string[]
}

type Stance = 'positive' | 'neutral' | 'negative' | 'dismiss'
type BeatSet = Record<Stance, readonly string[]>

const INTEL_BEATS: BeatSet = {
  positive: [
    '"I heard it in two separate conversations. Both pointed to {subject}, but neither person saw the whole plan — so treat it as a lead, not a fact."',
    '"The first whisper came after the last decision, then I watched people stop talking when {subject} walked in. I am telling you the pattern, not pretending I can prove the motive."',
  ],
  neutral: [
    '"I can give you the shape of it, but not a clean source. The name that keeps coming back is {subject}; I would watch before I would act."',
    '"It is second-hand, and I do not want to overstate it. Something changed around {subject}, but I cannot tell you yet whether it is strategy or nerves."',
  ],
  negative: [
    '"Fair. I will not push a rumour you do not want to hear — but I will remember who you were quick to protect."',
    '"If you think I am fishing, leave it there. I would rather keep a weak lead private than turn it into Hub noise."',
  ],
  dismiss: [
    '"Then forget I raised it. I will take the next piece of this to someone who wants the risk."',
    '"All right. No source, no debate — just do not say nobody tried to give you a heads-up."',
  ],
}

const CAMPAIGN_BEATS: BeatSet = {
  positive: [
    '"My case is that I am a number you can work with, while the people pushing my name have more to gain from a divided Hub. If you keep me safe, I will show you that in the next decision."',
    '"I am not asking you to save me out of guilt. I am asking you to look at who benefits if I go, because it is not your game."',
  ],
  neutral: [
    '"I cannot give you certainty, but I can be clear: I am not building anything against you. I need to know what would make you comfortable enough to keep the door open."',
    '"I hear that you are not promising anything. Tell me the concern, and I will answer it instead of guessing where I lost you."',
  ],
  negative: [
    '"Then I have my answer. I will not waste either of our time pretending this is still a live conversation."',
    '"I do not like it, but I would rather know where I stand than keep campaigning to a closed door."',
  ],
  dismiss: [
    '"Okay. I will take the pitch somewhere I can get an answer before the window closes."',
    '"You do not have to explain it, but the silence tells me I cannot build my week around you."',
  ],
}

const ALLIANCE_BEATS: BeatSet = {
  positive: [
    '"Then let us make it practical: we tell each other when our names are being discussed, compare targets before a ceremony, and do not make each other guess."',
    '"Good. I do not need a showmance alliance; I need a person who will warn me before a room flips. I can be that for you too."',
  ],
  neutral: [
    '"I can work with cautious, but I need to know what that means. Are we sharing information, or are we just being friendly until power changes?"',
    '"Take the time you need. I will keep the door open, but I cannot plan my whole week around a maybe."',
  ],
  negative: [
    '"Then I will stop treating our chats as strategy. No hard feelings, but I will protect my information from here."',
    '"That is clear enough. I would rather have an honest no than build a plan on something neither of us means."',
  ],
  dismiss: [
    '"I will take that as no answer for now. If the Hub changes, we can see whether there is still a reason to talk."',
    '"All right. I will make my next move without assuming you are part of it."',
  ],
}

const CO_NOMINEE_BEATS: BeatSet = {
  positive: [
    '"Thanks. I will keep comparing what I hear with you, but neither of us can promise how the others vote."',
    '"I appreciate that. Let us focus on the voters we can still reach; we cannot change the block for each other."',
  ],
  neutral: [
    '"That is fair. I will share what I know, but I will not mistake this for a vote promise."',
    '"We can compare notes and still make our own cases. Neither of us controls the block."',
  ],
  negative: [
    '"I understand. I will stop asking you to carry my campaign and focus on the votes I can still reach."',
    '"Fair enough. We are both on the block, so I need to make my own case."',
  ],
  dismiss: [
    '"All right. I will take my campaign to someone else and leave this conversation here."',
    '"I hear you. I will keep working the room on my own."',
  ],
}

const REPAIR_BEATS: BeatSet = {
  positive: [
    '"Thank you for saying that. I did not need a perfect apology; I needed to know you saw why it landed badly."',
    '"That helps. I am still hurt, but I would rather deal with it directly than let the Hub write the story for us."',
  ],
  neutral: [
    '"I hear the explanation. I am not ready to call it fixed, but at least I know you are not pretending nothing changed."',
    '"Give me a little time. I can keep this from becoming a bigger thing, but I need your actions to match what you are saying."',
  ],
  negative: [
    '"Then we are not going to agree on what happened. I will stop asking you to see it my way."',
    '"That answer makes the distance clearer, even if it does not make it easier."',
  ],
  dismiss: [
    '"Fine. I will take the space you are asking for, but unresolved things do not disappear just because nobody names them."',
    '"I will leave it alone for now. It still changes what I bring to you next time."',
  ],
}

const AFTERSHOCK_PROCESSING_BEATS: BeatSet = {
  positive: [
    '"Thank you for sitting with me. I can breathe a little easier now."',
    '"I needed someone to stay for a minute. That helped more than advice would have."',
  ],
  neutral: [
    '"I am not sure what I need yet. Let me talk it through, and maybe I will find the answer."',
    '"Just asking what would help gives me a moment to think. The block still feels real, though."',
  ],
  negative: [
    '"I know you want to focus on the game. I am still trying to steady myself before I can do that."',
    '"I hear you. I will find another person to talk to while I get my head back in the game."',
  ],
  dismiss: [
    '"All right. I will give you room and try to get through the first shock on my own."',
    '"I understand. I will step away for now and collect myself."',
  ],
}

const AFTERSHOCK_TRUST_BEATS: BeatSet = {
  positive: [
    '"That helps. I needed to know I still had someone I could be straight with."',
    '"I appreciate the reassurance. I will keep being honest with you about what I hear."',
  ],
  neutral: [
    '"Comparing reads works for me. Let us keep each other informed without making promises we cannot control."',
    '"I can share what I know. We can both decide what to do with it after we compare notes."',
  ],
  negative: [
    '"I get that you need to protect your own position. I will do the same with mine."',
    '"Fair enough. I will stop assuming we are sharing information and make my own read."',
  ],
  dismiss: [
    '"Okay. I will not press you for reassurance right now."',
    '"I hear you. I will take the conversation elsewhere and let this sit."',
  ],
}

const AFTERSHOCK_STRATEGY_BEATS: BeatSet = {
  positive: [
    '"That gives me something useful. I will compare it with what I hear before I make a move."',
    '"Good. I would rather build a plan from what we both know than guess alone."',
  ],
  neutral: [
    '"Let us compare notes, then. I will keep my options open until the numbers are clearer."',
    '"That is fair. We can trade reads without locking ourselves into the same move."',
  ],
  negative: [
    '"Understood. I will keep my own game protected and work from the information I have."',
    '"I will make my case on my own, then. At least I know where we stand strategically."',
  ],
  dismiss: [
    '"All right. I will take my read to someone else before the room shifts again."',
    '"I will get back to the campaign. We can talk when there is more to say."',
  ],
}

const AFTERSHOCK_FOLLOW_UP_BEATS: BeatSet = {
  positive: [
    '"I could tell you meant it. I am glad I came back to talk instead of sitting with the worry alone."',
    '"I did not forget that you showed up for me. Hearing you say it again makes this week feel less isolating."',
  ],
  neutral: [
    '"I am holding up better than I was. I still have a lot to figure out, but I appreciate you asking."',
    '"Some moments are easier than others. It helps to know I can check in without pretending I am fine."',
  ],
  negative: [
    '"I understand. I will keep this focused on the game too, even if I was hoping we could talk as people."',
    '"Fair. I will not lean on you for comfort, but I am grateful you were there earlier."',
  ],
  dismiss: [
    '"I will let you get back to it. I just wanted to say that earlier conversation mattered to me."',
    '"Okay. I will give you the space. Thanks for hearing me before."',
  ],
}

const AFTERSHOCK_FAMILY_BEATS: Record<string, BeatSet> = {
  na_processing: AFTERSHOCK_PROCESSING_BEATS,
  na_trust_check: AFTERSHOCK_TRUST_BEATS,
  na_strategic: AFTERSHOCK_STRATEGY_BEATS,
  na_followup: AFTERSHOCK_FOLLOW_UP_BEATS,
}

const NOMINEE_UNDERSTANDS_BEATS: BeatSet = {
  positive: [
    '"I appreciate you being straight with me. I still hate being on the block, but I understand why you made the call."',
    '"That explanation helps. I need to see what happens next before I know how much it changes things between us."',
  ],
  neutral: [
    '"I can explain how it looked from my side. I am listening, but I still need time to sort out what it means for us."',
    '"I am trying to separate the move from our relationship. Tell me what you were weighing when you chose me."',
  ],
  negative: [
    '"I hear that you are standing by it. I will stop looking for an apology and focus on surviving the block."',
    '"You do not owe me an apology, but I will make my next move with this in mind."',
  ],
  dismiss: [
    '"All right. I will give you space and work out what comes next on my own."',
    '"I will leave it there for now. The vote is close enough that I have other things to handle."',
  ],
}

const NOMINEE_CONFRONTATION_BEATS: BeatSet = {
  positive: [
    '"Thank you for hearing how much this hurt. I can listen to your reasons now, even if I am not over it."',
    '"That is the honest conversation I wanted. Tell me what you were weighing, and do not soften it for me."',
  ],
  neutral: [
    '"I am angry, but I can hear you out if we keep this honest."',
    '"I will listen to the calculation. Just do not expect it to erase how the nomination landed."',
  ],
  negative: [
    '"Then we are both clear about where we stand. I will protect my game from here."',
    '"If you want to push back, say it plainly. I am done guessing at your reasons."',
  ],
  dismiss: [
    '"Fine. I am too angry to get anywhere with this right now."',
    '"I will leave before this turns into a bigger fight. We can deal with it later."',
  ],
}

const REPLACEMENT_NOMINEE_BEATS: BeatSet = {
  positive: [
    '"I appreciate you explaining it. The replacement still put me in danger, but at least I know why."',
    '"That helps me understand the decision. I will focus on what I can still change this week."',
  ],
  neutral: [
    '"I want to hear how you reached that choice before I decide what it means for us."',
    '"I can listen to the logic. I still need a plan for getting off the block."',
  ],
  negative: [
    '"I hear that you are standing by it. I will stop expecting you to undo the damage."',
    '"Then I know the choice was deliberate. I will campaign without counting on you."',
  ],
  dismiss: [
    '"I cannot do this conversation right now. I need to work out how to survive first."',
    '"I will take it from here. The block needs my attention more than this argument does."',
  ],
}

const PLAYER_NOMINATED_SUPPORT_BEATS: BeatSet = {
  positive: [
    '"I am glad you checked in. Having someone beside me makes the block feel a little less heavy."',
    '"Thank you. I do not need you to fix it; I just needed to know someone noticed."',
  ],
  neutral: [
    '"I am still sorting out what would help. Can we talk through the options before the vote moves?"',
    '"A straight conversation would help. I need to know what you have heard about the numbers."',
  ],
  negative: [
    '"I understand if you cannot be in my corner. I will look for support somewhere else."',
    '"All right. I will handle the campaign on my own and stop asking you to carry it."',
  ],
  dismiss: [
    '"I will let you go. I have to keep moving while there is still time."',
    '"Okay. I will give you space and find someone else to talk to."',
  ],
}

const PLAYER_NOMINATED_TENSION_BEATS: BeatSet = {
  positive: [
    '"Thank you for being willing to talk plainly. I would rather know the truth than let the tension grow."',
    '"That is a start. We do not have to agree, but at least we are not pretending nothing is wrong."',
  ],
  neutral: [
    '"I can keep this calm. I want to hear your read before either of us decides what this means."',
    '"Fair. Let us talk through the tension without turning it into a promise or a fight."',
  ],
  negative: [
    '"I hear the boundary. I will stop pushing and protect my own position from here."',
    '"Then we should be honest that this has changed things. I will plan accordingly."',
  ],
  dismiss: [
    '"I will leave it there for now. We are not going to solve this while we are both raw."',
    '"All right. I will give you space, even if the tension is still here."',
  ],
}

const POWER_BEATS: BeatSet = {
  positive: [
    '"That is enough for me to work with. I will keep my side of the conversation quiet and show you I can be useful when the decision lands."',
    '"I appreciate the opening. I know the power is yours; I only needed to know there was a real path for me."',
  ],
  neutral: [
    '"I understand. You are keeping options open, so I will keep working mine. If the board shifts, tell me before I hear it from somebody else."',
    '"No promise is still information. I will plan for both outcomes instead of assuming I am covered."',
  ],
  negative: [
    '"Then I will stop trying to negotiate this decision and start protecting myself from it."',
    '"That is not the answer I wanted, but it is a usable one. I know where to spend the rest of my time."',
  ],
  dismiss: [
    '"I will not chase you for an answer. I just wish I had not spent the time pretending there was a conversation to have."',
    '"All right. I will read the decision when it happens and adjust from there."',
  ],
}

const ALLIANCE_NOMINATION_BEATS: BeatSet = {
  positive: [
    '"I hear you. {subject} is the target we are recommending, but the LOH still owns the final slate."',
    '"That gives me a clear alliance read. I will treat {subject} as our recommendation, not a guaranteed nominee."',
  ],
  neutral: [
    '"You heard my slate without backing it. I will keep your position open and make my own decision."',
    '"Fair. {subject} is my preference, but I know you have not joined that plan."',
  ],
  negative: [
    '"I hear the pushback. I will reconsider {subject}, but the final slate is still mine to set."',
    '"Then we do not share a read on {subject}. I will weigh that before I lock the nominations."',
  ],
  dismiss: [
    '"I will set the slate without your read, then. I wanted to ask before I locked it."',
    '"All right. I will make the nomination call on the information I have."',
  ],
}

const ALLIANCE_SAFETY_BEATS: BeatSet = {
  positive: [
    '"I have your read: save {subject}, with {secondary} as the replacement recommendation. I still make the Safety decision."',
    '"That helps. I will weigh saving {subject} and using {secondary} for the open seat; the choice is still mine."',
  ],
  neutral: [
    '"You heard my Safety read, but you have not backed it. I will make the call with that in mind."',
    '"Fair. I will keep {subject} and {secondary} in view while I decide."',
  ],
  negative: [
    '"I hear your objection. I will reconsider the plan before I use Safety."',
    '"Then we disagree on this Safety move. I will decide after weighing your concern."',
  ],
  dismiss: [
    '"I will make the Safety call without your read, then."',
    '"All right. The decision is mine to make, and I will do that now."',
  ],
}

const ALLIANCE_VOTE_BEATS: BeatSet = {
  positive: [
    '"Good, we are reading the vote the same way on {subject}. We still each cast our own ballot."',
    '"That is the same target I had in mind: {subject}. Let us see how the rest of the Hub moves."',
  ],
  neutral: [
    '"You heard my vote read, but I will not count you as part of it."',
    '"That is fair. {subject} is my choice; yours is still yours."',
  ],
  negative: [
    '"Then we disagree about {subject}. I will cast my own ballot."',
    '"I hear you. I will not pretend the alliance has one shared vote when it does not."',
  ],
  dismiss: [
    '"I will leave your ballot out of my count and make my own choice."',
    '"All right. We can leave the vote conversation there."',
  ],
}

const CONNECTION_BEATS: BeatSet = {
  positive: [
    '"That is the first honest answer I have had all day. I do not need us to agree on everything; I needed to know I was not guessing alone."',
    '"Thank you for meeting me halfway. It makes it easier to bring the next concern to you instead of carrying it around the Hub."',
    '"I came here expecting to leave with more questions. I am glad we actually talked about where we stand."',
    '"You could have given me an easy answer. You gave me a real one, and I can meet you there."',
    '"We do not have to solve everything tonight. I just wanted us to stop guessing at each other."',
    '"I was ready to read your silence as an answer. I am glad I asked instead."',
    '"That gives me something solid to carry into our next conversation."',
    '"I can hold on to my own plans and still be straight with you. That feels better than playing it cool."',
  ],
  neutral: [
    '"I can live with careful. Just do not ask me to read between the lines and call it trust."',
    '"That tells me where you are today. I will watch what happens next before I decide what it means for us."',
    '"I hear you. I will leave room for this to change, but I am not going to fill in the blanks myself."',
    '"We can keep talking. I just need to see whether this feels the same when the room gets tense."',
    '"That is enough for now. I would rather have a careful answer than a promise neither of us can keep."',
  ],
  negative: [
    '"I hear the boundary. I will stop reaching for an answer you do not want to give."',
    '"Okay. I was hoping for more, but I would rather know the distance is real than keep inventing reasons for it."',
    '"I do not like hearing it, but I will respect what you are asking for."',
    '"Then I will keep this between us and stop expecting the conversation to go further."',
    '"I understand. I will take care of my side of this without asking you to carry it."',
  ],
  dismiss: [
    '"Then we can leave it there. I will take the lack of an answer into account the next time I decide who to trust."',
    '"I will give you space. It does not mean the question goes away for me."',
    '"All right. I will stop asking tonight and let your next move speak for itself."',
    '"We can drop it. I will make my own read until you feel like talking."',
    '"I will leave you to it. I am not going to force a conversation you do not want."',
  ],
}

const COMPETITION_SUPPORT_BEATS: BeatSet = {
  positive: [
    '"It was one rough round, not the whole week. Thanks for checking on me without making it a spectacle."',
    '"I needed a minute after that result. It helps that you asked instead of turning it into a joke."',
    '"I know where I slipped. I will come back sharper, and I appreciate you saying something."',
  ],
  neutral: [
    '"I am all right. One result does not tell me what the next one will look like."',
    '"I hear you. I am still deciding what that round means for my week."',
    '"It was not my best showing. I would rather focus on what comes next."',
  ],
  negative: [
    '"I can handle a bad result without turning it into a conversation about my limits."',
    '"I know you mean well, but I do not need a pep talk every time I fall short."',
    '"Let me be disappointed for a minute before we turn it into a lesson."',
  ],
  dismiss: [
    '"I am going to cool off and think about the next round on my own."',
    '"Thanks, but I would rather leave the competition out of this conversation."',
    '"I hear you. I am going to get back to the Hub."',
  ],
}

const COMPETITION_TAUNT_BEATS: BeatSet = {
  positive: [
    '"If that was meant to rattle me, nice try. I am still in this."',
    '"I will give you the point for timing. The next result can speak for itself."',
    '"You got your joke in. I am not giving you the reaction you came for."',
  ],
  neutral: [
    '"I heard you. I am not spending the rest of the day arguing about one round."',
    '"Say what you want. I know what I need to work on."',
    '"Maybe. I am more interested in the next result than this conversation."',
  ],
  negative: [
    '"That was a cheap shot. Do not confuse one result with my place in this game."',
    '"If you have something to say about my game, say it without the victory lap."',
    '"You can keep the joke. I will remember who enjoyed making it."',
  ],
  dismiss: [
    '"Enjoy the moment. I have somewhere else to be."',
    '"I am not giving this any more of my time."',
    '"Keep talking if you want. I am done here."',
  ],
}

const CELEBRATION_BEATS: BeatSet = {
  positive: [
    '"Thank you. A win changes the room fast, so it means something that you came to me as a person first."',
    '"I am trying to enjoy the moment before everyone turns it into a strategy meeting."',
    '"I appreciate you sharing this with me. I will remember who could be happy for me without asking for something."',
    '"That means a lot. Let me have one minute to celebrate before the game takes over again."',
  ],
  neutral: [
    '"Thanks. I am keeping my head clear until I know what this win actually changes."',
    '"I appreciate it. I am still working out how much of this I want the Hub to know."',
    '"It is a good moment. I am trying not to get ahead of what comes next."',
  ],
  negative: [
    '"I know there is a game attached to this, but I would rather not turn the whole moment into a pitch."',
    '"I am not ready to trade the celebration for a conversation about what you need."',
    '"You can ask me about strategy later. Right now I am not making promises."',
  ],
  dismiss: [
    '"I am going to enjoy the moment with someone else. We can talk game later."',
    '"Not right now. I have enough people trying to get a read on me today."',
    '"Let me have this one without turning it into a conversation."',
  ],
}

const GRATITUDE_BEATS: BeatSet = {
  positive: [
    '"You put something real on the line for me. I will remember that when it is my turn to make a hard choice."',
    '"I do not take that kind of help lightly. You gave me room to keep playing, and I know what that cost you."',
    '"I was not sure anyone would come through. You did, and I will make sure it matters."',
    '"Thank you for showing me where I stand with you. I will try to answer that with actions."',
  ],
  neutral: [
    '"I appreciate the help. I am not ready to call it a deal, but I will remember the choice you made."',
    '"Thank you. I know the game is still moving, so let us see what this means after the next decision."',
    '"That mattered to me. I just need a little time before I know what I can offer back."',
  ],
  negative: [
    '"I am grateful, but I do not want either of us pretending this settles everything between us."',
    '"I will remember what you did. I still need to make my own decisions from here."',
    '"Thank you for the help. I cannot promise that it changes where my game has to go."',
  ],
  dismiss: [
    '"I have said thank you. Let us leave the rest of this for another time."',
    '"I appreciate it, but I need a moment before I talk about what comes next."',
    '"I will remember the help. I am going to get back to the Hub now."',
  ],
}

const SNARK_BEATS: BeatSet = {
  positive: [
    '"I can take a joke. Just do not mistake me laughing for missing the point."',
    '"Fair shot. I am not going to let one jab decide how the rest of this conversation goes."',
    '"I know what you were testing. You can ask me directly next time."',
  ],
  neutral: [
    '"I heard the point underneath the joke. I am not sure I agree with your read."',
    '"Maybe there is something to what you said. I am not giving you a full answer in the middle of the Hub."',
    '"I am going to let that sit before I decide whether it was funny or useful."',
  ],
  negative: [
    '"If you have a real problem with me, say it without hiding behind a joke."',
    '"That was not playful. Do not expect me to pretend it landed that way."',
    '"You made your point. I am not giving you another opening to take a shot at me."',
  ],
  dismiss: [
    '"I am not giving the jab an audience. Find someone else to try it on."',
    '"I have nothing to add to that."',
    '"Keep the punchline. I am leaving."',
  ],
}

const BEATS_BY_SCENE: Record<string, BeatSet> = {
  week_start_enemy_gossip: INTEL_BEATS,
  generic_gossip: INTEL_BEATS,
  betrayal_warning: INTEL_BEATS,
  social_momentum_notice: INTEL_BEATS,
  nominee_hoh_plea: CAMPAIGN_BEATS,
  nominee_veto_pitch: CAMPAIGN_BEATS,
  nominee_campaign: CAMPAIGN_BEATS,
  post_veto_campaign: CAMPAIGN_BEATS,
  live_vote_pitch: CAMPAIGN_BEATS,
  tie_break_campaign: {
    positive: [
      '"Then I will remember that you chose me when the whole game came down to one vote. I will make that loyalty count."',
      '"If you keep me, you have my word: I will protect your game, share what I know, and stand with you at the next decision."',
    ],
    neutral: [
      '"I understand. You are not promising me anything, so I will make my case on the game and accept that the choice is yours."',
      '"Then hear the one thing I can offer: a real vote beside you next week. Decide whether that is worth more than keeping them."',
    ],
    negative: [
      '"I hear you. If you send me out, at least I will know exactly where I stood with you."',
      '"Then I will stop asking. I hope the person you keep gives you more than I could have."',
    ],
    dismiss: [
      '"The vote is yours, but the clock is running. I will find one last person willing to hear me out."',
      '"All right. I will not chase you for an answer while you hold the deciding vote."',
    ],
  },
  week_start_alliance_lock: ALLIANCE_BEATS,
  co_nominee_check_in: CO_NOMINEE_BEATS,
  alliance_reassurance: ALLIANCE_BEATS,
  alliance_nomination_pitch: ALLIANCE_NOMINATION_BEATS,
  alliance_power_nomination_huddle: ALLIANCE_NOMINATION_BEATS,
  alliance_safety_pitch: ALLIANCE_SAFETY_BEATS,
  alliance_power_safety_huddle: ALLIANCE_SAFETY_BEATS,
  alliance_vote_pitch: ALLIANCE_VOTE_BEATS,
  relationship_alliance_follow_up: ALLIANCE_BEATS,
  nomination_aftershock: REPAIR_BEATS,
  nominee_understands_loh: NOMINEE_UNDERSTANDS_BEATS,
  unavoidable_nominee_reaction: POWER_BEATS,
  automatic_nominee_reaction: POWER_BEATS,
  nominee_confronts_loh: NOMINEE_CONFRONTATION_BEATS,
  replacement_nominee_reacts_to_loh: REPLACEMENT_NOMINEE_BEATS,
  ignored_warning: REPAIR_BEATS,
  relationship_frustration_follow_up: REPAIR_BEATS,
  relationship_repair_follow_up: REPAIR_BEATS,
  hoh_safety_request: POWER_BEATS,
  player_nominated_support: PLAYER_NOMINATED_SUPPORT_BEATS,
  player_nominated_tension: PLAYER_NOMINATED_TENSION_BEATS,
  competition_low_finish_support: COMPETITION_SUPPORT_BEATS,
  competition_low_finish_taunt: COMPETITION_TAUNT_BEATS,
  hoh_congratulations: CELEBRATION_BEATS,
  safety_win_congratulations: CELEBRATION_BEATS,
  post_veto_gratitude: GRATITUDE_BEATS,
  survivor_gratitude: GRATITUDE_BEATS,
  targeted_snark: SNARK_BEATS,
  season_provocateur: {
    positive: [
      '"I will take that as a real answer. We still disagree, but I do not need to turn every conversation into a contest."',
      '"Fine. I heard you out. I am not promising we are good, but I can leave it there for now."',
    ],
    neutral: [
      '"You do not have to agree with me. I wanted you to know I am going to keep saying it when I think you are wrong."',
      '"That is your read. Mine has not changed, and people can decide for themselves which one makes sense."',
    ],
    negative: [
      '"There it is. You can dismiss me, but you cannot make me stop calling out what I see."',
      '"Good. At least now we are being honest about where we stand. I am not dropping this."',
    ],
    dismiss: [
      '"Walk away if you want. I said what I came to say, and I will say it again when it matters."',
      '"You do not want the conversation. That is fine. The disagreement is still there."',
    ],
  },
  generic_check_in: CONNECTION_BEATS,
  week_start_ally_check_in: CONNECTION_BEATS,
  relationship_friendship_check_in: CONNECTION_BEATS,
  relationship_romance_check_in: CONNECTION_BEATS,
  relationship_confidant_check_in: CONNECTION_BEATS,
}

function stanceForResponse(responseType: IncomingInteractionResponseType): Stance {
  if (responseType === 'positive' || responseType === 'accept') return 'positive'
  if (responseType === 'negative' || responseType === 'decline') return 'negative'
  if (responseType === 'dismiss' || responseType === 'ignore') return 'dismiss'
  return 'neutral'
}

function replaceTokens(line: string, input: IncomingDialogueBeatInput): string {
  const subject = input.subjectName ?? 'the person at the centre of it'
  const secondary = input.secondarySubjectName ?? 'the replacement option'
  return line.replaceAll('{subject}', subject).replaceAll('{secondary}', secondary)
}

/** Returns a stable in-character reply, rotating past recently used dialogue where possible. */
export function getIncomingDialogueBeat(input: IncomingDialogueBeatInput): string | null {
  const familyBeats = input.variantFamilyId
    ? AFTERSHOCK_FAMILY_BEATS[input.variantFamilyId]
    : undefined
  const beats = familyBeats ?? (input.scenarioKey ? BEATS_BY_SCENE[input.scenarioKey] : undefined)
  if (!beats) return null
  const options = beats[stanceForResponse(input.responseType)]
  if (!options.length) return null
  const startIndex = input.seed % options.length
  for (let offset = 0; offset < options.length; offset += 1) {
    const candidate = replaceTokens(
      options[(startIndex + offset) % options.length] ?? options[0],
      input
    )
    if (!input.recentLines?.includes(candidate)) return candidate
  }
  return replaceTokens(options[startIndex] ?? options[0], input)
}
