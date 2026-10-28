import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getLaunchContestant,
  withSeasonContestant,
  type SeasonContestant,
} from '../appearance/seasonContestant'
import gameReducer, {
  createInitialGameState,
  hydrateGame,
  updateUserPlayerIdentity,
} from '../store/gameSlice'
import profilesReducer, { saveProfilesState } from '../store/profilesSlice'
import { launchSeasonWithContestant, type NewSeasonMode } from './launchSeason'
import {
  createSavedSeasonSnapshot,
  loadSavedRunProfile,
  saveRunSnapshot,
} from '../store/saveStatePersistence'
import finaleReducer from '../store/finaleSlice'
import socialReducer from '../social/socialSlice'
import publicOpinionReducer from '../publicOpinion/publicOpinionSlice'
import challengeReducer from '../store/challengeSlice'

const maya: SeasonContestant = {
  version: 1,
  name: 'Maya',
  avatar: 'assets/player_characters/character%202/main.webp',
  appearanceSelection: { kind: 'catalog', lookId: 'pc-002', revision: 1 },
  presetId: 'pc-002',
  presetRevision: 1,
  bio: {
    age: '41',
    sex: 'Female',
    location: 'Sofia',
    profession: 'Architect',
    reproductiveProfile: { canBecomePregnant: true, canCausePregnancy: false },
  },
}

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      profiles: profilesReducer,
      finale: finaleReducer,
      social: socialReducer,
      publicOpinion: publicOpinionReducer,
      challenge: challengeReducer,
    },
  })
}

describe('season contestant ownership', () => {
  beforeEach(() => {
    localStorage.clear()
    saveProfilesState({
      profiles: [
        {
          id: 'owner',
          name: 'Player',
          avatar: '🧑',
          createdAt: '2026-10-27',
          bio: { age: '28', sex: 'Male' },
          eyeoleans: 700,
        },
      ],
      activeProfileId: 'owner',
      isGuest: false,
    })
  })

  it.each<NewSeasonMode>(['classic', 'cupidArrow', 'voxPopuli', 'survival'])(
    'initializes %s with the chosen contestant before mode rules',
    (mode) => {
      const store = makeStore()
      const wallet = store.getState().profiles
      launchSeasonWithContestant(store.dispatch, mode, maya, [])
      const run = store.getState().game
      expect(run.seasonContestant).toEqual(maya)
      expect(run.players.find((player) => player.isUser)).toMatchObject({
        name: 'Maya',
        age: 41,
        sex: 'Female',
        avatar: maya.avatar,
        reproductiveProfile: maya.bio.reproductiveProfile,
      })
      expect(run.mode ?? 'classic').toBe(mode === 'survival' ? 'survival' : 'classic')
      expect(run.expansionMode).toBe(mode === 'classic' || mode === 'survival' ? null : mode)
      expect(store.getState().profiles).toBe(wallet)
    }
  )

  it('keeps a saved contestant after profile edits, reload, and a different new season', () => {
    const store = makeStore()
    launchSeasonWithContestant(store.dispatch, 'classic', maya, [])
    expect(saveRunSnapshot('owner', createSavedSeasonSnapshot('owner', store.getState()))).toBe(
      true
    )
    saveProfilesState({
      profiles: [
        {
          id: 'owner',
          name: 'Edited player',
          avatar: '👤',
          createdAt: '2026-10-27',
          bio: { age: '65', sex: 'Male' },
        },
      ],
      activeProfileId: 'owner',
      isGuest: false,
    })
    const saved = loadSavedRunProfile('owner').runs.classic!
    const alex = { ...maya, name: 'Alex', bio: { age: '24', sex: 'Male' } }
    launchSeasonWithContestant(store.dispatch, 'survival', alex, [])
    expect(store.getState().game.players.find((player) => player.isUser)?.name).toBe('Alex')
    store.dispatch(hydrateGame(saved.game))
    expect(store.getState().game.seasonContestant).toEqual(maya)
    expect(store.getState().game.players.find((player) => player.isUser)).toMatchObject({
      name: 'Maya',
      age: 41,
      sex: 'Female',
    })
    store.dispatch(
      updateUserPlayerIdentity({
        name: 'Changed',
        avatar: '👤',
        age: 18,
        sex: 'Male',
        reproductiveProfile: null,
      })
    )
    expect(store.getState().game.players.find((player) => player.isUser)).toMatchObject({
      name: 'Maya',
      age: 41,
      sex: 'Female',
    })
    expect(saved.game.seasonContestant).toEqual(maya)
  })

  it('locks a legacy save from its saved player, without importing current profile attributes', () => {
    const legacy = createInitialGameState()
    delete legacy.seasonContestant
    const human = legacy.players.find((player) => player.isUser)!
    human.name = 'Original contestant'
    human.age = 52
    human.sex = 'Female'
    human.reproductiveProfile = { canBecomePregnant: true }
    const restored = gameReducer(undefined, hydrateGame(legacy))
    expect(restored.players.find((player) => player.isUser)).toMatchObject({
      name: 'Original contestant',
      age: 52,
      sex: 'Female',
    })
    expect(restored.seasonContestant?.bio).toMatchObject({
      age: '52',
      sex: 'Female',
      reproductiveProfile: { canBecomePregnant: true },
    })
    expect(
      gameReducer(restored, updateUserPlayerIdentity({ name: 'Override', avatar: '👤', age: 28 }))
    ).toBe(restored)
  })

  it('clears launch context after a failed launch', () => {
    expect(() =>
      withSeasonContestant(maya, () => {
        throw new Error('failed')
      })
    ).toThrow('failed')
    expect(getLaunchContestant()).toBeUndefined()
  })
})
