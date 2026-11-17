import { configureStore, createAction, type UnknownAction } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../store/gameSlice'
import type { AppDispatch, RootState } from '../../store/store'
import type { GameState, Player } from '../../types'
import publicReducer, { initializeProfiles } from '../../publicOpinion/publicOpinionSlice'
import { createAudienceBreakdown } from '../../publicOpinion/audienceBreakdown'
import { publicOpinionMiddleware } from '../../publicOpinion/publicOpinionMiddleware'
import { realityJurorScorecard } from '../../utils/juryUtils'
import socialReducer, {
  hydrateSocial,
  recordSocialAction,
  replaceRealityDomain,
} from '../socialSlice'
import { migrateSocialState } from '../socialStateMigration'
import { createInitialRealityDomainState } from '../reality/state'
import { getRealityRelationship } from '../reality/relationships'
import {
  normalizeSocialParticipation,
  participationForDay,
  participationQuietStreak,
  backingTarget,
  visibilityTarget,
} from '../socialParticipation'
import { processSocialParticipationDay } from '../socialParticipationEffects'
import { getIncomingInteractionResponseOptions } from '../incomingInteractionPresentation'
import { respondToIncomingInteraction } from '../incomingInteractions'
import { createIncomingInteraction } from '../incomingInteractionFactory'
import { socialStrategyMiddleware } from '../socialStrategyMiddleware'
import type { SocialActionLogEntry } from '../types'

const patchGame = createAction<Partial<GameState>>('test/participation-day')
const ids = ['user', 'ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-5', 'ai-6', 'ai-7']

function fixture(publicMode = true, withDayBoundary = false) {
  const game = createInitialGameState()
  game.players = ids.map(
    (id) =>
      ({
        id,
        name: id,
        avatar: '',
        status: 'active',
        isUser: id === 'user',
        stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
      }) as Player
  )
  game.week = 1
  game.phase = 'eviction_results'
  game.publicModeEnabled = publicMode
  game.lohId = null
  game.posWinnerId = null
  game.nomineeIds = []
  const domain = createInitialRealityDomainState()
  for (const from of ids)
    for (const to of ids)
      if (from !== to) {
        Object.assign(getRealityRelationship(domain, from, to), {
          warmth: 10,
          trust: 10,
          respect: 20,
          loyalty: 10,
          familiarity: 10,
        })
      }
  const store = configureStore({
    reducer: {
      game: (state: GameState = game, action: UnknownAction): GameState =>
        patchGame.match(action)
          ? { ...state, ...action.payload }
          : action.type === 'game/advance'
            ? { ...state, phase: 'week_end' as const }
            : state,
      social: socialReducer,
      publicOpinion: publicReducer,
    },
    middleware: (defaults) =>
      defaults().concat(
        publicOpinionMiddleware,
        ...(withDayBoundary ? [socialStrategyMiddleware] : [])
      ),
  })
  store.dispatch(replaceRealityDomain(domain))
  store.dispatch(initializeProfiles(ids))
  const getState = store.getState as () => RootState
  const dispatch = store.dispatch as AppDispatch
  const assess = () =>
    processSocialParticipationDay({ dispatch: store.dispatch, getState }, getState())
  const day = (day: number) => {
    store.dispatch(patchGame({ week: day }))
    assess()
  }
  return { store, getState, dispatch, assess, day }
}

const action = (
  actorId: string,
  week: number,
  actionId = 'share_intel',
  source: 'manual' | 'system' = 'manual'
): SocialActionLogEntry => ({
  actionId,
  actorId,
  targetId: 'ai-7',
  cost: 0,
  delta: 0,
  outcome: 'success',
  newEnergy: 20,
  timestamp: week,
  week,
  phase: 'social_1',
  source,
})

describe('meaningful social participation', () => {
  it('records completed day boundaries through the live middleware and stops treating silence as a secret agenda', () => {
    const { store, getState } = fixture(true, true)
    for (let day = 1; day <= 6; day++) {
      store.dispatch(patchGame({ week: day, phase: 'eviction_results' }))
      store.dispatch({ type: 'game/advance' })
    }
    expect(getState().social.participation?.processedDays).toEqual([1, 2, 3, 4, 5, 6])
    expect(getState().social.reality.relationships['ai-1'].user.suspicion).toBe(0)
    expect(getState().social.participation?.effectsByActor.user.publicAdjustment).toBe(-2)
    const before = JSON.stringify(getState())
    store.dispatch({ type: 'game/advance' })
    expect(JSON.stringify(getState())).toBe(before)
  })
  it('counts substantive play identically for human and AI without requiring energy spending', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    state.social.actionHistory = [action('user', 4), action('ai-1', 4, 'share_intel', 'system')]
    expect(participationForDay(state, 'user', 4).credits).toBe(2)
    expect(participationForDay(state, 'ai-1', 4).credits).toBe(2)
    state.social.actionHistory = [
      action('user', 4, 'idle'),
      action('ai-1', 4, 'dbg-social', 'system'),
    ]
    expect(participationForDay(state, 'user', 4).credits).toBe(0)
    expect(participationForDay(state, 'ai-1', 4).credits).toBe(0)
  })

  it('credits genuine replies and honest refusals, but never expiry, invalidation or unread cards', () => {
    const { getState } = fixture()
    for (const origin of ['player', 'deadline', 'invalidation'] as const) {
      const state = structuredClone(getState())
      state.social.incomingInteractions = [
        {
          ...createIncomingInteraction({
            id: 'request',
            fromId: 'ai-1',
            type: 'deal_offer',
            text: 'Will you work with me?',
            week: 4,
            phase: 'social_1',
            mode: 'normal',
            responsePolicy: 'required',
          }),
          resolved: true,
          resolvedWeek: 4,
          resolutionOrigin: origin,
          resolvedWith: 'decline',
        },
      ]
      expect(participationForDay(state, 'user', 4).credits).toBe(origin === 'player' ? 2 : 0)
    }
  })

  it('does not let repeated copies of one small-talk action simulate multiple contacts', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    state.social.actionHistory = Array.from({ length: 30 }, () => action('user', 4, 'compliment'))
    expect(participationForDay(state, 'user', 4).credits).toBe(1)
    state.social.actionHistory.push({ ...action('user', 4, 'reassure'), targetId: 'ai-6' })
    expect(participationForDay(state, 'user', 4).credits).toBe(2)
  })

  it('counts an explicit alliance decision, including declining, without needing a paid action', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    state.social.reality.events.push({
      id: 'consent',
      sequence: 1,
      day: 4,
      phase: 'social_1',
      type: 'ALLIANCE_REQUEST_CONSENT',
      actorId: 'user',
      participantIds: ['user', 'ai-1'],
      targetIds: [],
      witnessIds: [],
      visibility: 'PAIR_ONLY',
      outcome: 'FAILURE',
      reason: 'Declined',
      tags: [],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })
    expect(participationForDay(state, 'user', 4).credits).toBe(2)
    expect(participationForDay(state, 'user', 4).visible).toBe(false)
  })

  it('has a grace period, needs sustained observed quiet, and caps late-game contributions', () => {
    expect(backingTarget(3, 3)).toBe(0)
    expect(backingTarget(5, 2)).toBe(0)
    expect(backingTarget(5, 5)).toBe(-1)
    expect(backingTarget(20, 7)).toBe(-5)
    expect(backingTarget(20, 20)).toBe(-6)
    expect(visibilityTarget(20, 20, false, -4)).toBe(-4)
    expect(visibilityTarget(20, 20, true, -4)).toBe(-2)
    expect(
      participationQuietStreak(
        [{ day: 10, credits: 0, contacts: [], visible: false, competitionWin: false }],
        10
      )
    ).toBe(1)
  })

  it('applies the same capped policy to quiet human and AI contestants, without hostility tags', () => {
    const { day, getState } = fixture()
    for (let current = 1; current <= 14; current++) day(current)
    for (const actor of ['user', 'ai-1']) {
      const effect = getState().social.participation!.effectsByActor[actor]
      expect(effect.publicAdjustment).toBe(-4)
      expect(Object.values(effect.backingByObserver)).toHaveLength(2)
      expect(
        Object.values(effect.backingByObserver).every(
          (value) => value.trust >= -6 && value.respect >= -3
        )
      ).toBe(true)
      for (const observer of Object.keys(effect.backingByObserver)) {
        const edge = getState().social.reality.relationships[observer][actor]
        expect(edge.suspicion).toBe(0)
        expect(edge.resentment).toBe(0)
        expect(getState().social.relationships[observer][actor].tags).not.toContain('betrayal')
      }
      expect(getState().publicOpinion.profiles[actor].approval).toBe(46)
      const breakdown = getState().publicOpinion.profiles[actor].audienceBreakdown!
      expect(breakdown.gameplay).toBe(50)
      expect(breakdown.integrity).toBe(50)
    }
  })

  it('keeps reliable floater bonds intact while requiring evidence for additional protection', () => {
    const { store, day, getState } = fixture(false)
    const domain = structuredClone(getState().social.reality)
    for (const observer of ids.filter((id) => id !== 'user'))
      Object.assign(domain.relationships[observer].user, { trust: 45, loyalty: 45 })
    store.dispatch(replaceRealityDomain(domain))
    for (let current = 1; current <= 14; current++) day(current)
    expect(getState().social.participation!.effectsByActor.user.backingByObserver).toEqual({})
    expect(getState().social.reality.relationships['ai-1'].user.trust).toBe(45)
  })

  it('recovers backing through meaningful communication and audience presence through visible contributions', () => {
    const { day, getState, store } = fixture()
    for (let current = 1; current <= 10; current++) day(current)
    const previous = getState().social.participation!.effectsByActor.user
    expect(previous.publicAdjustment).toBe(-4)
    for (let current = 11; current <= 13; current++) {
      store.dispatch(patchGame({ week: current }))
      store.dispatch(
        recordSocialAction({ entry: { ...action('user', current), visibility: 'HOUSE_PUBLIC' } })
      )
      day(current)
    }
    const recovered = getState().social.participation!.effectsByActor.user
    expect(recovered.quietStreak).toBe(0)
    expect(recovered.publicAdjustment).toBe(0)
    expect(
      Object.values(recovered.backingByObserver).every(
        (value) => value.trust === 0 && value.respect === 0
      )
    ).toBe(true)
  })

  it('restores private backing only with informed observers and never spreads the adjustment beyond two people', () => {
    const { day, getState, store } = fixture(false)
    for (let current = 1; current <= 14; current++) day(current)
    const initial = getState().social.participation!.effectsByActor.user.backingByObserver
    const [contact, uninformed] = Object.keys(initial)
    store.dispatch(recordSocialAction({ entry: { ...action('user', 15), targetId: contact } }))
    day(15)
    const after = getState().social.participation!.effectsByActor.user.backingByObserver
    expect(after[contact].trust).toBe(initial[contact].trust + 2)
    expect(after[uninformed].trust).toBe(initial[uninformed].trust)
    for (let current = 16; current <= 21; current++) {
      day(current)
      expect(
        Object.values(
          getState().social.participation!.effectsByActor.user.backingByObserver
        ).filter((backing) => backing.trust < 0 || backing.respect < 0).length
      ).toBeLessThanOrEqual(2)
    }
  })

  it('does not count a private reply as public knowledge, and recognizes competition wins', () => {
    const { getState } = fixture()
    const state = structuredClone(getState())
    state.social.actionHistory = [action('user', 4)]
    expect(participationForDay(state, 'user', 4).visible).toBe(false)
    state.game.week = 4
    state.game.lohId = 'user'
    expect(participationForDay(state, 'user', 4)).toMatchObject({
      visible: true,
      competitionWin: true,
    })
  })

  it('does not apply twice after double advancement or save hydration', () => {
    const { day, assess, getState, store } = fixture()
    for (let current = 1; current <= 8; current++) day(current)
    const before = JSON.stringify(getState())
    assess()
    expect(JSON.stringify(getState())).toBe(before)
    store.dispatch(hydrateSocial(JSON.parse(JSON.stringify(getState().social))))
    const restored = JSON.stringify(getState())
    assess()
    expect(JSON.stringify(getState())).toBe(restored)
  })

  it('does not infer a legacy quiet streak from missing history and resets the ledger for a new season', () => {
    const { store, day, getState } = fixture()
    day(10)
    day(11)
    expect(getState().social.participation!.effectsByActor.user.publicAdjustment).toBe(0)
    expect(
      migrateSocialState({ ...getState().social, participation: undefined }).participation
        ?.processedDays
    ).toEqual([])
    store.dispatch({ type: 'game/resetGame' })
    expect(getState().social.participation?.processedDays).toEqual([])
    expect(
      normalizeSocialParticipation({
        effectsByActor: {
          user: {
            publicAdjustment: -100,
            backingByObserver: {
              ai: { trust: -999, respect: Number.NaN },
            },
          },
        },
        processedDays: [1, 1, -1, '2'],
      })
    ).toMatchObject({
      processedDays: [1],
      effectsByActor: {
        user: { publicAdjustment: -4, backingByObserver: { ai: { trust: -6, respect: 0 } } },
      },
    })
  })

  it('skips Survival, weekends and unresolved votes and leaves private-mode approval alone', () => {
    const { store, assess, day, getState } = fixture(false)
    for (let current = 1; current <= 8; current++) day(current)
    expect(getState().publicOpinion.profiles.user.approval).toBe(50)
    store.dispatch(patchGame({ mode: 'survival', week: 9 }))
    assess()
    expect(getState().social.participation!.processedDays).not.toContain(9)
    store.dispatch(patchGame({ mode: 'classic', awaitingTieBreak: true }))
    assess()
    expect(getState().social.participation!.processedDays).not.toContain(9)
  })

  it('does not create recovery points when a loss was clipped at zero approval', () => {
    const { store, getState, day } = fixture()
    const publicState = structuredClone(publicReducer(undefined, initializeProfiles(ids)))
    publicState.profiles.user = {
      ...publicState.profiles.user,
      approval: 0,
      audienceBreakdown: createAudienceBreakdown(0),
    }
    // A separate fresh store keeps this boundary fixture free of earned approval.
    const lowStore = configureStore({
      reducer: { game: () => getState().game, social: socialReducer, publicOpinion: publicReducer },
      preloadedState: { social: getState().social, publicOpinion: publicState },
    })
    expect(store).toBeDefined()
    day(1)
    for (let current = 1; current <= 8; current++) {
      const snapshot = {
        ...lowStore.getState(),
        game: { ...lowStore.getState().game, week: current },
      } as RootState
      processSocialParticipationDay(
        { dispatch: lowStore.dispatch, getState: lowStore.getState },
        snapshot
      )
    }
    expect(lowStore.getState().social.participation!.effectsByActor.user.publicAdjustment).toBe(0)
  })

  it('offers a bounded, optional invitation with honest noncommittal replies and no vote commitment', () => {
    const { store, day, getState, dispatch } = fixture()
    store.dispatch(
      patchGame({ pendingEviction: { evicteeId: 'ai-1' } as GameState['pendingEviction'] })
    )
    for (let current = 1; current <= 4; current++) day(current)
    const invitation = getState().social.incomingInteractions.find(
      (entry) => entry.payload?.source === 'social_participation'
    )!
    expect(invitation.requiresResponse).toBe(false)
    expect(invitation.fromId).not.toBe('ai-1')
    expect(invitation.createdWeek).toBe(4)
    const choices = getIncomingInteractionResponseOptions('check_in', invitation)
    expect(choices.find((choice) => choice.id === 'engagement:quiet')?.responseType).toBe('neutral')
    dispatch(
      respondToIncomingInteraction({ interactionId: invitation.id, choiceId: 'engagement:quiet' })
    )
    expect(participationForDay(getState(), 'user', 4).credits).toBe(2)
    expect(getState().social.commitments).toHaveLength(0)
    store.dispatch(patchGame({ week: 5 }))
    day(5)
    expect(getState().social.participation!.effectsByActor.user.quietStreak).toBe(1)
    expect(getState().social.participation!.effectsByActor.user.publicAdjustment).toBe(0)
    expect(
      getState().social.incomingInteractions.filter(
        (entry) => entry.payload?.source === 'social_participation'
      )
    ).toHaveLength(1)
  })

  it('makes social backing matter to a Tribunal read without fabricating betrayal or erasing competition credit', () => {
    const { day, getState } = fixture(false)
    const before = realityJurorScorecard('ai-1', ['user', 'ai-7'], getState().social.reality)!
    for (let current = 1; current <= 12; current++) day(current)
    const state = getState()
    const after = realityJurorScorecard('ai-1', ['user', 'ai-7'], state.social.reality)!
    expect(after.user).toBeLessThan(before.user)
    expect(state.social.reality.relationships['ai-1'].user.resentment).toBe(0)
  })
})
