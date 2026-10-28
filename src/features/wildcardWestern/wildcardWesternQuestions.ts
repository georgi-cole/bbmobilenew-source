import questionData from './data/questions.v1.json'
/**
 * wildcardWesternQuestions.ts – Question bank for Wildcard Western.
 */

export interface WildcardQuestion {
  id: string
  prompt: string
  options: [string, string, string]
  correctIndex: 0 | 1 | 2
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
}

export const WILDCARD_QUESTIONS: WildcardQuestion[] = questionData as WildcardQuestion[]
