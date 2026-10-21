import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../types'
import { executeAction, initManeuvers, computeActionCosts, getActionById } from '../SocialManeuvers'
import socialReducer, {
  setEnergyBankEntry,
  setInfluenceBankEntry,
  setInfoBankEntry,
  updateRelationship,
} from '../socialSlice'

function createStore() {
  const game = {
    week: 4,
    phase: 'social_1',
    lohId: 'loh',
    players: [
      { id: 'loh', name: 'Quinn', status: 'loh', isUser: true },
      { id: 'rae', name: 'Rae', status: 'active' },
      { id: 'nova', name: 'Nova', status: 'active' },
    ],
  } as unknown as GameState
  const store = configureStore({
    reducer: {
      game: () => game,
      social: socialReducer,
      settings: () => ({ gameUX: { dramaMode: false } }),
    },
  })
  initManeuvers(store as never)
  store.dispatch(setEnergyBankEntry({ playerId: 'loh', value: 10 }))
  store.dispatch(setInfluenceBankEntry({ playerId: 'loh', value: 10 }))
  store.dispatch(setInfoBankEntry({ playerId: 'loh', value: 0 }))
  store.dispatch(updateRelationship({ source: 'rae', target: 'nova', delta: 50 }))
  return store
}

describe('social inquiry execution', () => {
  it('persists a player opinion, awards information once, and charges more energy on repeat', () => {
    const store = createStore()
    const action = getActionById('ask_player_opinion')
    if (!action) throw new Error('Missing ask_player_opinion action')
    const rolls = [0.99, 0, 0.99, 0.99]
    const random = () => rolls.shift() ?? 0.99

    const first = executeAction('loh', 'rae', 'ask_player_opinion', {
      source: 'manual',
      subjectId: 'nova',
      random,
    })

    expect(first.success).toBe(true)
    expect(first.summary).toContain('Rae: “')
    expect(store.getState().social.energyBank.loh).toBe(9)
    expect(store.getState().social.influenceBank.loh).toBe(8)
    expect(store.getState().social.infoBank.loh).toBe(50)
    expect(store.getState().social.inquiryHistory[0]).toMatchObject({
      askerId: 'loh',
      respondentId: 'rae',
      kind: 'PLAYER_OPINION',
      subjectId: 'nova',
      tone: 'CANDID',
      infoAwarded: true,
    })

    expect(computeActionCosts('loh', action, 'rae', undefined, 1, false, 'nova')).toEqual({
      energy: 2,
      influence: 2,
      info: 0,
    })
    const second = executeAction('loh', 'rae', 'ask_player_opinion', {
      source: 'manual',
      subjectId: 'nova',
      random,
    })

    expect(second.success).toBe(true)
    expect(second.summary).toContain('I already told you:')
    expect(store.getState().social.energyBank.loh).toBe(7)
    expect(store.getState().social.influenceBank.loh).toBe(6)
    expect(store.getState().social.infoBank.loh).toBe(50)
    expect(store.getState().social.inquiryHistory).toHaveLength(2)
    expect(store.getState().social.inquiryHistory[1].tone).toBe('REPEATED')
  })
})
