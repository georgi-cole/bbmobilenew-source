import { describe, expect, it } from 'vitest'

import {
  buildBaseAiAnswers,
  buildPeekPreview,
  buildPollEstimate,
  countAnswerDistribution,
  initializeDiceDuel,
  initializeThreeWayDice,
  pickAiDuelNumber,
  pickMajorityRulesQuestion,
  resolveDiceDuelRoll,
  resolveMajorityRulesBallot,
  resolveThreeWayDiceRoll,
  simulateMajorityRulesBallot,
  type MajorityRulesHintInventory,
  type MajorityRulesQuestion,
  type MajorityRulesQuestionOption,
} from '../src/features/majorityRules/helpers'

const QUESTION: MajorityRulesQuestion = {
  id: 'q-majority-rules-audit',
  prompt: 'What would most people choose?',
  options: [
    { id: 'a', label: 'A', text: 'Alpha', baseBias: 0.92 },
    { id: 'b', label: 'B', text: 'Beta', baseBias: 0.66 },
    { id: 'c', label: 'C', text: 'Gamma', baseBias: 0.24 },
  ] as [MajorityRulesQuestionOption, MajorityRulesQuestionOption, MajorityRulesQuestionOption],
}

const EXHAUSTED_INVENTORY: MajorityRulesHintInventory = {
  pollHintUsed: true,
  peekTwoUsed: true,
  followPlayerUsed: true,
}

describe('Majority Rules', () => {
  it('keeps question selection and polls deterministic', () => {
    const picked = pickMajorityRulesQuestion(12, 1, [])
    expect(picked.options).toHaveLength(3)
    expect(picked.options.map((option) => option.id)).toEqual(['a', 'b', 'c'])
    expect(picked.options.map((option) => option.label)).toEqual(['A', 'B', 'C'])
    expect(pickMajorityRulesQuestion(12, 1, [])).toEqual(picked)

    const distribution = countAnswerDistribution(
      { p1: 'a', p2: 'b', p3: 'a', p4: 'c' },
      QUESTION.options
    )
    expect(distribution).toEqual({ a: 2, b: 1, c: 1 })

    const poll = buildPollEstimate(distribution, 99, 2, 'viewer')
    expect(Object.keys(poll)).toEqual(['a', 'b', 'c'])
    expect(Object.values(poll).reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it('resolves ballots across unanimous, distinct-minority, and split states', () => {
    const unanimous = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3'],
      answers: { p1: 'a', p2: 'a', p3: 'a' },
      question: QUESTION,
      eliminationCount: 1,
    })
    expect(unanimous.kind).toBe('unanimous')
    expect(unanimous.eliminatedIds).toEqual([])

    const splitMinority = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'p4'],
      answers: { p1: 'a', p2: 'a', p3: 'b', p4: 'c' },
      question: QUESTION,
      eliminationCount: 2,
    })
    expect(splitMinority.kind).toBe('split')
    expect(splitMinority.eliminatedIds).toEqual([])
    expect(splitMinority.tiedOptionIds.sort()).toEqual(['b', 'c'])

    const tiedLeaders = resolveMajorityRulesBallot({
      activeIds: ['p1', 'p2', 'p3', 'p4'],
      answers: { p1: 'a', p2: 'a', p3: 'b', p4: 'b' },
      question: QUESTION,
      eliminationCount: 1,
    })
    expect(tiedLeaders.kind).toBe('split')
    expect(tiedLeaders.eliminatedIds).toEqual([])
    expect(tiedLeaders.tiedOptionIds.sort()).toEqual(['a', 'b'])
  })

  it('never re-votes a 6–6–0 tie; zero-vote answers do not count as a minority', () => {
    const activeIds = Array.from({ length: 12 }, (_, i) => `p${i + 1}`)
    const answers = Object.fromEntries(activeIds.map((id, i) => [id, i < 6 ? 'a' : 'b']))
    const result = resolveMajorityRulesBallot({
      activeIds,
      answers,
      question: QUESTION,
      eliminationCount: 1,
    })
    expect(result.kind).toBe('split')
    expect(result.distribution).toEqual({ a: 6, b: 6, c: 0 })
    expect(result.eliminatedIds).toEqual([])
    expect(result.tiedOptionIds).toEqual(['a', 'b'])
  })

  it('moves on with no elimination when all three populated groups tie', () => {
    const activeIds = Array.from({ length: 12 }, (_, i) => `p${i + 1}`)
    const answers = Object.fromEntries(
      activeIds.map((id, i) => [id, i < 4 ? 'a' : i < 8 ? 'b' : 'c'])
    )
    const result = resolveMajorityRulesBallot({
      activeIds,
      answers,
      question: QUESTION,
      eliminationCount: 1,
    })
    expect(result.kind).toBe('split')
    expect(result.eliminatedIds).toEqual([])
  })

  it('eliminates only a unique small populated minority, not a large or tied group', () => {
    const activeIds = Array.from({ length: 12 }, (_, i) => `p${i + 1}`)
    const election = (a: number, b: number) => {
      const answers = Object.fromEntries(
        activeIds.map((id, i) => [id, i < a ? 'a' : i < a + b ? 'b' : 'c'])
      )
      return resolveMajorityRulesBallot({
        activeIds,
        answers,
        question: QUESTION,
        eliminationCount: 1,
      })
    }
    const oneOut = election(6, 5)
    expect(oneOut.kind).toBe('elimination')
    expect(oneOut.eliminatedIds).toEqual(['p12'])

    const twoOut = election(7, 3)
    expect(twoOut.kind).toBe('elimination')
    expect(twoOut.eliminatedIds).toEqual(['p11', 'p12'])

    const tiedBottom = election(10, 1)
    expect(tiedBottom.kind).toBe('split')
    expect(tiedBottom.eliminatedIds).toEqual([])
  })

  it('applies hint-aware simulation without breaking the human vote', () => {
    const activeIds = ['human', 'ai-1', 'ai-2', 'ai-3']
    const blockedAnswers = { 'ai-2': 'c' }
    const baseAiAnswers = buildBaseAiAnswers({
      activeIds,
      humanPlayerId: 'human',
      seed: 11,
      roundNumber: 1,
      question: QUESTION,
      previousDistribution: { a: 2, b: 1, c: 1 },
      blockedAnswers,
    })

    expect(Object.keys(baseAiAnswers).sort()).toEqual(['ai-1', 'ai-2', 'ai-3'])
    expect(baseAiAnswers['ai-2']).not.toBe('c')

    const preview = buildPeekPreview({
      activeIds,
      viewerId: 'human',
      seed: 11,
      roundNumber: 1,
      question: QUESTION,
      baseAiAnswers,
      blockedAnswers,
    })
    expect(Object.keys(preview).length).toBeLessThanOrEqual(2)
    expect(preview.human).toBeUndefined()

    const simulation = simulateMajorityRulesBallot({
      activeIds,
      humanPlayerId: 'human',
      humanAnswer: 'b',
      humanHint: null,
      inventories: {
        'ai-1': { ...EXHAUSTED_INVENTORY },
        'ai-2': { ...EXHAUSTED_INVENTORY },
        'ai-3': { ...EXHAUSTED_INVENTORY },
      },
      seed: 11,
      roundNumber: 1,
      question: QUESTION,
      previousDistribution: { a: 2, b: 1, c: 1 },
      blockedAnswers,
    })

    expect(simulation.aiHintDecision).toBeNull()
    expect(simulation.answers.human).toBe('b')
    expect(Object.values(simulation.distribution).reduce((sum, value) => sum + value, 0)).toBe(4)
  })

  it('keeps the dice tie-break helpers deterministic', () => {
    const duel = initializeDiceDuel(['alice', 'bob'])
    expect(duel.currentRollerId).toBe('alice')
    expect(pickAiDuelNumber(7, 'alice', [1, 2, 3])).toBeGreaterThanOrEqual(4)
    expect(pickAiDuelNumber(7, 'alice', [1, 2, 3])).toBeLessThanOrEqual(6)

    const duelWithChoice = {
      ...duel,
      chosenNumbers: { alice: 3, bob: 5 },
    }
    const result = resolveDiceDuelRoll(duelWithChoice, 99)
    expect(result.duel.turnCount).toBe(1)
    expect(result.duel.lastRoll).toBeTruthy()
    expect(result.duel.lastRoll?.playerId).toBe('alice')
    expect(result.duel.lastRoll?.value).toBeGreaterThanOrEqual(1)
    expect(result.duel.lastRoll?.value).toBeLessThanOrEqual(6)

    let threeWay = initializeThreeWayDice(['a', 'b', 'c'])
    threeWay = {
      ...threeWay,
      chosenNumbers: { a: 1, b: 2, c: 3 },
    }
    const step1 = resolveThreeWayDiceRoll(threeWay, 7)
    const step2 = resolveThreeWayDiceRoll(step1.duel, 7)
    const step3 = resolveThreeWayDiceRoll(step2.duel, 7)
    expect(step3.duel.roundCount).toBe(1)
    expect(step3.duel.lastRoundResult).not.toBeNull()
  })
})
