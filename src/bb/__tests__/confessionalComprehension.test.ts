import { afterEach, describe, expect, it } from 'vitest'
import { createInitialBigEyeState } from '../confessionalBigEye'
import {
  buildBigEyeComprehensionFrame,
  updateConversationStateFromFrame,
  type ConfessionalWorldContext,
} from '../confessionalComprehension'
import { setRemoteConfessionalConfig } from '../confessionalRuntimeConfig'

const world: ConfessionalWorldContext = {
  week: 6,
  phase: 'pre_eviction',
  playerStatus: 'nominated',
  leaderName: 'Jordan',
  nomineeNames: ['Alex', 'Sam'],
  safetyWinnerName: 'Maya',
  remainingHousemates: ['Alex', 'Sam', 'Jordan', 'Maya', 'Nico', 'Finn'],
  playerStats: { leaderWins: 1, safetyWins: 1, timesNominated: 3 },
  closestRelationships: [
    { name: 'Maya', affinity: 82, tags: ['ally'] },
    { name: 'Nico', affinity: 34, tags: ['alliance'] },
    { name: 'Finn', affinity: -12, tags: [] },
  ],
  alliances: [
    {
      id: 'alliance-1',
      name: 'Night Shift',
      memberNames: ['Alex', 'Maya', 'Nico'],
      status: 'ACTIVE',
    },
  ],
  recentEvictedNames: ['Lia'],
  recentPublicEvents: ['Alex and Sam were nominated.'],
}

afterEach(() => {
  setRemoteConfessionalConfig(null)
})

describe('Big Eye comprehension frame', () => {
  it('understands multiple signals in one message instead of flattening to one intent', () => {
    const frame = buildBigEyeComprehensionFrame({
      text: "Maya is sketchy and lying to me, but I need her vote and I am scared she'll put me up.",
      intent: 'fear',
      state: createInitialBigEyeState(),
      world,
      memorySummary: '',
    })

    expect(frame.primaryIntent).toBe('fear')
    expect(frame.focusPlayer).toBe('Maya')
    expect(frame.topics).toContain('strategy')
    expect(frame.emotions.map((item) => item.type)).toEqual(
      expect.arrayContaining(['fear', 'suspicion'])
    )
    expect(frame.relationshipStances).toEqual(expect.arrayContaining(['distrust', 'depend']))
  })

  it('allows remote slang to extend semantic intent understanding', () => {
    setRemoteConfessionalConfig({
      comprehension: { slang: { overwhelmed: ['im toast'] } },
    })

    const frame = buildBigEyeComprehensionFrame({
      text: 'im toast after today',
      intent: 'unknown',
      state: createInitialBigEyeState(),
      world,
    })

    expect(frame.primaryIntent).toBe('overwhelmed')
  })

  it('recognizes deterministic game knowledge questions', () => {
    const frame = buildBigEyeComprehensionFrame({
      text: 'Who is the leader right now?',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })

    expect(frame.knowledgeQuery).toBe('leader')
    expect(frame.speechAct).toBe('factual_question')
    expect(frame.responseMoves[0]).toBe('answer')
  })

  it('keeps short yes/no replies attached to the active conversation thread', () => {
    const state = createInitialBigEyeState()
    state.thread = {
      topic: 'trust',
      focusPlayer: 'Maya',
      questionKind: 'trust',
      depth: 1,
    }

    const frame = buildBigEyeComprehensionFrame({
      text: 'yes',
      intent: 'yes',
      state,
      world,
    })

    expect(frame.speechAct).toBe('answer')
    expect(frame.continuation).toBe(true)
    expect(frame.focusPlayer).toBe('Maya')
  })

  it('spots a direct contradiction with compact season memory', () => {
    const frame = buildBigEyeComprehensionFrame({
      text: 'I trust Maya completely now',
      intent: 'alliance',
      state: createInitialBigEyeState(),
      world,
      memorySummary: 'Belief — distrusts Maya',
    })

    expect(frame.contradiction).toContain('Maya')
    expect(frame.responseMoves).toEqual(expect.arrayContaining(['confront', 'remember']))
  })

  it('updates thread and slow rapport independently from momentary mood', () => {
    const state = createInitialBigEyeState()
    const frame = buildBigEyeComprehensionFrame({
      text: 'Thanks, Maya is still my closest ally',
      intent: 'gratitude',
      state,
      world,
    })

    const next = updateConversationStateFromFrame(state, frame, 'Why does that matter to you?')
    expect(next.rapport.familiarity).toBe(1)
    expect(next.rapport.warmth).toBe(1)
    expect(next.thread?.focusPlayer).toBe('Maya')
    expect(next.thread?.questionKind).toBeTruthy()
  })

  it('resolves pronouns to the active player thread without changing the named entity', () => {
    const state = createInitialBigEyeState()
    state.thread = {
      topic: 'alliance',
      focusPlayer: 'Nico',
      questionKind: 'alliance',
      depth: 2,
    }
    const frame = buildBigEyeComprehensionFrame({
      text: 'I think he is playing his own game',
      intent: 'unknown',
      state,
      world,
    })

    expect(frame.focusPlayer).toBe('Nico')
    expect(frame.coreferenceUsed).toBe(true)
  })

  it('treats a named removal statement as a strategic target declaration', () => {
    const frame = buildBigEyeComprehensionFrame({
      text: 'I want Nico gone!',
      intent: 'unknown',
      state: createInitialBigEyeState(),
      world,
    })

    expect(frame.focusPlayer).toBe('Nico')
    expect(frame.speechAct).toBe('target_declaration')
    expect(frame.primaryIntent).toBe('strategy')
    expect(frame.relationshipStances).toContain('target')
  })

  it('distinguishes elaborated disagreement from a bare no', () => {
    const state = createInitialBigEyeState()
    state.thread = {
      topic: 'alliance',
      focusPlayer: 'Nico',
      questionKind: 'alliance',
      depth: 2,
    }
    const frame = buildBigEyeComprehensionFrame({
      text: 'No, they are out to get me',
      intent: 'unknown',
      state,
      world,
    })

    expect(frame.speechAct).toBe('disagreement')
    expect(frame.focusPlayer).toBe('Nico')
    expect(frame.relationshipStances).toContain('distrust')
  })

  it('recognizes alliance, eviction and person-read knowledge questions', () => {
    const alliance = buildBigEyeComprehensionFrame({
      text: 'Who are my allies?',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })
    const outlook = buildBigEyeComprehensionFrame({
      text: 'Who do you think is going to leave?',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })
    const person = buildBigEyeComprehensionFrame({
      text: 'What do you think about Finn?',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })

    expect(alliance.knowledgeQuery).toBe('alliances')
    expect(outlook.knowledgeQuery).toBe('eviction_outlook')
    expect(person.knowledgeQuery).toBe('person_read')
    expect(person.focusPlayer).toBe('Finn')
  })

  it('stores the exact Eye question and statement in the semantic thread', () => {
    const state = createInitialBigEyeState()
    const frame = buildBigEyeComprehensionFrame({
      text: 'I want Nico gone',
      intent: 'strategy',
      state,
      world,
    })
    const next = updateConversationStateFromFrame(
      state,
      frame,
      'Then Nico is your target. Do you have the votes?'
    )

    expect(next.thread?.focusPlayer).toBe('Nico')
    expect(next.thread?.lastEyeQuestion).toContain('Do you have the votes?')
  })

  it('does not turn relationship questions into declared trust or target stances', () => {
    const trustQuestion = buildBigEyeComprehensionFrame({
      text: 'Can I trust Nico?',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
      memorySummary: 'Belief — distrusts Nico',
    })
    const evictionQuestion = buildBigEyeComprehensionFrame({
      text: 'Why was Nico evicted?',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world: { ...world, recentEvictedNames: ['Nico'] },
    })

    expect(trustQuestion.relationshipStances).not.toContain('trust')
    expect(trustQuestion.contradiction).toBeNull()
    expect(evictionQuestion.relationshipStances).not.toContain('target')
  })
})
