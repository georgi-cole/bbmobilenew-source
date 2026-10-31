import { describe, it, expect } from 'vitest'
import {
  adaptCeremonyScene,
  shouldPlayCinematic,
  isCinematicSceneAllowed,
  winnerScene,
  ceremonyCast,
} from '../../src/cinematic/ceremonies/runtime.mjs'
import { modeDetails, publicResult } from '../../src/cinematic/ceremonies/mode-routing.mjs'
import { sceneResources } from '../../src/cinematic/ceremonies/renderer.js'
import catalog from '../../src/cinematic/ceremonies/cast.json'

const characters = catalog.characters.slice(0, 6)
const players = characters.map((c) => ({ id: c.id, name: c.name, status: 'active' }))
const game = {
  mode: 'classic',
  players,
  lohId: players[0].id,
  posWinnerId: players[0].id,
  cupidArrow: {
    status: 'active',
    pendingPartnerEvictionId: null,
    pairs: [0, 2, 4].map((i) => ({
      id: 'pair-' + i,
      memberIds: [players[i].id, players[i + 1].id],
      color: '#ff5d8f',
    })),
  },
}
describe('mode-aware premium ceremonies', () => {
  it('keeps three distinct nominees when twins share the same character artwork', () => {
    const twins = ['One', 'Two', 'Three'].map((name, i) => ({
      id: 'nominee-' + i,
      name,
      avatar: `${characters[i === 1 ? 0 : i].id}_avatar.webp`,
      status: 'nominated',
    }))
    const sharedGame = {
      ...game,
      players: twins,
      cupidArrow: { status: 'inactive' },
      voxPopuli: { status: 'active' },
    }
    const props = {
      actorIds: twins.map((p) => p.id),
      caption: 'One & Two & Three have been nominated',
    }
    for (const scene of ['nominations', 'voxNominations']) {
      const cast = ceremonyCast(scene, props, sharedGame, characters)
      expect(cast.a.id).toBe(cast.b.id)
      expect(cast.a.playerId).not.toBe(cast.b.playerId)
      expect(sceneResources(scene, cast).cinema_standC).toBeDefined()
    }
  })
  it.each(['survival', 'survivor'])(
    'never prepares premium media in %s, even for VIP Cinematic',
    (mode) => {
      expect(
        shouldPlayCinematic(
          {
            game: { mode },
            settings: { gameUX: { animations: true, animationMode: 'cinematic' }, display: {} },
          },
          true
        )
      ).toBe(false)
      for (const scene of ['loh', 'shock', 'ambush', 'exit', 'cupidExit', 'voxResults'])
        expect(isCinematicSceneAllowed({ ...game, mode }, scene)).toBe(false)
    }
  )
  it('distinguishes Vox immunity, Final 4 with no immunity, and POS without royal All Power', () => {
    const vox = { ...game, cupidArrow: { status: 'inactive' }, voxPopuli: { status: 'active' } }
    expect(winnerScene({ caption: 'wins Immunity!', targetIds: [players[0].id] }, vox)).toBe(
      'voxImmunity'
    )
    expect(
      winnerScene({ caption: 'wins the Final 4 Competition!', targetIds: [players[0].id] }, vox)
    ).toBe('voxFinal4')
    expect(winnerScene({ caption: 'wins Power of Safety!', targetIds: [players[0].id] }, vox)).toBe(
      'safety'
    )
    expect(adaptCeremonyScene('nominations', {}, vox)).toBe('voxNominations')
    for (const scene of ['loh', 'allPower', 'final3', 'final4', 'tiebreak', 'ambush'])
      expect(isCinematicSceneAllowed(vox, scene)).toBe(false)
    expect(isCinematicSceneAllowed(vox, 'shock', 'vox_populi')).toBe(false)
    expect(isCinematicSceneAllowed(vox, 'save')).toBe(true)
  })
  it('expands both partners for awards, saves and up to three nominated pairs', () => {
    const winner = { targetIds: [players[0].id], caption: 'wins LOH' }
    expect(winnerScene(winner, game)).toBe('cupidLoh')
    expect(winnerScene({ ...winner, caption: 'wins POS' }, game)).toBe('cupidPower')
    for (const [base, scene] of [
      ['loh', 'cupidLoh'],
      ['safety', 'cupidSafety'],
      ['save', 'cupidSave'],
    ]) {
      expect(adaptCeremonyScene(base, winner, game)).toBe(scene)
      const cast = ceremonyCast(scene, winner, game, characters)
      expect([cast.a.playerId, cast.b.playerId]).toEqual([players[0].id, players[1].id])
      const resources = sceneResources(scene, cast)
      expect(Object.values(resources).every((r) => r?.src && r.width && r.bytes)).toBe(true)
    }
    const props = { actorIds: [players[0].id, players[2].id, players[4].id] }
    const cast = ceremonyCast('cupidNominations', props, game, characters)
    expect(new Set(Object.values(cast).map((c) => c.playerId)).size).toBe(6)
    expect(
      Object.keys(sceneResources('cupidNominations', cast)).filter((k) =>
        k.startsWith('pairFront_')
      )
    ).toHaveLength(6)
  })
  it('keeps a shared exit once and the second native elimination; broken spells return to solo scenes', () => {
    const ambush = { ...game, lohNominationPlan: { targetId: players[2].id } }
    expect(adaptCeremonyScene('ambush', {}, ambush)).toBeNull()
    expect(isCinematicSceneAllowed(ambush, 'ambush')).toBe(false)
    const props = { evictee: players[0] }
    expect(adaptCeremonyScene('tiebreak', props, game)).toBe('cupidExit')
    expect(
      adaptCeremonyScene(
        'exit',
        { evictee: players[1] },
        { ...game, cupidArrow: { ...game.cupidArrow, pendingPartnerEvictionId: players[1].id } }
      )
    ).toBeNull()
    expect(
      adaptCeremonyScene('exit', props, {
        ...game,
        players: players.map((p, i) => (i === 1 ? { ...p, status: 'jury' } : p)),
      })
    ).toBe('exit')
    expect(
      adaptCeremonyScene(
        'loh',
        { targetIds: [players[0].id] },
        { ...game, cupidArrow: { ...game.cupidArrow, status: 'broken' } }
      )
    ).toBe('loh')
  })
  it('shows actual vote-to-eliminate percentages, double results, and distinguishes approval tiebreaks', () => {
    const nominees = players
      .slice(0, 3)
      .map((nominee, i) => ({ nominee, voteCount: [52.3, 31.2, 16.5][i] }))
    const props = { nominees, evictee: players[0], evicteeIds: [players[0].id, players[1].id] }
    const details = modeDetails('voxResults', props, {
      ...game,
      voxPopuli: { publicVoteContext: 'final3' },
    })
    expect(details.tallies.map((t) => t.value)).toEqual([52.3, 31.2, 16.5])
    expect(details.ids).toEqual(props.evicteeIds)
    expect(details.finalists).toBe(true)
    expect(publicResult({ nominees: nominees.map((t) => ({ ...t, voteCount: 50 })) })).toEqual({
      kind: 'tie',
      ids: nominees.map((t) => t.nominee.id),
    })
    const publicTiebreak = {
      evicteeIds: [players[1].id],
      tiedNominees: [{ nominee: players[1], approval: 23 }],
    }
    expect(modeDetails('voxResults', { ...props, publicTiebreak }, game)).toMatchObject({
      kind: 'public-tie',
      ids: [players[1].id],
      approval: [{ value: 23 }],
    })
  })
  it('fits every character pack in both halves of a pair; missing custom art falls back safely', () => {
    for (const character of catalog.characters) {
      const pairPlayers = [
        { id: character.id, name: 'Custom name', status: 'active' },
        { id: characters.find((c) => c.id !== character.id).id, name: 'Partner', status: 'active' },
      ]
      const paired = {
        ...game,
        players: pairPlayers,
        cupidArrow: { ...game.cupidArrow, pairs: [{ memberIds: pairPlayers.map((p) => p.id) }] },
      }
      const cast = ceremonyCast(
        'cupidLoh',
        { targetIds: [character.id] },
        paired,
        catalog.characters
      )
      expect(cast.a.name).toBe('Custom name')
      expect(sceneResources('cupidLoh', cast).pairSeated.crown.width).toBeGreaterThan(0)
    }
    expect(
      ceremonyCast(
        'cupidLoh',
        { targetIds: ['custom'] },
        {
          ...game,
          players: [{ id: 'custom', avatar: 'profile-photo:123', isUser: true }],
          cupidArrow: { status: 'active' },
        },
        catalog.characters
      )
    ).toBeNull()
  })
})
