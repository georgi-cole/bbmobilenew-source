import { describe, expect, it } from 'vitest'
import type { GameState } from '../../types'
import {
  createReplacementPresentationTracker,
  selectReplacementPresentation,
} from './replacementPresentation'

const game = (overrides: Record<string, unknown> = {}) =>
  ({
    gameId: 'run',
    season: 1,
    week: 2,
    mode: 'classic',
    phase: 'pos_ceremony_results',
    players: ['loh', 'pos', 'a', 'b', 'c', 'd', 'mission', 'co'].map((id) => ({
      id,
      status: 'active',
    })),
    nomineeIds: ['a', 'b'],
    lohId: 'loh',
    posWinnerId: 'pos',
    replacementNeeded: false,
    specialVeto: { activeType: null },
    ...overrides,
  }) as unknown as GameState
const resolve = (overrides: Record<string, unknown> = {}) =>
  selectReplacementPresentation(game(), game({ nomineeIds: ['a', 'c'], ...overrides }))

describe('committed replacement presentation ownership', () => {
  it('routes the real ordinary replacement and keeps continuing nominees distinct', () => {
    expect(resolve()).toMatchObject({
      owner: 'replacement',
      variant: 'ordinary',
      chooserId: 'loh',
      replacementIds: ['c'],
      continuingNomineeIds: ['a'],
      savedIds: ['b'],
    })
  })
  it.each(['executed', 'failed', 'compromised'])(
    'gives Ambush priority only for the executed target (%s)',
    (status) => {
      expect(
        resolve({ lohNominationPlan: { strategy: 'backdoor', targetId: 'c', status } })?.owner
      ).toBe(status === 'executed' ? 'ambush' : 'replacement')
    }
  )
  it('waits while the existing Ambush pipeline has not resolved its plan', () => {
    expect(
      resolve({
        lohNominationPlan: { strategy: 'backdoor', targetId: 'c', status: 'initial_block_set' },
      })
    ).toBeNull()
  })
  it('never includes the concealed target in a failed-plan ordinary outcome', () => {
    const result = resolve({
      lohNominationPlan: { strategy: 'backdoor', targetId: 'd', status: 'compromised' },
    })
    expect(JSON.stringify(result)).not.toContain('compromised')
    expect(result?.replacementIds).toEqual(['c'])
  })
  it.each([
    ['diamond', 'halo', 'pos'],
    ['spotlight', 'force', 'loh'],
  ])('uses actual authority for %s', (activeType, variant, chooserId) => {
    expect(resolve({ specialVeto: { activeType } })).toMatchObject({ variant, chooserId })
  })
  it('honors mission takeover before the LOH', () => {
    expect(resolve({ missionPowers: { backupChooserId: 'mission' } })).toMatchObject({
      variant: 'mission',
      chooserId: 'mission',
    })
  })
  it('retains the designated co-leader after its reducer field clears', () => {
    expect(
      selectReplacementPresentation(
        game({ coLohReplacementOwnerId: 'co' }),
        game({ nomineeIds: ['a', 'c'] })
      )
    ).toMatchObject({ variant: 'coLoh', chooserId: 'co' })
  })
  it('waits for Detox pick 2 and then describes both replacements once', () => {
    expect(
      resolve({
        specialVeto: {
          activeType: 'coup',
          awaitingCoupReplacement2: true,
          coupReplacement1Id: 'c',
        },
      })
    ).toBeNull()
    expect(resolve({ nomineeIds: ['c', 'd'], specialVeto: { activeType: 'coup' } })).toMatchObject({
      variant: 'detox',
      chooserId: 'pos',
      replacementIds: ['c', 'd'],
      durationMs: 6000,
    })
  })
  it.each([0, 1, 2, 3])('waits at Double Trouble intermediate stage %s', (vipUseStage) => {
    expect(resolve({ specialVeto: { activeType: 'vip', vipUseStage } })).toBeNull()
  })
  it.each([
    ['a', 'c'],
    ['c', 'd'],
  ])('supports completed one- and two-use Double Trouble: %s', (...nomineeIds) => {
    expect(
      resolve({ nomineeIds, specialVeto: { activeType: 'vip', vipUseStage: -1 } })?.variant
    ).toBe('doubleTrouble')
  })
  it('shows only the committed Vox names, without a chooser or ballot data', () => {
    const result = resolve({ voxPopuli: { status: 'active', nominationVoteCounts: { d: 900 } } })
    expect(result).toMatchObject({ variant: 'vox', chooserId: null, durationMs: 3000 })
    expect(JSON.stringify(result)).not.toContain('900')
  })
  it('waits for a complete Cupid pair', () => {
    const cupidArrow = { status: 'active', pairs: [{ memberIds: ['c', 'd'] }] }
    expect(resolve({ cupidArrow })).toBeNull()
    expect(resolve({ cupidArrow, nomineeIds: ['c', 'd'] })).toMatchObject({
      variant: 'cupid',
      replacementIds: ['c', 'd'],
    })
  })
  it.each([
    { nomineeIds: ['a', 'b'] },
    { nomineeIds: [] },
    { replacementNeeded: true },
    { aiReplacementStep: 2 },
    { week: 3 },
    { mode: 'survival' },
  ])('rejects incomplete, nonexistent and out-of-scope outcomes: %j', (overrides) => {
    expect(resolve(overrides)).toBeNull()
  })
  it('uses an order-independent identity for remount/Skip receipts', () => {
    expect(resolve()?.eventKey).toBe(resolve({ nomineeIds: ['c', 'a'] })?.eventKey)
  })
  it('keeps the opening block across Detox intermediate picks and resets next week', () => {
    const tracker = createReplacementPresentationTracker()
    tracker.restore(game())
    expect(
      tracker.observe(
        game({
          nomineeIds: [],
          specialVeto: { activeType: 'coup', awaitingCoupReplacement2: true },
        })
      )
    ).toBeNull()
    expect(
      tracker.observe(game({ nomineeIds: ['c', 'd'], specialVeto: { activeType: 'coup' } }))
        ?.replacementIds
    ).toEqual(['c', 'd'])
    expect(tracker.observe(game({ week: 3 }))).toBeNull()
  })
})
