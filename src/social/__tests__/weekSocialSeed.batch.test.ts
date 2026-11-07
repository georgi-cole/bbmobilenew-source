import { describe, expect, it } from 'vitest'
import type { AnyAction } from 'redux'
import socialReducer, {
  applyRealityAmbientMood,
  applyRealityAmbientRelationship,
  applyWeekSeedBatch,
  recordRealityCeremony,
  replaceRealityDomain,
  updateRelationship,
} from '../socialSlice'
import { buildWeekSeedBatch, seedWeekRelationships } from '../weekSocialSeed'
import { socialMiddleware } from '../socialMiddleware'
import { createRealityAlliance } from '../reality'

describe('week-start relationship batching', () => {
  it('matches ordered individual reducer updates with one normal-mode dispatch', () => {
    const startingState = socialReducer(
      socialReducer(undefined, { type: 'test/initialize' }),
      recordRealityCeremony({
        kind: 'NOMINATIONS_LOCKED',
        day: 1,
        phase: 'nomination_results',
        actorId: 'lia',
        targetIds: ['rae'],
        witnessIds: ['lia', 'rae'],
        publicEligible: false,
        tags: ['betrayal'],
      })
    )
    let social = socialReducer(
      startingState,
      updateRelationship({ source: 'lia', target: 'rae', delta: 18 })
    )
    social = socialReducer(social, updateRelationship({ source: 'rae', target: 'lia', delta: -12 }))
    const state = {
      game: {
        players: [
          { id: 'lia', status: 'active' },
          { id: 'rae', status: 'active', isUser: true },
        ],
        week: 2,
        seed: 843,
      },
      social,
      settings: { gameUX: { dramaMode: false } },
    }
    const actions: AnyAction[] = []
    const store = {
      getState: () => ({ ...state, social }),
      dispatch: (action: unknown) => {
        const typedAction = action as AnyAction
        actions.push(typedAction)
        social = socialReducer(social, typedAction)
        return action
      },
    }

    seedWeekRelationships(store)

    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe(applyWeekSeedBatch.type)

    const batch = (actions[0] as ReturnType<typeof applyWeekSeedBatch>).payload
    let expected = startingState
    expected = socialReducer(
      expected,
      updateRelationship({ source: 'lia', target: 'rae', delta: 18 })
    )
    expected = socialReducer(
      expected,
      updateRelationship({ source: 'rae', target: 'lia', delta: -12 })
    )
    for (const operation of batch.operations) {
      expected = socialReducer(
        expected,
        operation.kind === 'relationship'
          ? updateRelationship(operation.payload)
          : applyRealityAmbientRelationship(operation.payload)
      )
    }
    for (const mood of batch.moods) {
      expected = socialReducer(expected, applyRealityAmbientMood(mood))
    }

    expect(social).toEqual(expected)
  })

  it.each([1, 2, 7])(
    'keeps Drama relationships, twin echoes, Bella warmth, Reality and moods on week %i',
    (week) => {
      const players = [
        { id: 'lia', status: 'active' },
        { id: 'ali', status: 'active' },
        { id: 'bella', status: 'active' },
        { id: 'rae', status: 'active', isUser: true },
        { id: 'sol', status: 'jury' },
      ]
      const game = { players, week, seed: 843, dramaSocialMode: true }
      const settings = { gameUX: { dramaMode: true } }
      const socialWithHistory = socialReducer(
        socialReducer(undefined, { type: 'test/initialize' }),
        recordRealityCeremony({
          kind: 'NOMINATIONS_LOCKED',
          day: 1,
          phase: 'nomination_results',
          actorId: 'lia',
          targetIds: ['rae'],
          witnessIds: ['lia', 'rae', 'ali', 'bella'],
          publicEligible: false,
          tags: ['betrayal'],
        })
      )
      const realityWithAlliance = structuredClone(socialWithHistory.reality)
      createRealityAlliance(realityWithAlliance, {
        id: 'seed-test-pact',
        founderIds: ['lia'],
        memberIds: ['ali'],
        purpose: 'Compare day-start behavior',
        at: { day: 1, phase: 'social_1' },
      })
      const initialSocial = socialReducer(
        socialWithHistory,
        replaceRealityDomain(realityWithAlliance)
      )
      let referenceSocial = initialSocial
      if (week > 1) {
        for (const source of players.slice(0, 4)) {
          for (const target of players.slice(0, 4)) {
            if (source.id === target.id) continue
            referenceSocial = socialReducer(
              referenceSocial,
              updateRelationship({ source: source.id, target: target.id, delta: 12 })
            )
          }
        }
      }
      const batch = buildWeekSeedBatch({ game, social: referenceSocial, settings })
      expect(batch).not.toBeNull()
      const initialForWeek = referenceSocial

      let invoke: (action: unknown) => unknown = () => undefined
      const api = {
        getState: () => ({ game, social: referenceSocial, settings }),
        dispatch: (action: unknown) => invoke(action),
      }
      invoke = socialMiddleware(api as never)((action: unknown) => {
        referenceSocial = socialReducer(referenceSocial, action as AnyAction)
        return action
      })
      for (const operation of batch?.operations ?? []) {
        invoke(
          operation.kind === 'relationship'
            ? updateRelationship(operation.payload)
            : applyRealityAmbientRelationship(operation.payload)
        )
      }
      for (const mood of batch?.moods ?? []) invoke(applyRealityAmbientMood(mood))

      let batchedSocial = initialForWeek
      const actions: AnyAction[] = []
      const store = {
        getState: () => ({ game, social: batchedSocial, settings }),
        dispatch: (action: unknown) => {
          actions.push(action as AnyAction)
          batchedSocial = socialReducer(batchedSocial, action as AnyAction)
          return action
        },
      }
      seedWeekRelationships(store)

      expect(actions).toHaveLength(1)
      expect(actions[0].type).toBe(applyWeekSeedBatch.type)
      expect(batchedSocial).toEqual(referenceSocial)
    }
  )
})
