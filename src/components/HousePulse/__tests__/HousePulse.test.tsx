import { act, fireEvent, render, screen } from '@testing-library/react'
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
  it('normalizes archived story terminology without changing the saved story', () => {
    const savedChronicle = {
      season: 1,
      day: 2,
      episodeKey: 'day:2',
      episodeLabel: 'Day 2',
      title: 'One Less Housemate',
      paragraphs: ['Two housemates changed the vote in the Hub.'],
      note: 'The houseguest left a mark on the story.',
      sourceEventIds: ['archived-event'],
      complete: true,
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
        season={1}
        gameId="saved-pulse-vocabulary"
        pulseChronicles={[savedChronicle]}
        reality={createInitialRealityDomainState()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))

    expect(screen.getByRole('heading', { name: 'One Less Hubmate' })).toBeInTheDocument()
    expect(screen.getByText('Two hubmates changed the vote in the Hub.')).toBeInTheDocument()
    expect(screen.getByText('The hubmate left a mark on the story.')).toBeInTheDocument()
    expect(savedChronicle.title).toBe('One Less Housemate')
  })

  it('writes a short producer-style daily chapter rather than reporting counts', () => {
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

    expect(screen.getByText('Your story in the Hub is unfolding.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.queryByText('Huddle 0.')).toBeNull()
    expect(screen.getByText('The Hub Chronicles')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Whispers in the Hub|Friends, Favors & Question Marks/ })
    ).toBeInTheDocument()
    expect(screen.queryByText(/Earlier today/)).toBeNull()
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
    expect(screen.getByText('The Hub Chronicles')).toBeInTheDocument()
    expect(screen.getByText(/A new alliance entered your story/)).toBeInTheDocument()
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
    appendRealityEvent(reality, {
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
    expect(screen.getByText('The Hub Chronicles')).toBeInTheDocument()
    expect(screen.getByText(/allies compared plans/)).toBeInTheDocument()
    expect(screen.queryByText(/Lia recommends Remy for eviction/)).toBeNull()
    expect(screen.queryByText('You · Consult Alliance · Lia.')).toBeNull()

    // Details stay in Intel / alliance history; Today is the narrative, not a second ledger.
    expect(screen.queryByRole('button', { name: 'View alliance history' })).toBeNull()
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
    expect(
      screen.getByText(/No major developments have reached your radar today/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Intel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Commitments' })).toBeInTheDocument()
    expect(screen.queryByText('house stories')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Commitments' }))
    expect(screen.getByRole('heading', { name: 'Commitments' })).toBeInTheDocument()
  })

  it('keeps completed episodes accessible after their source events are gone', () => {
    const reality = createInitialRealityDomainState()
    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={4}
        season={1}
        gameId="test-archive"
        reality={reality}
        pulseChronicles={[
          {
            season: 1,
            day: 3,
            title: 'A Surprising Goodbye',
            paragraphs: ['Kai left the Hub after a difficult vote.'],
            note: 'It was a memorable day.',
            sourceEventIds: ['eviction:3'],
            complete: true,
          },
        ]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    fireEvent.click(screen.getByText(/Previous episodes/))
    expect(screen.getByRole('heading', { name: 'A Surprising Goodbye' })).toBeInTheDocument()
    expect(screen.getByText(/Kai left the Hub/)).toBeInTheDocument()
  })

  it('shows the active weekend chapter without replaying the numbered day', () => {
    const reality = createInitialRealityDomainState()
    appendRealityEvent(reality, {
      day: 2,
      phase: 'loh_results',
      type: 'CEREMONY_POWER_WON',
      actorId: 'lia',
      targetIds: [],
      participantIds: ['lia'],
      witnessIds: ['human', 'lia', 'kai'],
      visibility: 'CEREMONY_PUBLIC',
      outcome: 'SYSTEM',
      reason: 'Weekday competition result',
      tags: ['loh'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[
          {
            id: 'weekend-action',
            actionId: 'compliment',
            actorId: 'human',
            targetId: 'kai',
            outcome: 'success',
            source: 'manual',
            week: 2,
            timestamp: 200,
            cost: 1,
            delta: 1,
            newEnergy: 3,
          },
        ]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={2}
        season={1}
        gameId="weekend-active"
        gamePhase="week_end"
        reality={reality}
        pulseChronicles={[
          {
            season: 1,
            day: 2,
            episodeKey: 'day:2',
            episodeLabel: 'Day 2',
            capturedThroughTimestamp: 100,
            capturedThroughRealitySequence: 0,
            title: 'Weekday episode',
            paragraphs: [],
            note: '',
            sourceEventIds: [],
            complete: true,
          },
        ]}
        weekendInterlude={{
          active: true,
          afterDay: 2,
          weekendNumber: 1,
          weekendDay: 1,
          episode: 'hub_says',
          stage: 'social',
          wallet: { energy: 10, influence: 0, info: 0 },
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.getByText(/Weekend 1 · Day 1 · The story so far/)).toBeInTheDocument()
    expect(screen.getByText(/You took time to connect with Kai/)).toBeInTheDocument()
    expect(screen.queryByText(/captured the LOH crown/)).toBeNull()
  })

  it('prefers a later Final Three episode over the finale weekend archive', () => {
    render(
      <HousePulse
        network={createInitialDramaSocialNetwork()}
        players={players}
        humanId="human"
        actionHistory={[]}
        relationships={{}}
        weekStartRelSnapshot={{}}
        currentWeek={14}
        season={1}
        reality={createInitialRealityDomainState()}
        pulseChronicles={[
          {
            season: 1,
            day: 14,
            episodeKey: 'weekend:3:14:2',
            episodeLabel: 'Finale weekend · Day 2',
            capturedThroughRealitySequence: 2,
            title: 'The Finale Weekend',
            paragraphs: ['The Tribunal gathered.'],
            note: '',
            sourceEventIds: ['weekend-event'],
            complete: true,
          },
          {
            season: 1,
            day: 14,
            episodeKey: 'day:14',
            episodeLabel: 'Day 14',
            capturedThroughRealitySequence: 3,
            title: 'The Final Two',
            paragraphs: ['The Final LOH chose Lia to leave.'],
            note: '',
            sourceEventIds: ['final-three-eviction'],
            complete: true,
          },
        ]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /my pulse/i }))
    expect(screen.getByText(/Day 14 · Episode complete/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The Final Two' })).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Previous episodes · 1/))
    expect(screen.getByRole('heading', { name: 'The Finale Weekend' })).toBeInTheDocument()
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
    expect(
      screen.getByText(/No major developments have reached your radar today/i)
    ).toBeInTheDocument()

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
    expect(screen.getByText('The Hub Chronicles')).toBeInTheDocument()
    expect(screen.getByText(/The Shield came to an end/)).toBeInTheDocument()
    expect(screen.queryByText('Kai dissolved The Shield.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View alliance history' })).toBeNull()
  })
})
