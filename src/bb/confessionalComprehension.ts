import {
  normalizeInput,
  type BigEyeConversationState,
  type BigEyeIntent,
} from './confessionalBigEye'
import {
  getConfessionalRuntimeConfig,
  type ConfessionalEmotion,
  type ConfessionalResponseMove,
  type ConfessionalTopic,
} from './confessionalRuntimeConfig'

export type ConfessionalSpeechAct =
  | 'factual_question'
  | 'advice_request'
  | 'answer'
  | 'agreement'
  | 'disagreement'
  | 'clarification'
  | 'target_declaration'
  | 'relationship_read'
  | 'vent'
  | 'confession'
  | 'prediction'
  | 'challenge_request'
  | 'memory_query'
  | 'statement'

export type ConfessionalKnowledgeQuery =
  | 'leader'
  | 'nominees'
  | 'remaining'
  | 'closest_relationship'
  | 'alliances'
  | 'recent_eviction'
  | 'eviction_outlook'
  | 'person_read'
  | 'stats'
  | 'recent_events'
  | 'phase'
  | 'memory'

export type RelationshipStance = 'trust' | 'distrust' | 'target' | 'protect' | 'depend'

export interface ConfessionalWorldContext {
  week: number
  phase: string
  playerStatus: string
  leaderName: string | null
  nomineeNames: string[]
  safetyWinnerName: string | null
  remainingHousemates: string[]
  playerStats?: {
    leaderWins: number
    safetyWins: number
    timesNominated: number
  }
  closestRelationships: Array<{
    name: string
    affinity: number
    tags: string[]
  }>
  alliances?: Array<{
    id: string
    name: string | null
    memberNames: string[]
    status: string
  }>
  recentEvictedNames?: string[]
  recentPublicEvents?: string[]
}

export interface BigEyeComprehensionFrame {
  primaryIntent: BigEyeIntent
  speechAct: ConfessionalSpeechAct
  topics: ConfessionalTopic[]
  emotions: Array<{ type: ConfessionalEmotion; score: number }>
  entities: string[]
  focusPlayer: string | null
  relationshipStances: RelationshipStance[]
  continuation: boolean
  contradiction: string | null
  responseMoves: ConfessionalResponseMove[]
  knowledgeQuery: ConfessionalKnowledgeQuery | null
  predictedWinner: string | null
  /** True when the active player was inherited from a pronoun/short continuation. */
  coreferenceUsed: boolean
}

function containsAny(text: string, values: string[]): boolean {
  return values.some((value) => {
    const normalized = normalizeInput(value)
    return normalized && text.includes(normalized)
  })
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function detectKnowledgeQuery(
  text: string,
  focusPlayer: string | null
): ConfessionalKnowledgeQuery | null {
  if (/what (?:do|did) you remember|what do you know about me|remember about me/.test(text)) {
    return 'memory'
  }
  if (/who (?:is|s) (?:the )?(?:leader|loh)|who won (?:leader|loh)/.test(text)) return 'leader'
  if (
    /who (?:am i|are) (?:up|nominated) (?:against|with)|who else is nominated|who is nominated/.test(
      text
    )
  ) {
    return 'nominees'
  }
  if (
    /who (?:got|was|has been) (?:evicted|eliminated)|who went home|who left (?:today|tonight|the house)/.test(
      text
    )
  ) {
    return 'recent_eviction'
  }
  if (
    /who do you think (?:is going to|will) (?:leave|go home|be evicted)|who (?:is going to|will) (?:leave|go home|be evicted)(?: tonight| today)?/.test(
      text
    )
  ) {
    return 'eviction_outlook'
  }
  if (
    /who are my allies|who is in my alliance|whos in my alliance|what alliances am i in|which alliances am i in|my alliance members/.test(
      text
    )
  ) {
    return 'alliances'
  }
  if (/how many (?:people|players|housemates).*(?:left|remain)|who is left/.test(text)) {
    return 'remaining'
  }
  if (/who am i closest to|who do i have the best relationship with|closest relationship/.test(text)) {
    return 'closest_relationship'
  }
  if (
    focusPlayer &&
    /what do you think (?:about|of)|what do you make of|how do you see|whats your read on|what is your read on/.test(
      text
    )
  ) {
    return 'person_read'
  }
  if (
    /how many times.*nominated|how many (?:loh|leader|safety|pos).*(?:wins|won)|my stats/.test(text)
  ) {
    return 'stats'
  }
  if (/what happened (?:today|recently)|what did i miss|recent events/.test(text)) {
    return 'recent_events'
  }
  if (/what phase|what happens now|what is happening now|where are we in the game/.test(text)) {
    return 'phase'
  }
  return null
}

function detectPrediction(text: string, world?: ConfessionalWorldContext): string | null {
  if (!world || !/\b(?:think|predict|bet|believe)\b.*\b(?:win|winner)\b/.test(text)) return null
  return (
    world.remainingHousemates.find((name) => text.includes(normalizeInput(name))) ??
    world.closestRelationships.find((row) => text.includes(normalizeInput(row.name)))?.name ??
    null
  )
}

function findEntities(text: string, world?: ConfessionalWorldContext): string[] {
  if (!world) return []
  const candidates = unique([
    ...world.remainingHousemates,
    ...world.nomineeNames,
    ...world.closestRelationships.map((row) => row.name),
    ...(world.leaderName ? [world.leaderName] : []),
    ...(world.safetyWinnerName ? [world.safetyWinnerName] : []),
  ])
  return candidates.filter((name) => text.includes(normalizeInput(name)))
}

function hasCoreferencePronoun(text: string): boolean {
  return /\b(?:he|him|his|she|her|hers|they|them|their|theirs|that guy|that girl|that person)\b/.test(
    text
  )
}

function isAgreement(text: string): boolean {
  return /^(?:yeah|yes|yep|exactly|true|fair point|you are right|youre right|right|agreed)(?:\s+(?:you are|youre) right)?[.! ]*$/.test(
    text
  )
}

function isDisagreement(text: string): boolean {
  if (/^(?:no|nope|nah|not really|i dont think so|i do not think so)$/.test(text)) return true
  return /^(?:no|nope|nah)\b.+/.test(text)
}

function isClarification(text: string): boolean {
  return /^(?:what do you mean|what did you mean|why|why is that|why do you say that|what are you talking about|explain that|what do you mean by that)\b/.test(
    text
  )
}

function isTargetDeclaration(text: string): boolean {
  return (
    /\bi (?:really )?(?:want|need) (?:him|her|them|[a-z0-9]+) (?:out|gone)\b/.test(text) ||
    /\b(?:target|vote out|evict|send home|get rid of|take out)\b/.test(text)
  )
}

function inferSpeechAct(
  text: string,
  intent: BigEyeIntent,
  state: BigEyeConversationState,
  knowledgeQuery: ConfessionalKnowledgeQuery | null,
  predictedWinner: string | null
): ConfessionalSpeechAct {
  if (knowledgeQuery === 'memory') return 'memory_query'
  if (knowledgeQuery === 'person_read') return 'relationship_read'
  if (knowledgeQuery) return 'factual_question'
  if (isClarification(text)) return 'clarification'
  if (/\bchallenge me\b|\bgive me a challenge\b|\bdare me\b/.test(text)) return 'challenge_request'
  if (predictedWinner) return 'prediction'
  if (isTargetDeclaration(text)) return 'target_declaration'
  if (isAgreement(text)) return 'agreement'
  if (isDisagreement(text)) return 'disagreement'
  if (state.thread && (intent === 'yes' || intent === 'no')) return 'answer'
  if (intent === 'advice_request' || intent === 'strategy') return 'advice_request'
  if (
    intent === 'fear' ||
    intent === 'frustration' ||
    intent === 'sadness' ||
    intent === 'overwhelmed' ||
    intent === 'betrayal'
  ) {
    return 'vent'
  }
  if (
    /\?$/.test(text) ||
    /^(who|what|when|where|why|how|can|could|should|would|do|does|is|are)\b/.test(text)
  ) {
    return 'factual_question'
  }
  if (intent === 'unknown') return 'statement'
  return 'confession'
}

function inferContradiction(
  text: string,
  focusPlayer: string | null,
  memorySummary: string | undefined
): string | null {
  if (!focusPlayer || !memorySummary) return null
  const memory = normalizeInput(memorySummary)
  const focus = normalizeInput(focusPlayer)
  const trustsNow =
    /\b(?:trust|loyal|believe)\b/.test(text) && !/\b(?:dont|do not|not)\b.*\btrust\b/.test(text)
  const distrustsNow = /\b(?:dont trust|do not trust|lying|liar|sketchy|shady|snake)\b/.test(text)

  if (
    trustsNow &&
    (memory.includes(`distrusts ${focus}`) || memory.includes(`targeting ${focus}`))
  ) {
    return `You previously described ${focusPlayer} as someone you did not trust.`
  }
  if (distrustsNow && memory.includes(`trusts ${focus}`)) {
    return `You previously described ${focusPlayer} as someone you trusted.`
  }
  return null
}

export function buildBigEyeComprehensionFrame(input: {
  text: string
  intent: BigEyeIntent
  state: BigEyeConversationState
  world?: ConfessionalWorldContext
  memorySummary?: string
}): BigEyeComprehensionFrame {
  const config = getConfessionalRuntimeConfig()
  const text = normalizeInput(input.text)
  let primaryIntent = input.intent
  if (primaryIntent === 'unknown' || primaryIntent === 'curiosity') {
    for (const [intent, phrases] of Object.entries(config.comprehension.slang) as Array<
      [BigEyeIntent, string[] | undefined]
    >) {
      if (phrases?.some((phrase) => text.includes(normalizeInput(phrase)))) {
        primaryIntent = intent
        break
      }
    }
  }
  const entities = findEntities(text, input.world)
  const inheritedFocus = input.state.thread?.focusPlayer ?? null
  const coreferenceUsed = Boolean(
    entities.length === 0 &&
      inheritedFocus &&
      (hasCoreferencePronoun(text) ||
        isAgreement(text) ||
        isDisagreement(text) ||
        isClarification(text) ||
        text.split(' ').length <= 5)
  )
  const focusPlayer = entities[0] ?? (coreferenceUsed ? inheritedFocus : null)

  const topics = (
    Object.entries(config.comprehension.topicPhrases) as Array<[ConfessionalTopic, string[]]>
  )
    .filter(([, phrases]) => containsAny(text, phrases))
    .map(([topic]) => topic)

  const emotions = (
    Object.entries(config.comprehension.emotionPhrases) as Array<[ConfessionalEmotion, string[]]>
  )
    .flatMap(([type, phrases]) => {
      const matches = phrases.filter((phrase) => text.includes(normalizeInput(phrase))).length
      return matches > 0 ? [{ type, score: Math.min(1, 0.55 + matches * 0.15) }] : []
    })
    .sort((left, right) => right.score - left.score)

  const relationshipStances: RelationshipStance[] = []
  if (containsAny(text, config.comprehension.distrustTerms)) relationshipStances.push('distrust')
  else if (containsAny(text, config.comprehension.trustTerms)) relationshipStances.push('trust')
  if (containsAny(text, config.comprehension.targetTerms)) relationshipStances.push('target')
  if (containsAny(text, config.comprehension.protectTerms)) relationshipStances.push('protect')
  if (containsAny(text, config.comprehension.dependencyTerms)) relationshipStances.push('depend')

  const knowledgeQuery = detectKnowledgeQuery(text, focusPlayer)
  const predictedWinner = config.features.predictions ? detectPrediction(text, input.world) : null
  const speechAct = inferSpeechAct(
    text,
    primaryIntent,
    input.state,
    knowledgeQuery,
    predictedWinner
  )
  const contradiction = inferContradiction(text, focusPlayer, input.memorySummary)
  const continuation = Boolean(
    input.state.thread &&
    (primaryIntent === 'yes' ||
      primaryIntent === 'no' ||
      entities.some((entity) => entity === input.state.thread?.focusPlayer) ||
      (topics[0] && topics[0] === input.state.thread.topic))
  )

  const responseMoves: ConfessionalResponseMove[] = []
  if (knowledgeQuery) responseMoves.push('answer')
  if (contradiction) responseMoves.push('confront', 'remember')
  if (speechAct === 'advice_request') responseMoves.push('advise')
  if (speechAct === 'target_declaration') responseMoves.push('observe', 'challenge')
  if (speechAct === 'agreement') responseMoves.push('brief', 'observe')
  if (speechAct === 'disagreement') responseMoves.push('observe', 'probe')
  if (speechAct === 'clarification') responseMoves.push('answer')
  if (speechAct === 'vent') responseMoves.push('reassure', 'probe')
  if (speechAct === 'challenge_request') responseMoves.push('challenge', 'playful')
  if (speechAct === 'prediction') responseMoves.push('remember', 'challenge')
  if (continuation) responseMoves.push('observe')
  if (responseMoves.length === 0) responseMoves.push('observe', 'probe')

  return {
    primaryIntent,
    speechAct,
    topics: unique(topics),
    emotions,
    entities,
    focusPlayer,
    relationshipStances: unique(relationshipStances),
    continuation,
    contradiction,
    responseMoves: unique(responseMoves),
    knowledgeQuery,
    predictedWinner,
    coreferenceUsed,
  }
}

export function updateConversationStateFromFrame(
  state: BigEyeConversationState,
  frame: BigEyeComprehensionFrame,
  responseText: string
): BigEyeConversationState {
  const previousRapport = state.rapport ?? {
    familiarity: 0,
    warmth: 0,
    friction: 0,
  }
  const warmthDelta =
    frame.primaryIntent === 'gratitude' ||
    frame.primaryIntent === 'compliment' ||
    frame.primaryIntent === 'love_confession'
      ? 1
      : frame.primaryIntent === 'insult'
        ? -1
        : 0
  const frictionDelta =
    frame.primaryIntent === 'insult' || frame.primaryIntent === 'repetition_complaint'
      ? 1
      : frame.primaryIntent === 'apology'
        ? -1
        : 0

  const topic = frame.topics[0] ?? state.thread?.topic ?? null
  const responseAsksQuestion = responseText.trim().endsWith('?')

  return {
    ...state,
    thread:
      topic || frame.focusPlayer || responseAsksQuestion
        ? {
            topic,
            focusPlayer: frame.focusPlayer ?? state.thread?.focusPlayer ?? null,
            questionKind: responseAsksQuestion
              ? (frame.knowledgeQuery ?? frame.speechAct)
              : (state.thread?.questionKind ?? null),
            depth: frame.continuation ? Math.min(6, (state.thread?.depth ?? 0) + 1) : 1,
            lastEyeQuestion: responseAsksQuestion
              ? responseText
              : (state.thread?.lastEyeQuestion ?? null),
            lastEyeStatement: responseAsksQuestion
              ? (state.thread?.lastEyeStatement ?? null)
              : responseText,
            contextReason: state.thread?.contextReason ?? null,
          }
        : null,
    rapport: {
      familiarity: Math.min(100, previousRapport.familiarity + 1),
      warmth: Math.max(-10, Math.min(10, previousRapport.warmth + warmthDelta)),
      friction: Math.max(0, Math.min(10, previousRapport.friction + frictionDelta)),
    },
  }
}
