import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import socialReducer, { setEnergyBankEntry } from '../socialSlice'
import { SOCIAL_ACTIONS } from '../socialActions'
import { normalizeActionCosts, normalizeActionYields } from '../smExecNormalize'
import { getSocialResourceEffect, nextHumanSocialEnergy } from '../socialResourceEconomy'
import { executeGroupAction, initManeuvers } from '../SocialManeuvers'
import gameReducer, { createInitialGameState } from '../../store/gameSlice'
import type { GameState } from '../../types'

function groupAction() {
  const action = SOCIAL_ACTIONS.find((candidate) => candidate.id === 'group_chat')
  if (!action) throw new Error('Missing group_chat action')
  return action
}

function makeStore(dramaMode = true) {
  return configureStore({
    reducer: {
      social: socialReducer,
      settings: () => ({ gameUX: { dramaMode } }),
    },
  })
}

describe('social resource economy', () => {
  it('adds a doubled human allowance while preserving unused energy under the cap', () => {
    expect(nextHumanSocialEnergy(0)).toBe(10)
    expect(nextHumanSocialEnergy(7)).toBe(17)
    expect(nextHumanSocialEnergy(27)).toBe(30)
  })

  it('makes Group Chat cost scale exactly with its audience', () => {
    expect(normalizeActionCosts(groupAction(), 1, true).energy).toBe(2)
    expect(normalizeActionCosts(groupAction(), 2, true).energy).toBe(2)
    expect(normalizeActionCosts(groupAction(), 3, true).energy).toBe(3)
    expect(normalizeActionCosts(groupAction(), 6, true).energy).toBe(6)
    expect(normalizeActionCosts(groupAction(), 6, false).energy).toBe(6)
  })

  it('gives every action meaningful outcome-sensitive resource effects', () => {
    for (const action of SOCIAL_ACTIONS) {
      expect(getSocialResourceEffect(action, 'success'), action.id).toBeDefined()
      expect(getSocialResourceEffect(action, 'failure'), action.id).toBeDefined()
      expect(getSocialResourceEffect(action, 'backfire'), action.id).toBeDefined()
    }
    expect(getSocialResourceEffect(groupAction(), 'success', 5).influence).toBe(6)
    expect(getSocialResourceEffect(groupAction(), 'backfire', 5).influence).toBeLessThan(0)
  })

  it('prices the new inquiry actions and awards their agreed Information amounts', () => {
    const nominationAdvice = SOCIAL_ACTIONS.find((action) => action.id === 'ask_nomination_advice')
    const playerOpinion = SOCIAL_ACTIONS.find((action) => action.id === 'ask_player_opinion')
    expect(nominationAdvice).toBeDefined()
    expect(playerOpinion).toBeDefined()
    expect(normalizeActionCosts(nominationAdvice!, 1, false)).toEqual({
      energy: 0,
      influence: 3,
      info: 0,
    })
    expect(normalizeActionCosts(playerOpinion!, 1, false)).toEqual({
      energy: 1,
      influence: 2,
      info: 0,
    })
    expect(normalizeActionYields(nominationAdvice!).info).toBe(25)
    expect(normalizeActionYields(playerOpinion!).info).toBe(50)
  })
})

describe('atomic Group Chat execution', () => {
  it('keeps main’s multi-target Group Chat behavior in normal mode', () => {
    const store = makeStore(false)
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 10 }))

    const result = executeGroupAction('user', ['a', 'b'], 'group_chat')

    expect(result.success).toBe(true)
    expect(store.getState().social.energyBank.user).toBe(8)
  })

  it('rejects one participant before spending or logging anything', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 10 }))

    const result = executeGroupAction('user', ['a'], 'group_chat')

    expect(result.success).toBe(false)
    expect(store.getState().social.energyBank.user).toBe(10)
    expect(store.getState().social.sessionLogs).toHaveLength(0)
  })

  it('charges once and changes every selected relationship independently', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 10 }))

    const rolls = [0, 0, 0, 0.999]
    const result = executeGroupAction('user', ['a', 'b'], 'group_chat', {
      source: 'manual',
      random: () => rolls.shift() ?? 0.5,
    })

    expect(result.success).toBe(true)
    expect(result.newEnergy).toBe(8)
    expect(result.targetDeltas?.a).toBe(1)
    expect(result.targetDeltas?.b).toBe(5)
    expect(store.getState().social.relationships.user.a.affinity).toBe(1)
    expect(store.getState().social.relationships.user.b.affinity).toBe(5)
    expect(store.getState().social.sessionLogs).toHaveLength(1)
    expect(store.getState().social.sessionLogs[0].targetIds).toEqual(['a', 'b'])
  })

  it('cannot partially execute when the full audience is unaffordable', () => {
    const store = makeStore()
    initManeuvers(store)
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 3 }))

    const result = executeGroupAction('user', ['a', 'b', 'c', 'd'], 'group_chat')

    expect(result.success).toBe(false)
    expect(store.getState().social.energyBank.user).toBe(3)
    expect(store.getState().social.relationships.user).toBeUndefined()
    expect(store.getState().social.sessionLogs).toHaveLength(0)
  })

  it('spends and rewards only the weekend wallet when the human starts a Group Chat', () => {
    const initialGame = createInitialGameState({ seed: 22 })
    const human = initialGame.players.find((player) => player.isUser)!
    const targets = initialGame.players.filter((player) => !player.isUser).slice(0, 2)
    const game: GameState = {
      ...initialGame,
      week: 4,
      phase: 'week_end',
      weekendInterlude: {
        active: true,
        afterDay: 4,
        weekendDay: 1,
        episode: 'party',
        stage: 'social',
        wallet: { energy: 5, influence: 4, info: 3 },
      },
    }
    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      preloadedState: { game },
    })
    initManeuvers(store)
    const { energyBank, influenceBank, infoBank } = store.getState().social

    const result = executeGroupAction(
      human.id,
      targets.map((player) => player.id),
      'group_chat',
      {
        source: 'manual',
        costOverride: { energy: 2, influence: 1, info: 2 },
        random: () => 0,
      }
    )

    expect(result).toMatchObject({ success: true, newEnergy: 3 })
    expect(store.getState().game.weekendInterlude?.wallet).toEqual({
      energy: 3,
      influence: 6,
      info: 1,
    })
    expect(store.getState().social).toMatchObject({ energyBank, influenceBank, infoBank })
    expect(store.getState().social.sessionLogs.at(-1)).toMatchObject({
      phase: 'weekend_day_1',
      balancesAfter: { energy: 3, influence: 6, info: 1 },
    })
  })
})
