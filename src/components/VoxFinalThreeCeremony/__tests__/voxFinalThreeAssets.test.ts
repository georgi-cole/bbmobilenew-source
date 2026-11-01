import { describe, expect, it } from 'vitest'
import catalog from '../../../cinematic/ceremonies/cast.json'
import { createInitialGameState } from '../../../store/gameSlice'
import type { Player } from '../../../types'
import { resolveVoxFinalThreeArtwork } from '../voxFinalThreeAssets'

function cast() {
  const base = createInitialGameState({ seed: 111 }).players[0]
  const human: Player = {
    ...base,
    id: 'user',
    name: 'Season name',
    isUser: true,
    avatar: 'assets/skins/Character7_avatar.webp',
    appearance: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
  }
  const [aria, dex] = ['Aria', 'Dex'].map((name) => ({
    ...base,
    id: name.toLowerCase(),
    name,
    isUser: false,
    appearance: undefined,
    avatar: `assets/skins/${name}_avatar.webp`,
  }))
  return { human, aria, dex }
}

describe('Vox Final Three ceremony artwork', () => {
  it('shows the immune human in their season-owned front look without a crown', () => {
    const { human, aria, dex } = cast()
    const artwork = resolveVoxFinalThreeArtwork(human, [aria, dex], catalog.characters)
    expect(artwork?.assets.holder).toContain('character-3/ceremony-front.webp')
    expect(artwork?.assets['nominee-a']).toContain('aria/ceremony-front.webp')
    expect(artwork?.assets['nominee-b']).toContain('dex/ceremony-front.webp')
    expect(artwork?.assets.crown).toBeUndefined()
    expect(artwork?.holderCrownAnchor).toBeUndefined()
    expect(Object.values(artwork!.assets).some((src) => /royal|crown/.test(src))).toBe(false)
  })

  it('preserves a human nominee and actual AI immunity holder without royal artwork', () => {
    const { human, aria, dex } = cast()
    const artwork = resolveVoxFinalThreeArtwork(dex, [human, aria], catalog.characters)
    expect(artwork?.assets.holder).toContain('dex/ceremony-front.webp')
    expect(artwork?.assets['nominee-a']).toContain('character-3/ceremony-front.webp')
    const reversed = resolveVoxFinalThreeArtwork(dex, [aria, human], catalog.characters)
    expect(reversed?.assets['nominee-b']).toContain('character-3/ceremony-front.webp')
  })

  it('keeps unsupported identities and invalid casts on the native path', () => {
    const { human, aria, dex } = cast()
    const photo = { ...human, appearance: undefined, avatar: 'profile-photo:season-photo' }
    expect(resolveVoxFinalThreeArtwork(photo, [aria, dex], catalog.characters)).toBeNull()
    expect(resolveVoxFinalThreeArtwork(dex, [photo, aria], catalog.characters)).toBeNull()
    expect(resolveVoxFinalThreeArtwork(dex, [human, human], catalog.characters)).toBeNull()
    expect(resolveVoxFinalThreeArtwork(dex, [dex, aria], catalog.characters)).toBeNull()
    expect(
      resolveVoxFinalThreeArtwork(
        dex,
        [human, aria],
        catalog.characters.filter((entry) => entry.id !== 'character-3')
      )
    ).toBeNull()
  })
})
