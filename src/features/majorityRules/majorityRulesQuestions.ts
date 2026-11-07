import questionData from './data/questions.v1.json'
export interface MajorityRulesQuestionTemplate {
  id: string
  prompt: string
  options: [string, string, string]
}

export const MAJORITY_RULES_QUESTION_BANK: MajorityRulesQuestionTemplate[] =
  questionData as MajorityRulesQuestionTemplate[]
