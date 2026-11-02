import { describe, expect, it } from 'vitest'
import { createRealityAlliance } from '../reality/relationshipForms'
import { appendRealityEvent, visibleRealityEvents } from '../reality/events'
import {
  createRealityNemesisObjective,
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
    activePlayerIds: new Set(echoActive ? ['human', 'echo'] : ['human']),
  }
}

function secretObjective(domain: RealityDomainState, reason: 'SOCIAL_REACH' | 'PERSONAL_FRICTION' = 'SOCIAL_REACH') {
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
    expect(selectCanonicalRelationshipView({
      reality,
      actorId: 'human',
      targetId: 'echo',
    }).isNemesis).toBe(false)

    const visible = visibleRealityEvents(reality, { actorId: 'human' })
    expect(visible.some((event) => event.type === 'NEMESIS_ANONYMOUS_CLUE')).toBe(true)
    expect(visible.some((event) => event.type === 'NEMESIS_PRIVATE_PRESSURE')).toBe(false)
    expect(visible.some((event) => event.type === 'NEMESIS_OBJECTIVE_FORMED')).toBe(false)

    const reveal = advanceNemesisNarrative(reality, context(4, 'social_1'))
    expect(reveal).toHaveLength(1)
    expect(reveal[0].kind).toBe('reveal')
    expect(reveal[0].text).toContain('Echo')
    expect(reveal[0].text).toContain('growing influence')
    expect(objective.revealEventId).toBe(reveal[0].eventId)
    expect(pact.status).toBe('FRACTURED')
    expect(selectCanonicalRelationshipView({
      reality,
      actorId: 'human',
      targetId: 'echo',
    }).isNemesis).toBe(true)
    expect(advanceNemesisNarrative(reality, context(4, 'social_2'))).toEqual([])
    expect(reality.events.filter((event) => event.type === 'NEMESIS_REVEALED')).toHaveLength(1)
  })

  it('does not show an anonymous clue after an actually witnessed confrontation', () => {
    const reality = createInitialRealityDomainState()
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
    expect(explainNemesisMotive(reality, nemesis)).toContain('nominated on Day 3')
    const beats = advanceNemesisNarrative(reality, context(3, 'social_2'))
    expect(beats).toHaveLength(1)
    expect(beats[0].kind).toBe('reveal')
    expect(beats[0].text).toContain('nominated on Day 3')
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
    expect(selectCanonicalRelationshipView({
      reality,
      actorId: 'human',
      targetId: 'echo',
    }).isNemesis).toBe(false)
    const reveal = advanceNemesisNarrative(reality, context(4, 'social_1'))
    expect(reveal[0]?.kind).toBe('reveal')
    expect(selectCanonicalRelationshipView({
      reality,
      actorId: 'human',
      targetId: 'echo',
    }).isNemesis).toBe(true)
  })

  it('closes the unresolved story as a retrospective reveal when Echo exits', () => {
    const reality = createInitialRealityDomainState()
    const objective = secretObjective(reality, 'PERSONAL_FRICTION')
    expect(advanceNemesisNarrative(reality, context(3, 'social_2'))[0].kind).toBe('clue')
    const closing = advanceNemesisNarrative(reality, context(3, 'week_end', false))
    expect(closing).toHaveLength(1)
    expect(closing[0].kind).toBe('reveal')
    expect(closing[0].text).toContain("Echo's departure")
    expect(closing[0].text).toContain('Unresolved friction')
    expect(objective.status).toBe('ENDED')
    expect(reality.threads['nemesis-thread:echo:human'].status).toBe('RESOLVED')
    expect(advanceNemesisNarrative(reality, context(4, 'social_1', false))).toEqual([])
  })

  it('reveals a late active Nemesis before the endgame even when normal social phases stop', () => {
    const reality = createInitialRealityDomainState()
    secretObjective(reality)
    const closure = advanceNemesisNarrative(reality, context(3, 'final3'))
    expect(closure).toHaveLength(1)
    expect(closure[0].kind).toBe('reveal')
    expect(advanceNemesisNarrative(reality, context(3, 'final3_comp1'))).toEqual([])
  })

  it('does not disclose a Nemesis who was genuinely reconciled before the next beat', () => {
    const reality = createInitialRealityDomainState()
    secretObjective(reality)
    reconcileNemesisWithVoluntarySafety(reality, {
      actorId: 'human',
      savedIds: ['echo'],
      eventId: 'real-safety-rescue',
      at: { day: 3, phase: 'pos_ceremony_results' },
    })
    expect(advanceNemesisNarrative(reality, context(4, 'social_1'))).toEqual([])
    expect(reality.events.some((event) => event.type === 'NEMESIS_REVEALED')).toBe(false)
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
    expect(reloadedAgain.events.filter((event) => event.type === 'NEMESIS_REVEALED')).toHaveLength(1)
  })
})
