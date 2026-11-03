import { describe, expect, it } from 'vitest'
import { createRealityAlliance } from '../reality/relationshipForms'
import { appendRealityEvent, visibleRealityEvents } from '../reality/events'
import {
  createRealityNemesisObjective,
  nemesisThreadId,
  reconcileNemesisWithVoluntarySafety,
} from '../reality/relationshipAutonomy'
import { createInitialRealityDomainState, normalizeRealityDomainState } from '../reality/state'
import { advanceNemesisNarrative, explainNemesisMotive } from '../reality/nemesisNarrative'
import { selectCanonicalRelationshipView } from '../relationshipSemantics'
import type { RealityDomainState } from '../reality/types'

const players = { human: 'You', echo: 'Echo' }

function context(day: number, phase: string, echoActive = true) {
  return {
    day,
    phase,
    humanId: 'human',
    playerNames: players,
    activePlayerIds: new Set(echoActive ? ['human', 'echo', 'a'] : ['human', 'a']),
  }
}

function secretObjective(
  domain: RealityDomainState,
  reason: 'SOCIAL_REACH' | 'PERSONAL_FRICTION' = 'SOCIAL_REACH'
) {
  return createRealityNemesisObjective(domain, {
    ownerId: 'echo',
    targetId: 'human',
    sourceEventId: 'private-reason',
    reason,
    at: { day: 3, phase: 'social_1' },
  })
}

describe('Nemesis storyline — reliable discovery', () => {
  it('generates one anonymous clue then exposes Echo and the persisted motive on the following day', () => {
    const reality = createInitialRealityDomainState()
    const pact = createRealityAlliance(reality, {
      id: 'echo-pact',
      founderIds: ['human', 'echo'],
      memberIds: [],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    pact.status = 'ACTIVE'
    const objective = secretObjective(reality)

    expect(advanceNemesisNarrative(reality, context(3, 'social_1'))).toEqual([])
    expect(advanceNemesisNarrative(reality, context(3, 'loh_results'))).toEqual([])
    const first = advanceNemesisNarrative(reality, context(3, 'social_2'))
    expect(first).toHaveLength(1)
    expect(first[0].kind).toBe('clue')
    expect(first[0].text).not.toContain('Echo')
    expect(objective.clueEventId).toBe(first[0].eventId)
    expect(advanceNemesisNarrative(reality, context(3, 'social_2'))).toEqual([])
    expect(advanceNemesisNarrative(reality, context(3, 'week_end'))).toEqual([])
    expect(
      selectCanonicalRelationshipView({
        reality,
        actorId: 'human',
        targetId: 'echo',
      }).isNemesis
    ).toBe(false)

    const visible = visibleRealityEvents(reality, { actorId: 'human' })
    expect(visible.some((event) => event.type === 'NEMESIS_ANONYMOUS_CLUE')).toBe(true)
    expect(visible.some((event) => event.type === 'NEMESIS_PRIVATE_PRESSURE')).toBe(false)
    expect(visible.some((event) => event.type === 'NEMESIS_OBJECTIVE_FORMED')).toBe(false)
    const privateMove = reality.events.find((event) => event.type === 'NEMESIS_PRIVATE_PRESSURE')
    expect(privateMove?.witnessIds).toEqual(['a'])
    expect(visibleRealityEvents(reality, { actorId: 'a' })).toContain(privateMove)
    expect(reality.relationships.a?.human?.suspicion).toBeGreaterThan(0)

    const reveal = advanceNemesisNarrative(reality, context(4, 'social_1'))
    expect(reveal).toHaveLength(1)
    expect(reveal[0].kind).toBe('reveal')
    expect(reveal[0].text).toContain('Echo')
    expect(reveal[0].text).toContain('Echo has turned against you')
    expect(reveal[0].text).not.toContain('Why?')
    expect(reality.events.find((event) => event.type === 'NEMESIS_REVEALED')?.reason).toContain(
      'growing influence'
    )
    expect(objective.revealEventId).toBe(reveal[0].eventId)
    expect(pact.status).toBe('DISSOLVED')
    expect(pact.memberIds).toEqual([])
    expect(pact.endReason).toBe('NEMESIS_REVEALED')
    expect(reality.events.filter((event) => event.type === 'ALLIANCE_ENDED')).toHaveLength(1)
    expect(
      selectCanonicalRelationshipView({
        reality,
        actorId: 'human',
        targetId: 'echo',
      }).isNemesis
    ).toBe(true)
    expect(advanceNemesisNarrative(reality, context(4, 'social_2'))).toEqual([])
    expect(reality.events.filter((event) => event.type === 'NEMESIS_REVEALED')).toHaveLength(1)
  })

  it('ends only the personal pact and strains a group without removing the nemesis or the human', () => {
    const reality = createInitialRealityDomainState()
    const pact = createRealityAlliance(reality, {
      id: 'personal-pact',
      founderIds: ['human', 'echo'],
      memberIds: [],
      kind: 'PACT',
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    const group = createRealityAlliance(reality, {
      id: 'working-group',
      kind: 'GROUP',
      founderIds: ['human', 'echo', 'jax'],
      memberIds: [],
      purpose: 'Control the vote',
      at: { day: 2, phase: 'social_1' },
    })
    pact.status = 'ACTIVE'
    group.status = 'ACTIVE'
    secretObjective(reality)
    expect(pact.status).not.toBe('DISSOLVED')
    expect(group.memberIds).toContain('echo')
    expect(advanceNemesisNarrative(reality, context(3, 'social_2'))[0]?.kind).toBe('clue')
    const reveal = advanceNemesisNarrative(reality, context(4, 'social_1'))
    expect(reveal[0]?.text).toContain('personal pact has ended')
    expect(pact.status).toBe('DISSOLVED')
    expect(pact.memberIds).toHaveLength(0)
    expect(pact.endReason).toBe('NEMESIS_REVEALED')
    expect(group.status).toBe('FRACTURED')
    expect(group.memberIds).toEqual(expect.arrayContaining(['human', 'echo', 'jax']))
    expect(group.memberIds).toHaveLength(3)
    expect(group.memberCommitment.echo).toBeLessThanOrEqual(0.2)
    expect(
      reality.events.filter((event) => event.type === 'ALLIANCE_MEMBER_DEFECTED')
    ).toHaveLength(1)
    expect(reality.events.filter((event) => event.type === 'ALLIANCE_ENDED')).toHaveLength(1)
    expect(advanceNemesisNarrative(reality, context(4, 'social_2'))).toEqual([])
  })

  it('migrates an already revealed Nemesis and open old-save pact without duplicating dissolution', () => {
    const original = createInitialRealityDomainState()
    const pact = createRealityAlliance(original, {
      id: 'legacy-pact',
      founderIds: ['human', 'echo'],
      memberIds: [],
      kind: 'PACT',
      purpose: 'Shared promises',
      at: { day: 2, phase: 'social_1' },
    })
    pact.status = 'ACTIVE'
    const nemesis = secretObjective(original)
    nemesis.revealEventId = 'old-reveal'
    nemesis.revealedAt = { day: 3, phase: 'social_2' }
    const normalized = normalizeRealityDomainState(original)
    expect(normalized.alliances['legacy-pact'].status).toBe('DISSOLVED')
    expect(normalized.alliances['legacy-pact'].endReason).toBe('NEMESIS_REVEALED')
    expect(original.alliances['legacy-pact'].status).toBe('ACTIVE')
    const twice = normalizeRealityDomainState(normalized)
    expect(twice.events.filter((event) => event.type === 'ALLIANCE_ENDED')).toHaveLength(1)
    expect(twice.alliances['legacy-pact'].status).toBe('DISSOLVED')
  })

  it('does not invent a conversation with a nonexistent third contestant', () => {
    const reality = createInitialRealityDomainState()
    secretObjective(reality)
    const clue = advanceNemesisNarrative(reality, {
      ...context(3, 'social_2'),
      activePlayerIds: new Set(['human', 'echo']),
    })
    expect(clue[0]?.text).toContain('privately planning')
    const privateMove = reality.events.find((event) => event.type === 'NEMESIS_PRIVATE_PRESSURE')
    expect(privateMove?.participantIds).toEqual(['echo'])
    expect(privateMove?.witnessIds).toEqual([])
  })

  it('does not falsely blame a historical nomination when the recorded motive is social reach', () => {
    const reality = createInitialRealityDomainState()
    appendRealityEvent(reality, {
      day: 2,
      phase: 'nomination_results',
      type: 'CEREMONY_NOMINATIONS_LOCKED',
      actorId: 'human',
      targetIds: ['echo'],
      participantIds: ['human', 'echo'],
      witnessIds: [],
      visibility: 'HOUSE_PUBLIC',
      outcome: 'SYSTEM',
      reason: 'Quartz nominated Echo.',
      tags: ['NOMINATION'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
    const objective = secretObjective(reality, 'SOCIAL_REACH')
    const motive = explainNemesisMotive(reality, objective)
    expect(motive).toContain('growing influence')
    expect(motive).not.toContain('nominated')
  })

  it('does not show an anonymous clue after an actually witnessed confrontation', () => {
    const reality = createInitialRealityDomainState()
    appendRealityEvent(reality, {
      day: 2,
      phase: 'nominations',
      type: 'CEREMONY_NOMINATIONS_LOCKED',
      actorId: 'human',
      targetIds: ['echo'],
      participantIds: ['human', 'echo'],
      witnessIds: [],
      visibility: 'HOUSE_PUBLIC',
      outcome: 'SYSTEM',
      reason: 'You nominated Echo.',
      tags: ['NOMINATION'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
    const conflict = appendRealityEvent(reality, {
      day: 3,
      phase: 'social_1',
      type: 'PROVOCATEUR_CONFLICT_STARTED',
      actorId: 'echo',
      targetIds: ['human'],
      participantIds: ['echo', 'human'],
      witnessIds: [],
      visibility: 'PAIR_ONLY',
      outcome: 'SYSTEM',
      reason: 'season_provocateur_nomination',
      tags: ['CONFLICT', 'PROVOCATEUR'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })
    const nemesis = createRealityNemesisObjective(reality, {
      ownerId: 'echo',
      targetId: 'human',
      sourceEventId: conflict.id,
      reason: 'PERSONAL_FRICTION',
      at: { day: 3, phase: 'social_1' },
    })
    expect(explainNemesisMotive(reality, nemesis)).toContain('nominated them on Day 2')
    const beats = advanceNemesisNarrative(reality, context(3, 'social_2'))
    expect(beats).toHaveLength(1)
    expect(beats[0].kind).toBe('reveal')
    expect(beats[0].text).not.toContain('Day 2')
    expect(reality.events.find((event) => event.type === 'NEMESIS_REVEALED')?.reason).toContain(
      'nominated them on Day 2'
    )
    expect(reality.events.some((event) => event.type === 'NEMESIS_ANONYMOUS_CLUE')).toBe(false)
  })

  it('does not leak hidden identity from an unrelated visible dispute before revelation', () => {
    const reality = createInitialRealityDomainState()
    secretObjective(reality)
    appendRealityEvent(reality, {
      day: 3,
      phase: 'social_2',
      type: 'PROVOCATEUR_CONFLICT_STARTED',
      actorId: 'echo',
      targetIds: ['human'],
      participantIds: ['echo', 'human'],
      witnessIds: [],
      visibility: 'PAIR_ONLY',
      outcome: 'SYSTEM',
      reason: 'An argument about strategy',
      tags: ['CONFLICT'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })
    expect(
      selectCanonicalRelationshipView({
        reality,
        actorId: 'human',
        targetId: 'echo',
      }).isNemesis
    ).toBe(false)
    const reveal = advanceNemesisNarrative(reality, context(4, 'social_1'))
    expect(reveal[0]?.kind).toBe('reveal')
    expect(
      selectCanonicalRelationshipView({
        reality,
        actorId: 'human',
        targetId: 'echo',
      }).isNemesis
    ).toBe(true)
  })

  it('closes the unresolved story as a retrospective reveal when Echo exits', () => {
    const reality = createInitialRealityDomainState()
    const objective = secretObjective(reality, 'PERSONAL_FRICTION')
    expect(advanceNemesisNarrative(reality, context(3, 'social_2'))[0].kind).toBe('clue')
    const closing = advanceNemesisNarrative(reality, context(3, 'week_end', false))
    expect(closing).toHaveLength(1)
    expect(closing[0].kind).toBe('reveal')
    expect(closing[0].text).toContain("Echo's exit")
    expect(closing[0].text).not.toContain('Why?')
    expect(reality.events.find((event) => event.type === 'NEMESIS_REVEALED')?.reason).toContain(
      'Unresolved friction'
    )
    expect(objective.status).toBe('ENDED')
    expect(reality.threads[nemesisThreadId(objective)].status).toBe('RESOLVED')
    expect(advanceNemesisNarrative(reality, context(4, 'social_1', false))).toEqual([])
  })

  it('lets an eliminated human juror learn who targeted them and why', () => {
    const reality = createInitialRealityDomainState()
    const objective = secretObjective(reality)
    const truth = advanceNemesisNarrative(reality, {
      ...context(3, 'week_end'),
      activePlayerIds: new Set(['echo', 'a']),
    })
    expect(truth).toHaveLength(1)
    expect(truth[0].kind).toBe('reveal')
    expect(truth[0].text).toContain('before your elimination')
    expect(truth[0].text).toContain('Echo')
    expect(objective.status).toBe('ENDED')
    expect(reality.threads[nemesisThreadId(objective)].status).toBe('RESOLVED')
    expect(advanceNemesisNarrative(reality, context(4, 'social_1'))).toEqual([])
  })

  it('preserves separate bounded episodes when the same pair enters a new feud', () => {
    const reality = createInitialRealityDomainState()
    const episodes = []
    for (let index = 1; index <= 6; index += 1) {
      const objective = createRealityNemesisObjective(reality, {
        ownerId: 'echo',
        targetId: 'human',
        sourceEventId: `feud-${index}`,
        at: { day: index * 3, phase: 'social_1' },
      })
      episodes.push(objective)
      if (index < 6) {
        reconcileNemesisWithVoluntarySafety(reality, {
          actorId: 'human',
          savedIds: ['echo'],
          eventId: `repair-${index}`,
          at: { day: index * 3 + 1, phase: 'social_1' },
        })
        if (index === 1) {
          const replay = createRealityNemesisObjective(reality, {
            ownerId: 'echo',
            targetId: 'human',
            sourceEventId: 'feud-1',
            at: { day: 3, phase: 'social_1' },
          })
          expect(replay).toBe(objective)
          expect(replay.status).toBe('RECONCILED')
        }
      }
    }

    expect(episodes[0].id).not.toBe(episodes[1].id)
    expect(episodes[0].status).toBe('RECONCILED')
    expect(reality.relationshipAutonomy.nemeses[episodes[5].id].status).toBe('ACTIVE')
    expect(Object.values(reality.relationshipAutonomy.nemeses)).toHaveLength(4)
    expect(reality.threads[nemesisThreadId(episodes[5])].status).toBe('OPEN')
    expect(reality.threads[nemesisThreadId(episodes[0])]).toBeUndefined()
  })

  it('reveals a late active Nemesis before the endgame even when normal social phases stop', () => {
    const reality = createInitialRealityDomainState()
    secretObjective(reality)
    const closure = advanceNemesisNarrative(reality, context(3, 'final3'))
    expect(closure).toHaveLength(1)
    expect(closure[0].kind).toBe('reveal')
    expect(advanceNemesisNarrative(reality, context(3, 'final3_comp1'))).toEqual([])
  })

  it('also closes the storyline when a finale skips directly to the jury', () => {
    const reality = createInitialRealityDomainState()
    secretObjective(reality)
    const closure = advanceNemesisNarrative(reality, context(4, 'jury_announcement'))
    expect(closure).toHaveLength(1)
    expect(closure[0].kind).toBe('reveal')
    expect(advanceNemesisNarrative(reality, context(4, 'jury_cinematic'))).toEqual([])
  })

  it('explains an undisclosed Nemesis after a real reconciliation without reviving hostility', () => {
    const reality = createInitialRealityDomainState()
    const objective = secretObjective(reality)
    reconcileNemesisWithVoluntarySafety(reality, {
      actorId: 'human',
      savedIds: ['echo'],
      eventId: 'real-safety-rescue',
      at: { day: 3, phase: 'pos_ceremony_results' },
    })
    const epilogue = advanceNemesisNarrative(reality, context(4, 'social_1'))
    expect(epilogue).toHaveLength(1)
    expect(epilogue[0].text).toContain('once saw you as a rival')
    expect(epilogue[0].text).toContain('Echo')
    expect(epilogue[0].text).toContain('Safety rescue helped change their mind')
    expect(
      reality.events.find((event) => event.type === 'NEMESIS_RECONCILIATION_REVEALED')?.reason
    ).toContain('growing influence')
    expect(objective.status).toBe('RECONCILED')
    expect(reality.events.some((event) => event.type === 'NEMESIS_REVEALED')).toBe(false)
    expect(
      reality.events.filter((event) => event.type === 'NEMESIS_RECONCILIATION_REVEALED')
    ).toHaveLength(1)
    expect(advanceNemesisNarrative(reality, context(5, 'social_1'))).toEqual([])
  })

  it('preserves the clue and revelation checkpoints across save hydration without replay', () => {
    const reality = createInitialRealityDomainState()
    secretObjective(reality)
    expect(advanceNemesisNarrative(reality, context(3, 'social_2'))[0].kind).toBe('clue')
    const reloaded = normalizeRealityDomainState(reality)
    expect(advanceNemesisNarrative(reloaded, context(3, 'social_2'))).toEqual([])
    expect(advanceNemesisNarrative(reloaded, context(4, 'social_1'))[0].kind).toBe('reveal')
    const reloadedAgain = normalizeRealityDomainState(reloaded)
    expect(advanceNemesisNarrative(reloadedAgain, context(5, 'social_1'))).toEqual([])
    expect(reloadedAgain.events.filter((event) => event.type === 'NEMESIS_REVEALED')).toHaveLength(
      1
    )
  })
})
