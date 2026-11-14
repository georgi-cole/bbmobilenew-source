import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer from '../../store/gameSlice'
import type { AppDispatch, RootState } from '../../store/store'
import socialReducer, { pushIncomingInteraction } from '../socialSlice'
import { createIncomingInteraction } from '../incomingInteractionFactory'
import { respondToIncomingInteraction } from '../incomingInteractions'
import { getIncomingInteractionResponseOptions } from '../incomingInteractionPresentation'
import { isIncomingInteractionInvalidated } from '../incomingInteractionValidity'
import { buildAllianceConsultationPlan } from '../reality/humanFlow'
import { advanceAllianceRequests } from '../reality/allianceManagement'
import { allianceEventText } from '../reality/allianceHistory'
import { createRealityAlliance, removeRealityAllianceMember } from '../reality/relationshipForms'
import { createInitialRealityDomainState } from '../reality/state'
import { getRealityRelationship } from '../reality/relationships'
import { createRealityNemesisObjective } from '../reality/relationshipAutonomy'
import { advanceNemesisNarrative } from '../reality/nemesisNarrative'
import { selectCanonicalRelationshipView } from '../relationshipSemantics'
import { registerProvocateurConflict } from '../seasonProvocateurs'

function fixture(memberIds = ['human', 'ally', 'loh']) {
  const initial = gameReducer(undefined, { type: '@@test' })
  const reality = createInitialRealityDomainState()
  const alliance = createRealityAlliance(reality, {
    id: 'team',
    kind: 'GROUP',
    founderIds: memberIds.length < 3 ? [...memberIds, 'spare'] : memberIds,
    memberIds: [],
    purpose: 'Mutual protection',
    at: { day: 4, phase: 'social_1' },
  })
  alliance.status = 'ACTIVE'
  if (memberIds.length < 3)
    removeRealityAllianceMember(reality, {
      allianceId: alliance.id,
      memberId: 'spare',
      actorId: 'spare',
      kind: 'ELIMINATED',
      at: { day: 4, phase: 'social_1' },
    })
  const state = {
    game: {
      ...initial,
      mode: 'classic',
      week: 4,
      phase: 'pos_results',
      lohId: 'loh',
      posWinnerId: 'nominee-a',
      nomineeIds: ['nominee-a', 'nominee-b'],
      players: ['human', 'ally', 'loh', 'nominee-a', 'nominee-b', 'outside', 'spare'].map((id) => ({
        id,
        name: id,
        isUser: id === 'human',
        status: id === 'loh' ? 'loh' : 'active',
        stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
      })),
    },
    social: { ...socialReducer(undefined, { type: '@@test' }), reality },
  } as unknown as RootState
  return { state, reality, alliance }
}

describe('reported alliance decision contexts', () => {
  it('plans a conditional backup when a nominee outside the alliance wins Safety', () => {
    const { state, alliance } = fixture()
    const plan = buildAllianceConsultationPlan(state, alliance, 'human')
    expect(plan?.agenda).toBe('backup_plan')
    expect(plan?.summary).toContain('expected to save themselves')
    expect(plan?.summary).toContain('Safety has not been used yet')
    expect(plan?.summary).toContain('backup nominee')
    expect(plan?.targetIds).toEqual([])
  })

  it('prioritizes a vacant backup seat over another Safety consultation', () => {
    const { state, alliance } = fixture(['human', 'ally', 'loh', 'nominee-a'])
    state.game.replacementNeeded = true
    state.game.phase = 'pos_ceremony_results'
    state.game.povSavedId = 'nominee-a'
    state.game.nomineeIds = ['nominee-b']
    expect(buildAllianceConsultationPlan(state, alliance, 'human')?.agenda).toBe('replacement')
  })

  it("does not claim to know a nonattending Safety holder's private decision", () => {
    const { state, alliance } = fixture()
    state.game.posWinnerId = 'outside'
    const plan = buildAllianceConsultationPlan(state, alliance, 'human')
    expect(plan?.agenda).toBe('safety_contingency')
    expect(plan?.summary).toContain('has not disclosed a decision here')
    expect(plan?.summary).toContain('eviction vote are still open')
  })

  it('does not invent a backup choice when the LOH is outside the huddle', () => {
    const { state, alliance } = fixture(['human', 'ally'])
    state.game.replacementNeeded = true
    state.game.phase = 'pos_ceremony_results'
    state.game.povSavedId = 'nominee-a'
    state.game.nomineeIds = ['nominee-b']
    const plan = buildAllianceConsultationPlan(state, alliance, 'human')
    expect(plan?.agenda).toBe('replacement_watch')
    expect(plan?.summary).toContain('has not shared a choice')
    expect(plan?.targetIds).toEqual([])
  })

  it('keeps a nominated ally out of both double-elimination recommendations', () => {
    const { state, alliance } = fixture(['human', 'ally'])
    state.game.phase = 'social_2'
    state.game.nomineeIds = ['ally', 'nominee-a', 'nominee-b']
    state.game.doubleEviction = { ...state.game.doubleEviction!, weekActive: true }
    const plan = buildAllianceConsultationPlan(state, alliance, 'human')
    expect(plan?.agenda).toBe('eviction_vote')
    expect(plan?.targetIds).toHaveLength(2)
    expect(plan?.targetIds).not.toContain('ally')
    expect(plan?.summary).toContain('cannot cast an eviction vote')
    expect(plan?.summary).toContain('survival appeal')
  })

  it('expires New Pact on its third day and removes a stale projected new tag', () => {
    const { reality, alliance } = fixture(['human', 'ally'])
    alliance.kind = 'PACT'
    alliance.status = 'PROBATIONARY'
    const context = {
      at: { day: 5, phase: 'week_start' },
      activeActorIds: ['human', 'ally'],
      humanActorIds: ['human', 'ally'],
      seed: 1,
    }
    advanceAllianceRequests(reality, context)
    expect(alliance.status).toBe('PROBATIONARY')
    advanceAllianceRequests(reality, { ...context, at: { day: 6, phase: 'week_start' } })
    expect(alliance.status).toBe('ACTIVE')
    expect(
      selectCanonicalRelationshipView({
        reality,
        actorId: 'human',
        targetId: 'ally',
        relationships: { human: { ally: { affinity: 30, tags: ['new_alliance'] } } },
      }).visibleTags.has('new_alliance')
    ).toBe(false)
  })

  it('preserves the actual exit reason after the former alliance changes', () => {
    const { reality, alliance } = fixture()
    alliance.fractureRisk = 0.8
    removeRealityAllianceMember(reality, {
      allianceId: alliance.id,
      memberId: 'ally',
      actorId: 'ally',
      kind: 'VOLUNTARY',
      at: { day: 5, phase: 'social_2' },
    })
    const departure = reality.events.find((event) => event.type === 'ALLIANCE_MEMBER_LEFT')!
    alliance.fractureRisk = 0
    expect(allianceEventText(reality, departure, 'human', (id) => id)).toContain(
      'because the group had become too fractured'
    )
  })

  it('supersedes a warm check-in after its sender is nominated by the human', () => {
    const { state, reality } = fixture()
    state.game.lohId = 'human'
    state.game.phase = 'pos_ceremony_results'
    const card = createIncomingInteraction({
      id: 'warm-before-nomination',
      mode: 'drama',
      fromId: 'nominee-a',
      type: 'check_in',
      text: 'I feel more comfortable with you than expected.',
      week: 4,
      phase: 'social_1',
      payload: { scenarioKey: 'relationship_friendship_check_in' },
    })
    expect(isIncomingInteractionInvalidated(card, state.game, reality)).toBe(true)
  })

  it('answers an alliance question without resolving the card or committing a vote', () => {
    const { state, reality, alliance } = fixture()
    state.game.phase = 'social_1'
    state.game.nomineeIds = []
    const card = createIncomingInteraction({
      id: 'ask-why',
      fromId: 'loh',
      type: 'deal_offer',
      text: 'I want the alliance read.',
      week: 4,
      phase: 'social_1',
      mode: 'drama',
      payload: {
        scenarioKey: 'alliance_power_nomination_huddle',
        allianceId: alliance.id,
        subjectId: 'outside',
        allianceGroupHuddle: true,
        allianceGroupMemberIds: ['human', 'ally', 'loh'],
      },
    })
    const store = configureStore({
      reducer: { game: () => state.game, social: socialReducer },
      preloadedState: { social: { ...state.social, reality } },
    })
    store.dispatch(pushIncomingInteraction(card))
    const dispatch = store.dispatch as unknown as AppDispatch
    dispatch(
      respondToIncomingInteraction({
        interactionId: card.id,
        responseType: 'neutral',
        responseLabel: 'Ask why outside is the priority',
      })
    )
    const after = store.getState().social
    expect(after.incomingInteractions[0].resolved).toBe(false)
    expect(after.incomingInteractions[0].outcomeText).toContain('As LOH I will make')
    expect(after.incomingInteractions[0].outcomeText).toContain('still back the proposal')
    expect(
      getIncomingInteractionResponseOptions(card.type, after.incomingInteractions[0]).some(
        (option) => option.label === 'Stay neutral'
      )
    ).toBe(true)
    expect(after.reality.alliances[alliance.id].currentTargetIds).toEqual([])
    expect(Object.values(after.reality.voteIntents)).toEqual([])
  })
})

describe('major relationship ruptures', () => {
  it('makes a directly observed rivalry visibly reduce trust and raise tension', () => {
    const reality = createInitialRealityDomainState()
    registerProvocateurConflict(reality, {
      actorId: 'ally',
      targetId: 'human',
      at: { day: 4, phase: 'social_1' },
      cause: 'PERSONALITY_CLASH',
    })
    const edge = reality.relationships.human.ally
    expect(edge.trust).toBeLessThanOrEqual(-15)
    expect(edge.acuteTension).toBeGreaterThan(35)
    expect(edge.perceivedLabel).toBe('RIVAL')
  })

  it('makes a private nemesis emotionally significant only for the owner, then impacts the target on reveal', () => {
    const reality = createInitialRealityDomainState()
    const owner = getRealityRelationship(reality, 'ally', 'human')
    const target = getRealityRelationship(reality, 'human', 'ally')
    const before = target.trust
    const input = {
      ownerId: 'ally',
      targetId: 'human',
      sourceEventId: 'rupture',
      at: { day: 4, phase: 'social_1' },
    }
    createRealityNemesisObjective(reality, input)
    expect(owner.trust).toBeLessThanOrEqual(-20)
    expect(owner.acuteTension).toBeGreaterThan(40)
    expect(target.trust).toBe(before)
    const savedTrust = owner.trust
    createRealityNemesisObjective(reality, input)
    expect(owner.trust).toBe(savedTrust)
    advanceNemesisNarrative(reality, {
      day: 4,
      phase: 'social_2',
      humanId: 'human',
      playerNames: { human: 'You', ally: 'Ally' },
      activePlayerIds: new Set(['human', 'ally', 'outside']),
    })
    advanceNemesisNarrative(reality, {
      day: 5,
      phase: 'social_1',
      humanId: 'human',
      playerNames: { human: 'You', ally: 'Ally' },
      activePlayerIds: new Set(['human', 'ally', 'outside']),
    })
    expect(target.trust).toBeLessThanOrEqual(before - 25)
    expect(target.acuteTension).toBeGreaterThan(50)
  })
})
