import { describe, expect, it } from 'vitest'
import {
  createInitialPregnancyStoryState,
  getPregnancyEligibility,
  normalizePregnancyStoryState,
  revealPregnancyTest,
  startPregnancyAttempt,
  type PlayerLike,
} from '../reality/pregnancy'
import { evaluateSocialActionEligibility } from '../socialActionEligibility'
import { SOCIAL_ACTIONS } from '../socialActions'
import { createInitialDramaSocialNetwork } from '../dramaModeEngine'

const actor: PlayerLike = {
  id: 'ai-a',
  name: 'A',
  status: 'active',
  age: 28,
  sex: 'Male',
}
const target: PlayerLike = {
  id: 'ai-b',
  name: 'B',
  status: 'active',
  age: 27,
  sex: 'Female',
}

function begin(seed: number, story = createInitialPregnancyStoryState()) {
  return startPregnancyAttempt(story, {
    actor,
    target,
    currentDay: 4,
    story,
    romanceActive: true,
    relationshipScore: 20,
    seed,
    accepted: true,
  })
}

describe('Reality pregnancy lifecycle', () => {
  it('exposes Try for a Baby only for an established adult romance', () => {
    const network = createInitialDramaSocialNetwork()
    network.arcs.push({
      id: 'romance-a-b',
      type: 'romance',
      participantIds: ['ai-a', 'ai-b'],
      stage: 'established',
      intensity: 70,
      startedWeek: 1,
      lastAdvancedWeek: 1,
      public: false,
      status: 'active',
    })
    const action = SOCIAL_ACTIONS.find((entry) => entry.id === 'try_for_baby')!
    const result = evaluateSocialActionEligibility({
      action,
      actorId: actor.id,
      targetIds: [target.id],
      players: [actor, target],
      relationships: { 'ai-a': { 'ai-b': { affinity: 20, tags: [] } } },
      dramaNetwork: network,
      pregnancyStory: createInitialPregnancyStoryState(),
      dramaMode: true,
      requireCompleteSelection: true,
    })
    expect(result).toEqual({ eligible: true, reason: '' })
  })

  it('requires two adults in an active romance and rejects under-18 participants', () => {
    expect(
      getPregnancyEligibility({
        actor,
        target,
        currentDay: 1,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      }).eligible
    ).toBe(true)

    expect(
      getPregnancyEligibility({
        actor: { ...actor, age: 17 },
        target,
        currentDay: 1,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      })
    ).toMatchObject({ eligible: false })
  })

  it('rolls once at attempt time and keeps the result through repeated tests', () => {
    const started = begin(42)
    expect(started.attempt).not.toBeNull()
    const attempt = started.attempt!
    expect(attempt.attemptDay).toBe(4)
    expect(attempt.resultAvailableDay).toBe(9)
    expect(attempt.positiveChance).toBe(0.5)
    expect(attempt.pregnant).toBe(attempt.roll < attempt.positiveChance)

    const olderCarrier = startPregnancyAttempt(createInitialPregnancyStoryState(), {
      actor,
      target: { ...target, age: 50 },
      currentDay: 4,
      story: createInitialPregnancyStoryState(),
      romanceActive: true,
      relationshipScore: 1,
      seed: 42,
      accepted: true,
    })
    expect(olderCarrier.attempt?.positiveChance).toBe(0.01)

    const youngerCarrier = startPregnancyAttempt(createInitialPregnancyStoryState(), {
      actor,
      target: { ...target, age: 49 },
      currentDay: 4,
      story: createInitialPregnancyStoryState(),
      romanceActive: true,
      relationshipScore: 99,
      seed: 42,
      accepted: true,
    })
    expect(youngerCarrier.attempt?.positiveChance).toBe(0.5)

    const tooEarly = revealPregnancyTest(started.story, {
      attemptId: attempt.attemptId,
      currentDay: 8,
    })
    expect(tooEarly.result.tooEarly).toBe(true)

    const first = revealPregnancyTest(started.story, {
      attemptId: attempt.attemptId,
      currentDay: 9,
    })
    const second = revealPregnancyTest(first.story, {
      attemptId: attempt.attemptId,
      currentDay: 12,
    })
    expect(first.result.attempt?.pregnant).toBe(attempt.pregnant)
    expect(second.result.attempt?.pregnant).toBe(attempt.pregnant)
    expect(second.result.changed).toBe(false)
  })

  it('allows a fresh attempt after a negative result and preserves the attempt id', () => {
    let seed = 1
    let first = begin(seed)
    while (first.attempt?.pregnant && seed < 1000) first = begin(++seed)
    expect(first.attempt?.pregnant).toBe(false)
    const revealed = revealPregnancyTest(first.story, {
      attemptId: first.attempt!.attemptId,
      currentDay: 9,
    })
    const second = begin(seed + 1, revealed.story)
    expect(second.attempt).not.toBeNull()
    expect(second.attempt?.attemptId).not.toBe(first.attempt?.attemptId)
    expect(second.story.attempts).toHaveLength(2)
  })

  it('still reveals a persisted attempt after the relationship or house status changes', () => {
    const started = begin(9)
    const saved = normalizePregnancyStoryState(JSON.parse(JSON.stringify(started.story)))
    const resolved = revealPregnancyTest(saved, {
      attemptId: started.attempt!.attemptId,
      currentDay: 9,
    })
    expect(resolved.result.attempt?.resultKnown).toBe(true)
  })

  it('requires a canonical male/female pairing and rejects unknown or same-sex roles', () => {
    expect(
      getPregnancyEligibility({
        actor: { ...actor, sex: 'Unknown' },
        target,
        currentDay: 1,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      }).eligible
    ).toBe(false)
    expect(
      getPregnancyEligibility({
        actor,
        target: { ...target, sex: 'Male' },
        currentDay: 1,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      }).eligible
    ).toBe(false)
  })

  it('keeps ages and sex on a generated production roster', async () => {
    const { createInitialGameState } = await import('../../store/gameSlice')
    const generated = createInitialGameState({ seed: 9081 })
    const aiPlayers = generated.players.filter((player) => !player.isUser)
    expect(aiPlayers.length).toBeGreaterThan(0)
    expect(aiPlayers.every((player) => Number.isFinite(player.age))).toBe(true)
    expect(aiPlayers.every((player) => player.sex === 'Male' || player.sex === 'Female')).toBe(true)
  })
})
