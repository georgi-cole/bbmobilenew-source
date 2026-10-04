import { describe, expect, it } from 'vitest'
import {
  advancePregnancyWeekendDay,
  createInitialPregnancyStoryState,
  getActivePregnancyAttempt,
  getPregnancyEligibility,
  hasPublicPregnancyWithOtherPartner,
  normalizePregnancyStoryState,
  pregnancyNewsLeakChance,
  processPregnancyStoryDay,
  recordPregnancyNewsShare,
  revealPregnancyNewsLeak,
  resolvePregnancyResultDay,
  revealPaternityResult,
  revealPregnancyTest,
  shouldAcceptPregnancyAttempt,
  shouldLeakPregnancyNews,
  startPregnancyAttempt,
  type PlayerLike,
  type PregnancyStoryState,
} from '../reality/pregnancy'
import gameReducer, {
  createInitialGameState,
  resolveProfileAge,
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
    const resultRevealedDay = privateResult.result.attempt?.resultRevealedDay
    expect(typeof resultRevealedDay).toBe('number')
    expect(privateResult.result.attempt?.pregnancyPublicRevealDay).toBe(
      (resultRevealedDay ?? -1) + 1
    )
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

  it('records private pregnancy shares and makes a leak public immediately', () => {
    const first = findPositiveAttempt()
    const pregnancyId = first.attempt!.attemptId
    const confirmed = revealPregnancyTest(first.story, {
      attemptId: pregnancyId,
      currentDay: first.attempt!.resultAvailableDay!,
    })
    const shared = recordPregnancyNewsShare(confirmed.story, {
      attemptId: pregnancyId,
      recipientIds: ['friend-a', 'friend-b', 'friend-a'],
      day: confirmed.result.attempt!.resultRevealedDay!,
    })
    const active = getActivePregnancyAttempt(shared, female.id)!
    expect(active.pregnancyNewsSharedWithIds).toEqual(['friend-a', 'friend-b'])

    const leaked = revealPregnancyNewsLeak(shared, {
      attemptId: pregnancyId,
      leakerId: 'friend-b',
      day: 9,
    })
    expect(getActivePregnancyAttempt(leaked, female.id)).toMatchObject({
      pregnancyPublicRevealed: true,
      pregnancyPublicRevealDay: 9,
      pregnancyNewsLeakedById: 'friend-b',
    })
    expect(pregnancyNewsLeakChance(90)).toBeLessThan(pregnancyNewsLeakChance(20))
    expect(
      shouldLeakPregnancyNews({
        seed: 42,
        day: 9,
        attemptId: pregnancyId,
        recipientId: 'friend-b',
        loyalty: 40,
      })
    ).toBe(
      shouldLeakPregnancyNews({
        seed: 42,
        day: 9,
        attemptId: pregnancyId,
        recipientId: 'friend-b',
        loyalty: 40,
      })
    )
  })

  it('offers Share Pregnancy News only for a confirmed, still-private pregnancy', () => {
    const first = findPositiveAttempt()
    const pregnancyId = first.attempt!.attemptId
    const confirmed = revealPregnancyTest(first.story, {
      attemptId: pregnancyId,
      currentDay: first.attempt!.resultAvailableDay!,
    })
    const action = SOCIAL_ACTIONS.find((entry) => entry.id === 'share_pregnancy_news')!
    const eligible = evaluateSocialActionEligibility({
      action,
      actorId: female.id,
      targetIds: [male.id],
      players: [male, female],
      pregnancyStory: confirmed.story,
      dramaMode: true,
      requireCompleteSelection: true,
    })
    expect(eligible).toEqual({ eligible: true, reason: '' })

    const shared = recordPregnancyNewsShare(confirmed.story, {
      attemptId: pregnancyId,
      recipientIds: [male.id],
      day: confirmed.result.attempt!.resultRevealedDay!,
    })
    const alreadyTold = evaluateSocialActionEligibility({
      action,
      actorId: female.id,
      targetIds: [male.id],
      players: [male, female],
      pregnancyStory: shared,
      dramaMode: true,
      requireCompleteSelection: true,
    })
    expect(alreadyTold.eligible).toBe(false)
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

  it('uses a newly edited profile age for an in-progress adult romance', () => {
    const game = createInitialGameState({ seed: 9082 })
    const human = game.players.find((player) => player.isUser)!
    const partner = game.players.find((player) => !player.isUser && player.sex !== human.sex)!
    delete human.age

    const updated = gameReducer(
      game,
      updateUserPlayerIdentity({ name: human.name, avatar: human.avatar, age: '28' })
    )
    const adult = updated.players.find((player) => player.isUser)!
    expect(adult.age).toBe(28)
    expect(
      getPregnancyEligibility({
        actor: adult,
        target: partner,
        currentDay: 4,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      }).reason
    ).not.toBe('Both housemates must be 18 or older.')

    const minor = gameReducer(
      updated,
      updateUserPlayerIdentity({ name: adult.name, avatar: adult.avatar, age: '17' })
    )
    expect(
      getPregnancyEligibility({
        actor: minor.players.find((player) => player.isUser)!,
        target: partner,
        currentDay: 4,
        story: createInitialPregnancyStoryState(),
        romanceActive: true,
      }).eligible
    ).toBe(false)
  })

  it('normalizes persisted story state and preserves the hidden conception lock', () => {
    const first = findPositiveAttempt()
    const saved = normalizePregnancyStoryState(JSON.parse(JSON.stringify(first.story)))
    expect(saved.activePregnancies[female.id]).toBe(first.attempt!.attemptId)
    expect(saved.attempts[0]?.biologicalFatherId).toBe(male.id)
  })
})
