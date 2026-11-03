import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer from '../../store/gameSlice'
import settingsReducer from '../../store/settingsSlice'
import type { AppDispatch, RootState } from '../../store/store'
import { initManeuvers } from '../SocialManeuvers'
import socialReducer, { setEnergyBankEntry } from '../socialSlice'
import { createInitialRealityDomainState } from '../reality/state'
import { createRealityNemesisObjective } from '../reality/relationshipAutonomy'
import { advanceNemesisNarrative } from '../reality/nemesisNarrative'
import { executeHumanRealityAction } from '../reality/humanFlow'

function setup(revealed = true, resources = 2, dramaMode = true) {
  const initialGame = gameReducer(undefined, { type: 'test/init' })
  const initialSocial = socialReducer(undefined, { type: 'test/init' })
  const initialSettings = settingsReducer(undefined, { type: 'test/init' })
  const reality = createInitialRealityDomainState()
  createRealityNemesisObjective(reality, {
    ownerId: 'echo',
    targetId: 'human',
    sourceEventId: 'private-conflict',
    reason: 'SOCIAL_REACH',
    at: { day: 3, phase: 'social_1' },
  })
  if (revealed) {
    advanceNemesisNarrative(reality, {
      humanId: 'human',
      day: 3,
      phase: 'social_2',
      playerNames: { human: 'Quartz', echo: 'Echo', jax: 'Jax' },
      activePlayerIds: new Set(['human', 'echo', 'jax']),
    })
    advanceNemesisNarrative(reality, {
      humanId: 'human',
      day: 4,
      phase: 'social_1',
      playerNames: { human: 'Quartz', echo: 'Echo', jax: 'Jax' },
      activePlayerIds: new Set(['human', 'echo', 'jax']),
    })
  }
  const store = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      settings: settingsReducer,
    },
    preloadedState: {
      game: {
        ...initialGame,
        week: 4,
        phase: 'social_1' as const,
        seed: 46,
        players: [
          { id: 'human', name: 'Quartz', avatar: '🙂', status: 'active' as const, isUser: true },
          { id: 'echo', name: 'Echo', avatar: '🙂', status: 'active' as const },
          { id: 'jax', name: 'Jax', avatar: '🙂', status: 'active' as const },
        ],
        mode: 'classic' as const,
      },
      social: {
        ...initialSocial,
        reality,
        energyBank: { human: resources },
        influenceBank: { human: 24 },
        infoBank: { human: 30 },
      },
      settings: {
        ...initialSettings,
        gameUX: {
          ...initialSettings.gameUX,
          dramaMode,
          dramaModeAdminOverride: true,
        },
      },
    },
  })
  initManeuvers(store)
  const ask = (targetId = 'echo', costOverride?: { energy: number; influence: number; info: number }) =>
    executeHumanRealityAction({
      actorId: 'human',
      targetId,
      actionId: 'ask_nemesis_reason',
      costOverride,
    })(store.dispatch as AppDispatch, () => store.getState() as RootState)
  return { store, ask }
}

describe('Nemesis questioning — integrated Social action and energy bank', () => {
  it('charges exactly one energy and records one native receipt, even with a zero-price override', () => {
    const { store, ask } = setup(true, 2)
    const first = ask('echo', { energy: 0, influence: 0, info: 0 })
    expect(first.success).toBe(true)
    expect(first.receiptRecorded).toBe(true)
    expect(first.summary).toContain('Echo:')
    expect(store.getState().social.energyBank.human).toBe(1)
    expect(store.getState().social.influenceBank.human).toBe(24)
    expect(store.getState().social.infoBank.human).toBe(30)
    const log = store.getState().social.sessionLogs.at(-1)
    expect(log?.actionId).toBe('ask_nemesis_reason')
    expect(log?.costs).toEqual({ energy: 1, influence: 0, info: 0 })
    expect(log?.receipt?.summary).toBe(first.summary)
    expect(log?.receipt?.relationshipShifts).toBeDefined()
    expect(store.getState().social.reality.events.filter((event) => event.actionId === 'ask_nemesis_reason')).toHaveLength(1)

    const second = ask()
    expect(second.success).toBe(false)
    expect(store.getState().social.energyBank.human).toBe(1)
    expect(store.getState().social.sessionLogs).toHaveLength(1)
  })

  it('refuses a pre-reveal or wrong-target question without spending energy', () => {
    const { store, ask } = setup(false, 2)
    expect(ask().success).toBe(false)
    expect(ask('jax').success).toBe(false)
    expect(store.getState().social.energyBank.human).toBe(2)
    expect(store.getState().social.sessionLogs).toHaveLength(0)
  })

  it('rejects unaffordable questions before creating social or Reality events', () => {
    const { store, ask } = setup(true, 0)
    const count = store.getState().social.reality.events.length
    expect(ask().success).toBe(false)
    expect(store.getState().social.energyBank.human).toBe(0)
    expect(store.getState().social.reality.events).toHaveLength(count)
    store.dispatch(setEnergyBankEntry({ playerId: 'human', value: 1 }))
    expect(ask().success).toBe(true)
    expect(store.getState().social.energyBank.human).toBe(0)
  })

  it('does not make premium Nemesis questioning available in Normal Social', () => {
    const { store, ask } = setup(true, 2, false)
    expect(ask().success).toBe(false)
    expect(store.getState().social.energyBank.human).toBe(2)
    expect(store.getState().social.reality.events.some((event) =>
      event.type === 'NEMESIS_REASON_EXPLAINED'
    )).toBe(false)
  })
})
