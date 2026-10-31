import { describe, expect, it } from 'vitest'
import { buildByTheNumbersCandidate } from '../seasonDesk'
import type { GameState } from '../../types'

function stateFor(voxActive: boolean, stats: { lohWins: number; posWins: number }) {
  return {
    phase: 'loh_results',
    players: [
      {
        id: 'aria',
        name: 'Aria',
        status: 'active',
        stats,
      },
    ],
    tvFeed: [],
    lohId: 'aria',
    posWinnerId: null,
    nomineeIds: [],
    voxPopuli: voxActive ? { status: 'active' } : { status: 'inactive' },
  } as unknown as Pick<
    GameState,
    'phase' | 'players' | 'tvFeed' | 'lohId' | 'posWinnerId' | 'nomineeIds' | 'voxPopuli'
  >
}

describe('By the Numbers power milestone copy', () => {
  it('calls LOH results Immunity in Vox while retaining classic wording', () => {
    const vox = buildByTheNumbersCandidate(stateFor(true, { lohWins: 3, posWins: 0 }))
    const classic = buildByTheNumbersCandidate(stateFor(false, { lohWins: 3, posWins: 0 }))

    expect(vox?.text).toContain('Immunity wins')
    expect(vox?.text).not.toContain('LOH')
    expect(classic?.text).toContain('LOH wins')
  })

  it('uses Immunity in the dual-power milestone in Vox', () => {
    const base = stateFor(true, { lohWins: 1, posWins: 2 })
    const vox = buildByTheNumbersCandidate({
      ...base,
      players: [
        ...base.players,
        {
          ...base.players[0],
          id: 'ash',
          name: 'Ash',
          stats: { lohWins: 1, posWins: 2, timesNominated: 0 },
        },
      ],
    })

    expect(vox?.text).toContain('Immunity and the Power of Safety')
    expect(vox?.text).not.toContain('LOH')
  })
})
