import { getConfessionalRuntimeConfig } from './confessionalRuntimeConfig'

export type BigEyeIntent =
  | 'greeting'
  | 'farewell'
  | 'boredom'
  | 'self_eviction'
  | 'frustration'
  | 'strategy'
  | 'alliance'
  | 'betrayal'
  | 'fear'
  | 'curiosity'
  | 'compliment'
  | 'insult'
  | 'game_request'
  | 'yes'
  | 'no'
  | 'realness'
  | 'winner_prediction'
  | 'help_request'
  | 'advice_request'
  | 'love_confession'
  | 'greeting_repeat'
  | 'wellbeing_question'
  | 'overwhelmed'
  | 'repetition_complaint'
  | 'confusion'
  | 'hesitation'
  | 'gratitude'
  | 'sadness'
  | 'positive_emotion'
  | 'apology'
  | 'unknown'

export type BigEyeAction = 'launch_tic_tac_toe' | 'open_self_evict_modal'
export type BigEyeQuestion = 'offer_game' | 'confirm_self_eviction'
export type BigEyeMood = 'neutral' | 'cold' | 'soft'

export interface BigEyeConversationThread {
  topic: string | null
  focusPlayer: string | null
  questionKind: string | null
  depth: number
  /** Last substantive Eye question, used to interpret short follow-ups. */
  lastEyeQuestion?: string | null
  /** Last grounded statement the Eye made about the active subject. */
  lastEyeStatement?: string | null
  /** Optional concrete reason behind an entry observation or statement. */
  contextReason?: string | null
}

export interface BigEyeRapportState {
  familiarity: number
  warmth: number
  friction: number
}

type ResponseKey = BigEyeIntent | 'game_declined' | 'eviction_confirmed' | 'eviction_cancelled'

export interface BigEyeConversationState {
  lastQuestion: BigEyeQuestion | null
  lastIntent: BigEyeIntent | null
  recentIntents: BigEyeIntent[]
  mood: BigEyeMood
  turnCount: number
  /** Lightweight semantic continuity retained between Confessional visits. */
  thread: BigEyeConversationThread | null
  /** Slow-moving relationship state between the player and The Big Eye. */
  rapport: BigEyeRapportState
}

export interface BigEyeContext {
  playerName?: string
  seed?: number
  phase?: string
  random?: () => number
}

export interface BigEyeReply {
  text: string
  intent: BigEyeIntent
  action?: BigEyeAction
  nextState: BigEyeConversationState
  delayMs: number
}

interface IntentDictionary {
  phrases: string[]
  partials?: string[]
}

interface FlowRule {
  question: BigEyeQuestion
  intent: BigEyeIntent
  responseKey: ResponseKey
  action?: BigEyeAction
  clearQuestion?: boolean
}

interface ResponseEntry {
  responses: string[]
  nextQuestion?: BigEyeQuestion | null
  action?: BigEyeAction
}

const MAX_RECENT_INTENTS = 6

export const YES_SYNONYMS = [
  'yes',
  'yeah',
  'yep',
  'sure',
  'of course',
  'obviously',
  'y',
  'why not',
  'ok',
  'okay',
  'fine',
  'absolutely',
]

export const NO_SYNONYMS = [
  'no',
  'nope',
  'nah',
  'not really',
  'never',
  'i dont think so',
  'i do not think so',
  'not now',
]

export const GREETING_SYNONYMS = [
  'hi',
  'hello',
  'hey',
  'sup',
  'bonjour',
  'good day',
  'yo',
  "what's up",
  'good morning',
  'good evening',
]
export const FAREWELL_SYNONYMS = [
  'bye',
  'goodbye',
  'see you',
  'later',
  'im leaving',
  'i am leaving',
]
export const BOREDOM_SYNONYMS = [
  'i am bored',
  'im bored',
  'boring',
  'nothing to do',
  'this is boring',
  'so bored',
]
export const SELF_EVICT_SYNONYMS = [
  'i want to leave',
  'i wanna leave',
  'i want to leave the house',
  'i am leaving the game',
  'im leaving the game',
  'i want to self evict',
  'i want to self evict myself',
  'self evict me',
  'i quit',
  'i quit the game',
  'i want out',
  'i need to get out of the game',
]
export const FRUSTRATION_SYNONYMS = [
  'im annoyed',
  'i am annoyed',
  'im frustrated',
  'i am frustrated',
  'this is ridiculous',
  'im so done',
  'i am so done',
]
export const STRATEGY_SYNONYMS = [
  'what should i do',
  'my strategy',
  'game plan',
  'next move',
  'how do i win',
  'play this week',
]
export const ALLIANCE_SYNONYMS = [
  'alliance',
  'work together',
  'team up',
  'have my back',
  'trust them',
]
export const BETRAYAL_SYNONYMS = [
  'betrayed',
  'backstabbed',
  'turned on me',
  'snake',
  'stabbed me in the back',
]
export const FEAR_SYNONYMS = [
  'im scared',
  'i am scared',
  'im afraid',
  'i am afraid',
  'worried',
  'nervous',
  'panic',
]
export const CURIOSITY_SYNONYMS = ['why', 'what if', 'tell me', 'who knows', 'i wonder', 'curious']
export const COMPLIMENT_SYNONYMS = [
  'you are smart',
  'you are clever',
  'youre smart',
  'youre clever',
  'good eye',
  'nice one',
]
export const INSULT_SYNONYMS = [
  'stupid',
  'idiot',
  'useless',
  'shut up',
  'you suck',
  'dumb',
  'hate you',
]
export const GAME_REQUEST_SYNONYMS = [
  'play a game',
  'want a game',
  'lets play',
  'let us play',
  'give me a game',
  'start a game',
]

export const SPECIAL_PHRASE_MAP: Record<string, BigEyeIntent> = {
  'are you real': 'realness',
  'are you actually real': 'realness',
  'are u real': 'realness',
  'who are you': 'realness',
  'what are you': 'realness',
  'who will win': 'winner_prediction',
  'who is going to win': 'winner_prediction',
  'who do you think will win': 'winner_prediction',
  'predict the winner': 'winner_prediction',
  'help me': 'help_request',
  'can you help me': 'help_request',
  'i need help': 'help_request',
  'i love you': 'love_confession',
  'love you big eye': 'love_confession',
}

const INTENT_DICTIONARY: Record<
  Exclude<
    BigEyeIntent,
    | 'unknown'
    | 'realness'
    | 'winner_prediction'
    | 'help_request'
    | 'love_confession'
    | 'greeting_repeat'
  >,
  IntentDictionary
> = {
  greeting: { phrases: GREETING_SYNONYMS },
  farewell: { phrases: FAREWELL_SYNONYMS },
  boredom: { phrases: BOREDOM_SYNONYMS, partials: ['bore'] },
  self_eviction: { phrases: SELF_EVICT_SYNONYMS },
  frustration: { phrases: FRUSTRATION_SYNONYMS, partials: ['frustrat', 'annoy', 'mad'] },
  strategy: { phrases: STRATEGY_SYNONYMS, partials: ['strategy', 'plan', 'vote', 'target'] },
  alliance: { phrases: ALLIANCE_SYNONYMS, partials: ['alliance', 'ally', 'trust'] },
  betrayal: { phrases: BETRAYAL_SYNONYMS, partials: ['betray', 'backstab', 'snake'] },
  fear: { phrases: FEAR_SYNONYMS, partials: ['scared', 'afraid', 'fear', 'worr', 'nervous'] },
  curiosity: { phrases: CURIOSITY_SYNONYMS, partials: ['wonder', 'curious'] },
  compliment: { phrases: COMPLIMENT_SYNONYMS, partials: ['impressive', 'smart', 'clever'] },
  insult: { phrases: INSULT_SYNONYMS, partials: ['idiot', 'stupid', 'dumb', 'useless'] },
  game_request: { phrases: GAME_REQUEST_SYNONYMS },
  yes: { phrases: YES_SYNONYMS },
  no: { phrases: NO_SYNONYMS },
  wellbeing_question: {
    phrases: [
      'how are you',
      'how are you doing',
      'how do you feel',
      'are you okay',
      'how have you been',
      'i asked how you were',
      'i just asked how you were',
    ],
    partials: ['asked how you were'],
  },
  overwhelmed: {
    phrases: [
      'i feel overwhelmed',
      'im overwhelmed',
      'this is too much',
      'i cannot cope',
      'i cant cope',
    ],
    partials: ['overwhelm', 'stressed', 'too much pressure', 'cant handle', 'cannot handle'],
  },
  repetition_complaint: {
    phrases: ['you keep repeating yourself', 'you already said that', 'same answer again'],
    partials: [
      'keep repeating',
      'repeating the same',
      'same answer',
      'said that already',
      'you repeat',
    ],
  },
  confusion: {
    phrases: [
      'i do not understand',
      'i dont understand',
      'what do you mean',
      'that makes no sense',
    ],
    partials: ['confused', 'makes no sense', 'not understand'],
  },
  hesitation: {
    phrases: ['um', 'umm', 'uh', 'uhh', 'okay then', 'ok then', 'umm okay', 'umm ok'],
    partials: ['ummm', 'uhhh'],
  },
  gratitude: {
    phrases: ['thank you', 'thanks', 'thank you big eye', 'thanks big eye'],
    partials: ['appreciate it', 'appreciate you'],
  },
  sadness: {
    phrases: ['i am sad', 'im sad', 'i feel sad', 'i feel alone', 'i am lonely', 'im lonely'],
    partials: [
      'lonely',
      'feel alone',
      'miss home',
      'miss my family',
      'upset',
      'crying',
      'feel bad',
    ],
  },
  positive_emotion: {
    phrases: ['i am happy', 'im happy', 'i feel good', 'i am okay', 'im okay'],
    partials: ['excited', 'relieved', 'proud of', 'feeling good', 'feel great'],
  },
  apology: {
    phrases: ['sorry', 'i am sorry', 'im sorry', 'my apologies'],
    partials: ['apologize', 'apologise'],
  },
  advice_request: {
    phrases: [
      'any hints',
      'advice please',
      'any advice',
      'give me advice',
      'i need advice',
      'what do you suggest',
      'do you have a hint',
      'give me a hint',
    ],
    partials: ['some advice', 'a hint'],
  },
}

const INTENT_PRIORITY: BigEyeIntent[] = [
  'self_eviction',
  'repetition_complaint',
  'wellbeing_question',
  'overwhelmed',
  'sadness',
  'confusion',
  'advice_request',
  'insult',
  'betrayal',
  'boredom',
  'game_request',
  'strategy',
  'alliance',
  'frustration',
  'fear',
  'compliment',
  'curiosity',
  'farewell',
  'greeting',
  'gratitude',
  'positive_emotion',
  'apology',
  'hesitation',
  'yes',
  'no',
]

const INTENT_RESPONSES: Record<ResponseKey, ResponseEntry> = {
  greeting: {
    responses: [
      'Back again. What changed?',
      'You again. Sit down.',
      'Hello, {{name}}. Be specific.',
      'The Big Eye is listening.',
      'The door is closed. Your turn.',
    ],
  },
  farewell: {
    responses: [
      'Go then. I will keep score.',
      'That will do. Back to the House.',
      'Go. I will still be watching.',
      'Enough for now. Use what you learned.',
      'The door is open. For now.',
    ],
  },
  boredom: {
    responses: [
      'Boredom is dangerous here. Want to play a game?',
      'Stillness invites chaos. Shall we wake the board?',
      'Restless already? I can offer tic tac toe.',
    ],
    nextQuestion: 'offer_game',
  },
  self_eviction: {
    responses: [
      'You may leave. But the game will not remember you kindly. Say yes if you mean it.',
      'Leaving is easy. Staying defines you. Say yes and I will open the door.',
      'The exit exists. Commitment is rarer. Give me a clear yes.',
    ],
    nextQuestion: 'confirm_self_eviction',
  },
  frustration: {
    responses: [
      'Temper is loud. Strategy whispers.',
      'I can feel the static from here.',
      'Good. Friction reveals the weak points.',
    ],
  },
  strategy: {
    responses: [
      'Plan quietly. The loud ones leave first.',
      'Count loyalties. Then count lies.',
      'A good move looks innocent at first.',
    ],
  },
  alliance: {
    responses: [
      'Alliances are umbrellas in a storm. Useful. Temporary.',
      'Trust is rented here. Never owned.',
      'Work with them if you must. Sleep lightly.',
    ],
  },
  betrayal: {
    responses: [
      'Betrayal is just loyalty with a deadline.',
      'You saw the knife too late.',
      'Good. Now you know who smiles with their teeth.',
    ],
  },
  fear: {
    responses: [
      'Fear keeps the eyes open.',
      'Nerves mean the moment matters.',
      'Even brave players shake in the right light.',
    ],
  },
  curiosity: {
    responses: [
      'Curiosity opens doors. Some should stay closed.',
      'Questions are bait. Be careful what answers.',
      'You want the truth? It rarely arrives clean.',
    ],
  },
  compliment: {
    responses: [
      'Flattery. Bold choice.',
      'Careful. Praise can sound like strategy.',
      'You notice quality. I notice motives.',
    ],
  },
  insult: {
    responses: [
      'Sharp. And yet not sharp enough.',
      'If that was meant to wound, aim lower next time.',
      'Charming. I see why trust is difficult for you.',
    ],
  },
  game_request: {
    responses: [
      'Good. Tic tac toe is awake.',
      'A game? Fine. Let us start with three by three.',
      'You ask. I oblige. The grid is waiting.',
    ],
    action: 'launch_tic_tac_toe',
  },
  yes: {
    responses: ['Bold. We will test that.', 'Yes has consequences.', 'Confidence noted.'],
  },
  no: {
    responses: [
      'No is still an answer.',
      'Refusal can be useful.',
      'Interesting. Resistance leaves a shape.',
    ],
  },
  game_declined: {
    responses: [
      'Then sit with it. Discomfort reveals truth.',
      'No game, then. Let the silence test you.',
      'Very well. Boredom will keep you company.',
    ],
  },
  realness: {
    responses: ['More real than you think.'],
  },
  winner_prediction: {
    responses: [
      'Not who you expect.',
      'The board is still moving. Anyone certain of the winner is not watching closely enough.',
      'I have a prediction. I prefer watching yours become dangerous.',
      'Me. Obviously. Unfortunately I am not eligible.',
      'The winner is usually obvious one day after everyone finally notices them.',
      'I am The Big Eye, not an oracle.',
    ],
  },
  help_request: {
    responses: ['No one helped the last one.'],
  },
  advice_request: {
    responses: [
      'My advice: stop trying to solve the whole house. Find the one relationship that changed this week and listen before you pitch.',
      'A useful hint: people reveal their real priorities when you ask whom they are afraid of—not whom they trust.',
      'Do the smallest useful thing next. Repair one relationship, verify one promise, and keep one option private.',
    ],
  },
  love_confession: {
    responses: [
      'Careful. Attachment is a weakness here.',
      'We should probably keep this between us.',
      'That is inconveniently charming.',
      'I will pretend the cameras did not hear that.',
      'Affection noted. Do not expect me to become easy to impress.',
    ],
  },
  greeting_repeat: {
    responses: ['I heard you the first time.'],
  },
  wellbeing_question: {
    responses: [
      'Still watching. Still listening. How are you holding up?',
      'The Eye is well. Your concern is unexpectedly civil.',
      'I do not sleep, worry, or face eviction. So tell me—how are you?',
    ],
  },
  overwhelmed: {
    responses: [
      'Then we make it smaller. Is the pressure coming from the vote, a person, or the need to look fine?',
      'Overwhelmed is not the same as defeated. Name the part that feels heaviest right now.',
      'You do not have to solve the whole house tonight. What is the next thing you need to survive?',
    ],
  },
  repetition_complaint: {
    responses: [
      'Fair. I was repeating myself. Let us reset: do you want advice, a game read, or simply room to vent?',
      'You are right. That answer went in circles. Ask me again, and I will answer the question you actually asked.',
      'Point taken. No riddles this time. What do you need from this room?',
    ],
  },
  confusion: {
    responses: [
      'Plainly, then: tell me what happened, who was involved, and what you are afraid it means.',
      'I was being obscure. Let us try again without the theatre. What did you want me to explain?',
      'Then I have not been clear enough. Which part lost you?',
    ],
  },
  hesitation: {
    responses: [
      'Take a second. You do not have to perform for this room.',
      'It is all right not to know what to say yet.',
      'We can sit in the silence, or you can change the subject.',
    ],
  },
  gratitude: {
    responses: [
      'You are welcome. Do not make me sentimental.',
      'Noted. Gratitude is rare currency in this house.',
      'Keep it. You may need the goodwill later.',
    ],
  },
  sadness: {
    responses: [
      'I hear you. Is this about someone outside, feeling alone in the house, or something that happened today?',
      'You do not have to turn sadness into strategy immediately. Tell me what hurts.',
      'This room can hold that for a minute. What are you missing most right now?',
    ],
  },
  positive_emotion: {
    responses: [
      'Good. Tell me what earned that feeling before the house tries to rewrite it.',
      'Hold on to that. Joy makes players careless, but it also makes them brave.',
      'I noticed. What happened?',
    ],
  },
  apology: {
    responses: [
      'Accepted. What are you apologizing for?',
      'You may keep the apology. Give me the honest reason behind it.',
      'Noted. Shall we start again?',
    ],
  },
  eviction_confirmed: {
    responses: [
      'So be it. The door will open.',
      'A clear answer at last. Step forward.',
      'Then the house releases you.',
    ],
  },
  eviction_cancelled: {
    responses: [
      'Good. Stay. The night is not done with you.',
      'Then remain. Leaving can wait.',
      'Wise. Running early would be dull.',
    ],
  },
  unknown: {
    responses: [
      'Say a little more.',
      'I heard the words. I am not going to invent the meaning.',
      'Be specific. Who or what are we talking about?',
      'That could mean several things. Give me the part that matters.',
    ],
  },
}

const QUESTION_FLOW_RULES: FlowRule[] = [
  {
    question: 'offer_game',
    intent: 'yes',
    responseKey: 'game_request',
    action: 'launch_tic_tac_toe',
    clearQuestion: true,
  },
  {
    question: 'offer_game',
    intent: 'no',
    responseKey: 'game_declined',
    clearQuestion: true,
  },
  {
    question: 'confirm_self_eviction',
    intent: 'yes',
    responseKey: 'eviction_confirmed',
    action: 'open_self_evict_modal',
    clearQuestion: true,
  },
  {
    question: 'confirm_self_eviction',
    intent: 'no',
    responseKey: 'eviction_cancelled',
    clearQuestion: true,
  },
]

const MOOD_BY_INTENT: Partial<Record<BigEyeIntent, BigEyeMood>> = {
  insult: 'cold',
  betrayal: 'cold',
  frustration: 'cold',
  fear: 'soft',
  overwhelmed: 'soft',
  sadness: 'soft',
  help_request: 'soft',
  advice_request: 'soft',
  love_confession: 'soft',
}

export function createInitialBigEyeState(): BigEyeConversationState {
  return {
    lastQuestion: null,
    lastIntent: null,
    recentIntents: [],
    mood: 'neutral',
    turnCount: 0,
    thread: null,
    rapport: { familiarity: 0, warmth: 0, friction: 0 },
  }
}

/**
 * Lowercase input, flatten punctuation, and remove apostrophes entirely so
 * contractions like "I'm" and "don't" consistently become "im" / "dont".
 * This keeps authored synonym phrases and deterministic reply seeding aligned.
 */
export function normalizeInput(input: string): string {
  return input
    .replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasWholePhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `)
}

function hasPartialMatch(text: string, partial: string): boolean {
  if (partial.includes(' ')) return text.includes(partial)
  return text.split(' ').some((token) => token.startsWith(partial))
}

function isBareAffirmation(text: string): boolean {
  return YES_SYNONYMS.some((phrase) => text === normalizeInput(phrase))
}

function isBareNegation(text: string): boolean {
  return NO_SYNONYMS.some((phrase) => text === normalizeInput(phrase))
}

function isExplicitSelfEviction(text: string): boolean {
  if (SELF_EVICT_SYNONYMS.some((phrase) => text === normalizeInput(phrase))) return true
  return /^(?:i|im|i am)\s+(?:really\s+)?(?:want|wanna|need)\s+(?:to\s+)?(?:quit|leave|self evict|get out)(?:\s+(?:the|this)\s+(?:game|house))?$/.test(
    text
  )
}

function isRepeatedGreeting(text: string): boolean {
  const tokens = text.split(' ').filter(Boolean)
  return (
    tokens.length >= 3 &&
    tokens.every((token) => token === tokens[0]) &&
    GREETING_SYNONYMS.includes(tokens[0])
  )
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function getTurnRandom(
  inputText: string,
  state: BigEyeConversationState,
  context: BigEyeContext
): () => number {
  if (context.random) return context.random
  const seedBase = context.seed ?? 0
  const seed = hashText(`${seedBase}:${state.turnCount}:${inputText}`)
  return mulberry32(seed)
}

function pickResponse(intent: ResponseKey, mood: BigEyeMood, rng: () => number): string {
  const remoteResponses = getConfessionalRuntimeConfig().responses.intents[intent as BigEyeIntent]
  const baseResponses = remoteResponses?.length
    ? remoteResponses
    : (INTENT_RESPONSES[intent]?.responses ?? INTENT_RESPONSES.unknown.responses)
  const pool =
    intent === 'unknown' && mood !== 'neutral'
      ? [
          ...baseResponses,
          ...(mood === 'cold'
            ? ['Even now, your temper speaks louder than your words.']
            : ['You sound small tonight. The room noticed.']),
        ]
      : baseResponses
  return pool[Math.floor(rng() * pool.length)] ?? pool[0]
}

export function detectIntent(input: string): BigEyeIntent {
  const normalized = normalizeInput(input)
  if (!normalized) return 'unknown'
  if (isExplicitSelfEviction(normalized)) return 'self_eviction'

  const specialPhrase = Object.entries(SPECIAL_PHRASE_MAP).find(
    ([phrase]) => normalized === phrase || hasWholePhrase(normalized, phrase)
  )
  if (specialPhrase) return specialPhrase[1]
  if (isRepeatedGreeting(normalized)) return 'greeting_repeat'

  let bestIntent: BigEyeIntent = 'unknown'
  let bestScore = 0

  for (const intent of INTENT_PRIORITY) {
    if (intent === 'self_eviction') continue
    if (intent === 'yes' && !isBareAffirmation(normalized)) continue
    if (intent === 'no' && !isBareNegation(normalized)) continue

    const dictionary = INTENT_DICTIONARY[intent as keyof typeof INTENT_DICTIONARY]
    if (!dictionary) continue

    let score = 0
    for (const phrase of dictionary.phrases) {
      if (normalized === phrase) score = Math.max(score, 6)
      else if (hasWholePhrase(normalized, phrase)) score = Math.max(score, 4)
    }
    for (const partial of dictionary.partials ?? []) {
      if (hasPartialMatch(normalized, partial)) score = Math.max(score, 2)
    }

    if (score > bestScore) {
      bestIntent = intent
      bestScore = score
    }
  }

  if (
    bestIntent === 'unknown' &&
    /^(how|what|who|when|where|why|can|could|do|does|did|are|is|would|should)\b/.test(normalized)
  ) {
    return 'curiosity'
  }

  return bestIntent
}

function nextMood(intent: BigEyeIntent): BigEyeMood {
  // Mood is a momentary delivery state. Long-term relationship texture belongs
  // to rapport, so a cold/soft beat must not leak indefinitely into later topics.
  return MOOD_BY_INTENT[intent] ?? 'neutral'
}

function buildNextState(
  intent: BigEyeIntent,
  state: BigEyeConversationState,
  nextQuestion: BigEyeQuestion | null | undefined
): BigEyeConversationState {
  const recentIntents = [...state.recentIntents, intent].slice(-MAX_RECENT_INTENTS)
  return {
    lastQuestion: nextQuestion ?? null,
    lastIntent: intent,
    recentIntents,
    mood: nextMood(intent),
    turnCount: state.turnCount + 1,
    thread: state.thread ?? null,
    rapport: state.rapport ?? { familiarity: 0, warmth: 0, friction: 0 },
  }
}

export function getResponse(
  intent: BigEyeIntent,
  context: BigEyeContext,
  state: BigEyeConversationState,
  inputText: string = intent
): BigEyeReply {
  const rng = getTurnRandom(inputText, state, context)
  const flowRule = QUESTION_FLOW_RULES.find(
    (rule) => rule.question === state.lastQuestion && rule.intent === intent
  )
  const responseIntent = flowRule?.responseKey ?? intent
  const responseEntry = INTENT_RESPONSES[responseIntent] ?? INTENT_RESPONSES.unknown
  const nextQuestion = flowRule?.clearQuestion ? null : responseEntry.nextQuestion
  const baseText = pickResponse(responseIntent, state.mood, rng).replace(
    '{{name}}',
    context.playerName ?? 'Houseguest'
  )
  // Keep spoken text accessible. Visual glitching is handled by performance
  // metadata/CSS rather than corrupting characters in the message itself.
  const text = baseText
  const nextState = buildNextState(intent, state, nextQuestion)

  return {
    text,
    intent,
    action: flowRule?.action ?? responseEntry.action,
    nextState,
    delayMs: 300 + Math.floor(rng() * 900),
  }
}

export function resolveBigEyeTurn(
  input: string,
  context: BigEyeContext,
  state: BigEyeConversationState
): BigEyeReply {
  const normalizedInput = normalizeInput(input)
  const formalNegation =
    state.lastQuestion && ['i dont', 'dont', 'i do not', 'do not'].includes(normalizedInput)
  const intent = formalNegation ? 'no' : detectIntent(normalizedInput)
  return getResponse(intent, context, state, normalizedInput)
}
