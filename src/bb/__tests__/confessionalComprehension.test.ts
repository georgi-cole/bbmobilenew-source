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
  remainingHousemates: ['Alex', 'Sam', 'Jordan', 'Maya'],
  playerStats: { leaderWins: 1, safetyWins: 1, timesNominated: 3 },
  closestRelationships: [{ name: 'Maya', affinity: 82, tags: ['ally'] }],
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
})
