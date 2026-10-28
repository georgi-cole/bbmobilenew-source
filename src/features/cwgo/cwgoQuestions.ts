import questionData from './data/questions.v1.json'
// Question bank for "Closest Without Going Over" minigame.
// All answers are numeric and the data shape is intentionally serialisable so
// the bank can later be served as validated JSON without changing game logic.
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

export const CWGO_QUESTIONS: CwgoQuestion[] = questionData as CwgoQuestion[]
