import { describe, expect, it } from 'vitest'
import { retrieveHistoricalFacts } from '../confessionalHistory'

describe('retrieveHistoricalFacts', () => {
  it('retrieves the player’s public-vote percentage for the requested day', () => {
    const facts = retrieveHistoricalFacts({
      question: 'How much of the public vote did I get in day 1?',
      playerId: 'player-me',
      playerName: 'Alex',
      history: [
        {
          type: 'voxAudienceVoteResult',
          week: 1,
          data: {
            percentages: { 'player-me': 43.7, 'player-2': 56.3 },
            playerNamesById: { 'player-me': 'Alex', 'player-2': 'Sam' },
          },
          timestamp: 1,
        },
      ],
    })

    expect(facts).toEqual(['Day 1 public audience vote: Alex received 43.7%.'])
  })

  it('can use older Vox exit snapshots without exposing their secret ballots', () => {
    const facts = retrieveHistoricalFacts({
      question: 'How much of the public vote did I get in week 2?',
      playerId: 'player-me',
      playerName: 'Alex',
      history: [
        {
          type: 'seasonExit',
          week: 2,
          data: {
            voxPopuli: true,
            publicVotePercentages: { 'player-me': 31.25 },
            votesByVoterId: { 'private-voter': 'player-me' },
          },
          timestamp: 2,
        },
      ],
    })

    expect(facts).toEqual(['Day 2 public audience vote: Alex received 31.3%.'])
    expect(facts.join(' ')).not.toContain('private-voter')
  })

  it('does not borrow a result from another day or invent a missing percentage', () => {
    const facts = retrieveHistoricalFacts({
      question: 'How much of the public vote did I get in day 1?',
      playerId: 'player-me',
      playerName: 'Alex',
      history: [
        {
          type: 'voxAudienceVoteResult',
          week: 2,
          data: { percentages: { 'player-2': 72 } },
          timestamp: 3,
        },
      ],
    })

    expect(facts).toEqual([])
  })
})
