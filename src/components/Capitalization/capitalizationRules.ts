import { getGame } from '../../minigames/registry'

export function getCapitalizationRules(context: 'loh' | 'battleBack' = 'loh') {
  const game = getGame('capitalization')!
  if (context !== 'battleBack') return game
  return {
    ...game,
    title: 'Capitalization — Back 2 the Game',
    description:
      'All return candidates play the complete Capitalization challenge. Scores carry across every continent.',
    instructions: [
      'The globe selects three continents, with three capital-city questions on each.',
      'Every return candidate plays all nine questions.',
      'Faster first-try answers score more; hints halve the question score and skips score zero.',
      'Nobody is eliminated after Question 3 or Question 6 in Back 2 the Game.',
      'Scores carry across all three continents.',
      'After Question 9, the highest total score wins the right to return to the game.',
    ],
  }
}
