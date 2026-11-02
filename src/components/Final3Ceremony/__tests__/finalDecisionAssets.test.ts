import { describe, expect, it } from 'vitest'
import catalog from '../../../cinematic/ceremonies/cast.json'
import { createInitialGameState } from '../../../store/gameSlice'
import type { Player } from '../../../types'
import { resolveFinalDecisionArtwork } from '../finalDecisionAssets'

function cast() {
  const players = createInitialGameState({ seed: 111 }).players
  const base = players[0]
  const holder: Player = {
    ...base,
    id: 'user',
    name: 'Actual season name',
    isUser: true,
    avatar: 'assets/skins/Character7_avatar.webp',
    appearance: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
  }
  const nominees: Player[] = ['Aria', 'Dex'].map((name) => ({
    ...base,
    id: name.toLowerCase(),
    name,
    isUser: false,
    appearance: undefined,
    avatar: `assets/skins/${name}_avatar.webp`,
  }))
  return { holder, nominees }
}

describe('final decision ceremony identity', () => {
  it('keeps the season-owned human look despite a stale avatar, and preserves nominee order', () => {
    const { holder, nominees } = cast()
    const artwork = resolveFinalDecisionArtwork(holder, nominees, catalog.characters)
    expect(artwork?.assets.holder).toContain('character-3/ceremony-royal-standing.webp')
    expect(artwork?.assets['nominee-a']).toContain('aria/ceremony-front.webp')
    expect(artwork?.assets['nominee-b']).toContain('dex/ceremony-front.webp')
    expect(artwork?.holderCrownAnchor).toEqual(
      catalog.characters.find((player) => player.id === 'character-3')?.poses['royal-standing']
        .crown
    )
    const reversed = resolveFinalDecisionArtwork(
      holder,
      [...nominees].reverse(),
      catalog.characters
    )
    expect(reversed?.assets['nominee-a']).toContain('dex/ceremony-front.webp')
  })

  it('does not silently replace an unavailable selected human pack', () => {
    const { holder, nominees } = cast()
    const missing = catalog.characters.filter((player) => player.id !== 'character-3')
    expect(resolveFinalDecisionArtwork(holder, nominees, missing)).toBeNull()
  })

  it('uses native presentation for photo-only identities or an incomplete cast', () => {
    const { holder, nominees } = cast()
    const photo = { ...holder, appearance: undefined, avatar: 'profile-photo:personal-photo' }
    expect(resolveFinalDecisionArtwork(photo, nominees, catalog.characters)).toBeNull()
    expect(resolveFinalDecisionArtwork(holder, [nominees[0]], catalog.characters)).toBeNull()
    expect(
      resolveFinalDecisionArtwork(holder, [nominees[0], nominees[0]], catalog.characters)
    ).toBeNull()
    expect(
      resolveFinalDecisionArtwork(holder, [holder, nominees[0]], catalog.characters)
    ).toBeNull()
  })
})
