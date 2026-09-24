import type { BigEyeIntent } from './confessionalBigEye'

export type ConfessionalTopic =
  | 'strategy'
  | 'alliance'
  | 'trust'
  | 'betrayal'
  | 'nomination'
  | 'eviction'
  | 'competition'
  | 'power'
  | 'public'
  | 'romance'
  | 'mission'
  | 'jury'
  | 'finale'
  | 'wellbeing'

export type ConfessionalEmotion =
  | 'fear'
  | 'anger'
  | 'sadness'
  | 'confidence'
  | 'excitement'
  | 'suspicion'
  | 'embarrassment'
  | 'indecision'

export type ConfessionalResponseMove =
  | 'answer'
  | 'probe'
  | 'challenge'
  | 'observe'
  | 'tease'
  | 'reassure'
  | 'advise'
  | 'remember'
  | 'confront'
  | 'brief'
  | 'playful'
  | 'redirect'

export type ConfessionalSalienceEvent =
  | 'returned'
  | 'newly_nominated'
  | 'became_leader'
  | 'won_safety'
  | 'survived_nomination'
  | 'closest_relationship_changed'
  | 'late_game'

export interface RemoteConfessionalConfig {
  schemaVersion?: 1
  revision?: string
  features?: {
    memoryCallbacks?: boolean
    proactiveObservations?: boolean
    deterministicKnowledge?: boolean
    visualEyeReactions?: boolean
    predictions?: boolean
    challengeMe?: boolean
  }
  persona?: {
    warmth?: number
    sarcasm?: number
    mystery?: number
    questionFrequency?: number
    callbackFrequency?: number
    conciseBias?: number
  }
  comprehension?: {
    topicPhrases?: Partial<Record<ConfessionalTopic, string[]>>
    emotionPhrases?: Partial<Record<ConfessionalEmotion, string[]>>
    trustTerms?: string[]
    distrustTerms?: string[]
    targetTerms?: string[]
    protectTerms?: string[]
    dependencyTerms?: string[]
    slang?: Partial<Record<BigEyeIntent, string[]>>
  }
  responses?: {
    /** Optional authored pools that replace the bundled pool for a matching intent. */
    intents?: Partial<Record<BigEyeIntent, string[]>>
    moves?: Partial<Record<ConfessionalResponseMove, string[]>>
    challengePrompts?: string[]
  }
  salience?: {
    weights?: Partial<Record<ConfessionalSalienceEvent, number>>
    templates?: Partial<Record<ConfessionalSalienceEvent, string[]>>
  }
  director?: {
    authority?: number
    warmth?: number
    humour?: number
    mystery?: number
    verbosity?: number
    preferredMoves?: string[]
    forbiddenCliches?: string[]
    directives?: string[]
  }
}

export interface ResolvedConfessionalConfig {
  schemaVersion: 1
  revision: string
  features: Required<NonNullable<RemoteConfessionalConfig['features']>>
  persona: Required<NonNullable<RemoteConfessionalConfig['persona']>>
  comprehension: {
    topicPhrases: Record<ConfessionalTopic, string[]>
    emotionPhrases: Record<ConfessionalEmotion, string[]>
    trustTerms: string[]
    distrustTerms: string[]
    targetTerms: string[]
    protectTerms: string[]
    dependencyTerms: string[]
    slang: Partial<Record<BigEyeIntent, string[]>>
  }
  responses: {
    intents: Partial<Record<BigEyeIntent, string[]>>
    moves: Partial<Record<ConfessionalResponseMove, string[]>>
    challengePrompts: string[]
  }
  salience: {
    weights: Record<ConfessionalSalienceEvent, number>
    templates: Record<ConfessionalSalienceEvent, string[]>
  }
  director: Required<
    Pick<
      NonNullable<RemoteConfessionalConfig['director']>,
      'authority' | 'warmth' | 'humour' | 'mystery' | 'verbosity'
    >
  > & {
    preferredMoves: string[]
    forbiddenCliches: string[]
    directives: string[]
  }
}

const DEFAULT_CONFESSIONAL_CONFIG: ResolvedConfessionalConfig = {
  schemaVersion: 1,
  revision: 'bundled-confessional-2.0',
  features: {
    memoryCallbacks: true,
    proactiveObservations: true,
    deterministicKnowledge: true,
    visualEyeReactions: true,
    predictions: true,
    challengeMe: true,
  },
  persona: {
    warmth: 0.38,
    sarcasm: 0.34,
    mystery: 0.46,
    questionFrequency: 0.56,
    callbackFrequency: 0.42,
    conciseBias: 0.48,
  },
  comprehension: {
    topicPhrases: {
      strategy: ['strategy', 'plan', 'move', 'target', 'vote', 'numbers'],
      alliance: ['alliance', 'ally', 'deal', 'work with', 'final two', 'final 2'],
      trust: ['trust', 'loyal', 'loyalty', 'believe', 'safe with'],
      betrayal: ['betray', 'backstab', 'snake', 'lied to me', 'turned on me'],
      nomination: ['nomination', 'nominated', 'block', 'put me up', 'put up'],
      eviction: ['eviction', 'evict', 'eliminate', 'going home', 'leave tonight'],
      competition: ['competition', 'comp', 'challenge', 'loh', 'safety'],
      power: ['power', 'immunity', 'double vote', 'vote deduction', 'veto'],
      public: ['public', 'audience', 'rating', 'approval', 'favorite', 'favourite'],
      romance: ['romance', 'kiss', 'crush', 'love', 'couple', 'bromance'],
      mission: ['mission', 'objective', 'task', 'reward box'],
      jury: ['jury', 'tribunal', 'juror'],
      finale: ['finale', 'final 2', 'final two', 'final 3', 'final three', 'winner'],
      wellbeing: ['feel', 'feeling', 'sad', 'scared', 'afraid', 'angry', 'happy', 'overwhelmed'],
    },
    emotionPhrases: {
      fear: ['scared', 'afraid', 'worried', 'nervous', 'panic', 'terrified'],
      anger: ['angry', 'mad', 'furious', 'annoyed', 'pissed', 'frustrated'],
      sadness: ['sad', 'lonely', 'upset', 'crying', 'miss home', 'hurt'],
      confidence: ['confident', 'safe', 'i got this', 'i can win', 'certain'],
      excitement: ['excited', 'happy', 'thrilled', 'relieved', 'proud'],
      suspicion: ['suspicious', 'sketchy', 'shady', 'lying', 'dont trust', 'do not trust'],
      embarrassment: ['embarrassed', 'awkward', 'humiliated', 'ashamed'],
      indecision: ['not sure', 'dont know', 'do not know', 'maybe', 'confused', 'torn'],
    },
    trustTerms: ['trust', 'loyal', 'believe them', 'believe him', 'believe her'],
    distrustTerms: ['dont trust', 'do not trust', 'lying', 'liar', 'sketchy', 'shady', 'snake'],
    targetTerms: ['target', 'vote out', 'evict', 'get rid of', 'take out'],
    protectTerms: ['protect', 'save', 'keep safe', 'never vote'],
    dependencyTerms: [
      'need their vote',
      'need his vote',
      'need her vote',
      'depend on',
      'need them',
    ],
    slang: {
      overwhelmed: ['im cooked', 'i am cooked', 'this is cooked'],
    } as Partial<Record<BigEyeIntent, string[]>>,
  },
  responses: {
    intents: {},
    moves: {
      brief: ['Noted.', 'Go on.', 'I noticed.', 'That sounded certain.'],
      playful: [
        'You came here for advice. You are going to ignore it, are you not?',
        'Careful. I am beginning to think you enjoy these little talks.',
      ],
      remember: [
        'That is not what you told me last time.',
        'You have said something very different in this room before.',
      ],
    },
    challengePrompts: [
      'Before you come back here, have one honest conversation with the person you trust least.',
      'Before your next visit, verify one promise instead of collecting three more.',
      'For the next hour, keep your plan to yourself and listen to who talks too much.',
    ],
  },
  salience: {
    weights: {
      returned: 100,
      newly_nominated: 95,
      became_leader: 85,
      won_safety: 80,
      survived_nomination: 82,
      closest_relationship_changed: 70,
      late_game: 60,
    },
    templates: {
      returned: ['I watched you leave. Apparently the House was not finished with you.'],
      newly_nominated: ['Back already. And this time your name is on the block.'],
      became_leader: ['Power suits you. For now.'],
      won_safety: ['You won safety. I noticed.'],
      survived_nomination: ['Still here. That was not guaranteed.'],
      closest_relationship_changed: [
        'Your closest connection has changed since the last time you sat in that chair.',
      ],
      late_game: ['Fewer faces. Heavier choices. Sit down.'],
    },
  },
  director: {
    authority: 0.82,
    warmth: 0.36,
    humour: 0.32,
    mystery: 0.45,
    verbosity: 0.42,
    preferredMoves: ['answer', 'observe', 'challenge', 'remember', 'tease', 'probe'],
    forbiddenCliches: [
      'trust is currency',
      'the house is listening',
      'your feelings are valid',
      'interesting',
    ],
    directives: [
      'Prefer specific callbacks over generic atmosphere.',
      'A very short answer is allowed when it is dramatically sharper.',
      'Notice contradictions without inventing motives.',
    ],
  },
}

let remoteConfessionalConfig: RemoteConfessionalConfig | null = null

function clamp01(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value))
}

function safeStrings(value: unknown, maxItems = 80, maxLength = 180): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
  return items.length > 0 ? items : undefined
}

function sanitiseStringMap<T extends string>(
  value: unknown,
  allowed: readonly T[],
  maxItems = 80,
  maxLength = 180
): Partial<Record<T, string[]>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  const result: Partial<Record<T, string[]>> = {}
  for (const key of allowed) {
    const items = safeStrings(source[key], maxItems, maxLength)
    if (items) result[key] = items
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const TOPICS: readonly ConfessionalTopic[] = [
  'strategy',
  'alliance',
  'trust',
  'betrayal',
  'nomination',
  'eviction',
  'competition',
  'power',
  'public',
  'romance',
  'mission',
  'jury',
  'finale',
  'wellbeing',
]

const EMOTIONS: readonly ConfessionalEmotion[] = [
  'fear',
  'anger',
  'sadness',
  'confidence',
  'excitement',
  'suspicion',
  'embarrassment',
  'indecision',
]

const MOVES: readonly ConfessionalResponseMove[] = [
  'answer',
  'probe',
  'challenge',
  'observe',
  'tease',
  'reassure',
  'advise',
  'remember',
  'confront',
  'brief',
  'playful',
  'redirect',
]

const REMOTE_INTENTS: readonly BigEyeIntent[] = [
  'greeting',
  'farewell',
  'boredom',
  'self_eviction',
  'frustration',
  'strategy',
  'alliance',
  'betrayal',
  'fear',
  'curiosity',
  'compliment',
  'insult',
  'game_request',
  'yes',
  'no',
  'realness',
  'winner_prediction',
  'help_request',
  'advice_request',
  'love_confession',
  'greeting_repeat',
  'wellbeing_question',
  'overwhelmed',
  'repetition_complaint',
  'confusion',
  'hesitation',
  'gratitude',
  'sadness',
  'positive_emotion',
  'apology',
  'unknown',
]

const SALIENCE_EVENTS: readonly ConfessionalSalienceEvent[] = [
  'returned',
  'newly_nominated',
  'became_leader',
  'won_safety',
  'survived_nomination',
  'closest_relationship_changed',
  'late_game',
]

export function sanitiseRemoteConfessionalConfig(
  raw: unknown
): RemoteConfessionalConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const result: RemoteConfessionalConfig = { schemaVersion: 1 }

  if (typeof value.revision === 'string' && value.revision.trim()) {
    result.revision = value.revision.trim().slice(0, 120)
  }

  if (value.features && typeof value.features === 'object' && !Array.isArray(value.features)) {
    const source = value.features as Record<string, unknown>
    const features: NonNullable<RemoteConfessionalConfig['features']> = {}
    for (const key of [
      'memoryCallbacks',
      'proactiveObservations',
      'deterministicKnowledge',
      'visualEyeReactions',
      'predictions',
      'challengeMe',
    ] as const) {
      if (typeof source[key] === 'boolean') features[key] = source[key] as boolean
    }
    if (Object.keys(features).length) result.features = features
  }

  if (value.persona && typeof value.persona === 'object' && !Array.isArray(value.persona)) {
    const source = value.persona as Record<string, unknown>
    const persona: NonNullable<RemoteConfessionalConfig['persona']> = {}
    for (const key of [
      'warmth',
      'sarcasm',
      'mystery',
      'questionFrequency',
      'callbackFrequency',
      'conciseBias',
    ] as const) {
      const next = clamp01(source[key])
      if (next !== undefined) persona[key] = next
    }
    if (Object.keys(persona).length) result.persona = persona
  }

  if (
    value.comprehension &&
    typeof value.comprehension === 'object' &&
    !Array.isArray(value.comprehension)
  ) {
    const source = value.comprehension as Record<string, unknown>
    const comprehension: NonNullable<RemoteConfessionalConfig['comprehension']> = {}
    comprehension.topicPhrases = sanitiseStringMap(source.topicPhrases, TOPICS)
    comprehension.emotionPhrases = sanitiseStringMap(source.emotionPhrases, EMOTIONS)
    comprehension.trustTerms = safeStrings(source.trustTerms)
    comprehension.distrustTerms = safeStrings(source.distrustTerms)
    comprehension.targetTerms = safeStrings(source.targetTerms)
    comprehension.protectTerms = safeStrings(source.protectTerms)
    comprehension.dependencyTerms = safeStrings(source.dependencyTerms)
    if (source.slang && typeof source.slang === 'object' && !Array.isArray(source.slang)) {
      const slang: Partial<Record<BigEyeIntent, string[]>> = {}
      for (const [key, terms] of Object.entries(source.slang)) {
        if (!REMOTE_INTENTS.includes(key as BigEyeIntent)) continue
        const items = safeStrings(terms, 50, 100)
        if (items) slang[key as BigEyeIntent] = items
      }
      if (Object.keys(slang).length) comprehension.slang = slang
    }
    if (Object.values(comprehension).some(Boolean)) result.comprehension = comprehension
  }

  if (value.responses && typeof value.responses === 'object' && !Array.isArray(value.responses)) {
    const source = value.responses as Record<string, unknown>
    const responses: NonNullable<RemoteConfessionalConfig['responses']> = {}
    responses.intents = sanitiseStringMap(source.intents, REMOTE_INTENTS, 80, 320)
    responses.moves = sanitiseStringMap(source.moves, MOVES, 60, 280)
    responses.challengePrompts = safeStrings(source.challengePrompts, 30, 280)
    if (Object.values(responses).some(Boolean)) result.responses = responses
  }

  if (value.salience && typeof value.salience === 'object' && !Array.isArray(value.salience)) {
    const source = value.salience as Record<string, unknown>
    const salience: NonNullable<RemoteConfessionalConfig['salience']> = {}
    if (source.weights && typeof source.weights === 'object' && !Array.isArray(source.weights)) {
      const weights: Partial<Record<ConfessionalSalienceEvent, number>> = {}
      const rawWeights = source.weights as Record<string, unknown>
      for (const key of SALIENCE_EVENTS) {
        const next = rawWeights[key]
        if (typeof next === 'number' && Number.isFinite(next)) {
          weights[key] = Math.max(0, Math.min(100, Math.round(next)))
        }
      }
      if (Object.keys(weights).length) salience.weights = weights
    }
    salience.templates = sanitiseStringMap(source.templates, SALIENCE_EVENTS, 30, 280)
    if (Object.values(salience).some(Boolean)) result.salience = salience
  }

  if (value.director && typeof value.director === 'object' && !Array.isArray(value.director)) {
    const source = value.director as Record<string, unknown>
    const director: NonNullable<RemoteConfessionalConfig['director']> = {}
    for (const key of ['authority', 'warmth', 'humour', 'mystery', 'verbosity'] as const) {
      const next = clamp01(source[key])
      if (next !== undefined) director[key] = next
    }
    director.preferredMoves = safeStrings(source.preferredMoves, 20, 60)
    director.forbiddenCliches = safeStrings(source.forbiddenCliches, 40, 120)
    director.directives = safeStrings(source.directives, 30, 240)
    if (Object.values(director).some(Boolean)) result.director = director
  }

  return result
}

function mergeStringMap<T extends string>(
  base: Record<T, string[]>,
  overrides?: Partial<Record<T, string[]>>
): Record<T, string[]> {
  return Object.fromEntries(
    Object.entries(base).map(([key, values]) => [
      key,
      overrides?.[key as T]?.length ? overrides[key as T] : values,
    ])
  ) as Record<T, string[]>
}

export function setRemoteConfessionalConfig(config: RemoteConfessionalConfig | null): void {
  remoteConfessionalConfig = config ? (sanitiseRemoteConfessionalConfig(config) ?? null) : null
}

export function getConfessionalRuntimeConfig(): ResolvedConfessionalConfig {
  const remote = remoteConfessionalConfig
  if (!remote) return DEFAULT_CONFESSIONAL_CONFIG

  return {
    schemaVersion: 1,
    revision: remote.revision ?? DEFAULT_CONFESSIONAL_CONFIG.revision,
    features: { ...DEFAULT_CONFESSIONAL_CONFIG.features, ...remote.features },
    persona: { ...DEFAULT_CONFESSIONAL_CONFIG.persona, ...remote.persona },
    comprehension: {
      topicPhrases: mergeStringMap(
        DEFAULT_CONFESSIONAL_CONFIG.comprehension.topicPhrases,
        remote.comprehension?.topicPhrases
      ),
      emotionPhrases: mergeStringMap(
        DEFAULT_CONFESSIONAL_CONFIG.comprehension.emotionPhrases,
        remote.comprehension?.emotionPhrases
      ),
      trustTerms:
        remote.comprehension?.trustTerms ?? DEFAULT_CONFESSIONAL_CONFIG.comprehension.trustTerms,
      distrustTerms:
        remote.comprehension?.distrustTerms ??
        DEFAULT_CONFESSIONAL_CONFIG.comprehension.distrustTerms,
      targetTerms:
        remote.comprehension?.targetTerms ?? DEFAULT_CONFESSIONAL_CONFIG.comprehension.targetTerms,
      protectTerms:
        remote.comprehension?.protectTerms ??
        DEFAULT_CONFESSIONAL_CONFIG.comprehension.protectTerms,
      dependencyTerms:
        remote.comprehension?.dependencyTerms ??
        DEFAULT_CONFESSIONAL_CONFIG.comprehension.dependencyTerms,
      slang: {
        ...DEFAULT_CONFESSIONAL_CONFIG.comprehension.slang,
        ...remote.comprehension?.slang,
      },
    },
    responses: {
      intents: { ...DEFAULT_CONFESSIONAL_CONFIG.responses.intents, ...remote.responses?.intents },
      moves: { ...DEFAULT_CONFESSIONAL_CONFIG.responses.moves, ...remote.responses?.moves },
      challengePrompts:
        remote.responses?.challengePrompts ??
        DEFAULT_CONFESSIONAL_CONFIG.responses.challengePrompts,
    },
    salience: {
      weights: { ...DEFAULT_CONFESSIONAL_CONFIG.salience.weights, ...remote.salience?.weights },
      templates: mergeStringMap(
        DEFAULT_CONFESSIONAL_CONFIG.salience.templates,
        remote.salience?.templates
      ),
    },
    director: {
      ...DEFAULT_CONFESSIONAL_CONFIG.director,
      ...remote.director,
      preferredMoves:
        remote.director?.preferredMoves ?? DEFAULT_CONFESSIONAL_CONFIG.director.preferredMoves,
      forbiddenCliches:
        remote.director?.forbiddenCliches ?? DEFAULT_CONFESSIONAL_CONFIG.director.forbiddenCliches,
      directives: remote.director?.directives ?? DEFAULT_CONFESSIONAL_CONFIG.director.directives,
    },
  }
}

export function getBundledConfessionalConfig(): ResolvedConfessionalConfig {
  return DEFAULT_CONFESSIONAL_CONFIG
}
