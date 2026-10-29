import { configureStore, type Reducer, type UnknownAction } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { getNominationTargetScore } from '../../store/gameSlice'
import settingsReducer from '../../store/settingsSlice'
import type { RootState, AppDispatch } from '../../store/store'
import type { GameState } from '../../types'
import { withLohNominationPlanning } from '../../store/lohNominationPlanning'
import socialReducer from '../socialSlice'
import { initManeuvers } from '../SocialManeuvers'
import { SOCIAL_ACTIONS } from '../socialActions'
import { evaluateSocialActionEligibility } from '../socialActionEligibility'
import { createDirectedRelationship, createInitialRealityDomainState } from '../reality/state'
import { appendRealityEvent } from '../reality/events'
import { REALITY_ACTION_BY_ID, evaluateRealityCandidate } from '../reality/actionContract'
import { resolveRealityTargetResponse } from '../reality/response'
import { runRealityOpportunity } from '../reality/orchestrator'
import { recordRealityCeremonyOutcome } from '../reality/ceremonies'
import { createInitialRealitySimulationState } from '../realitySimulation'
import { buildLohConsultationSummary, executeHumanRealityAction } from '../reality/humanFlow'
import type { RealityContext, RealityDomainState } from '../reality/types'

const context: RealityContext = {
  day: 4,
  phase: 'pos_results',
  gameMode: 'CLASSIC',
  socialIntensity: 'REALITY',
  audienceMode: 'OFF',
  feedPerspective: 'PLAYER_LIMITED',
  activeActorIds: ['human', 'nominee'],
  rolesByActor: { human: ['pos'], nominee: ['nominated'] },
  atRiskActorIds: ['nominee'],
  powerHolderIds: ['human'],
}
const actors = {
  human: {
    id: 'human',
    name: 'You',
    active: true,
    isHuman: true,
    roles: ['pos'],
    resources: { energy: 30, influence: 1000, info: 1000 },
  },
  nominee: {
    id: 'nominee',
    name: 'Ash',
    active: true,
    isHuman: false,
    roles: ['nominated'],
    resources: { energy: 30, influence: 1000, info: 1000 },
  },
}
const players = [
  { id: 'human', status: 'pos' },
  { id: 'nominee', status: 'nominated' },
]

describe('POS protection offers', () => {
  it.each([0, 0.5, 0.999])(
    'welcomes an available Safety save without requiring an alliance (draw %s)',
    (draw) => {
      expect(
        resolveRealityTargetResponse({
          action: REALITY_ACTION_BY_ID.get('protect')!,
          actorId: 'human',
          targetId: 'nominee',
          reality: createInitialRealityDomainState(),
          context,
          draw,
        })
      ).toMatchObject({ accepted: true, reason: 'nominee_welcomes_available_safety_save' })
    }
  )

  it.each(['KEPT', 'BROKEN'] as const)(
    'records a concrete Safety promise that becomes %s at the ceremony',
    (expected) => {
      const resolved = runRealityOpportunity({
        domain: createInitialRealityDomainState(),
        simulation: createInitialRealitySimulationState(17),
        opportunity: {
          actorId: 'human',
          direction: 'HUMAN_TO_AI',
          context,
          actors,
          candidates: [{ action: REALITY_ACTION_BY_ID.get('protect')!, targetIds: ['nominee'] }],
        },
      })
      const reality = structuredClone(resolved.domain)
      const promise = Object.values(reality.promises)[0]
      expect(promise).toMatchObject({
        kind: 'use_safety_on_player',
        promisorId: 'human',
        beneficiaryIds: ['nominee'],
        deadline: { day: 4, phase: 'pos_ceremony_results' },
        status: 'ACTIVE',
      })
      recordRealityCeremonyOutcome(reality, {
        kind: expected === 'KEPT' ? 'SAFETY_USED' : 'SAFETY_DECLINED',
        day: 4,
        phase: 'pos_ceremony_results',
        actorId: 'human',
        targetIds: expected === 'KEPT' ? ['nominee'] : [],
        safetyEligibleTargetIds: ['nominee'],
        safetyDecisionComplete: true,
        witnessIds: ['human', 'nominee'],
        publicEligible: true,
      })
      expect(reality.promises[promise.id].status).toBe(expected)
    }
  )

  it('does not promise an already-spent Safety power', () => {
    const response = resolveRealityTargetResponse({
      action: REALITY_ACTION_BY_ID.get('protect')!,
      actorId: 'human',
      targetId: 'nominee',
      reality: createInitialRealityDomainState(),
      context: { ...context, phase: 'social_2' },
      draw: 0.999,
    })
    expect(response.accepted).toBe(false)
  })

  it('persists the actual Safety offer in the human result and action receipt', () => {
    const initialGame = gameReducer(undefined, { type: 'test/init' })
    const initialSocial = socialReducer(undefined, { type: 'test/init' })
    const initialSettings = settingsReducer(undefined, { type: 'test/init' })
    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
      preloadedState: {
        game: {
          ...initialGame,
          week: 4,
          phase: 'pos_results' as const,
          lohId: 'loh',
          posWinnerId: 'human',
          nomineeIds: ['nominee', 'pawn'],
          players: [
            { id: 'human', name: 'You', avatar: '🙂', isUser: true, status: 'pos' as const },
            { id: 'nominee', name: 'Ash', avatar: '🙂', status: 'nominated' as const },
            { id: 'pawn', name: 'Nova', avatar: '🙂', status: 'nominated' as const },
            { id: 'loh', name: 'Dex', avatar: '🙂', status: 'loh' as const },
          ],
          lohNominationPlan: null,
          lohSocialPlan: null,
        },
        social: {
          ...initialSocial,
          energyBank: { human: 30 },
          influenceBank: { human: 1000 },
          infoBank: { human: 1000 },
        },
        settings: {
          ...initialSettings,
          gameUX: { ...initialSettings.gameUX, dramaMode: true, dramaModeAdminOverride: true },
        },
      },
    })
    initManeuvers(store)
    const result = executeHumanRealityAction({
      actorId: 'human',
      targetId: 'nominee',
      actionId: 'protect',
    })(store.dispatch as AppDispatch, () => store.getState() as RootState)
    expect(result.summary).toContain('Ash welcomes your offer to use Safety on them')
    expect(result.summary).not.toContain('vote')
    const entry = store.getState().social.sessionLogs.at(-1)
    expect(entry?.narrative).toContain('use Safety')
    expect(entry?.receipt?.summary).toBe(result.summary)
    expect(entry?.receipt?.relationshipShifts).toBeDefined()
    expect(Object.values(store.getState().social.reality.promises)[0]?.kind).toBe(
      'use_safety_on_player'
    )
  })
})

function event(reality: RealityDomainState, actionId: string, tags: string[], day = 4) {
  return appendRealityEvent(reality, {
    day,
    phase: 'social_1',
    type: 'SOCIAL_INTERACTION_RESOLVED',
    actorId: 'human',
    actionId,
    targetIds: ['nominee'],
    participantIds: ['human', 'nominee'],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: 'SUCCESS',
    reason: 'test',
    tags,
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: false,
  })
}

describe.each(['apologize', 'repair_bond'])('%s requires something to repair', (actionId) => {
  function available(reality: RealityDomainState) {
    const action = SOCIAL_ACTIONS.find((candidate) => candidate.id === actionId)!
    const ui = evaluateSocialActionEligibility({
      action,
      actorId: 'human',
      targetIds: ['nominee'],
      players,
      relationships: {},
      reality,
      dramaMode: true,
      week: 4,
      phase: 'social_1',
      requireCompleteSelection: true,
    }).eligible
    const execution = evaluateRealityCandidate({
      action: REALITY_ACTION_BY_ID.get(actionId)!,
      actor: actors.human,
      targetIds: ['nominee'],
      actors,
      reality,
      direction: 'HUMAN_TO_AI',
      context: { ...context, phase: 'social_1' },
    }).eligible
    expect(ui).toBe(execution)
    return ui
  }
  it('is unavailable for a fresh neutral or healthy relationship', () => {
    const reality = createInitialRealityDomainState()
    expect(available(reality)).toBe(false)
    reality.relationships.nominee = { human: createDirectedRelationship('nominee', 'human', 65) }
    expect(available(reality)).toBe(false)
  })
  it('is available after damage in either direction, including a strong friendship with acute tension', () => {
    const reality = createInitialRealityDomainState()
    reality.relationships.nominee = { human: createDirectedRelationship('nominee', 'human', 65) }
    reality.relationships.nominee.human.acuteTension = 40
    expect(available(reality)).toBe(true)
    reality.relationships.nominee.human = createDirectedRelationship('nominee', 'human', -30)
    expect(available(reality)).toBe(true)
  })
  it('allows an unresolved grievance even when the visible relationship is positive', () => {
    const reality = createInitialRealityDomainState()
    reality.grievances.unresolved = {
      id: 'unresolved',
      holderId: 'nominee',
      againstId: 'human',
      causeEventId: 'fight',
      severity: 25,
      repairDebt: 15,
      createdAt: { day: 1, phase: 'social_1' },
      status: 'OPEN',
      apologyEventIds: [],
    }
    expect(available(reality)).toBe(true)
    reality.grievances.unresolved.status = 'RESOLVED'
    expect(available(reality)).toBe(false)
  })
  it('allows a recent fight or rumour, stops after successful repair, and reopens for a new incident', () => {
    const reality = createInitialRealityDomainState()
    reality.relationships.nominee = { human: createDirectedRelationship('nominee', 'human', 65) }
    event(reality, 'rumour', ['RUMOUR'])
    expect(available(reality)).toBe(true)
    event(reality, 'apologize', ['REPAIR'])
    expect(available(reality)).toBe(false)
    event(reality, 'confront', ['CONFLICT'])
    expect(available(reality)).toBe(true)
  })
  it('does not revive a healed dispute from stale betrayal tags or old history', () => {
    const reality = createInitialRealityDomainState()
    reality.relationships.nominee = { human: createDirectedRelationship('nominee', 'human', 65) }
    event(reality, 'betray', ['BETRAYAL'], 1)
    expect(available(reality)).toBe(false)
  })
})

function safetyState(strategy: 'direct' | 'backdoor'): GameState {
  const initial = gameReducer(undefined, { type: 'test/init' })
  return {
    ...initial,
    week: 4,
    phase: 'pos_results',
    lohId: 'loh',
    posWinnerId: 'human',
    nomineeIds: ['remy', 'nova'],
    replacementNomineeIds: [],
    povSavedId: null,
    povProtectedIds: [],
    coLohIds: null,
    players: [
      { id: 'human', name: 'You', avatar: '🙂', isUser: true, status: 'pos' },
      { id: 'loh', name: 'Dex', avatar: '🙂', status: 'loh' },
      { id: 'remy', name: 'Remy', avatar: '🙂', status: 'nominated' },
      { id: 'nova', name: 'Nova', avatar: '🙂', status: 'nominated' },
      { id: 'lux', name: 'Lux', avatar: '🙂', status: 'active' },
      { id: 'fallback', name: 'Sol', avatar: '🙂', status: 'active' },
    ],
    lohSocialPlan: {
      week: 4,
      lohId: 'loh',
      currentTargetId: 'remy',
      backupTargetId: 'lux',
      askCountsByPlayerId: {},
      disclosedTargetByPlayerId: {},
    },
    lohNominationPlan: {
      week: 4,
      lohId: 'loh',
      strategy,
      targetId: strategy === 'backdoor' ? 'lux' : 'remy',
      backupTargetId: strategy === 'backdoor' ? 'fallback' : 'lux',
      initialNomineeIds: ['remy', 'nova'],
      pawnIds: strategy === 'backdoor' ? ['remy', 'nova'] : ['nova'],
      status: 'initial_block_set',
      selectionBasis: 'strategy',
      targetScore: 80,
      backdoorChance: 0.6,
    },
  } as GameState
}
function consult(game: GameState) {
  return buildLohConsultationSummary(
    { game } as RootState,
    { actorId: 'human', targetId: 'loh', actionId: 'ask_loh_target' },
    'fallback'
  )
}

describe('canonical LOH Ambush advice', () => {
  it('does not sell an ordinary backup as an ambush while an original nominee remains the true target', () => {
    const summary = consult(safetyState('direct'))
    expect(summary).toContain('do not use it')
    expect(summary).toContain('Remy as the target')
    expect(summary).not.toContain('ambush')
  })
  it('keeps the advertised Ambush target through the actual replacement and locked-block consultation', () => {
    const state = safetyState('backdoor')
    expect(consult(state)).toContain('ambush on Lux')
    const base: Reducer<GameState, UnknownAction> = (current = state, action) =>
      action.type === 'test/save'
        ? {
            ...current,
            phase: 'pos_ceremony_results',
            povSavedId: 'remy',
            povProtectedIds: ['remy'],
            nomineeIds: ['nova', 'fallback'],
            replacementNomineeIds: ['fallback'],
            players: current.players.map((player) => ({
              ...player,
              status:
                player.id === 'remy'
                  ? 'active'
                  : player.id === 'fallback'
                    ? 'nominated'
                    : player.status,
            })),
          }
        : current
    const after = withLohNominationPlanning(base, getNominationTargetScore)(state, {
      type: 'test/save',
    })
    expect(after.nomineeIds).toContain('lux')
    expect(after.lohNominationPlan?.status).toBe('executed')
    expect(consult(after)).toContain('Lux is the person I most want out')
  })
  it('uses the executed canonical target even if an older save retained a stale social target', () => {
    const state = safetyState('backdoor')
    state.phase = 'social_2'
    state.nomineeIds = ['nova', 'lux']
    state.lohSocialPlan!.currentTargetId = 'nova'
    state.lohNominationPlan!.status = 'executed'
    expect(consult(state)).toContain('Lux is the person I most want out')
  })
  it('does not propose a plan against an immune target or put the Safety holder on the block', () => {
    const state = safetyState('backdoor')
    state.storeNominationProtections = [{ productKey: 'protection', targetId: 'lux', week: 4 }]
    expect(consult(state)).not.toContain('ambush')
    state.storeNominationProtections = []
    state.lohNominationPlan!.targetId = 'human'
    expect(consult(state)).not.toContain('ambush')
  })
})
