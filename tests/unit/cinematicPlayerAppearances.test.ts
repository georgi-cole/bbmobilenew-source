import { describe, expect, it } from 'vitest'
import { SELECTABLE_LOOKS } from '../../src/appearance/catalog'
import catalog from '../../src/cinematic/ceremonies/cast.json'
import { ceremonyCast, findArt } from '../../src/cinematic/ceremonies/runtime.mjs'
import { sceneResources } from '../../src/cinematic/ceremonies/renderer.js'

const selection = { kind: 'catalog', lookId: 'pc-002', revision: 1 } as const
const user = {
  id: 'user',
  name: 'Georgi',
  isUser: true,
  avatar: 'assets/player_characters/character%201/main.webp',
  appearance: selection,
}

describe('ceremony player appearance identity', () => {
  it('uses the season selection before a stale avatar URL or matching houseguest name', () => {
    expect(findArt(user, catalog.characters)?.id).toBe('character-2')
    expect(findArt({ ...user, name: 'Aria' }, catalog.characters)?.id).toBe('character-2')
  })

  it('recognizes the user ID when old saves omit isUser and only preserve the selected look', () => {
    expect(findArt({ ...user, isUser: undefined, avatar: '🧑' }, catalog.characters)?.id).toBe(
      'character-2'
    )
    expect(findArt({ ...user, avatar: 'malformed%avatar' }, catalog.characters)?.id).toBe(
      'character-2'
    )
  })

  it.each([
    'profile-photo:uploaded',
    'data:image/png;base64,uploaded',
    'blob:uploaded',
    'profile-photo%3Auploaded',
  ])('uses the season look before stale %s while keeping photo-only players native', (avatar) => {
    expect(findArt({ ...user, avatar }, catalog.characters)?.id).toBe('character-2')
    expect(findArt({ ...user, avatar, appearance: undefined }, catalog.characters)).toBeNull()
    expect(
      findArt({ ...user, avatar, appearance: { kind: 'legacy' } }, catalog.characters)
    ).toBeNull()
  })

  it('never replaces an unsupported or invalid explicit selection with a stale look', () => {
    const incompleteCatalog = catalog.characters.filter(
      (character) => character.id !== 'character-2'
    )
    expect(findArt(user, incompleteCatalog)).toBeNull()
    for (const appearance of [
      { ...selection, lookId: 'pc-999' },
      { ...selection, lookId: 'character-2' },
      { ...selection, revision: 2 },
    ]) {
      expect(findArt({ ...user, appearance }, catalog.characters)).toBeNull()
    }
  })

  it('keeps legacy catalogue URLs and canonical AI identities without guessing a user identity', () => {
    expect(findArt({ ...user, appearance: undefined }, catalog.characters)?.id).toBe('character-1')
    expect(findArt({ id: 'aria', name: 'Renamed AI', avatar: '🧑' }, catalog.characters)?.id).toBe(
      'aria'
    )
    expect(findArt({ id: 'user', name: 'Aria', avatar: '🧑' }, catalog.characters)).toBeNull()
  })
})

describe('selectable appearance ceremony coverage', () => {
  it.each(SELECTABLE_LOOKS)('keeps $label in every required ceremony role', (look) => {
    const contestant = {
      ...user,
      avatar: '🧑',
      appearance: { kind: 'catalog', lookId: look.id, revision: look.revision },
    }
    const expectedArt = `character-${Number(look.id.slice(3))}`
    const aria = { id: 'aria', name: 'Aria', status: 'active' }
    const ash = { id: 'ash', name: 'Ash', status: 'active' }
    const bea = { id: 'bea', name: 'Bea', status: 'nominated' }
    const game = {
      mode: 'classic',
      players: [contestant, aria, ash, bea],
      lohId: aria.id,
      posWinnerId: ash.id,
      nomineeIds: [contestant.id, bea.id],
      povSavedId: contestant.id,
      lohNominationPlan: { targetId: contestant.id },
    }
    const nominees = [contestant, bea].map((nominee, index) => ({
      nominee,
      voteCount: [62.4, 37.6][index],
    }))
    const vox = { ...game, voxPopuli: { status: 'active' } }
    const paired = {
      ...game,
      cupidArrow: {
        status: 'active',
        pairs: [{ memberIds: [contestant.id, aria.id] }, { memberIds: [ash.id, bea.id] }],
      },
    }
    const scenarios = [
      // Exiting a Vox competition places the human last without changing their identity.
      {
        scene: 'voxImmunity',
        props: { targetIds: [aria.id], voxLastPlaceId: contestant.id },
        game: vox,
      },
      {
        scene: 'voxImmunity',
        props: { targetIds: [contestant.id], voxLastPlaceId: bea.id },
        game: vox,
      },
      { scene: 'voxResults', props: { nominees, evictee: contestant }, game: vox },
      { scene: 'voxNominations', props: { actorIds: [contestant.id, bea.id] }, game: vox },
      { scene: 'voxFinal4', props: { targetIds: [contestant.id] }, game: vox },
      ...['loh', 'safety', 'allPower', 'save'].map((scene) => ({
        scene,
        props: { targetIds: [contestant.id] },
        game,
      })),
      {
        scene: 'nominations',
        props: { caption: 'Georgi & Bea have been nominated' },
        game,
      },
      { scene: 'ambush', props: {}, game },
      ...['exit', 'tiebreak', 'final3', 'final4'].map((scene) => ({
        scene,
        props: { evictee: contestant },
        game,
      })),
      ...['tiebreak', 'final3'].map((scene) => ({
        scene,
        props: { evictee: bea },
        game: { ...game, lohId: contestant.id, nomineeIds: [bea.id, ash.id] },
      })),
      {
        scene: 'final4',
        props: { evictee: bea },
        game: { ...game, posWinnerId: contestant.id, nomineeIds: [bea.id, aria.id] },
      },
      ...['cupidLoh', 'cupidPower', 'cupidSafety', 'cupidSave'].map((scene) => ({
        scene,
        props: { targetIds: [aria.id] },
        game: paired,
      })),
      { scene: 'cupidExit', props: { evictee: aria }, game: paired },
      { scene: 'cupidNominations', props: { actorIds: [aria.id, bea.id] }, game: paired },
    ]
    for (const { scene, props, game: state } of scenarios) {
      const label = `${look.label}: ${scene}`
      const cast = ceremonyCast(scene, props, state, catalog.characters)
      expect(cast, label).not.toBeNull()
      const actor = Object.values(cast).find((entry) => entry.playerId === contestant.id)
      expect(actor, label).toMatchObject({
        id: expectedArt,
        playerId: contestant.id,
        name: contestant.name,
      })
      const resources = sceneResources(scene, cast)
      expect(
        Object.values(resources).every(
          (resource) => resource?.src && resource.width && resource.height && resource.bytes
        ),
        label
      ).toBe(true)
    }
  })
})
