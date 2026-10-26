import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_LOOKS,
  SELECTABLE_LOOKS,
  appearanceFromAssetUrl,
  coerceAppearanceSelection,
  getAppearanceAsset,
  type AppearanceRole,
} from './catalog'
import {
  resolveAvatarCandidates,
  resolveFormalCutout,
  resolveFullSizeCutoutFallback,
  resolveInformalCutout,
} from '../utils/avatar'
import { resolvePresentationAvatarCandidates } from '../utils/presentationAvatar'
import { buildDepressionShockAvatarCandidates } from '../features/twists/depressionShock'
import profilesReducer, {
  createProfile,
  debugGrantEyeoleans,
  loadProfilesState,
  saveProfilesState,
  updateProfile,
} from '../store/profilesSlice'

const selected = { kind: 'catalog' as const, lookId: 'pc-017', revision: 1 as const }
const roles: AppearanceRole[] = ['casual', 'main', 'grey', 'formal', 'sad', 'paparazzi']

describe('player appearance catalogue', () => {
  it('publishes all 27 repaired or approved looks with six explicit roles', () => {
    expect(APPEARANCE_LOOKS).toHaveLength(27)
    expect(SELECTABLE_LOOKS).toHaveLength(27)
    expect(SELECTABLE_LOOKS.map((look) => look.id)).toEqual(APPEARANCE_LOOKS.map((look) => look.id))
    for (const role of roles) {
      expect(getAppearanceAsset(selected, role)).toBe(
        `assets/player_characters/character%2017/${role}.webp`
      )
    }
  })

  it('invalidates cached faulty portraits while retaining existing appearance selections', () => {
    const repaired = { kind: 'catalog' as const, lookId: 'pc-002', revision: 1 as const }
    const sad = getAppearanceAsset(repaired, 'sad')
    expect(sad).toContain('/character%202/sad.webp?v=20261026')
    expect(appearanceFromAssetUrl(sad)).toEqual(repaired)
    for (let number = 20; number <= 27; number++) {
      const look = {
        kind: 'catalog' as const,
        lookId: `pc-${number.toString().padStart(3, '0')}`,
        revision: 1 as const,
      }
      expect(getAppearanceAsset(look, 'main')).toContain('?v=20261026')
      expect(getAppearanceAsset(look, 'sad')).toContain('?v=20261026')
      expect(getAppearanceAsset(look, 'casual')).not.toContain('?')
      const main = getAppearanceAsset(look, 'main')!
      expect(resolvePresentationAvatarCandidates(main)[0]).toContain(
        `/character%20${number}/grey.webp`
      )
      expect(buildDepressionShockAvatarCandidates('user', [main], 'Player')[0]).toContain(
        `/character%20${number}/sad.webp?v=20261026`
      )
    }
    expect(
      getAppearanceAsset({ kind: 'catalog', lookId: 'pc-027', revision: 1 }, 'grey')
    ).toContain('?v=20261026')
  })

  it('does not accept invented IDs, revisions, or arbitrary paths from persisted state', () => {
    expect(coerceAppearanceSelection({ kind: 'catalog', lookId: 'pc-999', revision: 1 })).toEqual({
      kind: 'legacy',
    })
    expect(coerceAppearanceSelection({ kind: 'catalog', lookId: 'pc-017', revision: 2 })).toEqual({
      kind: 'legacy',
    })
    expect(appearanceFromAssetUrl('/assets/player_characters/character%2017/main.webp')).toEqual(
      selected
    )
    expect(appearanceFromAssetUrl('https://example.com/wrong/main.webp')).toBeNull()
  })

  it('resolves one human identity across portrait, grey, sad and both figures', () => {
    const player = {
      id: 'user',
      name: 'Nova',
      avatar: '/assets/player_characters/character%2017/main.webp',
      isUser: true,
      appearance: selected,
    }
    const main = resolveAvatarCandidates(player)
    expect(main[0]).toContain('/character%2017/main.webp')
    expect(main.join(' ')).not.toContain('Nova_avatar')
    expect(resolvePresentationAvatarCandidates(main[0])[0]).toContain('/character%2017/grey.webp')
    expect(buildDepressionShockAvatarCandidates('user', main, 'Nova')[0]).toContain(
      '/character%2017/sad.webp'
    )
    expect(resolveInformalCutout(player)).toContain('/character%2017/casual.webp')
    expect(resolveFormalCutout(player)).toContain('/character%2017/formal.webp')
    expect(resolveFullSizeCutoutFallback({ id: 'user', name: 'Nova', isUser: true })).toContain(
      'full_body_fallback_neutral.png'
    )
  })

  it('changes the default look without changing profile ownership or wallet state', () => {
    let state = profilesReducer(
      undefined,
      createProfile({ name: 'Nova', avatar: '🧑', appearanceSelection: selected })
    )
    state = profilesReducer(state, debugGrantEyeoleans({ grantId: 'appearance-test', amount: 300 }))
    const before = state.profiles[0]
    state = profilesReducer(
      state,
      updateProfile({ appearanceSelection: { kind: 'catalog', lookId: 'pc-013', revision: 1 } })
    )
    const after = state.profiles[0]

    expect(after?.id).toBe(before?.id)
    expect(after?.eyeoleans).toBe(300)
    expect(after?.eyeoleanTransactions).toEqual(before?.eyeoleanTransactions)
    expect(after?.appearanceSelection).toEqual({ kind: 'catalog', lookId: 'pc-013', revision: 1 })

    saveProfilesState(state)
    expect(loadProfilesState().profiles[0]?.appearanceSelection).toEqual(after?.appearanceSelection)
    localStorage.removeItem('bbmobilenew:profiles:v1')
  })
})
