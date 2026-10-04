import { describe, expect, it } from 'vitest'
import type { GameState, Player } from '../../types'
import {
  calculateLohAmbushChance,
  isLohAmbushPlan,
  type LohNominationPlan,
} from '../lohNominationPlanning'

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    avatar: '🧑',
    status: 'active',
    isUser: false,
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
    ...overrides,
  } as Player
}

function stateWith(players: Player[], overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'ambush-criteria',
    week: 3,
    seed: 17,
    phase: 'loh_results',
    lohId: 'loh',
    players,
    nomineeIds: [],
    strategicRelationships: {},
    ...overrides,
  } as GameState
}

function plan(overrides: Partial<LohNominationPlan> = {}): LohNominationPlan {
  return {
    week: 3,
    lohId: 'loh',
    targetId: 'target',
    backupTargetId: 'backup',
    pawnIds: ['pawn-a', 'pawn-b'],
    initialNomineeIds: ['pawn-a', 'pawn-b'],
    strategy: 'backdoor',
    status: 'planned',
    selectionBasis: 'strategy',
    targetScore: 70,
    backdoorChance: 0.35,
    ...overrides,
  }
}

describe('AI LOH Ambush criteria', () => {
  it('defines an Ambush as concealing the real target from the opening block', () => {
    expect(isLohAmbushPlan(plan())).toBe(true)

    // Merely naming somebody as a later replacement is not enough. If the
    // supposed target was already on the opening block, it is not an Ambush.
    expect(
      isLohAmbushPlan(
        plan({
          initialNomineeIds: ['target', 'pawn-a'],
        })
      )
    ).toBe(false)

    expect(isLohAmbushPlan(plan({ strategy: 'direct' }))).toBe(false)
  })

  it('gives an emerging proven threat a meaningful but non-default Ambush chance', () => {
    const loh = player('loh', { status: 'loh' })
    const target = player('target', {
      stats: { lohWins: 1, posWins: 0, timesNominated: 0 },
    })
    const pawnA = player('pawn-a')
    const pawnB = player('pawn-b')
    const backup = player('backup')
    const state = stateWith([loh, target, pawnA, pawnB, backup])

    const chance = calculateLohAmbushChance(state, loh.id, target, 62, 50)

    expect(chance).toBeGreaterThanOrEqual(0.3)
    expect(chance).toBeLessThan(0.5)
  })

  it('does not manufacture an Ambush for an ordinary low-threat target', () => {
    const loh = player('loh', { status: 'loh' })
    const target = player('target')
    const state = stateWith([loh, target, player('pawn-a'), player('pawn-b'), player('backup')])

    expect(calculateLohAmbushChance(state, loh.id, target, 52, 45)).toBe(0)
  })

  it('keeps Day 1 and Final 4 outside the Ambush ruleset', () => {
    const loh = player('loh', { status: 'loh' })
    const target = player('target', {
      stats: { lohWins: 2, posWins: 1, timesNominated: 0 },
    })
    const pawnA = player('pawn-a')
    const pawnB = player('pawn-b')
    const backup = player('backup')

    expect(
      calculateLohAmbushChance(
        stateWith([loh, target, pawnA, pawnB, backup], { week: 1 }),
        loh.id,
        target,
        90,
        30
      )
    ).toBe(0)

    expect(
      calculateLohAmbushChance(
        stateWith([loh, target, pawnA, pawnB], { week: 5 }),
        loh.id,
        target,
        90,
        30
      )
    ).toBe(0)
  })
})
