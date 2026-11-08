import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer from '../../store/gameSlice'
import settingsReducer from '../../store/settingsSlice'
import type { RootState, AppDispatch } from '../../store/store'
import { makeIntelMemory } from '../intelligenceSystem'
import { intelligenceMiddleware } from '../intelligenceMiddleware'
import { getActionById, initManeuvers } from '../SocialManeuvers'
import { validateSocialExecution } from '../socialExecutionGuard'
import { socialMiddleware } from '../socialMiddleware'
import socialReducer, { hydrateSocial } from '../socialSlice'
import { socialStrategyMiddleware } from '../socialStrategyMiddleware'
import { createInitialRealitySimulationState } from '../realitySimulation'
import { executeHumanRealityAction, type HumanRealityActionInput } from '../reality/humanFlow'
import { addRealityFact, learnRealityFact } from '../reality/knowledge'
import { createDirectedRelationship, createInitialRealityDomainState } from '../reality/state'
import type { RealityDomainState, RealityFact } from '../reality/types'
import type { SocialActionLogEntry, SocialState } from '../types'

const INIT = { type: 'test/init' }
const player = (id: string, name: string, isUser = false) => ({
  id,
  name,
  isUser,
  avatar: '',
  status: 'active' as const,
})

function fixture({
  seed = 1,
  energy = 20,
  drama = true,
  weekend = false,
  reality = createInitialRealityDomainState(),
  history = [] as SocialActionLogEntry[],
} = {}) {
  const game = gameReducer(undefined, INIT)
  const settings = settingsReducer(undefined, INIT)
  const social = socialReducer(undefined, INIT)
  const store = configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, social: socialReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(
        intelligenceMiddleware,
        socialStrategyMiddleware,
        socialMiddleware
      ),
    preloadedState: {
      game: {
        ...game,
        seed,
        gameId: 'human-social-action',
        week: 4,
        phase: 'social_2' as const,
        ...(weekend
          ? {
              weekendInterlude: {
                active: true as const,
                afterDay: 4,
                weekendDay: 1 as const,
                episode: 'party' as const,
                stage: 'social' as const,
                wallet: { energy: 12, influence: 100, info: 100 },
              },
            }
          : {}),
        players: [
          player('human', 'You', true),
          player('ash', 'Ash'),
          player('bea', 'Bea'),
          player('cy', 'Cy'),
          player('dee', 'Dee'),
        ],
      },
      social: {
        ...social,
        reality,
        actionHistory: history,
        energyBank: { human: energy },
        influenceBank: { human: 100 },
        infoBank: { human: 100 },
        realitySimulation: createInitialRealitySimulationState(seed),
      },
      settings: {
        ...settings,
        gameUX: { ...settings.gameUX, dramaMode: drama, dramaModeAdminOverride: drama },
      },
    },
  })
  initManeuvers(store)
  return {
    store,
    run(actionId: string, targetIds: string[], options?: Partial<HumanRealityActionInput>) {
      return executeHumanRealityAction({
        actorId: 'human',
        targetId: targetIds[0] ?? 'human',
        actionId,
        targetIds,
        ...options,
      })(store.dispatch as AppDispatch, () => store.getState() as RootState)
    },
    check(actionId: string, targetIds: string[]) {
      return validateSocialExecution(store.getState(), {
        action: getActionById(actionId)!,
        actorId: 'human',
        targetIds,
        allowPrimaryBatch: true,
      })
    },
  }
}

function seedTargetingFact(reality: RealityDomainState) {
  const fact: RealityFact = {
    id: 'targeting:cy:human',
    sourceEventId: 'audit:targeting:cy:human',
    propositionType: 'TARGETING',
    subjectIds: ['cy'],
    objectId: 'human',
    value: 'Cy is targeting you',
    day: 4,
    phase: 'social_2',
    visibility: 'PAIR_ONLY',
    participantIds: ['ash', 'cy'],
    witnessIds: [],
    viewerVisible: false,
    juryVisible: false,
    publicVisible: false,
  }
  addRealityFact(reality, fact)
  learnRealityFact(reality, {
    ownerId: 'ash',
    factId: fact.id,
    memory: makeIntelMemory({
      ownerId: 'ash',
      fact,
      sourceType: 'DIRECT',
      sourceChain: ['cy'],
      confidence: 0.9,
      day: 4,
      phase: 'social_2',
    }),
  })
  return fact
}

describe('player-authored Social actions', () => {
  it('keeps intelligence and relationship effects written by downstream middleware', () => {
    const reality = createInitialRealityDomainState()
    const fact = seedTargetingFact(reality)
    const { store, run } = fixture({ reality })
    expect(run('whisper', ['ash']).label).toBe('ACCEPT')
    const { social } = store.getState()
    expect(social.intelligenceDeliveries).toContainEqual(
      expect.objectContaining({ recipientId: 'human', factId: fact.id })
    )
    expect(social.reality.beliefsByOwner.human[`belief:human:${fact.id}`]).toMatchObject({
      objectId: 'human',
      subjectIds: ['cy'],
      sourceChain: ['ash'],
    })
    expect(social.reality.relationships.human.cy.suspicion).toBe(12)
    expect(social.energyBank.human).toBe(18)
    expect(social.sessionLogs).toHaveLength(1)
    store.dispatch(hydrateSocial(JSON.parse(JSON.stringify(social)) as SocialState))
    expect(
      store.getState().social.reality.beliefsByOwner.human[`belief:human:${fact.id}`]
    ).toBeDefined()
    expect(store.getState().social.sessionLogs.at(-1)?.targetReactions).toEqual({ ash: 'ACCEPT' })
  })

  it('keeps the recipient suspicion repair from an accepted compliment', () => {
    const reality = createInitialRealityDomainState()
    const edge = createDirectedRelationship('ash', 'human', 30)
    edge.suspicion = 30
    reality.relationships.ash = { human: edge }
    const { store, run } = fixture({ reality })
    expect(run('compliment', ['ash']).label).toBe('ACCEPT')
    expect(store.getState().social.reality.relationships.ash.human.suspicion).toBe(20)
  })

  it('describes a mixed Group Chat using actual reactions and measured relationship shifts', () => {
    const { store, run } = fixture({ seed: 7 })
    const action = run('group_chat', ['ash', 'bea'])
    const entry = store.getState().social.sessionLogs.at(-1)
    expect(entry?.targetReactions).toEqual({ ash: 'ACCEPT', bea: 'QUESTION' })
    expect(entry?.receipt).toMatchObject({
      outcomeLabel: 'Mixed result',
      tone: 'neutral',
      relationshipShifts: { ash: 3, bea: -1 },
      summary: 'Ash welcomed the conversation. Bea held back.',
    })
    expect(action.relationshipShifts).toEqual(entry?.receipt?.relationshipShifts)
    expect(entry?.realityEventId).toBeDefined()
  })

  it.each([
    [1, 'ESCALATE', 'Escalated', 'pushed back'],
    [2, 'DE_ESCALATE', 'Cooled the exchange', 'tried to defuse'],
    [9, 'WALK_AWAY', 'Walked away', 'walked away'],
  ])('keeps the actual confrontation reaction for seed %s', (seed, reaction, label, copy) => {
    const { store, run } = fixture({ seed })
    const action = run('confront', ['ash'])
    expect(action.label).toBe(reaction)
    expect(action.summary).toContain(`Ash ${copy}`)
    expect(action.summary).not.toContain('Relationship')
    expect(action.relationshipShifts?.ash).toBeLessThan(0)
    expect(store.getState().social.sessionLogs.at(-1)?.receipt?.outcomeLabel).toBe(label)
  })

  it('applies repeat pressure to each pair independently of target selection order', () => {
    const history = Array.from(
      { length: 4 },
      (_, index): SocialActionLogEntry => ({
        actionId: 'compliment',
        actorId: 'human',
        targetId: 'bea',
        cost: 1,
        delta: 0,
        outcome: 'success',
        newEnergy: 20,
        timestamp: index,
        week: 4,
        phase: 'social_2',
        source: 'manual',
      })
    )
    for (const targetIds of [
      ['ash', 'bea'],
      ['bea', 'ash'],
    ]) {
      const { store, run } = fixture({ seed: 2, history })
      const action = run('compliment', targetIds)
      const reactions = Object.assign(
        {},
        ...store.getState().social.sessionLogs.map((entry) => entry.targetReactions)
      )
      expect(reactions).toEqual({ ash: 'ACCEPT', bea: 'REJECT' })
      expect(action.relationshipShifts).toEqual({ ash: 3, bea: -1 })
    }
  })

  it('uses the target’s relationship for otherwise identical first compliments', () => {
    const reality = createInitialRealityDomainState()
    reality.relationships.ash = { human: createDirectedRelationship('ash', 'human', 90) }
    reality.relationships.bea = { human: createDirectedRelationship('bea', 'human', -90) }
    expect(fixture({ seed: 9, reality }).run('compliment', ['ash']).label).toBe('ACCEPT')
    expect(fixture({ seed: 9, reality }).run('compliment', ['bea']).label).toBe('REJECT')
  })

  it('rejects an underfunded Classic batch before applying any recipient effects', () => {
    const { store, run } = fixture({ energy: 1, drama: false })
    expect(
      run('compliment', ['ash', 'bea'], {
        costOverride: { energy: 0, influence: 0, info: 0 },
      })
    ).toMatchObject({ success: false, summary: 'Insufficient resources. Nothing was spent.' })
    expect(store.getState().social).toMatchObject({
      energyBank: { human: 1 },
      relationships: {},
      sessionLogs: [],
    })
  })

  it('uses the weekend rules for an eligible Call Them Out without touching regular resources', () => {
    const reality = createInitialRealityDomainState()
    reality.relationships.human = { ash: createDirectedRelationship('human', 'ash', -90) }
    const { check, run, store } = fixture({ weekend: true, reality })
    expect(check('public_callout', ['ash']).eligible).toBe(true)
    expect(run('public_callout', ['ash']).success).toBe(true)
    const state = store.getState()
    expect(state.game.weekendInterlude?.wallet.energy).toBe(8)
    expect(state.social.energyBank.human).toBe(20)
    expect(state.social.reality.events.at(-1)?.phase).toBe('weekend_day_1')
  })

  it('uses the same explicit cooldown reason in selection and execution', () => {
    const { check, run, store } = fixture()
    expect(run('group_chat', ['ash', 'bea']).success).toBe(true)
    const eligibility = check('group_chat', ['cy', 'dee'])
    expect(eligibility).toEqual({
      eligible: false,
      reason: 'You already used this move this phase.',
    })
    const before = store.getState().social
    expect(run('group_chat', ['cy', 'dee'])).toMatchObject({
      success: false,
      summary: eligibility.reason,
    })
    expect(store.getState().social).toBe(before)
  })
})
