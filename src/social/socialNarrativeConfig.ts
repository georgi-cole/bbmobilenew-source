/**
 * Display-only copy for social action receipts. Keep this file data-only so
 * writers can expand the story bank without changing outcome logic or saves.
 */
export type SocialNarrativeOutcome = 'success' | 'failure'
export type SocialNarrativeCategory = 'friendly' | 'strategic' | 'aggressive' | 'alliance'

/** Additional action attempts layered over the original, still-used phrase pools. */
export const SOCIAL_ACTION_NARRATIVE_ADDITIONS: Readonly<Record<string, readonly string[]>> = {
  compliment: [
    'You told {target} their confidence makes even the nomination board look less intimidating.',
    'You said {target} has the rare talent of making a tense room feel almost normal.',
    'You praised {target} for keeping their head while everyone else chased the latest rumour.',
    'You told {target} their laugh is the easiest sound to recognize across the Hub.',
    'You said {target} somehow makes game talk sound like an actual conversation.',
  ],
  whisper: [
    'You drew {target} aside and lowered your voice before sharing what you had heard.',
    'You gave {target} the short version first, then watched to see whether they wanted the rest.',
    'You passed {target} a quiet warning while the others were busy arguing over breakfast.',
    'You shared one carefully chosen detail with {target} and left the rest unsaid.',
  ],
  observe: [
    'You watched who sat together, who kept checking the door, and who stopped talking when the LOH entered.',
    'You let the room settle before deciding which conversations were worth remembering.',
    'You kept to the edge of the Hub and followed the shifting groups with your eyes.',
  ],
  group_chat: [
    'You brought {target} into a loose living-room conversation and let the topic wander.',
    'You joined {target} and the others around the kitchen island, keeping the talk light.',
    'You pulled {target} into a group chat that started with weekend plans and drifted toward the game.',
    'You made the rounds with {target} and gave everyone room to join the conversation.',
    'You helped {target} turn a quiet afternoon into a proper Hub catch-up.',
    'You started an easy conversation with {target} and let the rest of the room fill in around you.',
  ],
  build_quiet_bond: [
    'You found a quieter corner with {target} and asked what the week had really felt like for them.',
    'You stepped away from the noise with {target} and let the silence do some of the work.',
    'You asked {target} about life outside the game and shared a little about your own.',
    'You and {target} took a slower conversation away from the crowded sofa.',
    'You made time for {target} when the rest of the Hub was busy comparing plans.',
  ],
  share_personal_story: [
    'You told {target} a story you usually save for people you trust.',
    'You let {target} see a more personal side of you, away from the game talk.',
    'You shared a small memory with {target} and explained why it still matters to you.',
    'You opened up to {target} about something that does not fit neatly into a strategy.',
  ],
  read_the_room: [
    'You tracked who backed whose story and which names made the room go quiet.',
    'You watched the group split into smaller conversations and noted who crossed between them.',
    'You listened for the topics people carefully avoided as much as the ones they raised.',
    'You took the temperature of the Hub before choosing where to spend your attention.',
  ],
  consult_alliance: [
    'You brought the decision to your alliance and asked each person to speak plainly.',
    'You checked the alliance read before committing yourself to a move.',
    'You asked your allies what they were seeing and compared their answers.',
    'You opened a private alliance discussion about the choice in front of you.',
  ],
  proposeAlliance: [
    'You asked {target} whether the two of you could protect each other when the vote turns personal.',
    'You laid out a two-person pact with {target}, including the part where both of you could say no.',
    'You offered {target} a quiet partnership and asked what they would need from you in return.',
    'You and {target} talked through what a private pact would actually ask of each of you.',
  ],
  protect: [
    'You promised {target} you would consider their name before making a move that could put them at risk.',
    'You told {target} where you would stand if the Hub started lining up against them.',
    'You offered {target} your vote or power if the right moment came.',
    'You made {target} a promise that will matter only when the pressure is real.',
  ],
  betray: [
    'You quietly shifted your support away from {target} while keeping the conversation ordinary.',
    'You used what {target} trusted you with to make a move for yourself.',
    'You chose the game over your promise to {target} and let the consequences wait.',
    'You gave the other side enough information to move against {target}.',
  ],
  reassure: [
    'You checked in with {target} after the room had moved on to its next crisis.',
    'You reminded {target} that one bad day does not decide their place in the Hub.',
    'You stayed with {target} long enough for them to say what was actually bothering them.',
    'You told {target} they did not have to solve the whole week in one conversation.',
  ],
  apologize: [
    'You went back to {target} and named the part of your last conversation you regretted.',
    'You apologized to {target} without adding a reason you thought they should forgive you.',
    'You gave {target} space to answer after owning what you had done.',
    'You told {target} you understood why the moment had stuck with them.',
  ],
  share_intel: [
    'You shared the detail you had been holding back and explained where it came from.',
    'You gave {target} a piece of information that could change how they read the week.',
    'You compared notes with {target} and offered the part of your read you could stand behind.',
    'You passed {target} a useful detail and let them decide what to do with it.',
  ],
  rumor: [
    'You floated a story about {target} without saying who first brought it to you.',
    'You repeated a rumour about {target} and watched to see which details drew questions.',
    'You gave {target} a warning about someone else, then let the implication hang in the air.',
    'You shared a version of the story that made {target} look twice at their closest ally.',
  ],
  startFight: [
    'You raised the issue with {target} in the kitchen, where nobody could pretend not to hear.',
    'You pushed {target} to answer for a comment that had been following you all day.',
    'You challenged {target} in front of the room and did not soften the question.',
    'You let the disagreement with {target} become the conversation everyone was watching.',
  ],
  confront: [
    'You asked {target} directly why their version of the story kept changing.',
    'You gave {target} a chance to explain before telling them what you suspected.',
    'You brought the issue to {target} face-to-face instead of letting it travel through the Hub.',
    'You asked {target} to account for the gap between what they said and what happened.',
  ],
  favor_request: [
    'You reminded {target} of the last time you showed up for them and asked for help in return.',
    'You made a direct request of {target}, leaving little room to mistake what you wanted.',
    'You asked {target} to spend some of their influence on a move that mattered to you.',
    'You called in a favour with {target} and waited to see what the relationship was worth.',
  ],
  pitch_target: [
    'You explained to {target} why {subject} would be the safer name to put forward.',
    'You gave {target} your case against {subject}, including the risk of leaving them alone.',
    'You asked {target} to consider {subject} and laid out what the move could change.',
    'You brought {subject} into the conversation with {target} and made your reasons clear.',
  ],
  suggest_replacement: [
    'You asked {target} to consider {subject} if the veto opens a seat on the block.',
    'You explained to {target} why {subject} would fit the replacement plan.',
    'You put {subject} forward to {target} and described the fallout you expected.',
    'You suggested {subject} as the replacement and let {target} weigh the risks.',
  ],
  ask_use_safety: [
    'You asked {target} to use Safety on {subject} and gave them room to weigh the cost.',
    'You made your case to {target} for saving {subject} before the ceremony.',
    'You asked {target} what it would take for them to protect {subject}.',
    'You explained to {target} why {subject} should not be left on the block.',
  ],
  ask_safety_plan: [
    'You asked {target} what they intended to do with Safety and listened for the part they skipped.',
    'You gave {target} a chance to share their Safety plan before the room made assumptions.',
    'You asked {target} whether their decision was settled or still open to discussion.',
  ],
  ask_hold_safety: [
    'You asked {target} to leave the nominations as they are and explained why the block matters to you.',
    'You made the case to {target} for holding Safety instead of changing the board.',
    'You asked {target} not to use Safety and acknowledged they would have to live with the choice.',
  ],
  warn_about_danger: [
    'You told {target} the LOH had been saying their name and urged them to prepare.',
    'You warned {target} that the nomination plan might already include them.',
    'You gave {target} a quiet heads-up about the danger closing around them.',
  ],
  ask_why_nominated: [
    'You asked {target} what put your name on the block and waited through the first answer.',
    'You asked {target} to explain the nomination decision without dressing it up.',
    'You gave {target} a chance to tell you whether the move was personal or strategic.',
  ],
  ask_loh_target: [
    'You asked {target} which name they were really building the week around.',
    'You pressed {target} for a straight answer about the plan behind the nominations.',
    'You asked {target} who they would put up if the block changed.',
  ],
  warn_about_player: [
    'You told {target} what has been making you wary of {subject}.',
    'You shared your concern about {subject} with {target} and explained what you had noticed.',
    'You asked {target} to keep an eye on {subject} before deciding whether your read was right.',
  ],
  rally_votes_against: [
    'You asked {target} where their vote would go if {subject} stayed on the block.',
    'You made the case to {target} for voting {subject} out this week.',
    'You tried to turn {target} toward {subject} and away from the safer option.',
    'You asked {target} to make the vote count against {subject}.',
  ],
  ally: [
    'You asked {target} to make your alliance official and put a little trust on the line.',
    'You offered {target} a formal place at your side for the next stretch of the game.',
    'You and {target} talked about what it would mean to make the alliance real.',
  ],
  nominate: [
    'You put {target} forward as a name for the block and gave the LOH your reasoning.',
    'You made the case that {target} should face the vote this week.',
    'You told the decision-maker why {target} was the person you wanted nominated.',
  ],
  vote_rally: [
    'You asked {target} to spend their vote on the nominee you named.',
    'You laid out the numbers to {target} and asked them to join your side of the vote.',
    'You tried to lock in {target} before the rest of the Hub started campaigning.',
  ],
  idle: [
    'You kept your plans to yourself and let the Hub wonder where you stood.',
    'You saved your energy while everyone else tried to shape the day.',
    'You let the room make its noise without adding your name to it.',
  ],
  flirt: [
    'You let the teasing with {target} linger long enough to see whether it was mutual.',
    'You tested the chemistry with {target} in a conversation that kept finding its way back to eye contact.',
    'You gave {target} a playful opening and waited to see whether they took it.',
  ],
  private_flirt: [
    'You found a quiet moment with {target} and let the conversation turn more personal.',
    'You gave {target} a look that meant more than the words you used.',
    'You let {target} know the spark was easier to talk about away from the group.',
  ],
  late_night_talk: [
    'You stayed up with {target} after the rest of the Hub had gone quiet.',
    'You and {target} talked in low voices while the cameras watched the darkened room.',
    'You asked {target} what they think about when the game finally stops for the night.',
  ],
  cuddle: [
    'You and {target} settled close together and let the conversation fade into comfortable silence.',
    'You shared a quiet moment with {target} while the rest of the room slept.',
    'You checked that {target} was comfortable before leaning into the closeness.',
  ],
  kiss_under_covers: [
    'You and {target} shared a secret kiss beneath the covers and listened for movement nearby.',
    'You asked {target} if they wanted the moment too before leaning in.',
    'You and {target} stole a private kiss while the room stayed still.',
  ],
  pool_makeout: [
    'You and {target} let the poolside conversation turn unmistakably intimate.',
    'You checked in with {target}, then let the chemistry speak for itself by the pool.',
    'You and {target} got close enough by the water that the rest of the Hub started noticing.',
  ],
  spend_night: [
    'You and {target} chose to spend the night together after talking through what it meant.',
    'You and {target} left the late-night conversation with a decision you made together.',
    'You asked {target} what they wanted, then made the night your own.',
  ],
  try_for_baby: [
    'You and {target} talked through the possibility of starting a family and chose together.',
    'You asked {target} whether you were both ready for the decision in front of you.',
    'You and {target} made a private choice with consequences bigger than the game.',
  ],
  pregnancy_test: [
    'You asked {target} if they were ready to take the test and stayed close while they decided.',
    'You and {target} faced the uncertainty together instead of letting the Hub fill in the blanks.',
  ],
  pregnancy_test_self: [
    'You took a quiet moment to find out what your body was trying to tell you.',
    'You faced the test alone first, before deciding who should hear the result.',
  ],
  share_pregnancy_news: [
    'You told {target} the news privately and asked them to keep it between you for now.',
    'You chose {target} as one of the first people to hear what might change your life.',
    'You shared the news with {target} and watched their face before saying anything more.',
  ],
  paternity_test_self: [
    'You chose to get a clear answer before the uncertainty could speak for you.',
    'You took the test privately and prepared yourself for whatever it would say.',
  ],
  go_public: [
    'You and {target} decided to stop hiding the relationship from the rest of the Hub.',
    'You told {target} you were ready to let the house see where you stood together.',
    'You and {target} stepped into the open, knowing the game would notice.',
  ],
  end_romance: [
    'You told {target} the romance had reached its end and gave them room to respond.',
    'You and {target} ended things with the truth out in the open.',
    'You asked {target} to let the relationship go before the game made the choice for you.',
  ],
  break_alliance: [
    'You told {target} the alliance was over and stopped making promises you could not keep.',
    'You ended the pact with {target}, knowing the rest of the Hub might hear about it.',
    'You drew a clean line between you and {target} and let the fallout begin.',
  ],
  snoop_around: [
    'You checked the quiet corners for signs of a deal someone thought was private.',
    'You followed a few loose threads and listened for names that kept coming up.',
    'You watched the side conversations for chemistry, alliances, and unfinished business.',
    'You looked for the story people were trying hardest not to tell.',
  ],
  ride_or_die: [
    'You asked {target} to make your loyalty a two-way promise, even when it gets difficult.',
    'You and {target} talked about the kind of pact that survives a bad week.',
    'You offered {target} a place beside you when the game gets ugly.',
  ],
  risk_the_vibe: [
    'You tested whether {target} felt a spark beyond the friendship you already share.',
    'You asked {target} if the connection between you had started to change.',
    'You gave {target} an opening to turn the friendship into something more.',
  ],
  break_bromance: [
    'You told {target} the ride-or-die bond no longer worked for you.',
    'You and {target} called time on the pact that used to make you a team.',
    'You ended the friendship pact with {target} rather than let the resentment speak for you.',
  ],
  plant_lie: [
    'You gave {target} a false detail about {subject} and let them decide what it meant.',
    'You slipped {target} a story about {subject} that sounded almost too neat.',
    'You planted a claim about {subject} with {target} and waited for doubt to take root.',
  ],
  trade_secrets: [
    'You and {target} traded one private detail each and agreed not to name the source.',
    'You offered {target} one piece of what you knew in exchange for something they had learned.',
    'You and {target} compared notes about {subject} and left with more questions than before.',
  ],
  eavesdrop: [
    'You lingered just outside the conversation and tried to catch the name they kept avoiding.',
    'You listened from the hallway while the voices inside dropped to a whisper.',
    'You waited for the conversation to loosen, then caught a detail on the way out.',
    'You stayed out of sight and listened for the part of the story they left unfinished.',
  ],
  expose_secret: [
    'You brought what you knew about {target} into the open and let the room judge the claim.',
    'You chose the moment to reveal what {target} had hoped would stay private.',
    'You put the evidence about {target} in front of the Hub and waited for the reaction.',
  ],
  stir_rivalry: [
    'You brought {target} and {subject} into the same conversation and let the old tension show.',
    'You reminded {target} of what {subject} had done and let them connect the dots.',
    'You put one fact between {target} and {subject} and watched the mood shift.',
  ],
  public_callout: [
    'You challenged {target} in front of the Hub and made the room choose whether to listen.',
    'You put your accusation to {target} where everyone could hear the answer.',
    'You called out {target} in the living room instead of letting the story stay private.',
  ],
  repair_bond: [
    'You offered {target} a truce without pretending the damage had disappeared.',
    'You asked {target} what rebuilding trust would look like to them.',
    'You and {target} tried to put a boundary around the conflict before it grew.',
  ],
}

/** Reactions are selected after the action line, so one action can tell many stories. */
export const SOCIAL_ACTION_REACTION_COPY: Readonly<
  Record<string, Partial<Record<SocialNarrativeOutcome, readonly string[]>>>
> = {
  compliment: {
    success: [
      '{target} laughed and returned a compliment of their own.',
      '{target} smiled and held your gaze a second longer than usual.',
      '{target} seemed pleased; the praise did not feel rehearsed this time.',
      '{target} relaxed into the moment and let the conversation linger.',
    ],
    failure: [
      '{target} did not appreciate the suggestion.',
      '{target} gave you a polite smile that faded before the conversation did.',
      '{target} heard a line instead of a compliment and changed the subject.',
      '{target} looked unconvinced and glanced toward the rest of the room.',
    ],
  },
  flirt: {
    success: [
      '{target} returned the look and stayed close after the joke ended.',
      '{target} smiled in a way that made the moment feel less like a game.',
      '{target} met your teasing with a little more of their own.',
    ],
    failure: [
      '{target} kept the exchange friendly and let the spark go untested.',
      '{target} laughed, but did not give the moment a second meaning.',
      '{target} shifted back to safer conversation.',
    ],
  },
  whisper: {
    success: [
      '{target} leaned closer and asked what else you knew.',
      '{target} kept the detail to themself, but you could tell it had landed.',
      '{target} gave a small nod and started watching the room differently.',
    ],
    failure: [
      '{target} wanted to know where the story came from before believing it.',
      '{target} listened without giving away whether they trusted the source.',
      '{target} ended the conversation before you could add the second detail.',
    ],
  },
  trade_secrets: {
    success: [
      '{target} matched your confidence with a detail of their own.',
      '{target} gave you a name they had been holding back.',
      'You both left with something the other could use.',
    ],
    failure: [
      '{target} kept their best information to themself.',
      '{target} questioned the value of trading before giving anything away.',
      'The conversation stayed guarded, with no clear exchange.',
    ],
  },
  group_chat: {
    success: [
      'The room warmed up; two more people pulled their chairs into the circle.',
      'Laughter spread across the group, and the game talk softened for a while.',
      'People stayed after the conversation found its natural end.',
      'The group traded stories easily, with no one in a hurry to leave.',
    ],
    failure: [
      'The conversation never quite lifted, and people drifted back to their own plans.',
      'A few polite replies were all the room could manage before the topic changed.',
      'The group stayed cordial, but the easy rhythm never arrived.',
    ],
  },
  build_quiet_bond: {
    success: [
      '{target} shared something they had not brought up in the group.',
      '{target} seemed more at ease once the room was out of earshot.',
      'The talk grew more honest as the noise from the Hub faded.',
    ],
    failure: [
      '{target} kept the conversation on safer ground.',
      '{target} answered kindly but did not open the door any further.',
      'The quiet helped, but the trust was not there yet.',
    ],
  },
  share_personal_story: {
    success: [
      '{target} met your honesty with a story of their own.',
      '{target} listened without turning the moment back toward the game.',
      'The two of you left the conversation knowing a little more about each other.',
    ],
    failure: [
      '{target} listened, then steered the talk back to safer topics.',
      '{target} seemed unsure what to do with the honesty and let the moment pass.',
      '{target} thanked you, but kept their own story to themself.',
    ],
  },
  apologize: {
    success: [
      '{target} accepted the apology, though the trust will take longer to rebuild.',
      '{target} let some of the tension go and heard you out.',
      '{target} appreciated that you owned the mistake without making excuses.',
    ],
    failure: [
      '{target} heard you out but was not ready to forgive you.',
      '{target} accepted the words without changing how they felt.',
      '{target} asked for space instead of another explanation.',
    ],
  },
  reassure: {
    success: [
      '{target} finally let their shoulders drop and told you what was wrong.',
      '{target} thanked you for staying when the room moved on.',
      '{target} looked steadier by the time the conversation ended.',
    ],
    failure: [
      '{target} appreciated the check-in but still seemed unconvinced.',
      '{target} said they were fine and did not invite a follow-up.',
      '{target} needed more than a kind word to feel safe.',
    ],
  },
  proposeAlliance: {
    success: [
      '{target} took the offer seriously and started asking about the terms.',
      '{target} met your handshake, but kept one eye on the open doorway.',
      '{target} agreed to keep talking about what loyalty would mean.',
    ],
    failure: [
      '{target} left the offer unanswered and changed the subject.',
      '{target} wanted proof of trust before making a promise.',
      '{target} was not ready to tie their game to yours.',
    ],
  },
  ally: {
    success: [
      '{target} agreed to stand with you, though the details still need to be tested.',
      '{target} accepted the alliance and began talking about who else could be trusted.',
      '{target} clasped your hand and lowered their voice.',
    ],
    failure: [
      '{target} was not ready to make the alliance official.',
      '{target} asked for time before putting their name beside yours.',
      '{target} declined to promise loyalty while the numbers were still moving.',
    ],
  },
  ride_or_die: {
    success: [
      '{target} took the promise personally and asked whether you meant it beyond this week.',
      '{target} agreed to face the next hard choice with you.',
      '{target} offered the same loyalty back, with one condition: follow through.',
    ],
    failure: [
      '{target} was not ready to make loyalty an all-or-nothing promise.',
      '{target} asked you to prove the friendship before asking for more.',
      '{target} let the offer pass without calling the bond over.',
    ],
  },
  protect: {
    success: [
      '{target} took the promise seriously and asked what you would do if their name came up.',
      '{target} seemed relieved to know where you stood.',
      '{target} thanked you, while making clear they would remember the promise.',
    ],
    failure: [
      '{target} wanted to see you follow through before trusting the promise.',
      '{target} did not treat the offer as protection until the vote was real.',
      '{target} listened, but kept a backup plan of their own.',
    ],
  },
  rumor: {
    success: [
      '{target} asked who else had heard it and started fitting the story into their own read.',
      '{target} lowered their voice and promised to keep the conversation private.',
      '{target} looked unsettled enough to watch the person you named.',
    ],
    failure: [
      '{target} asked for proof and did not let the rumour travel any further.',
      '{target} recognized the story as second-hand and kept their distance from it.',
      '{target} wondered why you were the one bringing it to them.',
    ],
  },
  plant_lie: {
    success: [
      '{target} carried the story away without realizing where it began.',
      '{target} believed enough of it to start watching {subject}.',
      '{target} repeated one detail back to you as if it were already a fact.',
    ],
    failure: [
      '{target} spotted a gap in the story and asked what you were leaving out.',
      '{target} did not buy the version you gave them.',
      '{target} kept the claim to themself until they could check it.',
    ],
  },
  startFight: {
    success: [
      '{target} fired back, but the point you raised stayed in the room.',
      '{target} argued their side loudly enough for the nearby group to hear.',
      'The room went quiet while {target} decided how far to take the argument.',
    ],
    failure: [
      '{target} turned the challenge back on you, and nearby conversations stopped.',
      '{target} walked away before you could make your point.',
      'The exchange left the room more interested in your timing than your argument.',
    ],
  },
  confront: {
    success: [
      '{target} answered the question instead of dodging it.',
      '{target} admitted there was more to the story than they had told you.',
      '{target} pushed back, but the conversation stayed honest.',
    ],
    failure: [
      '{target} shut down and refused to give you a straight answer.',
      '{target} heard an accusation and stopped listening for the question.',
      '{target} left the conversation before you found common ground.',
    ],
  },
  public_callout: {
    success: [
      '{target} answered in front of everyone, and the room started comparing versions.',
      '{target} pushed back, but the accusation gave the group something to discuss.',
      'Several people stayed to hear what {target} would say next.',
    ],
    failure: [
      '{target} called the accusation a performance and walked away.',
      'The room focused on the confrontation more than the evidence.',
      '{target} turned the audience against the way you raised the issue.',
    ],
  },
  favor_request: {
    success: [
      '{target} agreed to consider the favour and asked when you would need an answer.',
      '{target} offered help, but made sure the terms were understood.',
      '{target} said yes with the careful look of someone counting the cost.',
    ],
    failure: [
      '{target} asked what you had done for them lately before answering.',
      '{target} declined to spend their influence on your problem.',
      '{target} left the request hanging between you.',
    ],
  },
  eavesdrop: {
    success: [
      'You caught a name and a plan before the conversation moved out of reach.',
      'The hallway gave you just enough of the story to recognize what was at stake.',
      'A loose detail connected two conversations you had heard earlier.',
    ],
    failure: [
      'The voices dropped before you could catch anything useful.',
      'Someone changed the subject, and you left with more suspicion than proof.',
      'You heard fragments, but no clear detail survived the walk back.',
    ],
  },
  observe: {
    success: [
      'A shift in the room made the quiet alliances easier to see.',
      'You spotted who followed the LOH out and who stayed behind to compare notes.',
      'The room gave up a small pattern once you stopped trying to join it.',
    ],
    failure: [
      'The room stayed scattered, with no clear pattern to follow.',
      'You watched closely, but nobody gave away more than a glance.',
      'The conversations changed too quickly to make a confident read.',
    ],
  },
  read_the_room: {
    success: [
      'You caught a shift in the group before anyone said it out loud.',
      'A glance between two people confirmed a pattern you had been watching.',
      'The way the room rearranged itself told you who felt safe together.',
    ],
    failure: [
      'The room stayed too scattered to read with confidence.',
      'People kept their tells close and gave you little to work with.',
      'The mood changed before you could pin down what caused it.',
    ],
  },
  idle: {
    success: [
      'The room carried on without noticing you had chosen to keep your plans private.',
      'You let the day pass without adding another promise to your list.',
    ],
    failure: [
      'Your silence left someone else to define the conversation.',
      'The Hub moved on while you held back, and the opening passed.',
    ],
  },
  pregnancy_test_self: {
    success: [
      'You faced the result privately and gave yourself a moment before deciding what came next.',
      'The answer gave you something real to work with, even if it raised new questions.',
    ],
    failure: [
      'The result did not settle the question, so you chose to wait for a clearer answer.',
      'You left the moment with uncertainty still in front of you.',
    ],
  },
  paternity_test_self: {
    success: [
      'You got the answer you needed and took a moment before sharing it.',
      'The result gave you clarity, even if it changed how you saw the past.',
    ],
    failure: [
      'The answer raised more questions than it settled.',
      'You left with the result, but not yet with peace about it.',
    ],
  },
  snoop_around: {
    success: [
      'A half-finished conversation pointed you toward a private deal.',
      'You found signs of a pact that had not made it into the open yet.',
      'A glance exchanged across the room told you which pair to watch.',
    ],
    failure: [
      'You found no clear proof, only a few conversations that stopped when you came near.',
      'The Hub kept its secrets this time.',
      'You followed the wrong thread and came away with nothing solid.',
    ],
  },
  ask_loh_target: {
    success: [
      '{target} answered, but their pause made you listen twice to the name they gave.',
      '{target} gave you a careful version of the plan and watched to see what you did with it.',
      '{target} shared a piece of the plan while keeping the rest close.',
    ],
    failure: [
      '{target} kept the plan close and gave you no useful opening.',
      '{target} had already answered once and was not interested in being pressed again.',
      '{target} stayed deliberately vague, leaving you to read the room yourself.',
    ],
  },
  private_flirt: {
    success: [
      '{target} smiled and kept the conversation between the two of you.',
      '{target} moved closer, making the quiet feel deliberate.',
      '{target} returned the flirt without looking toward the doorway.',
    ],
    failure: [
      '{target} kept the mood friendly and let the opening pass.',
      '{target} stepped back toward safer conversation.',
      '{target} did not return the signal, but did not embarrass you either.',
    ],
  },
  late_night_talk: {
    success: [
      '{target} stayed long after the first goodnight and let the conversation turn honest.',
      '{target} trusted you with the thought they had been carrying all day.',
      'The two of you lost track of time before either noticed the cameras.',
    ],
    failure: [
      '{target} kept the talk light and headed back to bed before it got personal.',
      '{target} listened, but the quiet did not turn into closeness.',
      '{target} ended the conversation gently and left the moment where it was.',
    ],
  },
  go_public: {
    success: [
      '{target} stood beside you when the rest of the room started looking over.',
      '{target} agreed to stop dodging questions about the two of you.',
      '{target} met the attention with you instead of stepping away.',
    ],
    failure: [
      '{target} was not ready to bring the relationship into the open.',
      '{target} worried about what the announcement would cost both of you.',
      '{target} asked to wait before letting the Hub define the relationship.',
    ],
  },
  end_romance: {
    success: [
      '{target} heard you out, even if the goodbye still hurt.',
      '{target} accepted that it was over and asked for honesty from here on.',
      '{target} needed a moment before answering you.',
    ],
    failure: [
      '{target} was not ready to let the relationship end on your terms.',
      '{target} pushed back, and neither of you found a clean ending.',
      '{target} walked away before the conversation could settle.',
    ],
  },
  break_alliance: {
    success: [
      '{target} accepted the break, but neither of you mistook it for forgiveness.',
      '{target} asked whether the decision was final and you did not soften it.',
      '{target} let the pact end and started planning without you.',
    ],
    failure: [
      '{target} refused to treat the alliance as over.',
      '{target} argued for one more chance to make the pact work.',
      '{target} left the door open, but the trust between you stayed strained.',
    ],
  },
  repair_bond: {
    success: [
      '{target} agreed to try again, with the boundary clearly understood.',
      '{target} let the argument rest for now, though neither of you forgot it.',
      '{target} offered a cautious truce and waited to see whether you would keep it.',
    ],
    failure: [
      '{target} was not ready to call the conflict over.',
      '{target} heard the offer but kept the old hurt close.',
      '{target} asked for time before trying to rebuild anything.',
    ],
  },
}

export const SOCIAL_CATEGORY_REACTION_COPY: Readonly<
  Record<SocialNarrativeCategory, Record<SocialNarrativeOutcome, readonly string[]>>
> = {
  friendly: {
    success: [
      '{target} relaxed into the conversation and shared a little more than before.',
      '{target} seemed glad you made time for them.',
      '{target} answered with more warmth than the conversation began with.',
      '{target} stayed with you instead of looking for an exit.',
    ],
    failure: [
      '{target} gave you a polite nod, then let the conversation die.',
      '{target} kept their guard up and moved on to another topic.',
      '{target} appreciated the effort, but did not meet you halfway.',
      '{target} was not ready to let the moment change things.',
    ],
  },
  strategic: {
    success: [
      '{target} followed the details closely and asked one question that mattered.',
      '{target} took the information seriously, though they kept their own cards close.',
      '{target} left with a different way to read the week.',
      '{target} listened carefully and did not dismiss the possibility.',
    ],
    failure: [
      '{target} listened, but kept the key part of their plan to themself.',
      '{target} wanted more proof before changing their read.',
      '{target} left the conversation without making a commitment.',
      '{target} treated the suggestion cautiously and changed the subject.',
    ],
  },
  aggressive: {
    success: [
      '{target} held your gaze; the point landed, even if the room stayed tense.',
      '{target} pushed back, but did not deny the part that mattered.',
      '{target} looked rattled enough to think twice before answering.',
      'The room went quiet while {target} chose a response.',
    ],
    failure: [
      '{target} turned the accusation back on you.',
      '{target} shut the conversation down before you could make your case.',
      'The room remembered your timing more than your argument.',
      '{target} walked away with the last word.',
    ],
  },
  alliance: {
    success: [
      '{target} treated the promise as real, though their eyes flicked toward the room.',
      '{target} agreed to stand with you and asked what happens when the plan gets tested.',
      '{target} lowered their voice and started talking about who else could be trusted.',
      '{target} accepted the idea, leaving the details for a quieter moment.',
    ],
    failure: [
      '{target} hesitated over the promise and left its terms unsettled.',
      '{target} was not ready to tie their game to yours.',
      '{target} asked for more time before putting their name beside yours.',
      '{target} kept the conversation friendly but made no commitment.',
    ],
  },
}

/** Replace older wording that either implies success or assumes a named target. */
export const SOCIAL_NARRATIVE_REPLACEMENTS = ['group_chat', 'eavesdrop'] as const
