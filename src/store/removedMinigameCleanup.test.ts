import { afterEach, describe, expect, it } from 'vitest'
import { getGame } from '../minigames/registryBase'
import type { GameState, Player } from '../types'
import gameReducer, { hydrateGame, updateGamePRs } from './gameSlice'
import challengeReducer, {
  hydrateChallenge,
  recordRun,
  type ChallengeRun,
  type ChallengeState,
} from './challengeSlice'
import { getDurableItem, removeDurableItem, setDurableItem } from './durablePersistence'
import { removeObsoleteChallengeData, removeObsoleteGameData } from './removedMinigameCleanup'
import {
  createSavedSeasonSnapshot,
  loadSeasonSnapshot,
  saveSeasonSnapshot,
  type SavedSeasonSnapshot,
} from './saveStatePersistence'

const storageKey = 'bbmobilenew:savedSeason:removed-game-test'
const player: Player = {
  id: 'human',
  name: 'Human',
  avatar: 'Y',
  status: 'active',
  isUser: true,
  stats: { lohWins: 2, posWins: 1, timesNominated: 0, gamePRs: { laneRacers: 312, quickTap: 225 } },
}
const initialGame = () => gameReducer(undefined, { type: '@@INIT' })
const legacyGame = (): GameState => ({
  ...initialGame(),
  players: [player],
  pendingMinigame: {
    key: 'laneRacers',
    participants: ['human'],
    seed: 7,
    aiScores: {},
    options: { timeLimit: 60 },
  },
})
const run = (gameKey: string): ChallengeRun => ({
  id: gameKey,
  gameKey,
  seed: 7,
  participants: ['human'],
  rawScores: { human: 312 },
  canonicalScores: { human: 312 },
  winnerId: 'human',
  timestamp: 1,
  authoritative: false,
})
const legacyChallenge = (): ChallengeState => ({
  nextNonce: 2,
  debug: { forceGameKey: 'laneRacers' },
  history: [run('laneRacers'), run('quickTap')],
  pending: {
    id: 'legacy-race',
    seed: 7,
    participants: ['human'],
    aiScores: {},
    phase: 'playing',
    game: {
      ...getGame('quickTap')!,
      key: 'laneRacers',
      reactComponentKey: 'LaneRacers',
      timeLimitMs: 60_000,
    },
  },
})

afterEach(() => {
  removeDurableItem(storageKey)
})

describe('removed minigame data cleanup', () => {
  it('removes obsolete records immutably and preserves other games and season wins', () => {
    const original = legacyGame()
    const cleaned = removeObsoleteGameData(original)
    expect(cleaned.players[0].stats?.gamePRs).toEqual({ quickTap: 225 })
    expect(cleaned.players[0].stats?.lohWins).toBe(2)
    expect(original.players[0].stats?.gamePRs?.laneRacers).toBe(312)
    expect(cleaned.pendingMinigame).toMatchObject({
      key: 'quickTap',
      quickTapVariant: 'classic',
      options: { timeLimit: 60 },
    })
    expect(removeObsoleteGameData(cleaned)).toBe(cleaned)
  })

  it('cleans hydrated players and prevents obsolete personal records being re-created', () => {
    const hydrated = gameReducer(initialGame(), hydrateGame(legacyGame()))
    expect(hydrated.players[0].stats?.gamePRs).toEqual({ quickTap: 225 })
    const updated = gameReducer(
      hydrated,
      updateGamePRs({ gameKey: 'laneRacers', scores: { human: 999 } })
    )
    expect(updated.players[0].stats?.gamePRs).toEqual({ quickTap: 225 })
  })

  it('removes old challenge score history and resumes the pending competition safely', () => {
    const original = legacyChallenge()
    const cleaned = challengeReducer(undefined, hydrateChallenge(original))
    expect(cleaned.history.map((item) => item.gameKey)).toEqual(['quickTap'])
    expect(cleaned.pending?.game).toMatchObject({
      key: 'quickTap',
      reactComponentKey: 'QuickTapRace',
      timeLimitMs: 60_000,
    })
    expect(cleaned.pending?.phase).toBe('rules')
    expect(cleaned.debug.forceGameKey).toBeUndefined()
    expect(challengeReducer(cleaned, recordRun(run('laneRacers'))).history).toEqual(cleaned.history)
    expect(original.pending?.game.key).toBe('laneRacers')
    expect(removeObsoleteChallengeData(cleaned)).toBe(cleaned)
  })

  it('cleans loaded saves and persists only valid records on subsequent saves', () => {
    const raw = {
      version: 1,
      profileId: 'removed-game-test',
      savedAt: '2026-10-28T12:00:00.000Z',
      game: legacyGame(),
      challenge: legacyChallenge(),
      finale: {},
      social: {},
    } as SavedSeasonSnapshot
    setDurableItem(storageKey, JSON.stringify(raw))
    const loaded = loadSeasonSnapshot(storageKey)!
    expect(loaded.game.players[0].stats?.gamePRs).toEqual({ quickTap: 225 })
    expect(loaded.challenge?.history.map((item) => item.gameKey)).toEqual(['quickTap'])
    const saved = createSavedSeasonSnapshot(raw.profileId, loaded)
    expect(saveSeasonSnapshot(storageKey, saved)).toBe(true)
    const stored = JSON.parse(getDurableItem(storageKey)!) as SavedSeasonSnapshot
    expect(stored.game.players[0].stats?.gamePRs).toEqual({ quickTap: 225 })
    expect(stored.challenge?.pending?.game.key).toBe('quickTap')
  })
})
