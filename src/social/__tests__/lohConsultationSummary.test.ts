import { describe, expect, it } from 'vitest'
import type { RootState } from '../../store/store'
import { createRealityAlliance } from '../reality/relationshipForms'
import { createInitialRealityDomainState } from '../reality/state'
import {
  buildAllianceConsultationPlan,
  buildLohConsultationSummary,
  isProtectionPromiseContradicted,
} from '../reality/humanFlow'

function makeBackdoorState(
  disclosureOutcome: 'truthful' | 'false' | 'vague' = 'truthful',
  disclosedTargetId = 'lux'
): RootState {
  return {
    game: {
      week: 4,
      phase: 'social_1',
      lohId: 'echo',
      posWinnerId: null,
      nomineeIds: [],
      replacementNeeded: false,
      aiReplacementStep: 0,
      players: [
        { id: 'human', name: 'You', status: 'active', isUser: true },
        { id: 'echo', name: 'Echo', status: 'loh' },
        { id: 'lux', name: 'Lux', status: 'active' },
        { id: 'remy', name: 'Remy', status: 'active' },
        { id: 'nova', name: 'Nova', status: 'active' },
        { id: 'dex', name: 'Dex', status: 'active' },
      ],
      lohSocialPlan: {
        week: 4,
        lohId: 'echo',
        currentTargetId: 'remy',
        backupTargetId: 'lux',
        askCountsByPlayerId: { human: 1 },
        disclosedTargetByPlayerId: { human: disclosedTargetId },
        disclosureOutcomeByPlayerId: { human: disclosureOutcome },
      },
      lohNominationPlan: {
        week: 4,
        lohId: 'echo',
        targetId: 'lux',
        backupTargetId: 'dex',
        pawnIds: ['remy', 'nova'],
        initialNomineeIds: ['remy', 'nova'],
        strategy: 'backdoor',
        status: 'planned',
        selectionBasis: 'strategy',
        targetScore: 10,
        backdoorChance: 0.4,
      },
    },
  } as unknown as RootState
}

describe('LOH consultation summary', () => {
  it.each(['loh_results', 'social_1', 'nominations'] as const)(
    'keeps a vague %s answer about opening nominations, even if the engine preselected nominees',
    (phase) => {
      const state = makeBackdoorState('vague')
      state.game.phase = phase
      state.game.nomineeIds = ['remy', 'nova']
      const summary = buildLohConsultationSummary(
        state,
        { actorId: 'human', targetId: 'echo', actionId: 'ask_loh_target' },
        'fallback'
      )
      expect(summary).toBe('Echo kept the opening nomination plan vague.')
      expect(summary).not.toContain('Lux')
    }
  )

  it('keeps the replacement stage meaningful after nominations are revealed', () => {
    const state = makeBackdoorState('vague')
    state.game.phase = 'nomination_results'
    expect(
      buildLohConsultationSummary(
        state,
        { actorId: 'human', targetId: 'echo', actionId: 'ask_loh_target' },
        'fallback'
      )
    ).toBe('Echo kept the replacement plan vague.')
  })
  it('flags a protection promise that contradicts the current target plan', () => {
    const state = makeBackdoorState()

    expect(isProtectionPromiseContradicted(state, 'echo', 'lux')).toBe(true)
    expect(isProtectionPromiseContradicted(state, 'human', 'lux')).toBe(false)
  })

  it('distinguishes the hidden backdoor target from the opening nominees', () => {
    const summary = buildLohConsultationSummary(
      makeBackdoorState(),
      { actorId: 'human', targetId: 'echo', actionId: 'ask_loh_target' },
      'fallback'
    )

    expect(summary).toBe(
      'My planned opening nominees are Remy and Nova. If Safety changes the block, Lux is my replacement option. I want to try to get them out, but Safety and the vote decide what happens.'
    )
  })

  it('keeps a deliberate decoy answer without leaking the canonical target', () => {
    const summary = buildLohConsultationSummary(
      makeBackdoorState('false', 'dex'),
      { actorId: 'human', targetId: 'echo', actionId: 'ask_loh_target' },
      'fallback'
    )

    expect(summary).toContain('Dex is the name I am willing to give you')
    expect(summary).not.toContain('Lux')
  })

  it('does not call an opening nominee the main target when a backdoor seat never opened', () => {
    const state = makeBackdoorState()
    state.game.phase = 'social_2'
    state.game.nomineeIds = ['remy', 'nova']
    state.game.players = state.game.players.map((player) =>
      ['remy', 'nova'].includes(player.id) ? { ...player, status: 'nominated' } : player
    )
    if (state.game.lohNominationPlan) state.game.lohNominationPlan.status = 'initial_block_set'

    const summary = buildLohConsultationSummary(
      state,
      { actorId: 'human', targetId: 'echo', actionId: 'ask_loh_target' },
      'fallback'
    )

    expect(summary).toBe(
      'The block is locked with Remy and Nova. Lux was my replacement target, but Safety did not open a replacement seat, so I can only vote to eliminate someone on this block.'
    )
  })

  it('reports member advice without claiming a group decision before the block strategy is set', () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'two-person-alliance',
      founderIds: ['human'],
      memberIds: ['echo'],
      purpose: 'Coordinate the vote',
      at: { day: 4, phase: 'social_1' },
    })
    const state = {
      game: {
        week: 4,
        phase: 'nomination_results',
        seed: 7,
        dramaSocialMode: true,
        lohId: 'echo',
        posWinnerId: null,
        nomineeIds: ['remy', 'nova'],
        players: [
          { id: 'human', name: 'You', status: 'active', isUser: true },
          { id: 'echo', name: 'Echo', status: 'active' },
          { id: 'remy', name: 'Remy', status: 'nominated' },
          { id: 'nova', name: 'Nova', status: 'nominated' },
        ],
        strategicRelationships: {},
      },
      social: { reality },
    } as unknown as RootState

    const consultation = buildAllianceConsultationPlan(state, alliance, 'human')

    expect(consultation?.agenda).toBe('block_strategy')
    expect(consultation?.summary).toMatch(
      /Block strategy: Echo recommends (Remy|Nova)\. You have not chosen a position, so the alliance has no decision yet\./
    )
    expect(consultation?.summary).not.toContain('→')
  })
})
