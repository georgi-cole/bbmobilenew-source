import { describe, expect, it } from 'vitest'
import { APPEARANCE_LOOK_PRICE_EYEROS, hasAppearanceLookAccess, isFreeAppearanceLook } from '../appearance/lookAccess'
import profilesReducer, {
  coerceStoredProfile,
  createProfile,
  debugGrantEyeoleans,
  purchaseAppearanceLook,
  selectActiveProfile,
} from './profilesSlice'

describe('changing-room Eyeros unlocks', () => {
  it('makes exactly the first five published looks free, and VIP unlocks the rest', () => {
    for (let index = 1; index <= 35; index++) {
      const id = `pc-${String(index).padStart(3, '0')}`
      expect(isFreeAppearanceLook(id)).toBe(index <= 5)
      expect(hasAppearanceLookAccess(id, null, false)).toBe(index <= 5)
      expect(hasAppearanceLookAccess(id, null, true)).toBe(true)
    }
    expect(hasAppearanceLookAccess('pc-999', null, true)).toBe(false)
  })

  it('purchases a permanent look once for the canonical 30,000 Eyeros price', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Maya', avatar: '👤' }))
    state = profilesReducer(state, debugGrantEyeoleans({ grantId: 'looks', amount: 80_000 }))
    const purchase = purchaseAppearanceLook({ lookId: 'pc-006' })
    state = profilesReducer(state, purchase)
    state = profilesReducer(state, purchase)
    expect(state.profiles[0].eyeoleans).toBe(80_000 - APPEARANCE_LOOK_PRICE_EYEROS)
    expect(state.profiles[0].unlockedAppearanceLookIds).toEqual(['pc-006'])
    expect(state.profiles[0].eyeoleanTransactions?.filter((entry) => entry.source === 'store_purchase')).toEqual([
      expect.objectContaining({ amount: -30_000, id: expect.stringContaining('pc-006') }),
    ])
    expect(hasAppearanceLookAccess('pc-006', state.profiles[0], false)).toBe(true)
  })

  it('refuses insufficient funds, free looks, invalid looks, and guest purchases', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Maya', avatar: '👤' }))
    state = profilesReducer(state, debugGrantEyeoleans({ grantId: 'poor', amount: 29_999 }))
    for (const lookId of ['pc-006', 'pc-001', 'pc-999'])
      state = profilesReducer(state, purchaseAppearanceLook({ lookId }))
    expect(state.profiles[0].eyeoleans).toBe(29_999)
    expect(state.profiles[0].unlockedAppearanceLookIds).toEqual([])
    state = { ...state, isGuest: true }
    expect(profilesReducer(state, purchaseAppearanceLook({ lookId: 'pc-006' }))).toEqual(state)
  })

  it('keeps existing premium selections without a fee when old saves are loaded', () => {
    const old = { id: 'legacy', name: 'Maya', avatar: '👤', createdAt: '2026-10-01',
      appearanceSelection: { kind: 'catalog', lookId: 'pc-017', revision: 1 },
      initialAppearanceSelection: { kind: 'catalog', lookId: 'pc-014', revision: 1 },
      eyeoleans: 45_000 }
    const restored = coerceStoredProfile(old)
    expect(restored?.unlockedAppearanceLookIds).toEqual(['pc-014', 'pc-017'])
    expect(restored?.eyeoleans).toBe(45_000)
  })

  it('keeps purchases isolated to the paying profile', () => {
    let state = profilesReducer(undefined, createProfile({ id: 'one', name: 'One', avatar: '👤' }))
    state = profilesReducer(state, debugGrantEyeoleans({ grantId: 'first', amount: 30_000 }))
    state = profilesReducer(state, purchaseAppearanceLook({ lookId: 'pc-035' }))
    state = profilesReducer(state, createProfile({ id: 'two', name: 'Two', avatar: '👤' }))
    expect(state.profiles[1].unlockedAppearanceLookIds).toEqual([])
    state = profilesReducer(state, selectActiveProfile('one'))
    expect(state.profiles[0].unlockedAppearanceLookIds).toEqual(['pc-035'])
  })
})