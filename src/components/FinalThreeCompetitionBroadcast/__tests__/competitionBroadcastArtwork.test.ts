import { describe, expect, it } from 'vitest'
import catalog from '../../../cinematic/ceremonies/cast.json'
import { createInitialGameState } from '../../../store/gameSlice'
import type { Player } from '../../../types'
import { resolveCompetitionBroadcastArtwork } from '../competitionBroadcastArtwork'

function cast(): Player[] {
  const base = createInitialGameState({ seed: 111 }).players[0]
  return [
    {
      ...base,
      id: 'human',
      name: 'Season-owned look',
      isUser: true,
      avatar: 'assets/skins/Character7_avatar.webp',
      appearance: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
    },
    ...['Aria', 'Dex'].map((name) => ({
      ...base,
      id: name.toLowerCase(),
      name,
      isUser: false,
      appearance: undefined,
      avatar: `assets/skins/${name}_avatar.webp`,
    })),
  ]
}

describe('competition broadcast artwork identity', () => {
  it('keeps the selected season look and all competitors in their own normal outfit', () => {
    const result = resolveCompetitionBroadcastArtwork(cast(), catalog.characters)
    expect(result?.contestants).toMatchObject({
      human: expect.stringContaining('character-3/ceremony-front.webp'),
      aria: expect.stringContaining('aria/ceremony-front.webp'),
      dex: expect.stringContaining('dex/ceremony-front.webp'),
    })
    expect(result?.eye).toContain('final-decision/token.webp')
    expect(result?.monitor).toContain('final-decision/monitor.webp')
    expect(Object.values(result?.contestants ?? {})).not.toContainEqual(
      expect.stringMatching(/royal|knight/)
    )
  })

  it('supports both two- and three-person casts without adding a bench player', () => {
    const players = cast()
    expect(
      Object.keys(resolveCompetitionBroadcastArtwork(players, catalog.characters)!.contestants)
    ).toEqual(['human', 'aria', 'dex'])
    expect(
      Object.keys(
        resolveCompetitionBroadcastArtwork(players.slice(1), catalog.characters)!.contestants
      )
    ).toEqual(['aria', 'dex'])
  })

  it('requests native fallback for missing selected art, photos or invalid casts', () => {
    const players = cast()
    expect(
      resolveCompetitionBroadcastArtwork(
        players,
        catalog.characters.filter((entry) => entry.id !== 'character-3')
      )
    ).toBeNull()
    expect(
      resolveCompetitionBroadcastArtwork(
        [
          { ...players[0], appearance: undefined, avatar: 'profile-photo:personal-photo' },
          players[1],
        ],
        catalog.characters
      )
    ).toBeNull()
    expect(resolveCompetitionBroadcastArtwork([players[0]], catalog.characters)).toBeNull()
    expect(
      resolveCompetitionBroadcastArtwork([players[0], players[0]], catalog.characters)
    ).toBeNull()
    expect(
      resolveCompetitionBroadcastArtwork(
        [...players, { ...players[2], id: 'extra' }],
        catalog.characters
      )
    ).toBeNull()
  })
})
