import { describe, expect, it } from 'vitest'
import { selectCompetitionLastPlaceIds } from './competitionRetryEligibility'

const participants = [
  { id: 'human', precomputedScore: 10 },
  { id: 'winner', precomputedScore: 30 },
  { id: 'lia', precomputedScore: 10 },
]

describe('competition retry last-place selection', () => {
  it('does not offer a retry for a complete metric receipt tied for first', () => {
    const tied = participants.map((p) => ({ ...p, precomputedScore: 30 }))
    expect(
      selectCompetitionLastPlaceIds({ rawResults: { human: 30, winner: 30, lia: 30 } }, tied, false)
    ).toEqual([])
    expect(
      selectCompetitionLastPlaceIds({ rawResults: { human: 30, winner: 30, lia: 30 } }, tied, true)
    ).toEqual([])
  })
  it('includes every member of an explicitly ranked last-place tie', () => {
    expect(
      selectCompetitionLastPlaceIds(
        {
          authoritativeWinnerId: 'winner',
          authoritativeRankedIds: ['winner', 'lia', 'human'],
          authoritativeTiedGroups: [['lia', 'human']],
        },
        participants,
        false
      )
    ).toEqual(['lia', 'human'])
  })

  it('does not infer a unique last place from a bare ordered ID list', () => {
    expect(
      selectCompetitionLastPlaceIds(
        { authoritativeWinnerId: 'winner', authoritativeRankedIds: ['winner', 'lia', 'human'] },
        participants,
        false
      )
    ).toEqual([])
  })

  it('uses an explicit no-ties declaration for a unique final rank', () => {
    expect(
      selectCompetitionLastPlaceIds(
        {
          authoritativeWinnerId: 'winner',
          authoritativeRankedIds: ['winner', 'lia', 'human'],
          authoritativeTiedGroups: [],
        },
        participants,
        false
      )
    ).toEqual(['human'])
  })

  it('does not offer a retry when the reported last-place group is the winning tie', () => {
    expect(
      selectCompetitionLastPlaceIds(
        {
          authoritativeWinnerIds: ['human', 'winner'],
          authoritativeLastPlaceIds: ['human', 'winner'],
        },
        participants,
        false
      )
    ).toEqual([])
  })
})
