import { seededUnit } from '../socialStrategyShared'
import { getRealityRelationship } from '../reality/relationships'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  getNominationTargetScore,
} from '../../store/gameSlice'
import { withLohNominationPlanning } from '../../store/lohNominationPlanning'
import type { AppDispatch, RootState } from '../../store/store'
import type { Player } from '../../types'
import { planAiAllianceProposal } from '../aiAlliancePlanning'
import { planAiCampaignMove } from '../aiCampaignPlanning'
import {
  aiFacadeAcceptanceChance,
  facadeNominationWasUsed,
  resolveAiFacadeReply,
  runAiFacadeNegotiation,
} from '../aiFacadeStrategy'
import { executeAllianceManagementCommand } from '../allianceManagementActions'
import { advanceAllianceRequests } from '../reality/allianceManagement'
import { allianceManagementContext } from '../allianceManagementActions'
import { createInitialRealityDomainState, ensureRealityActors } from '../reality/state'
import { createRealityAlliance } from '../reality/relationshipForms'
import socialReducer, { replaceRealityDomain } from '../socialSlice'
import { getIncomingInteractionResponseOptions } from '../incomingInteractionPresentation'
import {
  respondToIncomingInteraction,
  autoResolveExpiredIncomingInteractionsForClock,
} from '../incomingInteractions'
import { createIncomingInteraction } from '../incomingInteractionFactory'
import { evaluateIncomingInteractionEnqueueDecision } from '../incomingInteractionAutonomy'
import { getInteractionDedupeReason } from '../incomingInteractionScheduler'

const facadeSeed = Array.from({ length: 100 }, (_, index) => index + 1).find(
  (seed) => seededUnit(seed, 'facade-initiative:4:ai-1') < 0.1
)!

function fixture(seed = 1) {
  const game = createInitialGameState()
  game.week = 4
  game.phase = 'social_1'
  game.mode = 'classic'
  game.seed = seed
  game.players = ['user', 'ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-5', 'ai-6', 'ai-7'].map(
    (id) =>
      ({
        id,
        name: id,
        avatar: '',
        isUser: id === 'user',
        status: id === 'ai-1' ? 'loh' : 'active',
        stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
      }) as Player
  )
  game.lohId = 'ai-1'
  game.nomineeIds = []
  game.lohNominationPlan = {
    week: 4,
    lohId: 'ai-1',
    targetId: 'ai-7',
    backupTargetId: 'ai-6',
    pawnIds: ['ai-2'],
    initialNomineeIds: ['ai-7', 'ai-2'],
    strategy: 'direct',
    status: 'planned',
    selectionBasis: 'strategy',
    targetScore: 50,
    backdoorChance: 0,
  }
  const domain = createInitialRealityDomainState()
  ensureRealityActors(
    domain,
    game.players.map((player) => player.id)
  )
  for (const actor of game.players) {
    for (const target of game.players) {
      if (actor.id === target.id) continue
      Object.assign(getRealityRelationship(domain, actor.id, target.id), {
        warmth: 12,
        trust: 9,
        reliability: 10,
        strategicValue: 8,
        loyalty: 8,
      })
    }
  }
  const baseSocial = socialReducer(undefined, replaceRealityDomain(domain))
  const social = {
    ...baseSocial,
    energyBank: Object.fromEntries(game.players.map((player) => [player.id, 10])),
    influenceBank: Object.fromEntries(game.players.map((player) => [player.id, 20])),
    infoBank: Object.fromEntries(game.players.map((player) => [player.id, 100])),
  }
  const store = configureStore({
    reducer: {
      game: withLohNominationPlanning(gameReducer, getNominationTargetScore),
      social: socialReducer,
    },
    preloadedState: { game, social },
  })
  return {
    store,
    dispatch: store.dispatch as AppDispatch,
    getState: store.getState as () => RootState,
  }
}

describe('AI social competition', () => {
  it('naturally proposes and forms larger groups at ordinary early-season relationship levels', () => {
    let attempts = 0
    let formed = 0
    for (let seed = 1; seed <= 32; seed++) {
      const { dispatch, getState } = fixture(seed)
      for (const actor of getState().game.players.filter((player) => !player.isUser)) {
        const proposal = planAiAllianceProposal(getState(), actor.id)
        if (!proposal) continue
        const before = getState().social.energyBank[actor.id]
        dispatch(executeAllianceManagementCommand(proposal))
        attempts++
        expect(getState().social.energyBank[actor.id]).toBe(before - 3)
        expect(getState().social.influenceBank[actor.id]).toBe(15)
      }
      const groups = Object.values(getState().social.reality.alliances).filter(
        (entry) => entry.kind === 'GROUP'
      )
      formed += groups.length
      expect(groups.every((entry) => entry.memberIds.length >= 3)).toBe(true)
      expect(
        Object.values(getState().social.reality.allianceManagement.requests).length
      ).toBeLessThanOrEqual(2)
    }
    expect(attempts).toBeGreaterThan(20)
    expect(formed).toBeGreaterThan(4)
    expect(formed).toBeLessThan(attempts) // Consent remains a real decision.
  })

  it('does not invent human consent, and will not spend resources it does not have', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    state.social.energyBank['ai-1'] = 0
    expect(planAiAllianceProposal(state, 'ai-1')).toBeNull()
    expect(planAiAllianceProposal(state, 'user')).toBeNull()
    const domain = structuredClone(state.social.reality)
    domain.allianceManagement.requests.test = {
      id: 'test',
      kind: 'FOUND',
      status: 'CONSENT',
      proposerId: 'ai-1',
      memberIds: ['ai-1', 'ai-2', 'user'],
      electorateIds: [],
      officerIds: [],
      votes: {},
      consents: { 'ai-1': true, 'ai-2': true },
      purpose: 'Mutual protection',
      createdAt: { day: 4, phase: 'social_1' },
      deadline: { day: 4, phase: 'social_2' },
    }
    advanceAllianceRequests(domain, allianceManagementContext(state))
    expect(domain.allianceManagement.requests.test.consents.user).toBeUndefined()
    expect(domain.allianceManagement.requests.test.status).toBe('CONSENT')
  })

  it('recruits through member approval rather than directly adding a group member', () => {
    const { getState, dispatch } = fixture(2)
    const state = structuredClone(getState())
    const group = createRealityAlliance(state.social.reality, {
      id: 'group',
      kind: 'GROUP',
      founderIds: ['ai-1', 'ai-2', 'ai-3'],
      memberIds: [],
      at: { day: 2, phase: 'social_1' },
      purpose: 'Mutual protection',
      leaderId: 'ai-1',
    })
    group.status = 'ACTIVE'
    dispatch(replaceRealityDomain(state.social.reality))
    const proposal = Array.from({ length: 12 }, (_, seed) =>
      planAiAllianceProposal({ ...getState(), game: { ...getState().game, seed } }, 'ai-1')
    ).find(Boolean)
    expect(proposal?.kind).toBe('ADMIT')
    expect(proposal?.allianceId).toBe('group')
    expect(getState().social.reality.alliances.group.memberIds).toHaveLength(3)
  })

  it('a nominee without an alliance campaigns to a legal voter and stops repeating the same pitch', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    state.game.phase = 'social_2'
    state.game.nomineeIds = ['ai-2', 'ai-7']
    const move = planAiCampaignMove(state, 'ai-2')!
    expect(move.actionId).toBe('rally_votes_against')
    expect(move.subjectId).toBe('ai-7')
    expect(move.targetIds).not.toContain('ai-1')
    expect(move.targetIds.some((id) => state.game.nomineeIds.includes(id))).toBe(false)
    state.social.actionHistory = [
      {
        actorId: 'ai-2',
        targetId: move.targetIds[0],
        actionId: move.actionId,
        subjectId: move.subjectId,
        week: 4,
      } as never,
    ]
    expect(planAiCampaignMove(state, 'ai-2')?.targetIds).not.toEqual(move.targetIds)
    state.game.voxPopuli = { ...state.game.voxPopuli!, status: 'active' }
    expect(planAiCampaignMove(state, 'ai-2')).toBeNull()
  })

  it('requests Safety for self and does not treat the human as a voter when nominated', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    state.game.phase = 'pos_results'
    state.game.nomineeIds = ['ai-2', 'user']
    state.game.posWinnerId = 'ai-3'
    expect(planAiCampaignMove(state, 'ai-2')).toMatchObject({
      actionId: 'ask_use_safety',
      targetIds: ['ai-3'],
      subjectId: 'ai-2',
    })
  })

  it('excludes co-leaders and the Cupid leader partner from house-vote campaigns', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    state.game.phase = 'social_2'
    state.game.nomineeIds = ['ai-2', 'ai-7']
    state.game.coLohIds = ['ai-1', 'ai-3']
    state.game.cupidArrow = {
      ...state.game.cupidArrow,
      status: 'active',
      pairs: [{ id: 'leader-pair', memberIds: ['ai-1', 'user'] }],
    } as never
    state.social.relationships['ai-2'].user.affinity = 70
    const move = planAiCampaignMove(state, 'ai-2')!
    expect(move.targetIds).not.toContain('user')
    expect(move.targetIds).not.toContain('ai-3')
  })

  it('lets a meaningful campaign follow a basic same-day conversation without raising the actor cap', () => {
    const context = {
      week: 5,
      phase: 'social_2',
      seed: 5,
      nomineeIds: ['ai-2', 'ai-7'],
      lohId: 'ai-1',
      players: fixture().getState().game.players,
      relationships: {},
      random: () => 0.5,
    }
    const chat = createIncomingInteraction({
      id: 'hello',
      fromId: 'ai-2',
      type: 'check_in',
      text: 'Hello',
      week: 5,
      phase: 'week_start',
      mode: 'normal',
      responsePolicy: 'optional',
    })
    const decision = evaluateIncomingInteractionEnqueueDecision('ai-2', 'user', context, [chat])
    expect(decision.allowed).toBe(true)
    expect(decision.plan?.scenarioKey).toBe('nominee_campaign')
    const pitch = createIncomingInteraction({
      id: 'campaign',
      fromId: 'ai-2',
      type: 'check_in',
      text: 'Please keep me',
      week: 5,
      phase: 'social_2',
      mode: 'normal',
      payload: { scenarioKey: 'nominee_campaign', dedupeGroup: 'decision:nominee_campaign:5' },
    })
    expect(
      getInteractionDedupeReason({
        interaction: pitch,
        priority: 'high',
        pendingInteractions: [chat],
        week: 5,
      })
    ).toBeNull()
    expect(
      evaluateIncomingInteractionEnqueueDecision('ai-2', 'user', context, [chat, pitch]).reason
    ).toBe('blocked_by_actor_cap')
  })

  it('records AI pawn consent or refusal and keeps that choice scoped to one nomination', () => {
    let accepted = 0
    let declined = 0
    for (let seed = 1; seed <= 32; seed++) {
      const { getState, dispatch } = fixture(seed)
      runAiFacadeNegotiation(dispatch, getState)
      const agreement = Object.values(getState().social.reality.facadeAgreements)[0]
      if (!agreement) continue
      expect(getState().social.energyBank['ai-1']).toBe(9)
      runAiFacadeNegotiation(dispatch, getState)
      expect(getState().social.energyBank['ai-1']).toBe(9)
      if (agreement.status === 'ACCEPTED') {
        accepted++
        expect(getState().game.lohNominationPlan?.initialNomineeIds).toContain(agreement.facadeId)
        expect(getState().game.lohNominationPlan?.targetId).toBe('ai-7')
      } else declined++
    }
    expect(accepted).toBeGreaterThan(0)
    expect(declined).toBeGreaterThan(0)
  })

  it('a human pawn gets an explicit choice; declining or ignoring does not grant consent', () => {
    for (const response of ['accept', 'decline', 'ignore'] as const) {
      const { getState, dispatch } = fixture(facadeSeed)
      const state = structuredClone(getState())
      state.social.reality.relationships['ai-1'].user.trust = 60
      dispatch(replaceRealityDomain(state.social.reality))
      runAiFacadeNegotiation(dispatch, getState)
      const interaction = getState().social.incomingInteractions[0]
      expect(interaction?.payload?.scenarioKey).toBe('facade_nomination_request')
      expect(getState().social.reality.facadeAgreements[interaction.id].status).toBe('PROPOSED')
      const choices = getIncomingInteractionResponseOptions('deal_offer', interaction)
      if (response === 'ignore') resolveAiFacadeReply(dispatch, getState, interaction, response)
      else
        dispatch(
          respondToIncomingInteraction({
            interactionId: interaction.id,
            choiceId: choices.find((choice) => choice.responseType === response)!.id,
          })
        )
      expect(getState().social.reality.facadeAgreements[interaction.id].status).toBe(
        response === 'accept' ? 'ACCEPTED' : response === 'ignore' ? 'EXPIRED' : 'DECLINED'
      )
      expect(getState().social.incomingInteractions[0].resolved).toBe(true)
    }
  })

  it('keeps façade negotiations available to Classic saves with an omitted mode', () => {
    const { getState } = fixture(facadeSeed)
    const state = structuredClone(getState())
    state.game.mode = undefined
    const legacyStore = configureStore({
      reducer: {
        game: withLohNominationPlanning(gameReducer, getNominationTargetScore),
        social: socialReducer,
      },
      preloadedState: { game: state.game, social: state.social },
    })
    runAiFacadeNegotiation(
      legacyStore.dispatch as AppDispatch,
      legacyStore.getState as () => RootState
    )
    expect(Object.values(legacyStore.getState().social.reality.facadeAgreements)).toHaveLength(1)
  })

  it('uses the actual Standard-mode block to resolve a pawn arrangement without Reality ceremonies', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    const agreement = {
      id: 'pawn',
      day: 4,
      lohId: 'ai-1',
      facadeId: 'ai-2',
      intendedEvicteeId: 'ai-7',
      stage: 'INITIAL_NOMINATION' as const,
      status: 'ACCEPTED' as const,
      voluntary: true,
    }
    expect(facadeNominationWasUsed(state, agreement)).toBe(false)
    state.game.lastWeekNominationRecord = { week: 4, lohId: 'ai-1', nomineeIds: ['ai-2', 'ai-7'] }
    expect(facadeNominationWasUsed(state, agreement)).toBe(true)
    expect(facadeNominationWasUsed(state, { ...agreement, day: 5 })).toBe(false)
    expect(facadeNominationWasUsed(state, { ...agreement, lohId: 'ai-3' })).toBe(false)
  })

  it('expired façade offers close without consent or a blanket relationship penalty', () => {
    const { getState, dispatch } = fixture(facadeSeed)
    const state = structuredClone(getState())
    state.social.reality.relationships['ai-1'].user.trust = 60
    dispatch(replaceRealityDomain(state.social.reality))
    runAiFacadeNegotiation(dispatch, getState)
    const before = getState().social.reality.relationships['ai-1'].user.trust
    dispatch(autoResolveExpiredIncomingInteractionsForClock(4, 'nomination_results'))
    expect(Object.values(getState().social.reality.facadeAgreements)[0].status).toBe('EXPIRED')
    expect(getState().social.reality.relationships['ai-1'].user.trust).toBe(before)
    expect(
      aiFacadeAcceptanceChance(
        {
          ...getState(),
          game: { ...getState().game, players: getState().game.players.slice(0, 6) },
        },
        'ai-1',
        'ai-2'
      )
    ).toBe(0)
  })

  it('closes an obsolete façade card instead of leaving a nonfunctional reply', () => {
    const { getState, dispatch } = fixture(facadeSeed)
    const state = structuredClone(getState())
    state.social.reality.relationships['ai-1'].user.trust = 60
    dispatch(replaceRealityDomain(state.social.reality))
    runAiFacadeNegotiation(dispatch, getState)
    const interaction = getState().social.incomingInteractions[0]
    const domain = structuredClone(getState().social.reality)
    delete domain.facadeAgreements[interaction.id]
    dispatch(replaceRealityDomain(domain))
    resolveAiFacadeReply(dispatch, getState, interaction, 'accept')
    expect(getState().social.incomingInteractions[0]).toMatchObject({
      resolved: true,
      resolvedWith: 'neutral',
    })
    expect(Object.values(getState().social.reality.facadeAgreements)).toHaveLength(0)
  })
})
