import { describe, expect, it } from 'vitest'
import {
  advancePregnancyWeekendDay,
  createInitialPregnancyStoryState,
  getPregnancyEligibility,
  hasPublicPregnancyWithOtherPartner,
  normalizePregnancyStoryState,
  processPregnancyStoryDay,
  resolvePregnancyResultDay,
  revealPaternityResult,
  revealPregnancyTest,
  shouldAcceptPregnancyAttempt,
  startPregnancyAttempt,
  type PlayerLike,
  type PregnancyStoryState,
} from '../reality/pregnancy'
import gameReducer, {
  createInitialGameState,
  resolveProfileAge,
  resolveProfileSex,
  updateUserPlayerIdentity,
} from '../../store/gameSlice'
import { evaluateSocialActionEligibility } from '../socialActionEligibility'
import { SOCIAL_ACTIONS } from '../socialActions'
import { createInitialDramaSocialNetwork } from '../dramaModeEngine'

const male: PlayerLike = {
  id: 'ai-a',
  name: 'A',
  status: 'active',
  age: 28,
  sex: 'Male',
}
const female: PlayerLike = {
  id: 'ai-b',
  name: 'B',
  status: 'active',
  age: 27,
  sex: 'Female',
}

function begin(
  seed: number,
  story: PregnancyStoryState = createInitialPregnancyStoryState(),
  currentDay = 4,
  actor: PlayerLike = male,
  target: PlayerLike = female,
  finalThreeDay: number | null = 20
) {
  return startPregnancyAttempt(story, {
    actor,
    target,
    currentDay,
    story,
    romanceActive: true,
    relationshipScore: 85,
    seed,
    accepted: true,
    finalThreeDay,
  })
}

function findPositiveAttempt() {
  for (let seed = 1; seed < 5000; seed += 1) {
    const started = begin(seed)
    if (started.attempt?.pregnant) return { seed, ...started }
  }
  throw new Error('Expected to find a deterministic positive pregnancy seed')
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
      actorId: male.id,
      targetIds: [female.id],
      players: [male, female],
      relationships: { 'ai-a': { 'ai-b': { affinity: 85, tags: [] } } },
      dramaNetwork: network,
      pregnancyStory: createInitialPregnancyStoryState(),
      dramaMode: true,
      requireCompleteSelection: true,
    })
    expect(result).toEqual({ eligible: true, reason: '' })
  })

  it('requires adults and a canonical male/female pairing', () => {
    expect(
      getPregnancyEligibility({
        actor: male,
        target: female,
        currentDay: 1,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      }).eligible
    ).toBe(true)

    expect(
      getPregnancyEligibility({
        actor: { ...male, age: 17 },
        target: female,
        currentDay: 1,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      }).eligible
    ).toBe(false)

    expect(
      getPregnancyEligibility({
        actor: male,
        target: { ...female, sex: 'Male' },
        currentDay: 1,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      }).eligible
    ).toBe(false)
  })

  it('lets an unknown-sex human choose a season-local role instead of requiring profile sex', () => {
    const human: PlayerLike = {
      id: 'user',
      name: 'You',
      status: 'active',
      isUser: true,
      age: 30,
    }
    const unknown = getPregnancyEligibility({
      actor: human,
      target: female,
      currentDay: 2,
      story: createInitialPregnancyStoryState(),
      romanceActive: true,
    })
    expect(unknown).toMatchObject({ eligible: true, needsHumanRoleChoice: true })

    const chosenStory: PregnancyStoryState = {
      ...createInitialPregnancyStoryState(),
      humanRoleChoice: 'Male',
    }
    expect(
      getPregnancyEligibility({
        actor: human,
        target: female,
        currentDay: 2,
        story: chosenStory,
        romanceActive: true,
      })
    ).toMatchObject({ eligible: true, carrierId: female.id })
  })

  it(
    'keeps Try for a Baby available with Aria after a climax romance when human sex is unset',
    () => {
    const human: PlayerLike = {
      id: 'user',
      name: 'You',
      status: 'active',
      isUser: true,
      age: 30,
    }
    const aria: PlayerLike = {
      id: 'aria',
      name: 'Aria',
      status: 'active',
      age: 23,
      sex: 'Female',
    }
    const story = createInitialPregnancyStoryState()
    const pregnancyEligibility = getPregnancyEligibility({
      actor: human,
      target: aria,
      currentDay: 5,
      story,
      romanceActive: true,
      relationshipScore: 92,
    })
    expect(pregnancyEligibility).toMatchObject({
      eligible: true,
      needsHumanRoleChoice: true,
    })

    const network = createInitialDramaSocialNetwork()
    network.arcs.push({
      id: 'romance-user-aria',
      type: 'romance',
      participantIds: [human.id, aria.id],
      stage: 'climax',
      intensity: 92,
      startedWeek: 2,
      lastAdvancedWeek: 5,
      public: false,
      status: 'active',
    })
    const action = SOCIAL_ACTIONS.find((entry) => entry.id === 'try_for_baby')!
    expect(
      evaluateSocialActionEligibility({
        action,
        actorId: human.id,
        targetIds: [aria.id],
        players: [human, aria],
        relationships: { user: { aria: { affinity: 92, tags: [] } } },
        dramaNetwork: network,
        pregnancyStory: story,
        dramaMode: true,
        week: 5,
        requireCompleteSelection: true,
      })
    ).toEqual({ eligible: true, reason: '' })
    }
  )

  it('reports the adult prerequisite when the live human age is missing', () => {
    const humanWithoutAge: PlayerLike = {
      id: 'user',
      name: 'You',
      status: 'active',
      isUser: true,
    }
    const result = getPregnancyEligibility({
      actor: humanWithoutAge,
      target: female,
      currentDay: 2,
      story: createInitialPregnancyStoryState(),
      romanceActive: true,
    })
    expect(result).toEqual({
      eligible: false,
      reason: 'Both housemates must be 18 or older.',
    })
  })

  it('uses carrier age, never relationship score, for conception probability', () => {
    const younger = startPregnancyAttempt(createInitialPregnancyStoryState(), {
      actor: male,
      target: { ...female, age: 49 },
      currentDay: 4,
      story: createInitialPregnancyStoryState(),
      romanceActive: true,
      relationshipScore: -100,
      seed: 42,
      accepted: true,
      finalThreeDay: 20,
    })
    expect(younger.attempt?.positiveChance).toBe(0.5)

    const older = startPregnancyAttempt(createInitialPregnancyStoryState(), {
      actor: male,
      target: { ...female, age: 50 },
      currentDay: 4,
      story: createInitialPregnancyStoryState(),
      romanceActive: true,
      relationshipScore: 100,
      seed: 42,
      accepted: true,
      finalThreeDay: 20,
    })
    expect(older.attempt?.positiveChance).toBe(0.01)
  })

  it('compresses the +5 result window around Final 3 but never below +2', () => {
    expect(resolvePregnancyResultDay(4, 20)).toBe(9)
    expect(resolvePregnancyResultDay(4, 9)).toBe(8)
    expect(resolvePregnancyResultDay(4, 8)).toBe(7)
    expect(resolvePregnancyResultDay(4, 7)).toBe(6)
    expect(resolvePregnancyResultDay(4, 6)).toBeNull()
  })

  it('counts weekend days toward a pending pregnancy result without changing numbered game days', () => {
    const started = begin(42)
    expect(started.attempt?.attemptDay).toBe(4)
    expect(started.attempt?.resultAvailableDay).toBe(9)

    const afterWeekendDay1 = advancePregnancyWeekendDay(started.story)
    const afterWeekendDay2 = advancePregnancyWeekendDay(afterWeekendDay1)
    const attempt = afterWeekendDay2.attempts.find(
      (entry) => entry.attemptId === started.attempt!.attemptId
    )
    expect(attempt?.elapsedWeekendDays).toBe(2)

    const stillEarly = revealPregnancyTest(afterWeekendDay2, {
      attemptId: started.attempt!.attemptId,
      currentDay: 6,
    })
    expect(stillEarly.result).toMatchObject({
      tooEarly: true,
      availableDay: 7,
      changed: false,
    })

    const due = revealPregnancyTest(afterWeekendDay2, {
      attemptId: started.attempt!.attemptId,
      currentDay: 7,
    })
    expect(due.result.tooEarly).toBe(false)
  })

  it('shows the carrier self-test from Day +1 while keeping early tests inconclusive', () => {
    const started = begin(42)
    const dayAfter = getPregnancyEligibility({
      actor: female,
      target: female,
      currentDay: 5,
      story: started.story,
      action: 'PREGNANCY_TEST_SELF',
    })
    expect(dayAfter.eligible).toBe(true)

    const early = revealPregnancyTest(started.story, {
      attemptId: started.attempt!.attemptId,
      currentDay: 5,
    })
    expect(early.result.tooEarly).toBe(true)
    expect(early.result.availableDay).toBe(9)
    expect(early.result.changed).toBe(false)
  })

  it('keeps a too-late conception conceptual when no +2 result fits before Final 3', () => {
    const started = begin(42, createInitialPregnancyStoryState(), 9, male, female, 11)
    expect(started.attempt?.resultAvailableDay).toBeNull()
    const test = revealPregnancyTest(started.story, {
      attemptId: started.attempt!.attemptId,
      currentDay: 10,
    })
    expect(test.result).toMatchObject({ tooEarly: true, conceptualOnly: true, changed: false })
  })

  it('locks paternity on first successful conception even if another man tries later', () => {
    const first = findPositiveAttempt()
    const original = first.attempt!
    expect(first.story.activePregnancies[female.id]).toBe(original.attemptId)

    const secondMale: PlayerLike = {
      id: 'ai-c',
      name: 'C',
      status: 'active',
      age: 31,
      sex: 'Male',
    }
    const second = begin(first.seed + 1, first.story, 5, secondMale, female, 20)
    expect(second.attempt).not.toBeNull()
    expect(second.attempt?.pregnant).toBe(false)
    expect(second.story.activePregnancies[female.id]).toBe(original.attemptId)
    expect(original.biologicalFatherId).toBe(male.id)
  })

  it('reveals pregnancy first and ambiguous paternity later without changing the father', () => {
    const first = findPositiveAttempt()
    const secondMale: PlayerLike = {
      id: 'ai-c',
      name: 'C',
      status: 'active',
      age: 31,
      sex: 'Male',
    }
    const withSecondAttempt = begin(first.seed + 1, first.story, 5, secondMale, female, 20)
    const pregnancyId = first.attempt!.attemptId

    const privateResult = revealPregnancyTest(withSecondAttempt.story, {
      attemptId: pregnancyId,
      currentDay: first.attempt!.resultAvailableDay!,
    })
    expect(privateResult.result.attempt).toMatchObject({
      status: 'POSITIVE',
      pregnancyPublicRevealed: false,
      biologicalFatherId: male.id,
    })
    expect(privateResult.result.attempt?.plausibleFatherIds).toEqual(
      expect.arrayContaining([male.id, secondMale.id])
    )

    const publicDay = privateResult.result.attempt!.pregnancyPublicRevealDay!
    const pregnancyPublic = processPregnancyStoryDay(privateResult.story, publicDay)
    expect(pregnancyPublic.events).toHaveLength(1)
    expect(pregnancyPublic.events[0]).toMatchObject({
      kind: 'PREGNANCY_PUBLIC',
      fatherId: null,
    })

    const paternityDay = privateResult.result.attempt!.paternityRevealDay!
    const paternityPublic = processPregnancyStoryDay(pregnancyPublic.story, paternityDay)
    expect(paternityPublic.events).toHaveLength(1)
    expect(paternityPublic.events[0]).toMatchObject({
      kind: 'PATERNITY_PUBLIC',
      fatherId: male.id,
    })
  })

  it('allows a private paternity test after an ambiguous pregnancy is public', () => {
    const first = findPositiveAttempt()
    const secondMale: PlayerLike = {
      id: 'ai-c',
      name: 'C',
      status: 'active',
      age: 31,
      sex: 'Male',
    }
    const withSecondAttempt = begin(first.seed + 1, first.story, 5, secondMale, female, 20)
    const privateResult = revealPregnancyTest(withSecondAttempt.story, {
      attemptId: first.attempt!.attemptId,
      currentDay: first.attempt!.resultAvailableDay!,
    })
    const publicDay = privateResult.result.attempt!.pregnancyPublicRevealDay!
    const publicStory = processPregnancyStoryDay(privateResult.story, publicDay).story

    expect(
      getPregnancyEligibility({
        actor: female,
        target: female,
        currentDay: publicDay + 1,
        story: publicStory,
        action: 'PATERNITY_TEST_SELF',
      }).eligible
    ).toBe(true)

    const tested = revealPaternityResult(publicStory, female.id)
    expect(tested).toMatchObject({ fatherId: male.id, changed: true })
    expect(tested.attempt?.paternityResultKnown).toBe(true)
  })

  it('makes consent relationship-heavy around 75 while retaining a non-zero dramatic exception', () => {
    const ordinary: PlayerLike = {
      ...female,
      aiGameIdentity: { archetype: 'strategic_operator', temperament: 'adaptable' },
    }
    let acceptedLow = 0
    let acceptedHigh = 0
    for (let seed = 1; seed <= 200; seed += 1) {
      if (
        shouldAcceptPregnancyAttempt({
          target: ordinary,
          proposer: male,
          prospectivePartnerId: ordinary.id,
          relationshipScore: 60,
          seed,
          day: 3,
        })
      ) {
        acceptedLow += 1
      }
      if (
        shouldAcceptPregnancyAttempt({
          target: ordinary,
          proposer: male,
          prospectivePartnerId: ordinary.id,
          relationshipScore: 85,
          seed,
          day: 3,
        })
      ) {
        acceptedHigh += 1
      }
    }
    expect(acceptedHigh).toBeGreaterThan(acceptedLow)
    expect(acceptedLow).toBeGreaterThanOrEqual(0)
    expect(acceptedHigh).toBeGreaterThan(0)
  })

  it('sharply reduces but does not absolutely forbid consent after a public pregnancy elsewhere', () => {
    const first = findPositiveAttempt()
    const resolved = revealPregnancyTest(first.story, {
      attemptId: first.attempt!.attemptId,
      currentDay: first.attempt!.resultAvailableDay!,
    })
    const publicDay = resolved.result.attempt!.pregnancyPublicRevealDay!
    const publicStory = processPregnancyStoryDay(resolved.story, publicDay).story
    expect(hasPublicPregnancyWithOtherPartner(publicStory, male.id, 'ai-c')).toBe(true)

    const newPartner: PlayerLike = {
      id: 'ai-c',
      name: 'C',
      status: 'active',
      age: 29,
      sex: 'Female',
      aiGameIdentity: { archetype: 'chaos_agent', temperament: 'impulsive' },
    }

    let accepted = 0
    for (let seed = 1; seed <= 500; seed += 1) {
      if (
        shouldAcceptPregnancyAttempt({
          target: newPartner,
          proposer: male,
          prospectivePartnerId: newPartner.id,
          story: publicStory,
          relationshipScore: 98,
          seed,
          day: publicDay + 1,
        })
      ) {
        accepted += 1
      }
    }
    expect(accepted).toBeGreaterThan(0)
    expect(accepted).toBeLessThan(500)
  })

  it('keeps ages and sex on a generated production roster', async () => {
    const { createInitialGameState } = await import('../../store/gameSlice')
    const generated = createInitialGameState({ seed: 9081 })
    const aiPlayers = generated.players.filter((player) => !player.isUser)
    expect(aiPlayers.length).toBeGreaterThan(0)
    expect(aiPlayers.every((player) => Number.isFinite(player.age))).toBe(true)
    expect(aiPlayers.every((player) => player.sex === 'Male' || player.sex === 'Female')).toBe(true)
  })

  it('resolves numeric ages from profile age ranges', () => {
    expect(resolveProfileAge('mid-20s')).toBe(25)
    expect(resolveProfileAge('52')).toBe(52)
  })

  it('resolves profile sex only when explicit or unambiguous reproductive metadata exists', () => {
    expect(resolveProfileSex('Male')).toBe('Male')
    expect(resolveProfileSex(undefined, { canCausePregnancy: true })).toBe('Male')
    expect(resolveProfileSex(undefined, { canBecomePregnant: true })).toBe('Female')
    expect(
      resolveProfileSex(undefined, {
        canBecomePregnant: true,
        canCausePregnancy: true,
      })
    ).toBeUndefined()
  })

  it('synchronizes edited age, sex, and reproductive metadata into the live human player', () => {
    const state = createInitialGameState({ seed: 9081 })
    const human = state.players.find((player) => player.isUser)!
    delete human.age
    delete human.sex
    delete human.reproductiveProfile

    const updated = gameReducer(
      state,
      updateUserPlayerIdentity({
        name: human.name,
        avatar: human.avatar,
        age: 30,
        sex: 'Male',
        reproductiveProfile: {
          canBecomePregnant: false,
          canCausePregnancy: true,
        },
      })
    )
    expect(updated.players.find((player) => player.isUser)).toMatchObject({
      age: 30,
      sex: 'Male',
      reproductiveProfile: {
        canBecomePregnant: false,
        canCausePregnancy: true,
      },
    })

    const cleared = gameReducer(
      updated,
      updateUserPlayerIdentity({
        name: human.name,
        avatar: human.avatar,
        age: null,
        sex: null,
        reproductiveProfile: null,
      })
    )
    const clearedHuman = cleared.players.find((player) => player.isUser)!
    expect(clearedHuman.age).toBeUndefined()
    expect(clearedHuman.sex).toBeUndefined()
    expect(clearedHuman.reproductiveProfile).toBeUndefined()
  })

  it('normalizes persisted story state and preserves the hidden conception lock', () => {
    const first = findPositiveAttempt()
    const saved = normalizePregnancyStoryState(JSON.parse(JSON.stringify(first.story)))
    expect(saved.activePregnancies[female.id]).toBe(first.attempt!.attemptId)
    expect(saved.attempts[0]?.biologicalFatherId).toBe(male.id)
  })
})
