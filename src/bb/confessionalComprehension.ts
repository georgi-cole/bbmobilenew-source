import { normalizeInput, type BigEyeConversationState, type BigEyeIntent } from './confessionalBigEye'
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

function detectKnowledgeQuery(text: string): ConfessionalKnowledgeQuery | null {
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
  if (/how many (?:people|players|housemates).*(?:left|remain)|who is left/.test(text)) {
    return 'remaining'
  }
  if (/who am i closest to|who do i have the best relationship with|closest relationship/.test(text)) {
    return 'closest_relationship'
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
  if (!world || !/(?:think|predict|bet|believe).*(?:win|winner)/.test(text)) return null
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

function inferSpeechAct(
  text: string,
  intent: BigEyeIntent,
  state: BigEyeConversationState,
  knowledgeQuery: ConfessionalKnowledgeQuery | null,
  predictedWinner: string | null
): ConfessionalSpeechAct {
  if (knowledgeQuery === 'memory') return 'memory_query'
  if (knowledgeQuery) return 'factual_question'
  if (/challenge me|give me a challenge|dare me/.test(text)) return 'challenge_request'
  if (predictedWinner) return 'prediction'
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
  if (/?$/.test(text) || /^(who|what|when|where|why|how|can|could|should|would|do|does|is|are)/.test(text)) {
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
  const trustsNow = /(?:trust|loyal|believe)/.test(text) && !/(?:dont|do not|not).*trust/.test(text)
  const distrustsNow = /(?:dont trust|do not trust|lying|liar|sketchy|shady|snake)/.test(text)

  if (trustsNow && (memory.includes(`distrusts ${focus}`) || memory.includes(`targeting ${focus}`))) {
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
  const entities = findEntities(text, input.world)
  const focusPlayer = entities[0] ?? input.state.thread?.focusPlayer ?? null

  const topics = (Object.entries(config.comprehension.topicPhrases) as Array<
    [ConfessionalTopic, string[]]
  >)
    .filter(([, phrases]) => containsAny(text, phrases))
    .map(([topic]) => topic)

  const emotions = (Object.entries(config.comprehension.emotionPhrases) as Array<
    [ConfessionalEmotion, string[]]
  >)
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

  const knowledgeQuery = detectKnowledgeQuery(text)
  const predictedWinner = config.features.predictions ? detectPrediction(text, input.world) : null
  const speechAct = inferSpeechAct(text, input.intent, input.state, knowledgeQuery, predictedWinner)
  const contradiction = inferContradiction(text, focusPlayer, input.memorySummary)
  const continuation = Boolean(
    input.state.thread &&
      (input.intent === 'yes' ||
        input.intent === 'no' ||
        entities.some((entity) => entity === input.state.thread?.focusPlayer) ||
        (topics[0] && topics[0] === input.state.thread.topic))
  )

  const responseMoves: ConfessionalResponseMove[] = []
  if (knowledgeQuery) responseMoves.push('answer')
  if (contradiction) responseMoves.push('confront', 'remember')
  if (speechAct === 'advice_request') responseMoves.push('advise')
  if (speechAct === 'vent') responseMoves.push('reassure', 'probe')
  if (speechAct === 'challenge_request') responseMoves.push('challenge', 'playful')
  if (speechAct === 'prediction') responseMoves.push('remember', 'challenge')
  if (continuation) responseMoves.push('observe')
  if (responseMoves.length === 0) responseMoves.push('observe', 'probe')

  return {
    primaryIntent: input.intent,
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
              ? frame.knowledgeQuery ?? frame.speechAct
              : state.thread?.questionKind ?? null,
            depth: frame.continuation ? Math.min(6, (state.thread?.depth ?? 0) + 1) : 1,
          }
        : null,
    rapport: {
      familiarity: Math.min(100, previousRapport.familiarity + 1),
      warmth: Math.max(-10, Math.min(10, previousRapport.warmth + warmthDelta)),
      friction: Math.max(0, Math.min(10, previousRapport.friction + frictionDelta)),
    },
  }
}
