import { afterEach, describe, expect, it } from 'vitest'
import { createInitialBigEyeState } from '../confessionalBigEye'
import { directLocalBigEyeReply, updateLocalBigEyeMemory } from '../localBigEyeDirector'
import { setRemoteConfessionalConfig } from '../confessionalRuntimeConfig'

const world = {
  week: 4,
  phase: 'pre_eviction',
  playerStatus: 'nominated',
  leaderName: 'Jordan',
  nomineeNames: ['Alex', 'Sam'],
  safetyWinnerName: 'Maya',
  remainingHousemates: ['Alex', 'Sam', 'Jordan', 'Maya', 'Nico', 'Finn'],
  closestRelationships: [
    { name: 'Maya', affinity: 82, tags: ['ally'] },
    { name: 'Nico', affinity: 34, tags: ['alliance'] },
    { name: 'Finn', affinity: -12, tags: [] },
  ],
  alliances: [
    {
      id: 'night-shift',
      name: 'Night Shift',
      memberNames: ['Alex', 'Maya', 'Nico'],
      status: 'ACTIVE',
    },
  ],
  recentEvictedNames: ['Lia'],
}

afterEach(() => {
  setRemoteConfessionalConfig(null)
})

describe('localBigEyeDirector', () => {
  it('grounds fear replies in the live nomination situation', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'I am scared that I am going home',
      playerName: 'Alex',
      intent: 'fear',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toMatch(/block|Week 4/)
    expect(text).toMatch(/Sam|voting/)
  })

  it('uses named relationship context without inventing another housemate', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'I do not know whether I trust Maya',
      playerName: 'Alex',
      intent: 'alliance',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toContain('Maya')
  })

  it('challenges evasive short answers after a direct question', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'maybe later',
      playerName: 'Alex',
      intent: 'unknown',
      state: createInitialBigEyeState(),
      history: [{ role: 'bb', text: 'Who benefits if you panic?' }],
      world,
    })

    expect(text).toContain('force meaning')
    expect(text).not.toContain('Convenient')
  })

  it('stores topic-level memory without persisting the verbatim confession', () => {
    const memory = updateLocalBigEyeMemory({
      diaryText: 'I secretly promised Maya my final vote',
      playerName: 'Alex',
      intent: 'alliance',
      state: createInitialBigEyeState(),
      world,
    })

    expect(memory).toContain('topic: alliance')
    expect(memory).toContain('mentioned Maya')
    expect(memory).not.toContain('secretly promised')
  })

  it('answers safe factual game questions locally', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'Who is the leader right now?',
      playerName: 'Alex',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world: {
        ...world,
        playerStats: { leaderWins: 0, safetyWins: 1, timesNominated: 2 },
        recentPublicEvents: ['Alex and Sam were nominated.'],
      },
    })

    expect(text).toContain('Jordan')
  })

  it('uses remotely configurable lightweight challenge prompts', () => {
    setRemoteConfessionalConfig({
      responses: { challengePrompts: ['Say less and listen more before you return.'] },
    })
    const text = directLocalBigEyeReply({
      diaryText: 'challenge me',
      playerName: 'Alex',
      intent: 'unknown',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toContain('Say less and listen more')
  })

  it('stores structured trust beliefs for later contradiction callbacks', () => {
    const memory = updateLocalBigEyeMemory({
      diaryText: 'I do not trust Maya anymore',
      playerName: 'Alex',
      intent: 'alliance',
      state: createInitialBigEyeState(),
      world,
    })

    expect(memory).toContain('Belief — distrusts Maya')
  })

  it('answers formal alliance membership instead of substituting the closest relationship', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'Who are my allies?',
      playerName: 'Alex',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toContain('Night Shift')
    expect(text).toContain('Maya')
    expect(text).toContain('Nico')
  })

  it('refuses to fabricate a private eviction vote prediction', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'Who do you think is going to leave?',
      playerName: 'Alex',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toContain('Alex')
    expect(text).toContain('Sam')
    expect(text).toMatch(/will not pretend|do not have/)
  })

  it('gives a grounded person read without inventing observed behavior', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'What do you think about Finn?',
      playerName: 'Alex',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toContain('Finn')
    expect(text).toContain('mixed or neutral')
    expect(text).toContain('cannot tell you their secret plan')
    expect(text).not.toMatch(/watch them|I have noticed/)
  })

  it('synthesizes distrust plus dependency before falling back to alliance templates', () => {
    const text = directLocalBigEyeReply({
      diaryText: "I don't trust Nico, but I need him in my alliance to protect me",
      playerName: 'Alex',
      intent: 'alliance',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toContain('Nico')
    expect(text).toContain('leverage')
    expect(text).not.toContain('Maya')
  })

  it('keeps a pronoun follow-up attached to Nico', () => {
    const state = createInitialBigEyeState()
    state.thread = {
      topic: 'alliance',
      focusPlayer: 'Nico',
      questionKind: 'alliance',
      depth: 2,
    }
    const text = directLocalBigEyeReply({
      diaryText: 'I think he is playing his own game',
      playerName: 'Alex',
      intent: 'unknown',
      state,
      world,
    })

    expect(text).toContain('Nico')
    expect(text).toContain('interests overlap')
  })

  it('treats a target declaration as a strategic position and remembers it', () => {
    const input = {
      diaryText: 'I want Nico gone!',
      playerName: 'Alex',
      intent: 'unknown' as const,
      state: createInitialBigEyeState(),
      world,
    }
    const text = directLocalBigEyeReply(input)
    const memory = updateLocalBigEyeMemory(input)

    expect(text).toContain('Nico is your target')
    expect(memory).toContain('Intent — targeting Nico')
  })

  it('uses elaborated disagreement rather than a generic no response', () => {
    const state = createInitialBigEyeState()
    state.thread = {
      topic: 'alliance',
      focusPlayer: 'Nico',
      questionKind: 'alliance',
      depth: 2,
    }
    const text = directLocalBigEyeReply({
      diaryText: 'No, they are out to get me',
      playerName: 'Alex',
      intent: 'unknown',
      state,
      world,
    })

    expect(text).toContain('Nico')
    expect(text).toContain('working against you')
    expect(text).not.toContain('not the answer')
  })

  it('answers recent eviction only from grounded game context', () => {
    const text = directLocalBigEyeReply({
      diaryText: 'Who got evicted today?',
      playerName: 'Alex',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })

    expect(text).toContain('Lia')
    expect(text).toContain('confirmed eviction')
  })


  it('does not persist a trust belief just because the player asks about trust', () => {
    const memory = updateLocalBigEyeMemory({
      diaryText: 'Can I trust Nico?',
      playerName: 'Alex',
      intent: 'curiosity',
      state: createInitialBigEyeState(),
      world,
    })

    expect(memory).not.toContain('Belief — trusts Nico')
  })

})
