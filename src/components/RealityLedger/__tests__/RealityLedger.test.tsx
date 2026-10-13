import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  addRealityFact,
  createDirectedRelationship,
  createInitialRealityDomainState,
  createRealityAlliance,
  learnRealityFact,
  recordRealityAllianceDiscovery,
} from '../../../social/reality'
import type { Player } from '../../../types'
import RealityLedger from '../RealityLedger'

const players = [
  { id: 'human', name: 'You', status: 'active', isUser: true },
  { id: 'lia', name: 'Lia', status: 'active' },
  { id: 'kai', name: 'Kai', status: 'active' },
  { id: 'nova', name: 'Nova', status: 'active' },
] as Player[]

describe('RealityLedger privacy projection', () => {
  it('shows learned claims and the player’s own relationship read without leaking hidden facts', () => {
    const reality = createInitialRealityDomainState()
    reality.relationships.human = {
      lia: createDirectedRelationship('human', 'lia', 42, ['alliance']),
    }
    reality.relationships.lia = {
      human: createDirectedRelationship('lia', 'human', -80, ['betrayal']),
    }
    addRealityFact(reality, {
      id: 'known-claim',
      propositionType: 'TARGETING_PLAN',
      subjectIds: ['kai'],
      objectId: 'human',
      value: true,
      day: 3,
      phase: 'social_2',
      visibility: 'PAIR_ONLY',
      participantIds: ['lia', 'kai'],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'event-1',
    })
    addRealityFact(reality, {
      id: 'hidden-fact',
      propositionType: 'SECRET_FINAL_TWO',
      subjectIds: ['lia', 'kai'],
      value: true,
      day: 3,
      phase: 'social_2',
      visibility: 'PRIVATE',
      participantIds: ['lia', 'kai'],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'event-2',
    })
    learnRealityFact(reality, {
      ownerId: 'human',
      factId: 'known-claim',
      memory: {
        id: 'memory-claim',
        ownerId: 'human',
        eventId: 'event-1',
        day: 3,
        phase: 'social_2',
        participantIds: ['lia', 'kai'],
        sourceType: 'HEARSAY',
        sourceChain: ['lia'],
        confidence: 0.66,
        importance: 0.6,
        surprise: 0.4,
        emotionalValence: -0.2,
        emotionalIntensity: 0.4,
        secrecy: 0.8,
        strategicRelevance: 0.9,
        visibility: 'PAIR_ONLY',
        tags: ['targeting'],
        relatedPromiseIds: [],
        relatedSecretIds: [],
        recallStrength: 1,
      },
    })

    render(<RealityLedger reality={reality} players={players} humanId="human" />)

    expect(screen.getByText('Your relationship reads')).toBeInTheDocument()
    expect(screen.getAllByText('Ally')).toHaveLength(2)
    expect(screen.queryByText('Enemy')).toBeNull()
    expect(screen.getByText(/private opinion of you remains hidden/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Known' }))
    expect(screen.getByText('Targeting Plan')).toBeInTheDocument()
    expect(screen.getByText('Heard through Lia')).toBeInTheDocument()
    expect(screen.queryByText('Secret Final Two')).toBeNull()
  })

  it('keeps the focused read to relationship dimensions without repeating its summary label', () => {
    const reality = createInitialRealityDomainState()
    const edge = createDirectedRelationship('human', 'lia', 10)
    edge.perceivedLabel = 'FRIENDLY'
    reality.relationships.human = { lia: edge }

    render(
      <RealityLedger
        reality={reality}
        players={players}
        humanId="human"
        relationships={{ human: { lia: { affinity: 10, tags: [] } } }}
        focusPlayerId="lia"
        section="relationships"
        compact
      />
    )

    expect(screen.getByText('Your relationship reads')).toBeInTheDocument()
    expect(screen.getByText('Trust')).toBeInTheDocument()
    expect(screen.getByText('Warmth')).toBeInTheDocument()
    expect(screen.queryByText('Friendly')).toBeNull()
  })

  it('uses the Reality category when the legacy affinity projects to Neutral', () => {
    const reality = createInitialRealityDomainState()
    const edge = createDirectedRelationship('human', 'lia', 8)
    edge.perceivedLabel = 'FRIENDLY'
    reality.relationships.human = { lia: edge }

    render(
      <RealityLedger
        reality={reality}
        players={players}
        humanId="human"
        relationships={{ human: { lia: { affinity: 8, tags: [] } } }}
        section="relationships"
        compact
      />
    )

    expect(screen.getAllByText('Friendly')).toHaveLength(2)
    expect(screen.queryByText('Neutral')).toBeNull()
  })

  it('shows only discovered alliance members supported by the player’s evidence', () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'hidden-coalition',
      founderIds: ['lia'],
      memberIds: ['kai', 'nova'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })
    recordRealityAllianceDiscovery(reality, {
      allianceId: alliance.id,
      observerId: 'human',
      revealedMemberIds: ['lia', 'kai'],
      confidence: 0.68,
      at: { day: 3, phase: 'social_2' },
      sourceEventId: 'heard-about-coalition',
      sourceId: 'lia',
      sourceType: 'HEARSAY',
    })

    render(<RealityLedger reality={reality} players={players} humanId="human" />)
    fireEvent.click(screen.getByRole('button', { name: 'Known' }))

    expect(screen.getByText('Suspected pact')).toBeInTheDocument()
    expect(screen.getByText(/Known links: Lia · Kai · other members unknown/)).toBeInTheDocument()
    expect(screen.queryByText(/Nova/)).toBeNull()
    expect(screen.queryByText(/cohesion/i)).toBeNull()
    expect(screen.queryByText(alliance.name ?? 'not-a-name')).toBeNull()
  })

  it('keeps alliance membership and controls in Social instead of duplicating them in the notebook', () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'player-coalition',
      founderIds: ['human', 'lia'],
      memberIds: ['kai'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    alliance.leaderIds = ['human', 'lia']
    alliance.memberPerceivedStatus.human = 'CORE'
    alliance.memberPerceivedStatus.lia = 'CORE'
    alliance.memberPerceivedStatus.kai = 'REGULAR'
    render(<RealityLedger reality={reality} players={players} humanId="human" />)
    fireEvent.click(screen.getByRole('button', { name: 'Known' }))
    expect(screen.queryByText('Night Shift')).toBeNull()
    expect(screen.queryByText(/cohesion/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'House stories' }))
    expect(screen.queryByText(/You \(Leader\)/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rename alliance' })).toBeNull()
  })

  it('keeps your current group out of Intel, where only discovered groups appear', () => {
    const reality = createInitialRealityDomainState()
    createRealityAlliance(reality, {
      id: 'new-coalition',
      founderIds: ['lia', 'kai'],
      memberIds: ['human'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })

    render(<RealityLedger reality={reality} players={players} humanId="human" />)
    fireEvent.click(screen.getByRole('button', { name: 'Known' }))

    expect(screen.queryByText('New group')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rename alliance' })).toBeNull()
  })
})
