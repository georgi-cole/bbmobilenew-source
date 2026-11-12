import {
  STARTING_BUDGET,
  BUDGET_CAP,
  SURVIVAL_BONUS,
  VOWEL_COST,
  CONSONANT_COST,
  HINT_COSTS,
  MAX_WRONG_GUESSES,
  MAX_TOTAL_ROUNDS,
  FAILURE_PENALTY,
  MAX_QUALIFYING_ROUNDS,
} from './hangmanChallengeEngine'

export const FINAL_REVEAL_INTERVAL_SECONDS = 5
export const FINAL_FORCE_REVEAL_COST = 10
export const FINAL_FORCE_REVEAL_COOLDOWN_MS = 3000
export const FINAL_LOCK_COST = 15
export const FINAL_LOCK_DURATION_MS = 5000

export function getVerdictBoardRules(): string[] {
  return [
    `Start with ${STARTING_BUDGET} Eyeoleans and keep your wallet between boards.`,
    `Reveal one vowel position for ${VOWEL_COST} Eyeoleans or one consonant position for ${CONSONANT_COST}.`,
    `Hints cost ${HINT_COSTS.join(', ')} Eyeoleans; purchased hints can be reopened for free.`,
    `${MAX_WRONG_GUESSES} wrong full-word guesses shatter a qualifying board. Failed boards score 0 and carry a ${Math.abs(FAILURE_PENALTY)}-point cumulative penalty.`,
    `Successful survivors gain ${SURVIVAL_BONUS} Eyeoleans, capped at ${BUDGET_CAP}.`,
    `At most ${MAX_TOTAL_ROUNDS} boards: up to ${MAX_QUALIFYING_ROUNDS} qualifiers, then a final for two players. Smaller fields need fewer boards.`,
    `In the final, a letter reveals every ${FINAL_REVEAL_INTERVAL_SECONDS} seconds. Both finalists may buzz; the first correct answer wins. A wrong buzz locks you until the next reveal.`,
    `Force a reveal for ${FINAL_FORCE_REVEAL_COST} Eyeoleans every ${FINAL_FORCE_REVEAL_COOLDOWN_MS / 1000} seconds, or lock your opponent for ${FINAL_LOCK_DURATION_MS / 1000} seconds for ${FINAL_LOCK_COST}. Remaining wallet breaks an unsolved final tie.`,
  ]
}
