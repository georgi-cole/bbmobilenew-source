import { describe, expect, it } from 'vitest'
import type { GameState } from '../../types'
import type { ReplacementPresentation } from './replacementPresentation'
import {
  canAdvanceReplacementStep,
  nextReplacementStep,
  replacementDecision,
} from './replacementSequence'
import { replacementBeats, replacementDuration } from './replacement-timing.js'

const outcome: ReplacementPresentation = {
  owner: 'replacement',
  eventKey: 'run:1',
  variant: 'doubleTrouble',
  openingNomineeIds: ['a', 'b'],
  nomineeIds: ['a', 'd'],
  savedIds: ['b'],
  replacementIds: ['d'],
  continuingNomineeIds: ['a'],
  chooserId: 'loh',
  powerHolderId: 'pos',
  priorAuthorityId: 'loh',
  affectedCoLohId: null,
  coLohIds: [],
  coLohAssignments: [],
  pairUnits: [],
  actionHistory: [
    { kind: 'save', playerId: 'b', actorId: 'pos', slotIndex: 1 },
    { kind: 'replacement', playerId: 'c', actorId: 'loh', slotIndex: 1 },
    { kind: 'save', playerId: 'c', actorId: 'pos', slotIndex: 1 },
    { kind: 'replacement', playerId: 'd', actorId: 'special', slotIndex: 1 },
  ],
  durationMs: 15060,
}
const game = (props: Record<string, unknown> = {}) =>
  ({
    phase: 'pos_ceremony_results',
    nomineeIds: ['a', 'b'],
    lohId: 'loh',
    posWinnerId: 'pos',
    players: [{ id: 'user', isUser: true, status: 'active' }],
    ...props,
  }) as unknown as GameState

describe('connected replacement decisions', () => {
  it('leaves a declined Safety use on faux TV and preserves real consequences in mixed batches', () => {
    const decline = { kind: 'decline' as const, playerId: 'pos', actorId: 'pos', slotIndex: -1 }
    expect(nextReplacementStep({ ...outcome, actionHistory: [decline] }, 0)).toBeNull()
    const step = nextReplacementStep(
      { ...outcome, actionHistory: [...outcome.actionHistory, decline] },
      0
    )
    expect(step?.end).toBe(5)
    expect(step?.outcome.actionHistory).toEqual(outcome.actionHistory)
    expect(
      nextReplacementStep({ ...outcome, actionHistory: [...outcome.actionHistory, decline] }, 4)
    ).toBeNull()
  })
  it('presents the four committed actions in order with the actor for each choice', () => {
    const expected = [
      ['save', 'b', 'pos'],
      ['replacement', 'c', 'loh'],
      ['save', 'c', 'pos'],
      ['replacement', 'd', 'special'],
    ]
    expected.forEach((_, index) => {
      const next = nextReplacementStep(outcome, index)!
      expect(next.end).toBe(4)
      expect(
        next.outcome.actionHistory.map(({ kind, playerId, actorId }) => [kind, playerId, actorId])
      ).toEqual(expected.slice(index))
      expect(next.outcome.openingSlots?.a).toBe(0)
    })
    const partial = { ...outcome, actionHistory: outcome.actionHistory.slice(0, 1) }
    expect(nextReplacementStep(partial, 0)?.outcome.replacementIds).toEqual([])
    expect(nextReplacementStep(outcome, 4)).toBeNull()
  })
  it('keeps the surviving nominee on its original platform after the first slot clears', () => {
    const leftSaved = {
      ...outcome,
      actionHistory: [
        { kind: 'save' as const, playerId: 'a', actorId: 'pos', slotIndex: 0 },
        { kind: 'replacement' as const, playerId: 'c', actorId: 'loh', slotIndex: 0 },
      ],
    }
    expect(nextReplacementStep(leftSaved, 1)?.outcome).toMatchObject({
      openingNomineeIds: ['b'],
      openingSlots: { b: 1 },
      slotCount: 2,
    })
  })
  it('gives each Double Trouble round reading time, including the intermediate nominee', () => {
    const beats = replacementBeats(outcome)
    expect(beats).toHaveLength(4)
    beats.forEach((beat, index) => {
      expect(beat.shotEnd - beat.shotStart).toBeGreaterThanOrEqual(1600)
      expect(beat.end - beat.revealAt).toBeGreaterThanOrEqual(1200)
      if (index) expect(beat.shotStart).toBeGreaterThan(beats[index - 1].end)
    })
    expect(replacementDuration(outcome)).toBeGreaterThanOrEqual(14000)
    expect(replacementDuration(outcome)).toBeLessThanOrEqual(21000)
  })
  it('introduces one Detox holder, clears the block, and reveals the replacements sequentially', () => {
    const detox = {
      ...outcome,
      variant: 'detox' as const,
      actionHistory: [
        { kind: 'save' as const, playerId: 'a', actorId: 'pos', slotIndex: 0 },
        { kind: 'save' as const, playerId: 'b', actorId: 'pos', slotIndex: 1 },
        { kind: 'replacement' as const, playerId: 'c', actorId: 'pos', slotIndex: 0 },
        { kind: 'replacement' as const, playerId: 'd', actorId: 'pos', slotIndex: 1 },
      ],
    }
    const beats = replacementBeats(detox)
    expect(beats.map((b) => b.actions.length)).toEqual([2, 2])
    expect(beats.map((b) => b.showAuthority)).toEqual([true, false])
    expect(beats[1].reveals[1].at - beats[1].reveals[0].at).toBeGreaterThanOrEqual(1500)
    expect(nextReplacementStep(detox, 0)?.end).toBe(4)
  })
  it('requires the real human choice and recognizes a human Cupid coholder', () => {
    const current = game({
      awaitingPovSaveTarget: true,
      cupidArrow: {
        status: 'active',
        pairs: [{ id: 'pair', memberIds: ['pos', 'user'] }],
      },
    })
    expect(replacementDecision(current, outcome)).toEqual({ actorId: 'user', kind: 'save' })
    expect(canAdvanceReplacementStep(current)).toBe(false)
  })
  it.each([
    { awaitingPovDecision: true },
    { awaitingPovSaveTarget: true },
    { replacementNeeded: true },
    { specialVeto: { awaitingVipSecondUseDecision: true } },
    { specialVeto: { awaitingVipSecondSaveTarget: true } },
    { specialVeto: { awaitingCoupReplacement1: true } },
    { specialVeto: { awaitingCoupReplacement2: true } },
    { specialVeto: { awaitingHolderReplacement: true } },
    { missionPowers: { decision: { id: 'earned-power' } } },
  ])('never advances while a mandatory choice remains: %j', (flags) => {
    expect(canAdvanceReplacementStep(game({ aiReplacementStep: 1, ...flags }))).toBe(false)
  })
  it('advances only the explicit AI substeps and never the next gameplay phase', () => {
    expect(canAdvanceReplacementStep(game({ aiReplacementStep: 1 }))).toBe(true)
    expect(canAdvanceReplacementStep(game({ aiReplacementStep: 2 }))).toBe(true)
    expect(
      canAdvanceReplacementStep(game({ specialVeto: { activeType: 'vip', vipUseStage: 2 } }))
    ).toBe(true)
    expect(canAdvanceReplacementStep(game())).toBe(false)
    expect(canAdvanceReplacementStep(game({ phase: 'social_2', aiReplacementStep: 1 }))).toBe(false)
  })
  it('resumes an already confirmed staged save, while waiting for any mission-power intervention', () => {
    const staged = { safetyIntent: { id: 'confirmed-save', targetId: 'b' } }
    const current = game({
      awaitingPovSaveTarget: true,
      posWinnerId: 'user',
      missionPowers: staged,
    })
    expect(replacementDecision(current, outcome)).toBeNull()
    expect(canAdvanceReplacementStep(current)).toBe(true)
    const intervention = game({
      ...current,
      missionPowers: { ...staged, decision: { kind: 'vetoSafety', id: 'offer' } },
    })
    expect(replacementDecision(intervention, outcome)).toEqual({ actorId: 'user', kind: 'mission' })
    expect(canAdvanceReplacementStep(intervention)).toBe(false)
  })
})
