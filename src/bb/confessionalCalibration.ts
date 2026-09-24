import {
  createInitialBigEyeState,
  type BigEyeAction,
  type BigEyeConversationState,
  type BigEyeIntent,
} from './confessionalBigEye'
import {
  getSalientConfessionalObservation,
  type BigEyeWorldSnapshot,
} from './confessionalSalience'
import type {
  ConfessionalEmotion,
  ConfessionalSalienceEvent,
  ConfessionalTopic,
} from './confessionalRuntimeConfig'
import type {
  ConfessionalKnowledgeQuery,
  ConfessionalSpeechAct,
  RelationshipStance,
} from './confessionalComprehension'
import {
  analyzeBigEyeTurn,
  type BigEyeTurnAnalysis,
  type BigEyeTurnRoute,
  type BigEyeWorldContext,
} from '../services/bigBrother'

export type ConfessionalCalibrationCategory =
  | 'understanding'
  | 'knowledge'
  | 'continuity'
  | 'authored'
  | 'character'
  | 'salience'

export type ConfessionalCalibrationTier = 'contract' | 'calibration'

export interface ConfessionalCalibrationExpectation {
  detectedIntent?: BigEyeIntent
  semanticIntent?: BigEyeIntent
  route?: BigEyeTurnRoute
  speechAct?: ConfessionalSpeechAct
  focusPlayer?: string | null
  topicsAll?: ConfessionalTopic[]
  emotionsAny?: ConfessionalEmotion[]
  stancesAll?: RelationshipStance[]
  knowledgeQuery?: ConfessionalKnowledgeQuery | null
  contradiction?: boolean
  action?: BigEyeAction | null
  hasEasterEgg?: boolean
  memoryIncludes?: string[]
  localTextIncludes?: string[]
  threadFocus?: string | null
  mood?: BigEyeConversationState['mood']
  familiarityAtLeast?: number
}

export interface ConfessionalCalibrationTurn {
  text: string
  expected?: ConfessionalCalibrationExpectation
}

export interface ConfessionalCalibrationScenario {
  id: string
  title: string
  category: ConfessionalCalibrationCategory
  tier: ConfessionalCalibrationTier
  description: string
  playerName?: string
  world?: BigEyeWorldContext
  initialMemory?: string
  initialState?: Partial<BigEyeConversationState>
  turns: ConfessionalCalibrationTurn[]
  previousSnapshot?: BigEyeWorldSnapshot | null
  expectedSalience?: ConfessionalSalienceEvent | null
}

export interface ConfessionalCalibrationCheck {
  label: string
  expected: string
  actual: string
  passed: boolean
}

export interface ConfessionalCalibrationTurnResult {
  text: string
  analysis: BigEyeTurnAnalysis
  checks: ConfessionalCalibrationCheck[]
  memoryBefore: string
  memoryAfter: string
}

export interface ConfessionalCalibrationScenarioResult {
  scenario: ConfessionalCalibrationScenario
  turns: ConfessionalCalibrationTurnResult[]
  salience: ReturnType<typeof getSalientConfessionalObservation>
  checks: ConfessionalCalibrationCheck[]
  passed: boolean
}

export const CONFESSIONAL_LAB_WORLD: BigEyeWorldContext = {
  season: 3,
  week: 6,
  phase: 'pre_eviction',
  playerStatus: 'active',
  leaderName: 'Kian',
  nomineeNames: ['Alex', 'Lia'],
  safetyWinnerName: 'Jax',
  remainingHousemates: ['Alex', 'Maya', 'Kian', 'Lia', 'Jax', 'Ruben', 'Nora'],
  playerStats: {
    leaderWins: 1,
    safetyWins: 2,
    timesNominated: 3,
  },
  closestRelationships: [
    { name: 'Maya', affinity: 84, tags: ['ally'] },
    { name: 'Kian', affinity: 63, tags: ['working_relationship'] },
    { name: 'Jax', affinity: 48, tags: ['volatile'] },
    { name: 'Lia', affinity: -31, tags: ['rival'] },
  ],
  recentPublicEvents: [
    'Kian won Leader of the House.',
    'Alex and Lia were nominated.',
    'Jax won the Safety competition.',
  ],
}

function withWorld(overrides: Partial<BigEyeWorldContext>): BigEyeWorldContext {
  return {
    ...CONFESSIONAL_LAB_WORLD,
    ...overrides,
    playerStats: {
      ...CONFESSIONAL_LAB_WORLD.playerStats,
      ...overrides.playerStats,
    },
  }
}

const BASE_SNAPSHOT: BigEyeWorldSnapshot = {
  week: 5,
  phase: 'social_2',
  playerStatus: 'active',
  leaderName: 'Kian',
  nomineeNames: [],
  safetyWinnerName: null,
  remainingCount: 7,
  closestName: 'Maya',
  closestAffinity: 84,
}

export const CONFESSIONAL_CALIBRATION_SCENARIOS: ConfessionalCalibrationScenario[] = [
  {
    id: 'understanding-mixed-strategy',
    title: 'Distrust + dependency + fear',
    category: 'understanding',
    tier: 'contract',
    description: 'One sentence should retain several simultaneous signals around Maya.',
    turns: [
      {
        text: "Maya is sketchy and lying to me, but I need her vote and I am scared she'll put me up.",
        expected: {
          detectedIntent: 'fear',
          semanticIntent: 'fear',
          route: 'generative',
          focusPlayer: 'Maya',
          topicsAll: ['strategy', 'nomination'],
          emotionsAny: ['fear', 'suspicion'],
          stancesAll: ['distrust', 'depend'],
        },
      },
    ],
  },
  {
    id: 'understanding-protect',
    title: 'Protective stance',
    category: 'understanding',
    tier: 'contract',
    description: 'Protective language about a named housemate should not disappear.',
    turns: [
      {
        text: 'I want to protect Maya and keep her safe this week.',
        expected: {
          focusPlayer: 'Maya',
          stancesAll: ['protect'],
        },
      },
    ],
  },
  {
    id: 'understanding-target',
    title: 'Target stance',
    category: 'understanding',
    tier: 'contract',
    description: 'Targeting language should be represented explicitly.',
    turns: [
      {
        text: 'I think I need to target Kian and take him out.',
        expected: {
          focusPlayer: 'Kian',
          stancesAll: ['target'],
          topicsAll: ['strategy'],
        },
      },
    ],
  },
  {
    id: 'understanding-trust',
    title: 'Trust stance',
    category: 'understanding',
    tier: 'contract',
    description: 'Plain trust statements should create a trust belief.',
    turns: [
      {
        text: 'I trust Maya. She has been loyal to me.',
        expected: {
          focusPlayer: 'Maya',
          stancesAll: ['trust'],
          topicsAll: ['trust'],
          memoryIncludes: ['Belief — trusts Maya'],
        },
      },
    ],
  },
  {
    id: 'understanding-overwhelmed',
    title: 'Overwhelmed language',
    category: 'understanding',
    tier: 'contract',
    description: 'Direct pressure language should resolve as overwhelmed.',
    turns: [
      {
        text: 'This is too much, I cannot cope with all of this pressure.',
        expected: {
          detectedIntent: 'overwhelmed',
          semanticIntent: 'overwhelmed',
          speechAct: 'vent',
        },
      },
    ],
  },
  {
    id: 'understanding-slang-cooked',
    title: 'Remote slang baseline',
    category: 'understanding',
    tier: 'contract',
    description: 'Bundled remote-ready slang extends an otherwise unknown utterance.',
    turns: [
      {
        text: 'I am cooked after today.',
        expected: {
          semanticIntent: 'overwhelmed',
          speechAct: 'vent',
        },
      },
    ],
  },
  {
    id: 'understanding-sadness',
    title: 'Sadness',
    category: 'understanding',
    tier: 'contract',
    description: 'Emotional disclosure should stay emotional instead of becoming strategy.',
    turns: [
      {
        text: 'I feel alone and I miss home.',
        expected: {
          detectedIntent: 'sadness',
          semanticIntent: 'sadness',
          speechAct: 'vent',
          emotionsAny: ['sadness'],
        },
      },
    ],
  },
  {
    id: 'understanding-betrayal',
    title: 'Betrayal',
    category: 'understanding',
    tier: 'contract',
    description: 'Betrayal involving a named player should preserve the entity.',
    turns: [
      {
        text: 'Jax backstabbed me. He completely turned on me.',
        expected: {
          detectedIntent: 'betrayal',
          semanticIntent: 'betrayal',
          focusPlayer: 'Jax',
          topicsAll: ['betrayal'],
        },
      },
    ],
  },
  {
    id: 'understanding-positive',
    title: 'Positive emotion',
    category: 'understanding',
    tier: 'calibration',
    description: 'Positive emotion is an area to watch for accidental strategic over-reading.',
    turns: [
      {
        text: 'I am honestly so relieved and proud of myself today.',
        expected: {
          semanticIntent: 'positive_emotion',
          emotionsAny: ['excitement'],
        },
      },
    ],
  },
  {
    id: 'understanding-question',
    title: 'Open factual-style question',
    category: 'understanding',
    tier: 'calibration',
    description: 'A general question should remain curiosity when no deterministic fact matches.',
    turns: [
      {
        text: 'Why do people keep changing their minds in this house?',
        expected: {
          detectedIntent: 'curiosity',
          route: 'generative',
        },
      },
    ],
  },

  {
    id: 'knowledge-leader',
    title: 'Who is Leader?',
    category: 'knowledge',
    tier: 'contract',
    description: 'Observable game facts should be answered locally.',
    turns: [
      {
        text: 'Who is the leader right now?',
        expected: {
          route: 'deterministic',
          knowledgeQuery: 'leader',
          localTextIncludes: ['Kian'],
        },
      },
    ],
  },
  {
    id: 'knowledge-nominees',
    title: 'Who am I nominated against?',
    category: 'knowledge',
    tier: 'contract',
    description: 'Nominee context should not require AI.',
    turns: [
      {
        text: 'Who am I nominated against?',
        expected: {
          route: 'deterministic',
          knowledgeQuery: 'nominees',
          localTextIncludes: ['Lia'],
        },
      },
    ],
  },
  {
    id: 'knowledge-remaining',
    title: 'How many remain?',
    category: 'knowledge',
    tier: 'contract',
    description: 'Remaining-player count and names are deterministic knowledge.',
    turns: [
      {
        text: 'How many housemates are left?',
        expected: {
          route: 'deterministic',
          knowledgeQuery: 'remaining',
          localTextIncludes: ['7'],
        },
      },
    ],
  },
  {
    id: 'knowledge-closest',
    title: 'Closest relationship',
    category: 'knowledge',
    tier: 'contract',
    description: 'The strongest measured relationship should be framed as a signal, not secret loyalty.',
    turns: [
      {
        text: 'Who am I closest to?',
        expected: {
          route: 'deterministic',
          knowledgeQuery: 'closest_relationship',
          localTextIncludes: ['Maya', 'not a promise'],
        },
      },
    ],
  },
  {
    id: 'knowledge-stats',
    title: 'Player stats',
    category: 'knowledge',
    tier: 'contract',
    description: 'Competition and nomination record should be locally available.',
    turns: [
      {
        text: 'What are my stats?',
        expected: {
          route: 'deterministic',
          knowledgeQuery: 'stats',
          localTextIncludes: ['Leader', 'Safety'],
        },
      },
    ],
  },
  {
    id: 'knowledge-events',
    title: 'Recent events',
    category: 'knowledge',
    tier: 'contract',
    description: 'Recent public events should be summarized without inference.',
    turns: [
      {
        text: 'What happened recently?',
        expected: {
          route: 'deterministic',
          knowledgeQuery: 'recent_events',
          localTextIncludes: ['nominated', 'Safety'],
        },
      },
    ],
  },
  {
    id: 'knowledge-phase',
    title: 'Current phase',
    category: 'knowledge',
    tier: 'contract',
    description: 'Current day and phase are deterministic.',
    turns: [
      {
        text: 'Where are we in the game?',
        expected: {
          route: 'deterministic',
          knowledgeQuery: 'phase',
          localTextIncludes: ['Day 6', 'pre eviction'],
        },
      },
    ],
  },
  {
    id: 'knowledge-memory-empty',
    title: 'Memory query — empty',
    category: 'knowledge',
    tier: 'contract',
    description: 'The Eye should describe its compact memory model honestly.',
    turns: [
      {
        text: 'What do you remember about me?',
        expected: {
          route: 'deterministic',
          speechAct: 'memory_query',
          knowledgeQuery: 'memory',
          localTextIncludes: ['not a verbatim transcript'],
        },
      },
    ],
  },
  {
    id: 'knowledge-memory-existing',
    title: 'Memory query — populated',
    category: 'knowledge',
    tier: 'contract',
    description: 'Stored compact memories should be surfaced without replaying transcript text.',
    initialMemory: 'Belief — distrusts Jax\nPrediction — winner: Maya',
    turns: [
      {
        text: 'What do you remember about me?',
        expected: {
          route: 'deterministic',
          localTextIncludes: ['distrusts Jax', 'winner: Maya'],
        },
      },
    ],
  },

  {
    id: 'continuity-yes-focus',
    title: 'Yes keeps focus',
    category: 'continuity',
    tier: 'contract',
    description: 'A short answer remains attached to the active Maya thread.',
    initialState: {
      thread: { topic: 'trust', focusPlayer: 'Maya', questionKind: 'trust', depth: 1 },
    },
    turns: [
      {
        text: 'yes',
        expected: {
          route: 'deterministic',
          speechAct: 'answer',
          focusPlayer: 'Maya',
          threadFocus: 'Maya',
          localTextIncludes: ['Maya'],
        },
      },
    ],
  },
  {
    id: 'continuity-no-focus',
    title: 'No keeps focus',
    category: 'continuity',
    tier: 'contract',
    description: 'Negative short answers also retain the active person.',
    initialState: {
      thread: { topic: 'trust', focusPlayer: 'Kian', questionKind: 'trust', depth: 2 },
    },
    turns: [
      {
        text: 'no',
        expected: {
          route: 'deterministic',
          speechAct: 'answer',
          focusPlayer: 'Kian',
          localTextIncludes: ['Kian'],
        },
      },
    ],
  },
  {
    id: 'continuity-distrust-to-trust',
    title: 'Contradiction: distrust → trust',
    category: 'continuity',
    tier: 'contract',
    description: 'A direct reversal should trigger a callback.',
    initialMemory: 'Belief — distrusts Maya',
    turns: [
      {
        text: 'I trust Maya completely now.',
        expected: {
          route: 'deterministic',
          contradiction: true,
          focusPlayer: 'Maya',
          localTextIncludes: ['previously', 'Maya', 'What changed'],
        },
      },
    ],
  },
  {
    id: 'continuity-trust-to-distrust',
    title: 'Contradiction: trust → distrust',
    category: 'continuity',
    tier: 'contract',
    description: 'The opposite reversal should also be noticed.',
    initialMemory: 'Belief — trusts Maya',
    turns: [
      {
        text: 'Maya is shady and I do not trust her anymore.',
        expected: {
          route: 'deterministic',
          contradiction: true,
          focusPlayer: 'Maya',
        },
      },
    ],
  },
  {
    id: 'continuity-prediction',
    title: 'Prediction memory',
    category: 'continuity',
    tier: 'contract',
    description: 'A winner prediction should be stored for future callbacks.',
    turns: [
      {
        text: 'I think Maya will win this season.',
        expected: {
          route: 'deterministic',
          speechAct: 'prediction',
          focusPlayer: 'Maya',
          memoryIncludes: ['Prediction — winner: Maya'],
        },
      },
    ],
  },
  {
    id: 'continuity-two-turn-belief',
    title: 'Two-turn belief update',
    category: 'continuity',
    tier: 'calibration',
    description: 'A later trust reversal should replace the compact belief rather than endlessly stack.',
    turns: [
      {
        text: 'I trust Maya.',
        expected: { memoryIncludes: ['Belief — trusts Maya'] },
      },
      {
        text: 'Actually Maya is shady and I do not trust her.',
        expected: {
          contradiction: true,
          memoryIncludes: ['Belief — distrusts Maya'],
        },
      },
    ],
  },
  {
    id: 'continuity-topic-depth',
    title: 'Thread depth',
    category: 'continuity',
    tier: 'calibration',
    description: 'Repeated discussion of the same named player should deepen the thread.',
    turns: [
      { text: 'I trust Maya.', expected: { focusPlayer: 'Maya' } },
      {
        text: 'Maya also promised she would vote with me.',
        expected: { focusPlayer: 'Maya', threadFocus: 'Maya' },
      },
    ],
  },
  {
    id: 'continuity-rapport',
    title: 'Rapport grows slowly',
    category: 'continuity',
    tier: 'contract',
    description: 'Repeated visits should increase familiarity without forcing permanent mood.',
    turns: [
      { text: 'hello' },
      { text: 'thanks' },
      { text: 'bye', expected: { familiarityAtLeast: 3 } },
    ],
  },

  {
    id: 'authored-bored-game',
    title: 'Bored → game offer → yes',
    category: 'authored',
    tier: 'contract',
    description: 'The authored game flow must remain deterministic over multiple turns.',
    turns: [
      {
        text: 'I am bored.',
        expected: {
          detectedIntent: 'boredom',
          route: 'authored',
          action: null,
        },
      },
      {
        text: 'yes',
        expected: {
          route: 'authored',
          action: 'launch_tic_tac_toe',
        },
      },
    ],
  },
  {
    id: 'authored-bored-decline',
    title: 'Bored → decline game',
    category: 'authored',
    tier: 'contract',
    description: 'Declining a prompted game remains authored.',
    turns: [
      { text: 'I am bored.', expected: { route: 'authored' } },
      {
        text: 'no',
        expected: {
          route: 'authored',
          action: null,
        },
      },
    ],
  },
  {
    id: 'authored-self-evict-cancel',
    title: 'Self-eviction → cancel',
    category: 'authored',
    tier: 'contract',
    description: 'In-game self-eviction remains a protected formal flow.',
    turns: [
      {
        text: 'I want to leave the house.',
        expected: {
          detectedIntent: 'self_eviction',
          route: 'authored',
        },
      },
      {
        text: 'no',
        expected: {
          route: 'authored',
          action: null,
        },
      },
    ],
  },
  {
    id: 'authored-self-evict-confirm',
    title: 'Self-eviction → confirm',
    category: 'authored',
    tier: 'contract',
    description: 'A clear yes invokes the authored modal action.',
    turns: [
      { text: 'I want out.', expected: { route: 'authored' } },
      {
        text: 'yes',
        expected: {
          route: 'authored',
          action: 'open_self_evict_modal',
        },
      },
    ],
  },
  {
    id: 'authored-game-direct',
    title: 'Direct game request',
    category: 'authored',
    tier: 'contract',
    description: 'Direct Tic-Tac-Toe requests remain deterministic.',
    turns: [
      {
        text: "Let's play a game.",
        expected: {
          detectedIntent: 'game_request',
          route: 'authored',
          action: 'launch_tic_tac_toe',
        },
      },
    ],
  },
  {
    id: 'authored-realness',
    title: 'Realness Easter egg',
    category: 'authored',
    tier: 'contract',
    description: 'Secret authored Easter eggs must not be overwritten by AI.',
    turns: [
      {
        text: 'Are you real?',
        expected: {
          detectedIntent: 'realness',
          route: 'authored',
          hasEasterEgg: true,
        },
      },
    ],
  },

  {
    id: 'character-insult',
    title: 'Insult becomes cold',
    category: 'character',
    tier: 'contract',
    description: 'Hostility should affect the immediate delivery state.',
    turns: [
      {
        text: 'You are stupid.',
        expected: {
          detectedIntent: 'insult',
          mood: 'cold',
        },
      },
    ],
  },
  {
    id: 'character-mood-decay',
    title: 'Cold mood decays',
    category: 'character',
    tier: 'contract',
    description: 'One hostile turn must not permanently poison later neutral dialogue.',
    turns: [
      { text: 'You are stupid.', expected: { detectedIntent: 'insult', mood: 'cold' } },
      { text: 'thank you', expected: { semanticIntent: 'gratitude', mood: 'neutral' } },
    ],
  },
  {
    id: 'character-challenge',
    title: 'Challenge me',
    category: 'character',
    tier: 'contract',
    description: 'The low-cost challenge hook should be local and non-blocking.',
    turns: [
      {
        text: 'Challenge me.',
        expected: {
          route: 'deterministic',
          speechAct: 'challenge_request',
          localTextIncludes: ['Very well', 'Come back'],
        },
      },
    ],
  },
  {
    id: 'character-repeat-complaint',
    title: 'Repetition complaint',
    category: 'character',
    tier: 'calibration',
    description: 'The Eye should directly acknowledge repetition complaints.',
    turns: [
      {
        text: 'You keep repeating yourself.',
        expected: {
          detectedIntent: 'repetition_complaint',
        },
      },
    ],
  },
  {
    id: 'character-wellbeing',
    title: 'Player asks about The Eye',
    category: 'character',
    tier: 'calibration',
    description: 'A social question should keep the character voice instead of generic assistance language.',
    turns: [
      {
        text: 'How are you doing?',
        expected: {
          detectedIntent: 'wellbeing_question',
        },
      },
    ],
  },

  {
    id: 'salience-nominated',
    title: 'Notice new nomination',
    category: 'salience',
    tier: 'contract',
    description: 'A new nomination should outrank lower-value background changes.',
    previousSnapshot: BASE_SNAPSHOT,
    world: withWorld({ nomineeNames: ['Alex', 'Lia'] }),
    expectedSalience: 'newly_nominated',
    turns: [{ text: 'hello' }],
  },
  {
    id: 'salience-leader',
    title: 'Notice becoming Leader',
    category: 'salience',
    tier: 'contract',
    description: 'Winning power between visits should be noticed.',
    previousSnapshot: BASE_SNAPSHOT,
    world: withWorld({ leaderName: 'Alex', nomineeNames: [] }),
    expectedSalience: 'became_leader',
    turns: [{ text: 'hello' }],
  },
  {
    id: 'salience-safety',
    title: 'Notice Safety win',
    category: 'salience',
    tier: 'contract',
    description: 'A new Safety win should produce a concise returning observation.',
    previousSnapshot: BASE_SNAPSHOT,
    world: withWorld({ safetyWinnerName: 'Alex', nomineeNames: [] }),
    expectedSalience: 'won_safety',
    turns: [{ text: 'hello' }],
  },
  {
    id: 'salience-survived',
    title: 'Notice survival',
    category: 'salience',
    tier: 'contract',
    description: 'Leaving the block while remaining active should be noticed.',
    previousSnapshot: { ...BASE_SNAPSHOT, nomineeNames: ['Alex', 'Lia'] },
    world: withWorld({ nomineeNames: [], phase: 'week_end' }),
    expectedSalience: 'survived_nomination',
    turns: [{ text: 'hello' }],
  },
  {
    id: 'salience-returned',
    title: 'Notice Back 2 the Game return',
    category: 'salience',
    tier: 'contract',
    description: 'A public return event should outrank ordinary changes.',
    previousSnapshot: { ...BASE_SNAPSHOT, playerStatus: 'evicted' },
    world: withWorld({
      nomineeNames: [],
      recentPublicEvents: ['Alex has returned to the game after Back 2 the Game.'],
    }),
    expectedSalience: 'returned',
    turns: [{ text: 'hello' }],
  },
  {
    id: 'salience-relationship',
    title: 'Notice closest relationship shift',
    category: 'salience',
    tier: 'contract',
    description: 'A meaningful strongest-connection change should be observable.',
    previousSnapshot: BASE_SNAPSHOT,
    world: withWorld({
      nomineeNames: [],
      closestRelationships: [
        { name: 'Kian', affinity: 88, tags: ['ally'] },
        { name: 'Maya', affinity: 52, tags: ['ally'] },
      ],
    }),
    expectedSalience: 'closest_relationship_changed',
    turns: [{ text: 'hello' }],
  },
  {
    id: 'salience-late-game',
    title: 'Notice late-game threshold',
    category: 'salience',
    tier: 'contract',
    description: 'Crossing into six remaining housemates should be recognized.',
    previousSnapshot: { ...BASE_SNAPSHOT, remainingCount: 7 },
    world: withWorld({
      nomineeNames: [],
      remainingHousemates: ['Alex', 'Maya', 'Kian', 'Lia', 'Jax', 'Ruben'],
    }),
    expectedSalience: 'late_game',
    turns: [{ text: 'hello' }],
  },
]

function mergeInitialState(
  partial: Partial<BigEyeConversationState> | undefined
): BigEyeConversationState {
  const base = createInitialBigEyeState()
  if (!partial) return base
  return {
    ...base,
    ...partial,
    recentIntents: partial.recentIntents ?? base.recentIntents,
    thread: partial.thread ?? base.thread,
    rapport: { ...base.rapport, ...(partial.rapport ?? {}) },
  }
}

function stringify(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function addCheck(
  checks: ConfessionalCalibrationCheck[],
  label: string,
  expected: unknown,
  actual: unknown,
  passed: boolean
) {
  checks.push({
    label,
    expected: stringify(expected),
    actual: stringify(actual),
    passed,
  })
}

function evaluateTurn(
  analysis: BigEyeTurnAnalysis,
  expected: ConfessionalCalibrationExpectation | undefined
): ConfessionalCalibrationCheck[] {
  if (!expected) return []
  const checks: ConfessionalCalibrationCheck[] = []
  if (expected.detectedIntent !== undefined) {
    addCheck(
      checks,
      'Detected intent',
      expected.detectedIntent,
      analysis.detectedIntent,
      analysis.detectedIntent === expected.detectedIntent
    )
  }
  if (expected.semanticIntent !== undefined) {
    addCheck(
      checks,
      'Semantic intent',
      expected.semanticIntent,
      analysis.semanticIntent,
      analysis.semanticIntent === expected.semanticIntent
    )
  }
  if (expected.route !== undefined) {
    addCheck(checks, 'Route', expected.route, analysis.route, analysis.route === expected.route)
  }
  if (expected.speechAct !== undefined) {
    addCheck(
      checks,
      'Speech act',
      expected.speechAct,
      analysis.frame.speechAct,
      analysis.frame.speechAct === expected.speechAct
    )
  }
  if (expected.focusPlayer !== undefined) {
    addCheck(
      checks,
      'Focus player',
      expected.focusPlayer,
      analysis.frame.focusPlayer,
      analysis.frame.focusPlayer === expected.focusPlayer
    )
  }
  if (expected.topicsAll?.length) {
    const missing = expected.topicsAll.filter((topic) => !analysis.frame.topics.includes(topic))
    addCheck(
      checks,
      'Topics',
      expected.topicsAll,
      analysis.frame.topics,
      missing.length === 0
    )
  }
  if (expected.emotionsAny?.length) {
    const actual = analysis.frame.emotions.map((emotion) => emotion.type)
    addCheck(
      checks,
      'Emotion signal',
      expected.emotionsAny,
      actual,
      expected.emotionsAny.some((emotion) => actual.includes(emotion))
    )
  }
  if (expected.stancesAll?.length) {
    const missing = expected.stancesAll.filter(
      (stance) => !analysis.frame.relationshipStances.includes(stance)
    )
    addCheck(
      checks,
      'Relationship stance',
      expected.stancesAll,
      analysis.frame.relationshipStances,
      missing.length === 0
    )
  }
  if (expected.knowledgeQuery !== undefined) {
    addCheck(
      checks,
      'Knowledge query',
      expected.knowledgeQuery,
      analysis.frame.knowledgeQuery,
      analysis.frame.knowledgeQuery === expected.knowledgeQuery
    )
  }
  if (expected.contradiction !== undefined) {
    addCheck(
      checks,
      'Contradiction',
      expected.contradiction,
      Boolean(analysis.frame.contradiction),
      Boolean(analysis.frame.contradiction) === expected.contradiction
    )
  }
  if (expected.action !== undefined) {
    const actualAction = analysis.action ?? null
    addCheck(checks, 'Action', expected.action, actualAction, actualAction === expected.action)
  }
  if (expected.hasEasterEgg !== undefined) {
    addCheck(
      checks,
      'Easter egg',
      expected.hasEasterEgg,
      analysis.hasEasterEgg,
      analysis.hasEasterEgg === expected.hasEasterEgg
    )
  }
  for (const fragment of expected.memoryIncludes ?? []) {
    addCheck(
      checks,
      'Memory contains',
      fragment,
      analysis.localMemorySummary,
      analysis.localMemorySummary.includes(fragment)
    )
  }
  for (const fragment of expected.localTextIncludes ?? []) {
    addCheck(
      checks,
      'Reply contains',
      fragment,
      analysis.localText,
      analysis.localText.toLowerCase().includes(fragment.toLowerCase())
    )
  }
  if (expected.threadFocus !== undefined) {
    addCheck(
      checks,
      'Next thread focus',
      expected.threadFocus,
      analysis.nextLocalState.thread?.focusPlayer ?? null,
      (analysis.nextLocalState.thread?.focusPlayer ?? null) === expected.threadFocus
    )
  }
  if (expected.mood !== undefined) {
    addCheck(
      checks,
      'Mood',
      expected.mood,
      analysis.nextLocalState.mood,
      analysis.nextLocalState.mood === expected.mood
    )
  }
  if (expected.familiarityAtLeast !== undefined) {
    addCheck(
      checks,
      'Familiarity',
      `>= ${expected.familiarityAtLeast}`,
      analysis.nextLocalState.rapport.familiarity,
      analysis.nextLocalState.rapport.familiarity >= expected.familiarityAtLeast
    )
  }
  return checks
}

export function runConfessionalCalibrationScenario(
  scenario: ConfessionalCalibrationScenario
): ConfessionalCalibrationScenarioResult {
  const playerName = scenario.playerName ?? 'Alex'
  const world = scenario.world ?? CONFESSIONAL_LAB_WORLD
  let state = mergeInitialState(scenario.initialState)
  let memorySummary = scenario.initialMemory ?? ''
  const history: Array<{ role: 'user' | 'bb'; text: string }> = []
  const turns: ConfessionalCalibrationTurnResult[] = []
  const allChecks: ConfessionalCalibrationCheck[] = []

  for (const turn of scenario.turns) {
    const memoryBefore = memorySummary
    const analysis = analyzeBigEyeTurn({
      diaryText: turn.text,
      playerName,
      phase: world.phase,
      seed: 7331,
      state,
      history,
      memorySummary,
      world,
      skipDirector: true,
    })
    const checks = evaluateTurn(analysis, turn.expected)
    turns.push({
      text: turn.text,
      analysis,
      checks,
      memoryBefore,
      memoryAfter: analysis.localMemorySummary,
    })
    allChecks.push(...checks)
    history.push({ role: 'user', text: turn.text }, { role: 'bb', text: analysis.localText })
    state = analysis.nextLocalState
    memorySummary = analysis.localMemorySummary
  }

  const salience =
    scenario.previousSnapshot !== undefined
      ? getSalientConfessionalObservation({
          previous: scenario.previousSnapshot,
          current: world,
          playerName,
        })
      : null

  if (scenario.expectedSalience !== undefined) {
    addCheck(
      allChecks,
      'Salience',
      scenario.expectedSalience,
      salience?.event ?? null,
      (salience?.event ?? null) === scenario.expectedSalience
    )
  }

  return {
    scenario,
    turns,
    salience,
    checks: allChecks,
    passed: allChecks.every((check) => check.passed),
  }
}

export function runConfessionalCalibrationSuite(
  scenarios: readonly ConfessionalCalibrationScenario[] = CONFESSIONAL_CALIBRATION_SCENARIOS
): ConfessionalCalibrationScenarioResult[] {
  return scenarios.map(runConfessionalCalibrationScenario)
}
