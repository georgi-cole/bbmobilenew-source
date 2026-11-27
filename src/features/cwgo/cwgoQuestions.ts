import bundledBank from '../../../content/cwgo.json'

export type CwgoAnswerMode = 'common_knowledge' | 'exact_fact' | 'estimate'

export type CwgoQuestion = {
  id: string
  prompt: string
  answer: number
  unit?: string
  min?: number
  max?: number
  difficulty: 1 | 2 | 3 | 4 | 5
  /**
   * Describes how a human would realistically approach the answer.
   *
   * - common_knowledge: almost everyone knows the exact value; speed is the
   *   main differentiator and rare misses use only plausible misconceptions.
   * - exact_fact: a contestant either recalls the exact value or estimates it.
   * - estimate: continuous numeric variation is expected and strategically
   *   answering below one's estimate is valid gameplay.
   */
  answerMode: CwgoAnswerMode
  /** Explicit human-like wrong answers used when exact knowledge fails. */
  plausibleMistakes?: number[]
  /**
   * Optional input scaling hint for very large answers.
   * When set, the UI lets users enter a decimal (e.g. "4.5") and selects a
   * multiplier (thousand / million / billion / trillion) to produce the full
   * numeric answer internally.
   * The value is the "natural" scale for this question's answer
   * (e.g. 1_000_000 means the answer is best expressed in millions).
   */
  scale?: number
}

/** Increment when the remotely hosted question-bank contract changes. */
export const CWGO_QUESTION_BANK_SCHEMA_VERSION = 1

const ANSWER_MODES = new Set(['common_knowledge', 'exact_fact', 'estimate'])
const INPUT_SCALES = new Set([1_000, 1_000_000, 1_000_000_000, 1_000_000_000_000])

function validGuess(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  )
}

export function parseCwgoQuestions(raw: unknown): CwgoQuestion[] | null {
  if (!raw || typeof raw !== 'object') return null
  const { schemaVersion, questions } = raw as { schemaVersion?: unknown; questions?: unknown }
  if (
    schemaVersion !== CWGO_QUESTION_BANK_SCHEMA_VERSION ||
    !Array.isArray(questions) ||
    questions.length < 20 ||
    questions.length > 500
  )
    return null

  const ids = new Set<string>()
  const result: CwgoQuestion[] = []
  for (const rawQuestion of questions) {
    if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) return null
    const { id, prompt, answer, difficulty, answerMode, unit, min, max, scale, plausibleMistakes } =
      rawQuestion as CwgoQuestion
    if (
      typeof id !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{0,55}$/.test(id) ||
      ids.has(id) ||
      typeof prompt !== 'string' ||
      !prompt.trim() ||
      prompt.length > 500 ||
      !validGuess(answer) ||
      !Number.isInteger(difficulty) ||
      difficulty < 1 ||
      difficulty > 5 ||
      !ANSWER_MODES.has(answerMode) ||
      (unit !== undefined && (typeof unit !== 'string' || unit.length > 80)) ||
      (min !== undefined && (!validGuess(min) || min > answer)) ||
      (max !== undefined && (!validGuess(max) || max < answer || max <= (min ?? 0))) ||
      (scale !== undefined && !INPUT_SCALES.has(scale)) ||
      (plausibleMistakes !== undefined &&
        (!Array.isArray(plausibleMistakes) ||
          plausibleMistakes.length > 20 ||
          !plausibleMistakes.every(validGuess)))
    )
      return null
    ids.add(id)
    result.push({
      id,
      prompt,
      answer,
      difficulty,
      answerMode,
      unit,
      min,
      max,
      scale,
      plausibleMistakes,
    })
  }
  return result
}

const validated = parseCwgoQuestions(bundledBank)
if (!validated) throw new Error('The bundled CWGO bank is invalid.')
export const CWGO_QUESTIONS: CwgoQuestion[] = validated
