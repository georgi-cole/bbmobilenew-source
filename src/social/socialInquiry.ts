import type { SocialActionDefinition } from './socialActions'
import type { SocialInquiryKind, SocialInquiryRecord } from './types'

export type InquiryActionId = 'ask_nomination_advice' | 'ask_player_opinion'

export function getInquiryKind(actionId: string): SocialInquiryKind | null {
  if (actionId === 'ask_nomination_advice') return 'NOMINATION_ADVICE'
  if (actionId === 'ask_player_opinion') return 'PLAYER_OPINION'
  return null
}

export function getInquiryTopicKey(
  actionId: string,
  subjectId: string | undefined,
  day: number
): string {
  return actionId === 'ask_nomination_advice'
    ? `nomination:${day}`
    : `opinion:${subjectId ?? 'unknown'}:${day}`
}

export function getInquiryAttempts(
  history: readonly SocialInquiryRecord[] | undefined,
  askerId: string,
  respondentId: string,
  topicKey: string
): SocialInquiryRecord[] {
  return (history ?? []).filter(
    (entry) =>
      entry.askerId === askerId &&
      entry.respondentId === respondentId &&
      entry.topicKey === topicKey
  )
}

export function getInquiryEnergyCost(baseCost: number, priorAttempts: number): number {
  if (priorAttempts <= 0) return baseCost
  if (priorAttempts === 1) return Math.max(baseCost + 1, 1)
  return Math.max(baseCost, priorAttempts + 1)
}

export function getDynamicInquiryCosts(
  action: SocialActionDefinition,
  actorId: string,
  respondentId: string,
  subjectId: string | undefined,
  day: number,
  history: readonly SocialInquiryRecord[] | undefined,
  baseCosts: { energy: number; influence: number; info: number }
): { energy: number; influence: number; info: number } {
  const kind = getInquiryKind(action.id)
  if (!kind) return baseCosts
  const topicKey = getInquiryTopicKey(action.id, subjectId, day)
  const prior = getInquiryAttempts(history, actorId, respondentId, topicKey).length
  return {
    ...baseCosts,
    energy: getInquiryEnergyCost(baseCosts.energy, prior),
  }
}

export interface InquiryAnswerInput {
  trueAnswerText: string
  answerTargetIds: string[]
  priorAttempts: readonly SocialInquiryRecord[]
  openness: number
  stress: number
  fear: number
  emotionalVolatility: number
  trust: number
  coverAnswerText?: string
  coverTargetIds?: string[]
  coverChance?: number
  conditionalOfferText?: string
  conditionalOfferTargetIds?: string[]
  conditionalOfferChance?: number
  random: () => number
}

export interface InquiryAnswerResolution {
  answerText: string
  answerTargetIds: string[]
  tone: SocialInquiryRecord['tone']
  hardRefused: boolean
  infoReward: number
}

/** Resolve pressure without treating hesitation or annoyance as proof of truth. */
export function resolveInquiryAnswer(input: InquiryAnswerInput): InquiryAnswerResolution {
  const prior = input.priorAttempts
  const latest = prior.at(-1)
  const attempt = prior.length

  if (prior.some((entry) => entry.hardRefused)) {
    return {
      answerText: 'I said I am done talking about this. Stop interrogating me.',
      answerTargetIds: latest?.answerTargetIds ?? [],
      tone: 'REFUSED',
      hardRefused: true,
      infoReward: 0,
    }
  }

  if (attempt === 0) {
    const openness = Math.max(0, Math.min(1, input.openness + input.trust / 220))
    if (input.conditionalOfferText && input.random() < (input.conditionalOfferChance ?? 0)) {
      return {
        answerText: input.conditionalOfferText,
        answerTargetIds: input.conditionalOfferTargetIds ?? [],
        tone: 'CANDID',
        hardRefused: false,
        infoReward: 1,
      }
    }
    if (input.coverAnswerText && input.random() < (input.coverChance ?? 0)) {
      return {
        answerText: input.coverAnswerText,
        answerTargetIds: input.coverTargetIds ?? [],
        tone: 'CAUTIOUS',
        hardRefused: false,
        infoReward: 1,
      }
    }
    if (input.random() > openness) {
      return {
        answerText: 'I am keeping my thoughts to myself for now.',
        answerTargetIds: [],
        tone: 'VAGUE',
        hardRefused: false,
        infoReward: 0,
      }
    }
    return {
      answerText: input.trueAnswerText,
      answerTargetIds: input.answerTargetIds,
      tone: 'CANDID',
      hardRefused: false,
      infoReward: 1,
    }
  }

  if (attempt === 1) {
    if (latest?.tone === 'VAGUE' || latest?.tone === 'CAUTIOUS') {
      const composurePressure =
        input.stress * 0.003 + input.fear * 0.002 + input.emotionalVolatility * 0.2
      const crackChance = Math.max(0.08, Math.min(0.72, composurePressure))
      if (input.random() < crackChance) {
        return {
          answerText: `All right, honestly: ${input.trueAnswerText}`,
          answerTargetIds: input.answerTargetIds,
          tone: 'CRACKED',
          hardRefused: false,
          infoReward: 1,
        }
      }
    }
    return {
      answerText: latest
        ? `I already told you: “${latest.answerText}” My view has not changed.`
        : input.trueAnswerText,
      answerTargetIds: latest?.answerTargetIds ?? input.answerTargetIds,
      tone: 'REPEATED',
      hardRefused: false,
      infoReward: 0,
    }
  }

  const walkAwayChance = Math.max(0.55, Math.min(0.92, 0.7 + input.stress * 0.002))
  if (input.random() < walkAwayChance) {
    return {
      answerText: 'I have answered you. Stop pressing me; this conversation is over.',
      answerTargetIds: latest?.answerTargetIds ?? [],
      tone: 'REFUSED',
      hardRefused: true,
      infoReward: 0,
    }
  }
  return {
    answerText: latest
      ? `I already told you: “${latest.answerText}” My view has not changed.`
      : input.trueAnswerText,
    answerTargetIds: latest?.answerTargetIds ?? input.answerTargetIds,
    tone: 'REPEATED',
    hardRefused: false,
    infoReward: 0,
  }
}
