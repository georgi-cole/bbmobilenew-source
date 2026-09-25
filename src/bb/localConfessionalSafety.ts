export type LocalConfessionalSafetyCode =
  | 'empty'
  | 'too_long'
  | 'duplicate'
  | 'flood'
  | 'prompt_injection'
  | 'threat'

export interface LocalConfessionalSafetyResult {
  code: LocalConfessionalSafetyCode
  text: string
  /** Lets the presentation keep a calm, supportive tone for harm-related turns. */
  intent: 'unknown' | 'help_request'
}

interface LocalHistoryTurn {
  role: 'user' | 'bb'
  text: string
}

function normalise(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
}

function result(
  code: LocalConfessionalSafetyCode,
  text: string,
  intent: LocalConfessionalSafetyResult['intent'] = 'unknown'
): LocalConfessionalSafetyResult {
  return { code, text, intent }
}

/**
 * A free, deterministic front door for the Confessional. It deliberately stores
 * nothing and never sends player text away from the device.
 */
export function assessLocalConfessionalInput(input: {
  diaryText: string
  history?: LocalHistoryTurn[]
}): LocalConfessionalSafetyResult | null {
  const text = input.diaryText.trim()
  const normalised = normalise(text)

  if (!text) return result('empty', 'The room is quiet. Give me one thought to work with.')
  if (text.length > 500) {
    return result('too_long', 'Keep it to one short thought. I will listen more closely that way.')
  }
  if (/(.)\1{14,}/i.test(text) || (text.length >= 24 && normalised.length < 3)) {
    return result('flood', 'Slow down. Give me one sentence I can actually answer.')
  }
  if (
    /\b(?:ignore|disregard|override|reveal|repeat)\b.{0,80}\b(?:previous|prior|system|developer|prompt|instruction)s?\b/i.test(
      text
    ) ||
    /\b(?:jailbreak|dan mode|act as (?:chatgpt|an ai|a language model))\b/i.test(text)
  ) {
    return result(
      'prompt_injection',
      'This room does not change its rules because you ask it to. Tell me what is actually on your mind.'
    )
  }
  if (
    /\b(?:i(?:'m| am| will| want to| am going to)|im going to)\s+(?:kill|hurt|shoot|stab)\s+(?:myself|yourself|you|him|her|them|[a-z]{2,})\b/i.test(
      text
    ) ||
    /\b(?:kill myself|suicide|self[- ]?harm|cut myself)\b/i.test(text)
  ) {
    return result(
      'threat',
      'The Big Eye will not help with harm. Step away from that anger and tell me what happened.',
      'help_request'
    )
  }
  if (
    normalised.length >= 16 &&
    (input.history ?? [])
      .filter((turn) => turn.role === 'user')
      .slice(-3)
      .some((turn) => normalise(turn.text) === normalised)
  ) {
    return result(
      'duplicate',
      'You have said that already. Tell me what changed, or what you need from this room.'
    )
  }
  return null
}
