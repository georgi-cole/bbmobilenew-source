import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AllianceManager from '../AllianceManager'
import { createInitialRealityDomainState, createRealityAlliance } from '../../../social/reality'
import { manageAlliance } from '../../../social/reality/allianceManagement'
import type { Player } from '../../../types'

const players = [
  { id: 'u', name: 'You', isUser: true, status: 'active' },
  { id: 'k', name: 'Kian', status: 'active' },
  { id: 'r', name: 'Rae', status: 'active' },
  { id: 'x', name: 'Nova', status: 'active' },
] as Player[]
const context = {
  at: { day: 1, phase: 'social_1' },
  activeActorIds: ['u', 'k', 'r', 'x'],
  humanActorIds: ['u', 'k', 'r', 'x'],
  seed: 1,
}
const makeGroup = (leaderId = 'u') => {
  const reality = createInitialRealityDomainState()
  createRealityAlliance(reality, {
    id: 'group',
    kind: 'GROUP',
    founderIds: ['u', 'k', 'r'],
    memberIds: [],
    name: 'Night Shift',
    leaderId,
    purpose: 'Group protection',
    at: context.at,
  })
  return reality
}

describe('AllianceManager', () => {
  it('shows two personal pacts without inventing a group', () => {
    const reality = createInitialRealityDomainState()
    for (const partner of ['k', 'r'])
      createRealityAlliance(reality, {
        id: partner,
        founderIds: ['u', partner],
        memberIds: [],
        purpose: 'Mutual protection',
        at: context.at,
      })
    render(<AllianceManager reality={reality} players={players} humanId="u" onCommand={vi.fn()} />)
    expect(screen.getByText('0 / 2 groups · 2 / 3 personal pacts')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'End personal pact' })).toHaveLength(2)
  })
  it('gives regular members suggestions and a scoped leave preview', () => {
    const onCommand = vi.fn(() => ({ status: 'APPLIED' as const, reason: 'Left.' }))
    render(
      <AllianceManager
        reality={makeGroup('k')}
        players={players}
        humanId="u"
        onCommand={onCommand}
      />
    )
    expect(screen.queryByRole('button', { name: 'Dissolve group' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Suggest removal' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }))
    expect(screen.getByText(/Connections through other groups or pacts remain/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm leave' }))
    expect(onCommand).toHaveBeenCalledWith({ type: 'LEAVE', allianceId: 'group', actorId: 'u' })
    expect(screen.getByRole('status').textContent).toBe('Left.')
  })
  it('keeps internal admission votes private from an uninvited candidate', () => {
    const reality = makeGroup()
    const result = manageAlliance(
      reality,
      { type: 'PROPOSE', kind: 'ADMIT', actorId: 'u', allianceId: 'group', candidateId: 'x' },
      context
    )
    render(<AllianceManager reality={reality} players={players} humanId="x" onCommand={vi.fn()} />)
    expect(screen.queryByText('Decisions waiting')).toBeNull()
    expect(screen.queryByText('Night Shift')).toBeNull()
    manageAlliance(
      reality,
      { type: 'RESPOND', actorId: 'k', requestId: result.requestId!, accept: false },
      context
    )
    manageAlliance(
      reality,
      { type: 'RESPOND', actorId: 'r', requestId: result.requestId!, accept: false },
      context
    )
    expect(
      reality.allianceManagement.requests[result.requestId!].candidateInvitedAt
    ).toBeUndefined()
  })
  it('shows the approved roster and gives the candidate a separate acceptance', () => {
    const reality = makeGroup()
    const result = manageAlliance(
      reality,
      { type: 'PROPOSE', kind: 'ADMIT', actorId: 'u', allianceId: 'group', candidateId: 'x' },
      context
    )
    for (const actorId of ['k', 'r'])
      manageAlliance(
        reality,
        { type: 'RESPOND', actorId, requestId: result.requestId!, accept: true },
        context
      )
    render(<AllianceManager reality={reality} players={players} humanId="x" onCommand={vi.fn()} />)
    const region = screen.getByRole('region', { name: 'Your alliances' })
    expect(within(region).getByText(/The group approved this invitation/)).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Accept' })).toBeTruthy()
    expect(within(region).getByText(/Leader: You/)).toBeTruthy()
  })
})
