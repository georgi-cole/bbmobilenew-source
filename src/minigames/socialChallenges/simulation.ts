import type { GenericMinigameProps } from '../reactComponents'
import { runLastLightSimulation } from './lastLight/lastLightLogic'
import { simulateRpsTournament } from './rps/rules'
import { isSocialChallengeGameKey, socialPreference } from './shared'

/** Apply the same rules and choice policy when a competition runs without human input. */
export function simulateSocialChallengeScores(
  key: string,
  participants: readonly string[],
  seed: number,
  social: Pick<GenericMinigameProps, 'relationships' | 'alliances'>
): Record<string, number> | undefined {
  if (!isSocialChallengeGameKey(key)) return undefined
  const preference = (from: string, to: string) => socialPreference(social, from, to)
  const groups =
    key === 'rockPaperScissors'
      ? simulateRpsTournament(participants, seed, preference)
      : runLastLightSimulation({ participants, seed, preference }).rankedGroups
  return Object.fromEntries(
    groups.flatMap((group, index) => group.map((id) => [id, (groups.length - index) * 100]))
  )
}
