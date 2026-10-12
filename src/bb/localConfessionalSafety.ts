export type LocalConfessionalSafetyCode =
  | 'empty'
  | 'too_long'
  | 'duplicate'
  | 'flood'
  | 'gibberish'
  | 'profanity'
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
  timestamp?: number
}

function normalise(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(
      /[013457@$]/g,
      (character) =>
        ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' })[
          character
        ] ?? character
    )
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
}

const PROFANITY_STEMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'prick',
  'twat',
  'motherfucker',
  'motherfuck',
  'bullshit',
  'shitshow',
  'dumbass',
  'jackass',
  'arse',
  'cock',
  'dickhead',
  'fuckface',
  'fuckwit',
  'shithead',
  'wank',
  'wanker',
  'whore',
  'slut',
  'damn',
  'hell',
] as const

function containsProfanity(normalised: string): boolean {
  return PROFANITY_STEMS.some((term) => {
    // Permit repeated letters and small punctuation or space gaps while
    // keeping word boundaries so ordinary words do not trigger the filter.
    const letters = [...term].map((letter) => letter + '+').join('[^a-z0-9]{0,2}')
    const suffix = '(?:s|es|ed|ing|er|ers|y|ty)?'
    return new RegExp('(?:^|[^a-z0-9])' + letters + suffix + '(?:$|[^a-z0-9])', 'i').test(
      normalised
    )
  })
}

function isJibberish(normalised: string): boolean {
  const compact = normalised.replace(/[^a-z]/g, '')
  if (compact.length < 24) return false
  const vowels = (compact.match(/[aeiou]/g) ?? []).length
  const keyboardMash = /(?:asdf|qwer|zxcv|hjkl|qazwsx|poiuyt){2,}/i.test(compact)
  return keyboardMash || (compact.length >= 28 && vowels / compact.length < 0.13)
}

export function isConfessionalMisconductCode(
  code: LocalConfessionalSafetyCode
): code is 'too_long' | 'duplicate' | 'flood' | 'gibberish' | 'profanity' {
  return (
    code === 'too_long' ||
    code === 'duplicate' ||
    code === 'flood' ||
    code === 'gibberish' ||
    code === 'profanity'
  )
}

export function getConfessionalMisconductResponse(strike: number): string {
  if (strike >= 3) {
    return 'The Big Eye has removed you from this season for repeated Confessional misconduct. You cannot return this season or enter the Tribunal.'
  }
  if (strike === 2) {
    return 'This is your final warning. Another abusive, spam, or deliberately nonsensical message will get you removed from this season, with no Tribunal or return.'
  }
  return 'Please keep this room respectful. I can hear anger, but abusive language, spam, and deliberate nonsense are not acceptable here.'
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
  now?: number
}): LocalConfessionalSafetyResult | null {
  const text = input.diaryText.trim()
  const normalised = normalise(text)

  if (!text) return result('empty', 'The room is quiet. Give me one thought to work with.')
  if (text.length > 500) {
    return result('too_long', 'Keep it to one short thought. I will listen more closely that way.')
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
  if (containsProfanity(normalised)) {
    return result(
      'profanity',
      'Keep this room respectful. Tell me what is bothering you without abusive language.'
    )
  }
  const now = input.now ?? Date.now()
  const recentUserTurns = (input.history ?? []).filter(
    (turn) =>
      turn.role === 'user' &&
      typeof turn.timestamp === 'number' &&
      turn.timestamp <= now &&
      now - turn.timestamp <= 10_000
  ).length
  if (recentUserTurns >= 5) {
    return result('flood', 'Slow down. Too many messages in a short time is flooding this room.')
  }
  const words = normalised.split(/\s+/).filter(Boolean)
  if (words.length >= 5 && new Set(words).size === 1 && words[0].length >= 4) {
    return result(
      'flood',
      'Slow down. Repeating the same word is spam; send one clear thought instead.'
    )
  }
  if (/(.)\1{14,}/i.test(text) || (text.length >= 24 && normalised.length < 3)) {
    return result('flood', 'Slow down. Give me one sentence I can actually answer.')
  }
  if (isJibberish(normalised)) {
    return result(
      'gibberish',
      'I cannot make sense of that. Send one clear sentence and try again.'
    )
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
