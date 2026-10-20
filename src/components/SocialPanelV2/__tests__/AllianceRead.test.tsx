import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  appendRealityEvent,
  createInitialRealityDomainState,
  createRealityAlliance,
} from '../../../social/reality'
import type { Player } from '../../../types'
import AllianceRead from '../AllianceRead'

const players = [
  { id: 'human', name: 'You', status: 'active', isUser: true },
  { id: 'lia', name: 'Lia', status: 'active', isUser: false },
  { id: 'kai', name: 'Kai', status: 'active', isUser: false },
] as Player[]

describe('AllianceRead', () => {
  it('keeps a long track record accessible without rendering it all while collapsed', async () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'the-winners',
      kind: 'GROUP',
      founderIds: ['human', 'lia', 'kai'],
      memberIds: [],
      name: 'The Winners',
      purpose: 'Coordinate the vote',
      at: { day: 1, phase: 'social_1' },
    })
    const events = Array.from({ length: 60 }, (_, index) =>
      appendRealityEvent(reality, {
        day: index + 2,
        phase: 'social_1',
        type: 'ALLIANCE_STRATEGY_MEETING',
        allianceId: alliance.id,
        actorId: 'human',
        targetIds: [],
        participantIds: ['human', 'lia', 'kai'],
        witnessIds: [],
        visibility: 'GROUP_VISIBLE',
        outcome: 'SUCCESS',
        reason: 'strategy_meeting:the-winners',
        allianceConsultationSummary: `Huddle ${index}.`,
        tags: ['ALLIANCE'],
        relatedFactIds: [],
        relatedPromiseIds: [],
        relatedThreadIds: [],
        publicEligible: false,
        juryEligible: false,
      })
    )
    const props = {
      alliance,
      reality,
      humanId: 'human',
      players,
      selectedMemberId: null,
      onSelectMember: vi.fn(),
    }
    const { rerender } = render(<AllianceRead {...props} />)

    expect(screen.queryByText('You consulted The Winners. Huddle 59.')).toBeNull()
    fireEvent.click(screen.getByText('Open full alliance read'))
    await waitFor(() =>
      expect(screen.getByText('You consulted The Winners. Huddle 59.')).toBeInTheDocument()
    )
    expect(screen.queryByText('You consulted The Winners. Huddle 0.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show earlier events/ }))
    expect(screen.getByText('You consulted The Winners. Huddle 10.')).toBeInTheDocument()
    expect(screen.queryByText('You consulted The Winners. Huddle 0.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show earlier events/ }))
    expect(screen.getByText('You consulted The Winners. Huddle 0.')).toBeInTheDocument()

    rerender(<AllianceRead {...props} focusEventId={events[0].id} />)
    expect(document.getElementById(`alliance-history-event-${events[0].id}`)).toHaveClass(
      'is-highlighted'
    )

    rerender(<AllianceRead key="older-focus" {...props} focusEventId={events[10].id} />)
    expect(screen.getByText('You consulted The Winners. Huddle 10.')).toBeInTheDocument()
    expect(screen.queryByText('You consulted The Winners. Huddle 0.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show earlier events/ }))
    expect(screen.getByText('You consulted The Winners. Huddle 0.')).toBeInTheDocument()
  })

  it('opens and highlights the exact history event linked from Pulse', async () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'the-winners',
      kind: 'GROUP',
      founderIds: ['human', 'lia', 'kai'],
      memberIds: [],
      name: 'The Winners',
      purpose: 'Coordinate the vote',
      at: { day: 1, phase: 'social_1' },
    })
    delete alliance.createdAt
    alliance.provenance = 'LEGACY'
    const event = appendRealityEvent(reality, {
      day: 2,
      phase: 'social_2',
      type: 'ALLIANCE_STRATEGY_MEETING',
      allianceId: alliance.id,
      actorId: 'human',
      targetIds: ['lia'],
      participantIds: ['human', 'lia'],
      witnessIds: [],
      visibility: 'GROUP_VISIBLE',
      outcome: 'SUCCESS',
      reason: 'strategy_meeting:the-winners:block_strategy:reality-event-20',
      allianceConsultationSummary: 'Lia recommends Remy for eviction.',
      tags: ['ALLIANCE', 'STRATEGY', 'MEETING'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: true,
    })
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    render(
      <AllianceRead
        alliance={alliance}
        reality={reality}
        humanId="human"
        players={players}
        selectedMemberId={null}
        focusEventId={event.id}
        onSelectMember={vi.fn()}
      />
    )

    expect(screen.getByText('Open full alliance read').closest('details')).toHaveAttribute('open')
    expect(screen.getByText('Founded Day 1')).toBeInTheDocument()
    expect(document.getElementById(`alliance-history-event-${event.id}`)).toHaveClass(
      'is-highlighted'
    )
    expect(screen.getByText('Day 2 · Before the vote')).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce())
  })
})
