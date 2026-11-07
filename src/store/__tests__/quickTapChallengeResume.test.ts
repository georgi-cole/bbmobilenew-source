import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, { createInitialGameState } from '../gameSlice'
import challengeReducer, {
  checkpointChallengeResult,
  hydrateChallenge,
  prepareChallengeRetry,
  startChallenge,
} from '../challengeSlice'
import vipReducer, { initializeVip, restoreVip } from '../vipSlice'
import { store as baseline, type AppDispatch, type RootState } from '../store'
import { reconcileQuickTapChallenge } from '../reconcileQuickTapChallenge'
import { createEmptyStoreEntitlements } from '../../vip/vipStorage'

vi.hoisted(() => {
  vi.stubEnv('VITE_VIP_DEV_ENTITLEMENT', 'false')
  vi.stubEnv('VITE_BUILD_TARGET', 'release')
})

function snapshot(premium: boolean) {
  return {
    isActive: false,
    billingAvailable: false,
    entitlements: { ...createEmptyStoreEntitlements(), premiumChallenges: premium },
    products: {},
    verifiedAt: '2026-10-31T00:00:00.000Z',
  }
}

function makeStore(premium: boolean, key: string) {
  const game = createInitialGameState({ seed: 245 })
  game.players = game.players.slice(0, 3)
  game.phase = 'pos_comp'
  const initial: RootState = { ...structuredClone(baseline.getState()), game }
  const store = configureStore({
    reducer: (state = initial, action) => ({
      ...state,
      game: gameReducer(state.game, action),
      challenge: challengeReducer(state.challenge, action),
      vip: vipReducer(state.vip, action),
    }),
    middleware: (get) => get({ serializableCheck: false, immutableCheck: false }),
  })
  store.dispatch(initializeVip.fulfilled(snapshot(premium), 'initial', undefined))
  startChallenge(
    245,
    game.players.map((player) => player.id),
    { forceGameKey: key, prizeType: 'POS' }
  )(store.dispatch as AppDispatch, store.getState)
  return store
}

beforeEach(() => localStorage.clear())

describe.each(['quickTap', 'quickTapSeasons'])('%s saved challenge edition', (key) => {
  it('checks the current edition for a granted new attempt after preserving its previous result', () => {
    const store = makeStore(true, key)
    const pending = store.getState().challenge.pending!
    store.dispatch(
      checkpointChallengeResult({
        id: pending.id,
        number: 0,
        result: { rawValue: 10, partial: false },
      })
    )
    store.dispatch(initializeVip.fulfilled(snapshot(false), 'revoked', undefined))
    store.dispatch(prepareChallengeRetry({ id: pending.id, number: 0 }))
    reconcileQuickTapChallenge()(store.dispatch as AppDispatch, store.getState)
    expect(store.getState().challenge.pending?.attempt).toEqual({ number: 1, status: 'ready' })
    expect(store.getState().challenge.pending?.quickTapVariant).toBe('classic')
  })

  it('restores a finished premium result without restarting it after ownership changes', () => {
    const store = makeStore(true, key)
    const pending = store.getState().challenge.pending!
    const result = {
      rawValue: 999,
      partial: false,
      completion: { authoritativeWinnerId: pending.participants[0] },
    }
    store.dispatch(checkpointChallengeResult({ id: pending.id, number: 0, result }))
    const saved = JSON.parse(JSON.stringify(store.getState().challenge))
    store.dispatch(hydrateChallenge(saved))
    store.dispatch(initializeVip.fulfilled(snapshot(false), 'revoked', undefined))
    reconcileQuickTapChallenge()(store.dispatch as AppDispatch, store.getState)
    expect(store.getState().challenge.pending?.attempt).toMatchObject({
      status: 'finished',
      result,
    })
    expect(store.getState().challenge.pending?.quickTapVariant).toBe('vip')
    expect(store.getState().challenge.pending?.aiScores).toEqual(pending.aiScores)
    expect(store.getState().challenge.pending?.needsEditionReconciliation).toBe(false)
  })
  it.each([true, false])(
    'restarts with consistent scores when premium access changes from %s',
    (premium) => {
      const store = makeStore(premium, key)
      const saved = structuredClone(store.getState().challenge)
      const old = saved.pending!
      const beforeAds = structuredClone(store.getState().ads)
      store.dispatch(hydrateChallenge(saved))
      store.dispatch(initializeVip.fulfilled(snapshot(!premium), 'changed', undefined))
      expect(reconcileQuickTapChallenge()(store.dispatch as AppDispatch, store.getState)).toBe(true)
      const resumed = store.getState().challenge.pending!
      expect(resumed.quickTapVariant).toBe(premium ? 'classic' : 'vip')
      expect(resumed.aiScores).not.toEqual(old.aiScores)
      expect(resumed.id).toBe(old.id)
      expect(resumed.seed).toBe(old.seed)
      expect(resumed.participants).toEqual(old.participants)
      expect(resumed.editionChangeNotice).toContain('No retry is used')
      expect(resumed.phase).toBe('rules')
      expect(store.getState().challenge.history).toEqual(saved.history)
      expect(store.getState().challenge.nextNonce).toBe(saved.nextNonce)
      expect(store.getState().ads).toEqual(beforeAds)
      const matchingScores = resumed.aiScores
      store.dispatch(hydrateChallenge(structuredClone(store.getState().challenge)))
      reconcileQuickTapChallenge()(store.dispatch as AppDispatch, store.getState)
      expect(store.getState().challenge.pending?.aiScores).toEqual(matchingScores)
    }
  )

  it('waits for delayed restoration and keeps the premium attempt when ownership returns', () => {
    const store = makeStore(true, key)
    const saved = structuredClone(store.getState().challenge)
    store.dispatch(hydrateChallenge(saved))
    store.dispatch(initializeVip.fulfilled(snapshot(false), 'temporary', undefined))
    store.dispatch(restoreVip.pending('restore', undefined))
    expect(reconcileQuickTapChallenge()(store.dispatch as AppDispatch, store.getState)).toBe(false)
    expect(store.getState().challenge.pending?.quickTapVariant).toBe('vip')
    expect(store.getState().challenge.pending?.aiScores).toEqual(saved.pending?.aiScores)
    store.dispatch(restoreVip.fulfilled(snapshot(true), 'restore', undefined))
    reconcileQuickTapChallenge()(store.dispatch as AppDispatch, store.getState)
    expect(store.getState().challenge.pending?.needsEditionReconciliation).toBe(false)
    expect(store.getState().challenge.pending?.editionChangeNotice).toBeUndefined()
    expect(store.getState().challenge.pending?.aiScores).toEqual(saved.pending?.aiScores)
  })

  it('repairs a legacy save and lets an offline player explicitly use cached access', () => {
    const store = makeStore(true, key)
    const saved = structuredClone(store.getState().challenge)
    delete saved.pending!.quickTapVariant
    store.dispatch(hydrateChallenge(saved))
    store.dispatch(initializeVip.rejected(new Error('Offline'), 'offline', undefined))
    expect(reconcileQuickTapChallenge()(store.dispatch as AppDispatch, store.getState)).toBe(false)
    expect(reconcileQuickTapChallenge(true)(store.dispatch as AppDispatch, store.getState)).toBe(
      true
    )
    expect(store.getState().challenge.pending?.quickTapVariant).toBe('vip')
    expect(store.getState().challenge.pending?.editionChangeNotice).toContain('updated')
  })
})
