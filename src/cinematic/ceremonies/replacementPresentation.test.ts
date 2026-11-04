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
  it('carries royal and Safety role identity through a real dual-holder decision', () => {
    expect(resolve({ posWinnerId: 'loh' })).toMatchObject({
      leaderIds: ['loh'],
      safetyHolderIds: ['loh'],
    })
  })
  it('records real original-ballot rank without exposing the vote counts', () => {
    const tracker = createReplacementPresentationTracker()
    const rules = {
      voxPopuli: {
        status: 'active',
        nominationVoteCounts: { a: 9, b: 8, loh: 7, pos: 6, c: 5, d: 5 },
      },
    }
    tracker.restore(game(rules))
    const result = tracker.observe(game({ ...rules, nomineeIds: ['a', 'c', 'd'] }))
    expect(result?.actionHistory.filter((a) => a.kind === 'replacement')).toEqual([
      expect.objectContaining({ playerId: 'c', actorId: null, ballotRank: 5, tiedRank: true }),
      expect.objectContaining({ playerId: 'd', actorId: null, ballotRank: 5, tiedRank: true }),
    ])
    expect(result).not.toHaveProperty('nominationVoteCounts')
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
  it('keeps the actual co-leader-to-nominee assignment with the replacement', () => {
    expect(
      resolve({
        coLohIds: ['co', 'loh'],
        coLohNomineeByCoLohId: { co: 'c', loh: 'a' },
        coLohReplacementOwnerId: 'co',
      })
    ).toMatchObject({
      variant: 'coLoh',
      chooserId: 'co',
      coLohAssignments: [
        { coLohId: 'co', nomineeId: 'c' },
        { coLohId: 'loh', nomineeId: 'a' },
      ],
    })
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
      durationMs: expect.any(Number),
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
    expect(result).toMatchObject({
      variant: 'vox',
      chooserId: null,
      leaderIds: [],
      durationMs: expect.any(Number),
    })
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
  it('records Detox clearing both original nominees before its two ordered replacement picks', () => {
    const tracker = createReplacementPresentationTracker()
    tracker.restore(game())
    tracker.observe(
      game({
        nomineeIds: [],
        specialVeto: { activeType: 'coup', awaitingCoupReplacement1: true },
      })
    )
    tracker.observe(
      game({
        nomineeIds: [],
        specialVeto: {
          activeType: 'coup',
          awaitingCoupReplacement2: true,
          coupReplacement1Id: 'c',
        },
      })
    )
    const result = tracker.observe(
      game({ nomineeIds: ['c', 'd'], specialVeto: { activeType: 'coup' } })
    )
    expect(result?.actionHistory.map(({ kind, playerId }) => [kind, playerId])).toEqual([
      ['save', 'a'],
      ['save', 'b'],
      ['replacement', 'c'],
      ['replacement', 'd'],
    ])
  })
  it('retains an intermediate replacement saved on the second Double Trouble use', () => {
    const tracker = createReplacementPresentationTracker()
    tracker.restore(game({ specialVeto: { activeType: 'vip', vipUseStage: 0 } }))
    tracker.observe(
      game({
        nomineeIds: ['a'],
        povSavedId: 'b',
        specialVeto: { activeType: 'vip', vipUseStage: 1 },
      })
    )
    tracker.observe(
      game({
        nomineeIds: ['a', 'c'],
        povSavedId: null,
        specialVeto: { activeType: 'vip', vipUseStage: 2 },
      })
    )
    tracker.observe(
      game({
        nomineeIds: ['a'],
        povSavedId: 'c',
        specialVeto: { activeType: 'vip', vipUseStage: 3 },
      })
    )
    const outcome = tracker.observe(
      game({
        nomineeIds: ['a', 'd'],
        povSavedId: null,
        specialVeto: { activeType: 'vip', vipUseStage: -1 },
      })
    )
    expect(outcome?.actionHistory.map(({ kind, playerId }) => [kind, playerId])).toEqual([
      ['save', 'b'],
      ['replacement', 'c'],
      ['save', 'c'],
      ['replacement', 'd'],
    ])
    expect(outcome?.durationMs).toBeGreaterThanOrEqual(14000)
    expect(outcome?.replacementIds).toEqual(['d'])
  })
  it('captures the affected co-leader before the committed replacement clears its role field', () => {
    const tracker = createReplacementPresentationTracker()
    const roles = { coLohIds: ['loh', 'co'], coLohNomineeByCoLohId: { loh: 'a', co: 'b' } }
    tracker.restore(game(roles))
    tracker.observe(
      game({
        ...roles,
        nomineeIds: ['a'],
        povSavedId: 'b',
        replacementNeeded: true,
        coLohReplacementOwnerId: 'co',
      })
    )
    const outcome = tracker.observe(
      game({ ...roles, nomineeIds: ['a', 'c'], povSavedId: null, coLohReplacementOwnerId: null })
    )
    expect(outcome).toMatchObject({ variant: 'coLoh', chooserId: 'co', affectedCoLohId: 'co' })
    expect(outcome?.coLohAssignments).toEqual([
      { coLohId: 'loh', nomineeId: 'a' },
      { coLohId: 'co', nomineeId: 'c' },
    ])
  })
  it('captures an AI save and Halo replacement committed while entering Safety results', () => {
    const tracker = createReplacementPresentationTracker()
    tracker.restore(game({ phase: 'pos_ceremony', specialVeto: { activeType: 'diamond' } }))
    const result = tracker.observe(
      game({ nomineeIds: ['a', 'c'], povSavedId: 'b', specialVeto: { activeType: 'diamond' } })
    )
    expect(result).toMatchObject({ variant: 'halo', chooserId: 'pos', replacementIds: ['c'] })
    expect(result?.actionHistory.map(({ kind, playerId }) => [kind, playerId])).toEqual([
      ['save', 'b'],
      ['replacement', 'c'],
    ])
  })
  it('credits a human Cupid coholder and captures both partners of the saved and replacement pairs', () => {
    const rules = {
      cupidArrow: {
        status: 'active',
        pairs: [
          { id: 'leaders', memberIds: ['loh', 'co'], color: '#ff5d8f' },
          { id: 'old', memberIds: ['a', 'b'], color: '#5bbcff' },
          { id: 'new', memberIds: ['c', 'd'], color: '#ffc857' },
        ],
      },
      players: game().players.map((player) => ({ ...player, isUser: player.id === 'co' })),
    }
    const tracker = createReplacementPresentationTracker()
    tracker.restore(game(rules))
    tracker.observe(game({ ...rules, nomineeIds: [], povSavedId: 'a', replacementNeeded: true }))
    const result = tracker.observe(game({ ...rules, nomineeIds: ['c', 'd'], povSavedId: null }))
    expect(result).toMatchObject({
      variant: 'cupid',
      chooserId: 'co',
      replacementIds: ['c', 'd'],
      savedIds: ['a', 'b'],
    })
    expect(
      result?.actionHistory.map(({ kind, playerId, actorId }) => [kind, playerId, actorId])
    ).toEqual([
      ['save', 'a', 'pos'],
      ['save', 'b', 'pos'],
      ['replacement', 'c', 'co'],
      ['replacement', 'd', 'co'],
    ])
  })
})
