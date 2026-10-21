import { describe, expect, it } from 'vitest'
import {
  getDynamicInquiryCosts,
  getInquiryAttempts,
  getInquiryTopicKey,
  resolveInquiryAnswer,
} from '../socialInquiry'
import type { SocialActionDefinition } from '../socialActions'
import type { SocialInquiryRecord } from '../types'

const nominationAction = {
  id: 'ask_nomination_advice',
} as SocialActionDefinition
const opinionAction = {
  id: 'ask_player_opinion',
} as SocialActionDefinition

function record(overrides: Partial<SocialInquiryRecord> = {}): SocialInquiryRecord {
  return {
    id: 'inquiry-1',
    askerId: 'loh',
    respondentId: 'rae',
    kind: 'NOMINATION_ADVICE',
    topicKey: 'nomination:4',
    day: 4,
    phase: 'social_1',
    answerTargetIds: ['nova', 'dex'],
    answerText: 'My nomination advice is Nova and Dex.',
    tone: 'CANDID',
    hardRefused: false,
    infoAwarded: true,
    ...overrides,
  }
}

describe('social inquiry repeat handling', () => {
  it('raises energy from free/one to three on the third ask, then by one each time', () => {
    const history = [record(), record({ id: 'inquiry-2' }), record({ id: 'inquiry-3' })]
    const costs = (priorCount: number) =>
      getDynamicInquiryCosts(
        nominationAction,
        'loh',
        'rae',
        undefined,
        4,
        history.slice(0, priorCount),
        { energy: 0, influence: 3, info: 0 }
      )

    expect(costs(0)).toEqual({ energy: 0, influence: 3, info: 0 })
    expect(costs(1).energy).toBe(1)
    expect(costs(2).energy).toBe(3)
    expect(costs(3).energy).toBe(4)
    expect(
      getDynamicInquiryCosts(
        opinionAction,
        'loh',
        'rae',
        'nova',
        4,
        [record({ kind: 'PLAYER_OPINION', topicKey: 'opinion:nova:4', subjectId: 'nova' })],
        { energy: 1, influence: 2, info: 0 }
      ).energy
    ).toBe(2)
  })

  it('keeps nomination advice and opinions about different subjects on separate repeat tracks', () => {
    const history = [
      record(),
      record({
        id: 'inquiry-2',
        kind: 'PLAYER_OPINION',
        topicKey: 'opinion:nova:4',
        subjectId: 'nova',
      }),
    ]
    expect(getInquiryAttempts(history, 'loh', 'rae', 'nomination:4')).toHaveLength(1)
    expect(getInquiryTopicKey('ask_player_opinion', 'dex', 4)).toBe('opinion:dex:4')
  })

  it('lets a pressured respondent crack after a vague answer and reveal new information', () => {
    const prior = record({
      answerTargetIds: [],
      answerText: 'I am keeping my thoughts to myself for now.',
      tone: 'VAGUE',
      infoAwarded: false,
    })
    const answer = resolveInquiryAnswer({
      trueAnswerText: 'My nomination advice is Nova and Dex.',
      answerTargetIds: ['nova', 'dex'],
      priorAttempts: [prior],
      openness: 0.5,
      stress: 100,
      fear: 100,
      emotionalVolatility: 1,
      trust: 0,
      random: () => 0.1,
    })

    expect(answer.tone).toBe('CRACKED')
    expect(answer.answerText).toContain('My nomination advice is Nova and Dex.')
    expect(answer.infoReward).toBe(1)
  })

  it('repeats a stable answer without paying out information twice', () => {
    const answer = resolveInquiryAnswer({
      trueAnswerText: 'A newer answer that should not replace the stated view.',
      answerTargetIds: ['remy'],
      priorAttempts: [record()],
      openness: 0.5,
      stress: 0,
      fear: 0,
      emotionalVolatility: 0.2,
      trust: 0,
      random: () => 0.9,
    })

    expect(answer.tone).toBe('REPEATED')
    expect(answer.answerText).toContain('My nomination advice is Nova and Dex.')
    expect(answer.answerTargetIds).toEqual(['nova', 'dex'])
    expect(answer.infoReward).toBe(0)
  })

  it('walks away on the third ask and keeps refusing afterward', () => {
    const first = record()
    const second = record({ id: 'inquiry-2', tone: 'REPEATED' })
    const walkaway = resolveInquiryAnswer({
      trueAnswerText: 'unused',
      answerTargetIds: [],
      priorAttempts: [first, second],
      openness: 0.5,
      stress: 0,
      fear: 0,
      emotionalVolatility: 0,
      trust: 0,
      random: () => 0.1,
    })
    expect(walkaway.tone).toBe('REFUSED')
    expect(walkaway.hardRefused).toBe(true)

    const afterward = resolveInquiryAnswer({
      trueAnswerText: 'unused',
      answerTargetIds: [],
      priorAttempts: [first, second, record({ id: 'inquiry-3', hardRefused: true })],
      openness: 1,
      stress: 0,
      fear: 0,
      emotionalVolatility: 0,
      trust: 0,
      random: () => 0,
    })
    expect(afterward.tone).toBe('REFUSED')
    expect(afterward.answerText).toContain('Stop interrogating me')
    expect(afterward.infoReward).toBe(0)
  })
})
