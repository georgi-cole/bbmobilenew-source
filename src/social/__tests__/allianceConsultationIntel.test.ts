import { describe, expect, it } from 'vitest'
import type { RealityBelief, RealityFact } from '../reality/types'
import { buildPreNominationLohRead } from '../reality/allianceConsultationIntel'

const players = [
  { id: 'human', name: 'You', status: 'active' as const },
  { id: 'echo', name: 'Echo', status: 'active' as const },
  { id: 'lux', name: 'Lux', status: 'active' as const },
  { id: 'dex', name: 'Dex', status: 'active' as const },
  { id: 'remy', name: 'Remy', status: 'active' as const },
  { id: 'nova', name: 'Nova', status: 'active' as const },
]

function makeBelief(
  ownerId: string,
  factId: string,
  sourceId: string,
  targetId: string
): RealityBelief {
  return {
    id: `belief:${ownerId}:${factId}`,
    ownerId,
    propositionType: 'TARGETING',
    subjectIds: [sourceId],
    objectId: targetId,
    value: true,
    confidence: 0.7,
    supportingMemoryIds: [`memory:${factId}`],
    contradictingBeliefIds: [],
    sourceChain: [sourceId],
    lastUpdatedDay: 4,
    status: 'ACTIVE',
  }
}

function makeTargetingFact(id: string, sourceId: string, targetId: string): RealityFact {
  return {
    id,
    propositionType: 'TARGETING',
    subjectIds: [sourceId],
    objectId: targetId,
    value: true,
    day: 4,
    phase: 'social_1',
    visibility: 'PRIVATE',
    participantIds: [sourceId, 'echo'],
    witnessIds: ['lux'],
    viewerVisible: false,
    publicVisible: false,
    juryVisible: false,
    sourceEventId: `event:${id}`,
  }
}

describe('pre-nomination alliance intelligence', () => {
  it('does not invent a target when no attending member has a clue', () => {
    const summary = buildPreNominationLohRead({
      allianceName: 'The Winners',
      actorId: 'human',
      lohId: 'echo',
      week: 4,
      attendingMemberIds: ['human', 'lux'],
      players,
      beliefsByOwner: {},
      facts: {},
    })

    expect(summary).toBe(
      "Pre-nomination read — No one in The Winners has a reliable read on Echo's plan yet."
    )
  })

  it('reports a member-disclosed LOH answer as a report, never a confirmed nomination', () => {
    const summary = buildPreNominationLohRead({
      actorId: 'human',
      lohId: 'echo',
      week: 4,
      attendingMemberIds: ['lux'],
      players,
      disclosuresByMemberId: { lux: 'nova' },
      beliefsByOwner: {},
      facts: {},
    })

    expect(summary).toContain('Lux says Echo named Nova as a possible target')
    expect(summary).toContain('unconfirmed clues')
    expect(summary).not.toContain('Nova is nominated')
  })

  it('includes the caller’s own disclosure in the huddle read', () => {
    const summary = buildPreNominationLohRead({
      actorId: 'human',
      lohId: 'echo',
      week: 4,
      attendingMemberIds: ['human', 'lux'],
      players,
      disclosuresByMemberId: { human: 'remy' },
      disclosureOutcomeByMemberId: { human: 'truthful' },
      beliefsByOwner: {},
      facts: {},
    })

    expect(summary).toContain('You report that Echo named Remy as a possible target')
  })

  it('frames a witnessed pitch to the LOH as a clue about advice, not the LOH’s decision', () => {
    const fact = makeTargetingFact('pitch-remy', 'dex', 'remy')
    const summary = buildPreNominationLohRead({
      actorId: 'human',
      lohId: 'echo',
      week: 4,
      attendingMemberIds: ['lux'],
      players,
      beliefsByOwner: {
        lux: {
          [makeBelief('lux', fact.id, 'dex', 'remy').id]: makeBelief('lux', fact.id, 'dex', 'remy'),
        },
      },
      facts: { [fact.id]: fact },
    })

    expect(summary).toContain('Lux heard Dex urge Echo to consider Remy')
    expect(summary).toContain('not a locked nomination')
  })

  it('ignores stale clues and disclosures about inactive players', () => {
    const staleFact = { ...makeTargetingFact('old-pitch', 'dex', 'remy'), day: 3 }
    const staleBelief = { ...makeBelief('lux', staleFact.id, 'dex', 'remy'), lastUpdatedDay: 3 }
    const summary = buildPreNominationLohRead({
      actorId: 'human',
      lohId: 'echo',
      week: 4,
      attendingMemberIds: ['lux'],
      players: players.map((player) =>
        player.id === 'nova' ? { ...player, status: 'evicted' as const } : player
      ),
      disclosuresByMemberId: { lux: 'nova' },
      disclosureOutcomeByMemberId: { lux: 'vague' },
      beliefsByOwner: { lux: { [staleBelief.id]: staleBelief } },
      facts: { [staleFact.id]: staleFact },
    })

    expect(summary).toContain("No one in your alliance has a reliable read on Echo's plan yet")
    expect(summary).not.toContain('Nova')
    expect(summary).not.toContain('Remy')
  })
})
