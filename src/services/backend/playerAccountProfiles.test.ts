// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getAccountProfileSyncStatus,
  initializePlayerAccountProfiles,
  subscribeAccountProfileSync,
} from './playerAccountProfiles'
import { createProfile, debugGrantEyeoleans } from '../../store/profilesSlice'
import profilesReducer from '../../store/profilesSlice'
import type { store as appStore } from '../../store/store'

const backend = vi.hoisted(() => ({
  getSession: vi.fn(),
  order: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('./config', () => ({
  getBackendConfig: () => ({ url: 'https://example.test', key: 'key' }),
}))
vi.mock('./supabaseTransport', () => ({
  getBackendClient: async () => ({
    auth: { getSession: backend.getSession },
    from: () => ({ select: () => ({ order: backend.order }) }),
    rpc: backend.rpc,
  }),
  subscribeBackendAuth: () => () => undefined,
}))

beforeEach(() => {
  localStorage.clear()
  backend.getSession.mockResolvedValue({
    data: {
      session: {
        user: {
          id: 'account-1',
          email: 'player@example.test',
          email_confirmed_at: '2026-11-13T12:00:00Z',
        },
      },
    },
    error: null,
  })
  backend.order.mockResolvedValue({ data: [], error: null })
  backend.rpc.mockResolvedValue({ error: null })
})

afterEach(() => vi.clearAllMocks())

it('links local profiles once and keeps the synced indicator stable during game progress', async () => {
  const store = configureStore({ reducer: { profiles: profilesReducer } })
  store.dispatch(createProfile({ id: 'p1', name: 'Georgi', avatar: 'G' }))
  store.dispatch(createProfile({ id: 'p2', name: 'Kaka', avatar: 'K' }))
  const activeProfileId = store.getState().profiles.activeProfileId
  const statuses: string[] = []
  const unsubscribe = subscribeAccountProfileSync(() =>
    statuses.push(getAccountProfileSyncStatus())
  )
  const stop = initializePlayerAccountProfiles(store as unknown as typeof appStore)
  try {
    await vi.waitFor(() => expect(getAccountProfileSyncStatus()).toBe('synced'))
    expect(store.getState().profiles.profiles.map((profile) => profile.playerAccountId)).toEqual([
      'account-1',
      'account-1',
    ])
    expect(store.getState().profiles.activeProfileId).toBe(activeProfileId)
    expect(backend.rpc).toHaveBeenCalledTimes(2)

    await new Promise((resolve) => setTimeout(resolve, 1000))
    const profileFetches = backend.order.mock.calls.length
    const statusChanges = statuses.length
    store.dispatch(debugGrantEyeoleans({ grantId: 'wallet-1', amount: 100 }))
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(backend.order).toHaveBeenCalledTimes(profileFetches)
    expect(statuses).toHaveLength(statusChanges)
    expect(getAccountProfileSyncStatus()).toBe('synced')
  } finally {
    stop()
    unsubscribe()
  }
})
