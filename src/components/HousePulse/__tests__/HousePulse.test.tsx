import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createInitialDramaSocialNetwork } from '../../../social/dramaModeEngine'
import {
  appendRealityEvent,
  createInitialRealityDomainState,
  createRealityAlliance,
} from '../../../social/reality'
import type { Player } from '../../../types'
import HousePulse from '../HousePulse'

const players = [
  { id: 'human', name: 'You', status: 'active', isUser: true },
  { id: 'lia', name: 'Lia', status: 'active', isUser: false },
  { id: 'kai', name: 'Kai', status: 'active', isUser: false },
] as Player[]

describe('HousePulse', () => {
  it('keeps earlier developments available without rendering them while collapsed', async () => {
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
    for (let index = 0; index < 5; index += 1) {
      appendRealityEvent(reality, {
        day: 2,
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
    }
    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
        reality={reality}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.queryByText('Huddle 0.')).toBeNull()
    fireEvent.click(screen.getByText('Earlier today · 2'))
    await waitFor(() => expect(screen.getByText('Huddle 0.')).toBeInTheDocument())
  })

  it('keeps a personal pact development out of the group-alliance selection flow', () => {
    const reality = createInitialRealityDomainState()
    createRealityAlliance(reality, {
      id: 'pact-lia',
      kind: 'PACT',
      founderIds: ['human', 'lia'],
      memberIds: [],
      purpose: 'Protection',
      at: { day: 2, phase: 'social_1' },
    })
    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
        reality={reality}
        onOpenAlliances={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(
      screen.getByRole('heading', { name: 'You formed a personal pact with Lia.' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View alliance' })).toBeNull()
  })

  it('shows the consultation result once and opens its highlighted alliance history entry', () => {
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
    const interaction = appendRealityEvent(reality, {
      day: 2,
      phase: 'social_2',
      type: 'SOCIAL_INTERACTION_RESOLVED',
      actionId: 'consult_alliance',
      actorId: 'human',
      targetIds: ['lia'],
      participantIds: ['human', 'lia'],
      witnessIds: [],
      visibility: 'GROUP_VISIBLE',
      outcome: 'SUCCESS',
      reason: 'The huddle took place.',
      tags: ['STRATEGY'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })
    const meeting = appendRealityEvent(reality, {
      day: 2,
      phase: 'social_2',
      type: 'ALLIANCE_STRATEGY_MEETING',
      allianceId: alliance.id,
      actorId: 'human',
      targetIds: ['remy'],
      participantIds: ['human', 'lia'],
      witnessIds: [],
      visibility: 'GROUP_VISIBLE',
      outcome: 'SUCCESS',
      reason: `strategy_meeting:${alliance.id}:eviction_vote:${interaction.id}`,
      allianceConsultationSummary:
        'Lia recommends Remy for eviction. You have not chosen a position, so no alliance vote is set yet.',
      tags: ['ALLIANCE', 'STRATEGY', 'MEETING'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: true,
    })
    const onOpenAlliances = vi.fn()

    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={[...players, { id: 'remy', name: 'Remy', status: 'active' } as Player]}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
        reality={reality}
        onOpenAlliances={onOpenAlliances}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.getByRole('heading', { name: 'You consulted The Winners.' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Lia recommends Remy for eviction. You have not chosen a position, so no alliance vote is set yet.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('You · Consult Alliance · Lia.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'View alliance history' }))
    expect(onOpenAlliances).toHaveBeenCalledWith(alliance.id, meeting.id)
  })
  it('opens a short Today briefing with direct Intel and Commitments sections', () => {
    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
        reality={createInitialRealityDomainState()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.getByText(/nothing important has changed today/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Intel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Commitments' })).toBeInTheDocument()
    expect(screen.queryByText('house stories')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Commitments' }))
    expect(screen.getByRole('heading', { name: 'Commitments' })).toBeInTheDocument()
  })

  it('responds to the Reality Social tutorial navigation events', () => {
    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
        reality={createInitialRealityDomainState()}
      />
    )

    act(() => {
      window.dispatchEvent(new Event('reality-social-tutorial:open-pulse'))
    })
    expect(screen.getByRole('dialog', { name: 'My Pulse' })).toBeInTheDocument()
    expect(screen.getByText(/nothing important has changed today/i)).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(
        new CustomEvent('reality-social-tutorial:set-pulse-tab', { detail: 'commitments' })
      )
    })
    expect(screen.getByRole('heading', { name: 'Commitments' })).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(
        new CustomEvent('reality-social-tutorial:set-pulse-tab', { detail: 'intel' })
      )
    })
    expect(screen.getByText('Leads and discoveries')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('reality-social-tutorial:close-pulse'))
    })
    expect(screen.queryByRole('dialog', { name: 'My Pulse' })).toBeNull()
  })

  it('presents a causal stream, continuing stories and concrete intel known to the player', () => {
    const network = createInitialDramaSocialNetwork()
    network.arcs.push({
      id: 'romance:human~lia:2',
      type: 'romance',
      participantIds: ['human', 'lia'],
      stage: 'building',
      intensity: 55,
      startedWeek: 2,
      lastAdvancedWeek: 2,
      public: false,
      status: 'active',
    })
    network.rumours.push({
      id: 'rumour-1',
      kind: 'targeting',
      originatorId: 'lia',
      subjectId: 'kai',
      claim: 'Lia heard Kai testing your name as a backup plan.',
      truth: 'uncertain',
      createdWeek: 2,
      expiresWeek: 5,
      status: 'circulating',
      listeners: [
        { playerId: 'human', sourceId: 'lia', confidence: 0.7, believed: true, heardWeek: 2 },
      ],
      sourceChain: ['lia', 'human'],
    })
    network.events.push({
      id: 'event-1',
      type: 'discovery',
      title: 'A plan surfaced',
      text: 'You caught a private conversation.',
      detail: 'Kai was named as the target.',
      consequence: 'Trust shifted.',
      participantIds: ['human', 'kai'],
      week: 2,
      phase: 'social_2',
      public: false,
      severity: 'major',
      createdAt: 20,
    })

    render(
      <HousePulse
        network={network}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.getByText('New information surfaced')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'stories' }))
    expect(screen.getByText('You and Lia')).toBeInTheDocument()
    expect(
      screen.getByText(/Repeated moments are turning into a real storyline/)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intel' }))
    expect(
      screen.getByText('Lia heard Kai testing your name as a backup plan.')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Social' }))
    expect(screen.queryByRole('dialog', { name: 'My Pulse' })).toBeNull()
  })

  it('shows a concise dissolution and opens that exact ended alliance record', () => {
    const reality = createInitialRealityDomainState()
    reality.alliances['alliance:shield'] = {
      id: 'alliance:shield',
      kind: 'GROUP',
      name: 'The Shield',
      memberIds: [],
      founderIds: ['human', 'kai', 'lia'],
      leaderIds: [],
      secrecy: 0.5,
      cohesion: 0.5,
      fractureRisk: 0,
      purpose: 'safety',
      currentTargetIds: [],
      fallbackTargetIds: [],
      sharedPromiseIds: [],
      memberCommitment: {},
      memberPerceivedStatus: {},
      memberPlanBeliefs: {},
      operationalRoles: {},
      suspectedByIds: [],
      knownLeakEventIds: [],
      overlapAllianceIds: [],
      status: 'DISSOLVED',
      genuine: true,
      infiltratorIds: [],
      endReason: 'DISSOLVED_BY_LEADER',
    }
    reality.events.push({
      id: 'alliance-ended',
      sequence: 1,
      day: 2,
      phase: 'social_2',
      type: 'ALLIANCE_ENDED',
      actorId: 'kai',
      targetIds: [],
      participantIds: ['human', 'kai', 'lia'],
      witnessIds: [],
      visibility: 'GROUP_VISIBLE',
      outcome: 'SUCCESS',
      reason: 'management:alliance:shield',
      tags: ['ALLIANCE', 'MANAGEMENT'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      allianceSnapshot: {
        id: 'alliance:shield',
        kind: 'GROUP',
        name: 'The Shield',
        memberIds: ['human', 'kai', 'lia'],
        endReason: 'DISSOLVED_BY_LEADER',
      },
      publicEligible: false,
      juryEligible: true,
    })
    const onOpenAlliances = vi.fn()

    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
        reality={reality}
        onOpenAlliances={onOpenAlliances}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.getByRole('heading', { name: 'Kai dissolved The Shield.' })).toBeInTheDocument()
    expect(screen.queryByText('An alliance ended')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View alliance history' }))
    expect(onOpenAlliances).toHaveBeenCalledWith('alliance:shield', 'alliance-ended')
  })
})
