import { describe, expect, it } from 'vitest'
import {
  createInitialRealityDomainState,
  memoryRecallScore,
  remember,
  retrieveMemories,
  MAX_REALITY_MEMORIES_PER_ACTOR,
} from '../reality'
import type { RealityMemory } from '../reality'
import { produce } from 'immer'

describe('Reality memory ordering', () => {
  it('matches filtered recall across days, caller mutations, and in-transaction updates', () => {
    const initial = createInitialRealityDomainState()
    initial.memoriesByOwner.actor = Array.from(
      { length: 160 },
      (_, i) =>
        ({
          id: `memory-${i}`,
          ownerId: 'actor',
          day: i % 12,
          recallStrength: (i % 9) / 9,
          importance: (i % 7) / 7,
          emotionalIntensity: 0.6,
          strategicRelevance: 0.8,
          participantIds: [i % 2 ? 'one' : 'two'],
          tags: [i % 3 ? 'ordinary' : 'anchor'],
        }) as RealityMemory
    )
    const frozen = produce(initial, () => undefined)
    const query = { participantIds: ['one'], tags: ['anchor'], limit: 15 }
    const expected = (state: typeof frozen, day: number) =>
      state.memoriesByOwner.actor
        .filter((memory) => memory.participantIds.includes('one') || memory.tags.includes('anchor'))
        .sort(
          (a, b) =>
            memoryRecallScore(b, day) - memoryRecallScore(a, day) || a.id.localeCompare(b.id)
        )
        .slice(0, 15)
    for (const day of [12, 30, 12]) {
      expect(retrieveMemories(frozen, 'actor', { ...query, day })).toEqual(expected(frozen, day))
      retrieveMemories(frozen, 'actor', { ...query, day }).pop()
      expect(retrieveMemories(frozen, 'actor', { ...query, day })).toEqual(expected(frozen, day))
    }
    produce(frozen, (draft) => {
      draft.memoriesByOwner.actor[0].recallStrength = 10
      expect(retrieveMemories(draft, 'actor', { ...query, day: 12 })).toEqual(expected(draft, 12))
      const recalled = retrieveMemories(draft, 'actor', { ...query, day: 12 })[0]
      const original = draft.memoriesByOwner.actor.find((memory) => memory.id === recalled.id)
      expect(recalled).toBe(original)
      recalled.recallStrength = 0.25
      expect(original?.recallStrength).toBe(0.25)
    })
    const mutable = structuredClone(frozen)
    retrieveMemories(mutable, 'actor', { ...query, day: 12 })
    mutable.memoriesByOwner.actor[0].recallStrength = 10
    expect(retrieveMemories(mutable, 'actor', { ...query, day: 12 })).toEqual(expected(mutable, 12))
    for (const invalid of [NaN, Infinity]) {
      mutable.memoriesByOwner.actor[0].recallStrength = invalid
      expect(retrieveMemories(mutable, 'actor', { ...query, day: 12 })).toEqual(
        expected(mutable, 12)
      )
    }
  })
  it('retains earlier changes from the same transaction and unchanged memory records', () => {
    const memory = {
      id: 'existing',
      ownerId: 'actor',
      day: 1,
      recallStrength: 1,
      importance: 0.8,
      emotionalIntensity: 0.6,
      strategicRelevance: 1,
    } as RealityMemory
    const initial = createInitialRealityDomainState()
    remember(initial, memory)
    const next = produce(initial, (draft) => {
      draft.memoriesByOwner.actor[0].recallStrength = 0.5
      remember(draft, { ...memory, id: 'second' })
      remember(draft, { ...memory, id: 'third' })
    })
    expect(next.memoriesByOwner.actor.map((entry) => entry.id).sort()).toEqual([
      'existing',
      'second',
      'third',
    ])
    expect(
      next.memoriesByOwner.actor.find((entry) => entry.id === 'existing')?.recallStrength
    ).toBe(0.5)
    const extended = produce(next, (draft) => remember(draft, { ...memory, id: 'fourth' }))
    for (const entry of next.memoriesByOwner.actor)
      expect(extended.memoriesByOwner.actor.find((candidate) => candidate.id === entry.id)).toBe(
        entry
      )
  })
  it('matches the prior comparison and retention exactly through a long seeded sequence', () => {
    let seed = 424242
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    let domain = createInitialRealityDomainState()
    let expected: RealityMemory[] = []
    for (let i = 0; i < 600; i++) {
      const memory = {
        id: `memory-${i % 340}`,
        ownerId: 'actor',
        day: Math.floor(random() * 45),
        recallStrength: random(),
        importance: random(),
        emotionalIntensity: random(),
        strategicRelevance: random(),
      } as RealityMemory
      const index = expected.findIndex((entry) => entry.id === memory.id)
      if (index >= 0) expected[index] = memory
      else expected.push(memory)
      expected = expected
        .sort(
          (a, b) =>
            memoryRecallScore(a, Math.max(a.day, b.day)) -
              memoryRecallScore(b, Math.max(a.day, b.day)) || a.id.localeCompare(b.id)
        )
        .slice(-MAX_REALITY_MEMORIES_PER_ACTOR)
      domain = produce(domain, (draft) => remember(draft, memory))
      expect(domain.memoriesByOwner.actor).toEqual(expected)
    }
  })
})
