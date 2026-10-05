import { describe, expect, it } from 'vitest'
import type { AnyAction } from 'redux'
import socialReducer, {
  applyRealityAmbientMood,
  applyRealityAmbientRelationship,
  applyWeekSeedBatch,
  updateRelationship,
} from '../socialSlice'
import { seedWeekRelationships } from '../weekSocialSeed'

describe('week-start relationship batching', () => {
  it('matches ordered individual reducer updates with one normal-mode dispatch', () => {
    const startingState = socialReducer(undefined, { type: 'test/initialize' })
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

  it('keeps the individual action path in Drama mode', () => {
    let social = socialReducer(undefined, { type: 'test/initialize' })
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
      settings: { gameUX: { dramaMode: true } },
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

    expect(actions.length).toBeGreaterThan(1)
    expect(actions.every((action) => action.type !== applyWeekSeedBatch.type)).toBe(true)
  })
})
