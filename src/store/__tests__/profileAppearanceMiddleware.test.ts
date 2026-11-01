import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../types'
import type { AppearanceSelection } from '../../appearance/catalog'
import {
  gameWithInitialProfileAppearance,
  withInitialSeasonAppearance,
} from '../../appearance/initialSeasonAppearance'
import gameReducer, {
  applyFirstSeasonAppearance,
  createInitialGameState,
  hydrateGame,
  resetGame,
} from '../gameSlice'
import profilesReducer, {
  createProfile,
  enterGuestMode,
  loadProfilesState,
  MAX_PROFILES,
  saveProfilesState,
  selectActiveProfile,
  updateProfile,
  type ProfilesState,
} from '../profilesSlice'
import { profileAppearanceMiddleware } from '../profileAppearanceMiddleware'
import finaleReducer from '../finaleSlice'
import socialReducer from '../../social/socialSlice'
import publicOpinionReducer from '../../publicOpinion/publicOpinionSlice'
import challengeReducer from '../challengeSlice'
import {
  createSavedSeasonSnapshot,
  loadSavedRunProfile,
  saveRunSnapshot,
} from '../saveStatePersistence'

const firstLook: AppearanceSelection = { kind: 'catalog', lookId: 'pc-002', revision: 1 }
const nextLook: AppearanceSelection = { kind: 'catalog', lookId: 'pc-003', revision: 1 }

function guestGame(): GameState {
  const game = createInitialGameState({ seed: 42, seasonArchives: [] })
  game.gameId = 'guest-game'
  game.week = 2
  game.phase = 'social_1'
  game.seasonContestant = {
    version: 1,
    name: 'Guest contestant',
    avatar: '👤',
    bio: { age: '40', sex: 'Male', reproductiveProfile: { canCausePregnancy: true } },
  }
  const human = game.players.find((player) => player.isUser)!
  Object.assign(human, {
    name: 'Guest contestant',
    avatar: '👤',
    appearance: { kind: 'legacy' },
    age: 40,
    sex: 'Male',
    reproductiveProfile: { canCausePregnancy: true },
    stats: { lohWins: 1, posWins: 2, timesNominated: 3 },
  })
  return game
}

function makeStore(game = guestGame(), profiles = profilesReducer(undefined, enterGuestMode())) {
  return configureStore({
    reducer: {
      game: gameReducer,
      profiles: profilesReducer,
      finale: finaleReducer,
      social: socialReducer,
      publicOpinion: publicOpinionReducer,
      challenge: challengeReducer,
    },
    preloadedState: { game, profiles },
    middleware: (get) =>
      get({ serializableCheck: false, immutableCheck: false }).concat(profileAppearanceMiddleware),
  })
}

describe('first character in an adopted guest season', () => {
  beforeEach(() => localStorage.clear())

  it('applies the registration look immediately while preserving the entire ongoing game', () => {
    const store = makeStore()
    const before = store.getState().game
    const humanBefore = before.players.find((player) => player.isUser)!

    store.dispatch(
      createProfile({
        name: 'New profile',
        avatar: '👤',
        appearanceSelection: firstLook,
        bio: { age: '28', sex: 'Female', reproductiveProfile: { canBecomePregnant: true } },
      })
    )

    const after = store.getState().game
    const humanAfter = after.players.find((player) => player.isUser)!
    expect(humanAfter).toEqual({
      ...humanBefore,
      avatar: 'assets/player_characters/character%202/main.webp',
      appearance: firstLook,
    })
    expect(after.seasonContestant).toEqual({
      ...before.seasonContestant,
      avatar: humanAfter.avatar,
      appearanceSelection: firstLook,
    })
    expect(after).toEqual({
      ...before,
      players: before.players.map((player) => (player.isUser ? humanAfter : player)),
      seasonContestant: after.seasonContestant,
    })
    expect(after.players.find((player) => !player.isUser)).toBe(
      before.players.find((player) => !player.isUser)
    )

    const owner = store.getState().profiles.activeProfileId!
    expect(saveRunSnapshot(owner, createSavedSeasonSnapshot(owner, store.getState()))).toBe(true)
    const saved = loadSavedRunProfile(owner).runs.classic!
    expect(saved.game.players.find((player) => player.isUser)?.appearance).toEqual(firstLook)
    expect(saved.game.seasonContestant?.appearanceSelection).toEqual(firstLook)
    store.dispatch(hydrateGame(saved.game))
    expect(store.getState().game.players.find((player) => player.isUser)).toEqual(humanAfter)
  })

  it('fills a legacy profile first choice once and defers later changes until a new season', () => {
    const store = makeStore()
    store.dispatch(createProfile({ name: 'Owner', avatar: '👤' }))
    store.dispatch(updateProfile({ appearanceSelection: firstLook }))
    const acceptedGame = store.getState().game
    expect(acceptedGame.players.find((player) => player.isUser)?.appearance).toEqual(firstLook)

    store.dispatch(updateProfile({ appearanceSelection: nextLook }))
    expect(store.getState().game).toBe(acceptedGame)
    expect(store.getState().profiles.profiles[0]).toMatchObject({
      appearanceSelection: nextLook,
      initialAppearanceSelection: firstLook,
    })
    saveProfilesState(store.getState().profiles)
    store.dispatch(resetGame([]))
    expect(store.getState().game.players.find((player) => player.isUser)?.appearance).toEqual(
      nextLook
    )
  })

  it('repairs an owned old silhouette save with the first look, even after a later profile edit', () => {
    const oldGame = guestGame()
    const profiles: ProfilesState = {
      isGuest: false,
      activeProfileId: 'owner',
      profiles: [
        {
          id: 'owner',
          name: 'Owner',
          avatar: '👤',
          createdAt: '2026-11-01',
          appearanceSelection: firstLook,
        },
      ],
    }
    const store = makeStore(oldGame, profiles)
    store.dispatch(updateProfile({ appearanceSelection: nextLook }))
    saveProfilesState(store.getState().profiles)
    const restoredProfile = loadProfilesState().profiles[0]
    expect(restoredProfile.initialAppearanceSelection).toEqual(firstLook)
    const repaired = gameWithInitialProfileAppearance(
      { profileId: 'owner', game: oldGame },
      restoredProfile
    )
    expect(repaired.players.find((player) => player.isUser)?.appearance).toEqual(firstLook)
    expect(repaired.seasonContestant?.appearanceSelection).toEqual(firstLook)
    expect(oldGame.players.find((player) => player.isUser)?.appearance).toEqual({ kind: 'legacy' })
    expect(
      gameWithInitialProfileAppearance({ profileId: 'other', game: oldGame }, restoredProfile)
    ).toBe(oldGame)
    expect(
      gameWithInitialProfileAppearance({ profileId: 'owner', game: repaired }, restoredProfile)
    ).toBe(repaired)
  })

  it.each([
    'catalog selection',
    'catalog avatar path',
    'uploaded photo',
    'custom image',
    'snapshot look',
    'snapshot photo',
    'contestant preset',
  ])('preserves an existing %s on guest registration', (kind) => {
    const game = guestGame()
    const human = game.players.find((player) => player.isUser)!
    if (kind === 'catalog selection') human.appearance = nextLook
    if (kind === 'catalog avatar path')
      human.avatar = 'assets/player_characters/character%203/main.webp'
    if (kind === 'uploaded photo') human.avatar = 'profile-photo:my-photo'
    if (kind === 'custom image') human.avatar = 'https://example.com/my-avatar.jpg'
    if (kind === 'snapshot look') game.seasonContestant!.appearanceSelection = nextLook
    if (kind === 'snapshot photo') game.seasonContestant!.photoId = 'my-photo'
    if (kind === 'contestant preset') game.seasonContestant!.presetId = 'existing-contestant'
    const store = makeStore(game)
    const before = store.getState().game
    store.dispatch(createProfile({ name: 'Owner', avatar: '👤', appearanceSelection: firstLook }))
    expect(store.getState().game).toBe(before)
  })

  it('does not fill another profile, a rejected registration, or a stale game action', () => {
    const profiles: ProfilesState = {
      activeProfileId: null,
      isGuest: true,
      profiles: Array.from({ length: MAX_PROFILES }, (_, index) => ({
        id: `owner-${index}`,
        name: `Owner ${index}`,
        avatar: '👤',
        createdAt: '2026-11-01',
        appearanceSelection: firstLook,
      })),
    }
    const store = makeStore(guestGame(), profiles)
    const before = store.getState().game
    store.dispatch(
      createProfile({ name: 'Rejected', avatar: '👤', appearanceSelection: firstLook })
    )
    expect(store.getState().profiles.isGuest).toBe(true)
    expect(store.getState().game).toBe(before)
    store.dispatch(selectActiveProfile('owner-1'))
    expect(store.getState().game).toBe(before)
    store.dispatch(applyFirstSeasonAppearance({ gameId: 'different-game', appearance: firstLook }))
    expect(store.getState().game).toBe(before)
    expect(
      withInitialSeasonAppearance(before, { kind: 'catalog', lookId: 'missing', revision: 1 })
    ).toBe(before)
  })
})
