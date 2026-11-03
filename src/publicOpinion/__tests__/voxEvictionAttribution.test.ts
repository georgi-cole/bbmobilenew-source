import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import type { Player } from '../../types'
import publicOpinionReducer, {
  initializeProfiles,
  setProfileApprovals,
} from '../publicOpinionSlice'
import { publicOpinionMiddleware } from '../publicOpinionMiddleware'

type VoxStatus = 'inactive' | 'scheduled' | 'active' | 'complete'

interface GameFixture {
  phase: string
  week: number
  lohId: string | null
  posWinnerId: string | null
  povSavedId: string | null
  nomineeIds: string[]
  players: Player[]
  seed: number
  publicModeEnabled: boolean
  voxPopuli?: { status: VoxStatus }
}

function player(id: string): Player {
  return { id, name: id.toUpperCase(), avatar: '🙂', status: 'active' }
}

function makeStore(
  voxStatus: VoxStatus | undefined,
  publicModeEnabled = true,
  completeVoxOnEviction = false
) {
  const initial: GameFixture = {
    phase: 'eviction_results',
    week: 2,
    lohId: 'p1',
    posWinnerId: 'p3',
    povSavedId: 'p2',
    nomineeIds: ['p4', 'p2'],
    players: ['p1', 'p2', 'p3', 'p4'].map(player),
    seed: 42,
    publicModeEnabled,
    ...(voxStatus ? { voxPopuli: { status: voxStatus } } : {}),
  }
  const gameReducer = (
    state: GameFixture = initial,
    action: { type: string }
  ): GameFixture => {
    if (
      completeVoxOnEviction &&
      action.type === 'game/finalizePendingEviction' &&
      state.voxPopuli?.status === 'active'
    ) {
      return { ...state, voxPopuli: { status: 'complete' } }
    }
    return state
  }

  const store = configureStore({
    reducer: { game: gameReducer, publicOpinion: publicOpinionReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(publicOpinionMiddleware),
  })
  store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']))
  store.dispatch(setProfileApprovals({ p1: 50, p2: 50, p3: 50, p4: 25 }))
  return store
}

describe('Vox audience eviction attribution', () => {
  it.each([true, false])(
    'does not blame immunity or Safety winners when Public Mode visibility is %s',
    (publicModeEnabled) => {
      const store = makeStore('active', publicModeEnabled)
      const before = store.getState().publicOpinion.profiles

      store.dispatch({ type: 'game/finalizePendingEviction', payload: 'p4' })

      const after = store.getState().publicOpinion.profiles
      expect(after.p1.approval).toBe(before.p1.approval)
      expect(after.p3.approval).toBe(before.p3.approval)
      expect(after.p4.approval).toBeGreaterThan(before.p4.approval)
    }
  )

  it('uses the pre-action Vox status when a finale completes during eviction', () => {
    const store = makeStore('active', true, true)
    const before = store.getState().publicOpinion.profiles

    store.dispatch({ type: 'game/finalizePendingEviction', payload: 'p4' })

    const state = store.getState()
    expect(state.game.voxPopuli?.status).toBe('complete')
    expect(state.publicOpinion.profiles.p1.approval).toBe(before.p1.approval)
    expect(state.publicOpinion.profiles.p3.approval).toBe(before.p3.approval)
  })

  it.each([undefined, 'inactive', 'scheduled'] as const)(
    'retains Classic eviction responsibility when Vox status is %s',
    (status) => {
      const store = makeStore(status)
      const before = store.getState().publicOpinion.profiles

      store.dispatch({ type: 'game/finalizePendingEviction', payload: 'p4' })

      const after = store.getState().publicOpinion.profiles
      expect(after.p1.approval).toBeGreaterThan(before.p1.approval)
      expect(after.p3.approval).toBeGreaterThan(before.p3.approval)
    }
  )
})
