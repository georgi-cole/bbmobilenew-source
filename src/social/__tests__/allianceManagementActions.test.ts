import { describe, expect, it, vi } from 'vitest'
import type { RootState } from '../../store/store'
import { applyEnergyDelta, recordSocialAction, replaceRealityDomain } from '../socialSlice'
import { createInitialRealityDomainState } from '../reality/state'
import { createRealityAlliance } from '../reality/relationshipForms'
import { executeAllianceManagementCommand } from '../allianceManagementActions'

function makeState(energy: number, bothHuman = false) {
  return {
    game: {
      week: 1,
      phase: 'social_1',
      seed: 13,
      mode: 'drama',
      players: [
        { id: 'u', name: 'You', isUser: true, status: 'active' },
        { id: 'k', name: 'Kian', isUser: bothHuman, status: 'active' },
      ],
    },
    social: {
      reality: createInitialRealityDomainState(),
      energyBank: { u: energy, k: 3 },
      influenceBank: {},
      infoBank: {},
    },
  } as unknown as RootState
}

function runCommand(
  state: RootState,
  command: Parameters<typeof executeAllianceManagementCommand>[0],
  costs?: { energy: number; influence?: number; info?: number }
) {
  const dispatch = vi.fn((action: { type: string; payload?: unknown }) => {
    if (action.type === applyEnergyDelta.type) {
      const { playerId, delta } = action.payload as { playerId: string; delta: number }
      state.social.energyBank[playerId] = (state.social.energyBank[playerId] ?? 0) + delta
    }
    if (action.type === replaceRealityDomain.type)
      state.social.reality = action.payload as typeof state.social.reality
    return action
  })
  const result = executeAllianceManagementCommand(command, costs)(
    dispatch as never,
    (() => state) as never
  )
  return { result, dispatch }
}

describe('alliance proposal resource costs', () => {
  it('explains that a proposed invite is voted on before the invitee is asked', () => {
    const state = makeState(3, true)
    state.game.players.push(
      { id: 'r', name: 'Rae', isUser: false, status: 'active' } as never,
      { id: 'x', name: 'Lia', isUser: false, status: 'active' } as never
    )
    state.social.influenceBank.u = 5
    const alliance = createRealityAlliance(state.social.reality, {
      id: 'the-shield',
      kind: 'GROUP',
      founderIds: ['u', 'k', 'r'],
      memberIds: [],
      purpose: 'Mutual protection',
      name: 'The Shield',
      at: { day: 1, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'

    const { result, dispatch } = runCommand(state, {
      type: 'PROPOSE',
      kind: 'ADMIT',
      actorId: 'u',
      candidateId: 'x',
      allianceId: alliance.id,
    })

    expect(result.status).toBe('APPLIED')
    const receipt = dispatch.mock.calls
      .map(([action]) => action)
      .find((action) => action.type === recordSocialAction.type)
    const narrative = (receipt?.payload as { entry: { narrative: string } } | undefined)?.entry
      .narrative
    expect(narrative).toContain('The Shield is voting on inviting Lia.')
    expect(narrative).toContain('Votes so far: You yes; Kian not voted; Rae yes.')
    expect(narrative).toContain('A majority passes; the leader breaks a tie.')
    expect((receipt?.payload as { entry: { receipt: unknown } }).entry.receipt).toMatchObject({
      summary: narrative,
      outcomeLabel: 'Pending approval',
      tone: 'neutral',
    })
  })

  it('charges two energy for a new personal pact proposal, only once', () => {
    const state = makeState(3)
    const command = {
      type: 'PROPOSE' as const,
      kind: 'PACT' as const,
      actorId: 'u',
      candidateId: 'k',
      commandId: 'pact-once',
    }
    const first = runCommand(state, command, { energy: 2 })
    const second = runCommand(state, command, { energy: 2 })

    expect(first.result.status).toBe('APPLIED')
    expect(first.result.reason).toContain('Spent ⚡2 to submit.')
    expect(first.result.receiptRecorded).toBe(true)
    const logged = first.dispatch.mock.calls
      .map(([action]) => action)
      .find((action) => action.type === recordSocialAction.type)?.payload as {
      entry: {
        receipt: { summary: string; outcomeLabel: string; tone: string }
        costs: { energy: number }
      }
    }
    const request = state.social.reality.allianceManagement.requests[first.result.requestId!]
    expect(logged.entry.receipt.summary).toContain(request.reason)
    expect(logged.entry.receipt.summary).not.toContain('Spent')
    expect(logged.entry.costs.energy).toBe(2)
    if (request.status === 'DECLINED') {
      expect(logged.entry.receipt).toMatchObject({ outcomeLabel: 'Declined', tone: 'negative' })
    }
    expect(state.social.energyBank.u).toBe(1)
    expect(second.result.status).toBe('NO_OP')
    expect(state.social.energyBank.u).toBe(1)
  })

  it('rejects an unaffordable proposal without committing it or spending resources', () => {
    const state = makeState(0)
    const before = state.social.reality
    const { result, dispatch } = runCommand(
      state,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'u', candidateId: 'k' },
      { energy: 1 }
    )

    expect(result.status).toBe('REJECTED')
    expect(result.reason).toContain('nothing was spent')
    expect(dispatch).not.toHaveBeenCalled()
    expect(state.social.reality).toBe(before)
  })

  it('does not charge a member who is only answering a group request', () => {
    const state = makeState(3, true)
    const proposal = runCommand(state, {
      type: 'PROPOSE',
      kind: 'PACT',
      actorId: 'u',
      candidateId: 'k',
    })
    expect(proposal.result.requestId).toBeTruthy()
    const response = runCommand(
      state,
      { type: 'RESPOND', requestId: proposal.result.requestId!, actorId: 'k', accept: true },
      { energy: 1 }
    )

    expect(response.result.status).toBe('APPLIED')
    expect(state.social.energyBank.u).toBe(1)
  })
})
