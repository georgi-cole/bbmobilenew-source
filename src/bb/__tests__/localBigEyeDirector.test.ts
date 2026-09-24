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
  remainingHousemates: ['Alex', 'Sam', 'Jordan', 'Maya'],
  closestRelationships: [{ name: 'Maya', affinity: 82, tags: ['ally'] }],
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

    expect(text).toContain('change the subject')
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
})
