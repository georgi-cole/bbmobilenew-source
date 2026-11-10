import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLastSavePersistenceIssue,
  CORRUPT_SAVE_RECOVERY_KEY,
  createSavedSeasonSnapshot,
  getLastSavePersistenceIssue,
  isSavePersistenceBlocked,
  loadSavedRunProfile,
  markSurvivorAchievementCelebrationSeen,
  retrySavePersistenceWrites,
  saveRunSnapshot,
  savedRunsKeyForProfile,
  savedRunSlotKeyForProfile,
  type SavedSeasonSnapshot,
  type SavedSeasonState,
} from './saveStatePersistence'

describe('saveStatePersistence survivor progression', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearLastSavePersistenceIssue()
    retrySavePersistenceWrites()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    clearLastSavePersistenceIssue()
    retrySavePersistenceWrites()
  })

  it('opens a circuit breaker after quota exhaustion and only retries on demand', () => {
    const snapshot = {
      version: 1,
      profileId: 'profile-1',
      savedAt: '2026-09-23T10:00:00.000Z',
      game: {
        mode: 'classic',
        week: 7,
        status: 'active',
        runId: 'run-quota',
        gameId: 'run-quota',
        players: [],
      },
      finale: {},
      social: {},
    } as unknown as SavedSeasonSnapshot

    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    })

    expect(saveRunSnapshot('profile-1', snapshot)).toBe(false)
    expect(isSavePersistenceBlocked()).toBe(true)
    const failedWriteCount = setItemSpy.mock.calls.length

    expect(saveRunSnapshot('profile-1', snapshot)).toBe(false)
    expect(setItemSpy).toHaveBeenCalledTimes(failedWriteCount)

    setItemSpy.mockRestore()
    retrySavePersistenceWrites()

    expect(isSavePersistenceBlocked()).toBe(false)
    expect(saveRunSnapshot('profile-1', snapshot)).toBe(true)
  })

  it('quarantines a damaged run and reports a visible recovery event', () => {
    const key = savedRunsKeyForProfile('profile-1')
    localStorage.setItem(key, '{damaged-json')

    const profile = loadSavedRunProfile('profile-1')

    expect(profile.runs).toEqual({})
    expect(localStorage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem(CORRUPT_SAVE_RECOVERY_KEY)).toBe('{damaged-json')
    expect(getLastSavePersistenceIssue()?.kind).toBe('corrupt_recovered')
  })

  it('normalizes missing survivor achievement unlock maps to an empty object', () => {
    localStorage.setItem(
      savedRunsKeyForProfile('profile-1'),
      JSON.stringify({
        version: 2,
        profileId: 'profile-1',
        savedAt: '2026-07-01T00:00:00.000Z',
        activeRunId: null,
        lastPlayedRunId: null,
        runs: {},
        stats: {
          maxSurvivorDaysSurvived: 37,
        },
      })
    )

    expect(loadSavedRunProfile('profile-1').stats.survivorAchievementsUnlocked).toEqual({})
  })

  it('persists survivor unlocks and marks their celebration as seen', () => {
    const snapshot = {
      version: 1,
      profileId: 'profile-1',
      savedAt: '2026-07-01T12:00:00.000Z',
      game: {
        mode: 'survival',
        week: 25,
        status: 'active',
        runId: 'run-1',
        gameId: 'game-1',
        players: [
          { id: 'user', name: 'You', avatar: '🙂', status: 'active', isUser: true },
          { id: 'ai-1', name: 'AI 1', avatar: 'A', status: 'active' },
          { id: 'ai-2', name: 'AI 2', avatar: 'B', status: 'active' },
        ],
        modeSpecific: {
          kind: 'survival',
          currentDay: 25,
          bestDayReached: 25,
          startingCastSize: 9,
          totalRoboContestantsEvicted: 0,
          nextRoboIndex: 0,
        },
      },
      finale: {},
      social: {},
    } as SavedSeasonSnapshot

    expect(saveRunSnapshot('profile-1', snapshot)).toBe(true)

    const afterUnlock = loadSavedRunProfile('profile-1')
    expect(afterUnlock.stats.maxSurvivorDaysSurvived).toBe(25)
    expect(Object.keys(afterUnlock.stats.survivorAchievementsUnlocked)).toEqual([
      'survivor-day-10',
      'survivor-day-25',
    ])
    expect(afterUnlock.stats.survivorAchievementsUnlocked['survivor-day-25'].celebrationSeen).toBe(
      false
    )

    expect(markSurvivorAchievementCelebrationSeen('profile-1', 'survivor-day-25')).toBe(true)
    expect(
      loadSavedRunProfile('profile-1').stats.survivorAchievementsUnlocked['survivor-day-25']
        .celebrationSeen
    ).toBe(true)
  })

  it('keeps Classic, Surveyeval, Cupid, and Vox Populi in independent save slots', () => {
    const makeSnapshot = (
      runId: string,
      mode: 'classic' | 'survival',
      expansionMode: 'cupidArrow' | 'voxPopuli' | null
    ) =>
      ({
        version: 1,
        profileId: 'profile-1',
        savedAt: `2026-07-01T12:00:0${runId.length}.000Z`,
        game: {
          mode,
          expansionMode,
          week: 2,
          status: 'active',
          runId,
          gameId: runId,
          players: [{ id: 'user', name: 'You', avatar: 'P', status: 'active', isUser: true }],
        },
        finale: {},
        social: {},
      }) as SavedSeasonSnapshot

    expect(saveRunSnapshot('profile-1', makeSnapshot('classic-run', 'classic', null))).toBe(true)
    expect(saveRunSnapshot('profile-1', makeSnapshot('survival-run', 'survival', null))).toBe(true)
    expect(saveRunSnapshot('profile-1', makeSnapshot('cupid-run', 'classic', 'cupidArrow'))).toBe(
      true
    )
    expect(saveRunSnapshot('profile-1', makeSnapshot('vox-run', 'classic', 'voxPopuli'))).toBe(true)

    const runs = loadSavedRunProfile('profile-1').runs
    expect(runs.classic?.game.runId).toBe('classic-run')
    expect(runs.survival?.game.runId).toBe('survival-run')
    expect(runs.cupidArrow?.game.runId).toBe('cupid-run')
    expect(runs.voxPopuli?.game.runId).toBe('vox-run')
  })

  it('rewrites only the active split run slot during routine autosaves', () => {
    const makeSnapshot = (
      runId: string,
      mode: 'classic' | 'survival',
      expansionMode: 'cupidArrow' | 'voxPopuli' | null,
      week = 2
    ) =>
      ({
        version: 1,
        profileId: 'profile-1',
        savedAt: `2026-08-11T20:00:${String(week).padStart(2, '0')}.000Z`,
        game: {
          mode,
          expansionMode,
          week,
          status: 'active',
          runId,
          gameId: runId,
          players: [{ id: 'user', name: 'You', avatar: 'P', status: 'active', isUser: true }],
        },
        finale: {},
        social: {},
      }) as SavedSeasonSnapshot

    expect(saveRunSnapshot('profile-1', makeSnapshot('classic-run', 'classic', null))).toBe(true)
    expect(saveRunSnapshot('profile-1', makeSnapshot('survival-run', 'survival', null))).toBe(true)
    expect(saveRunSnapshot('profile-1', makeSnapshot('cupid-run', 'classic', 'cupidArrow'))).toBe(
      true
    )
    expect(saveRunSnapshot('profile-1', makeSnapshot('vox-run', 'classic', 'voxPopuli'))).toBe(true)

    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    setItemSpy.mockClear()

    expect(saveRunSnapshot('profile-1', makeSnapshot('classic-run', 'classic', null, 3))).toBe(true)

    const writtenKeys = setItemSpy.mock.calls.map(([key]) => key)
    expect(writtenKeys).toContain(savedRunsKeyForProfile('profile-1'))
    expect(writtenKeys).toContain(savedRunSlotKeyForProfile('profile-1', 'classic'))
    expect(writtenKeys).not.toContain(savedRunSlotKeyForProfile('profile-1', 'survival'))
    expect(writtenKeys).not.toContain(savedRunSlotKeyForProfile('profile-1', 'cupidArrow'))
    expect(writtenKeys).not.toContain(savedRunSlotKeyForProfile('profile-1', 'voxPopuli'))

    const runs = loadSavedRunProfile('profile-1').runs
    expect(runs.classic?.game.week).toBe(3)
    expect(runs.survival?.game.runId).toBe('survival-run')
    expect(runs.cupidArrow?.game.runId).toBe('cupid-run')
    expect(runs.voxPopuli?.game.runId).toBe('vox-run')
  })

  describe('paid Survival recovery persistence', () => {
    const makeSnapshot = ({
      profileId = 'profile-1',
      runId = 'paid-run',
      paidContinueCount,
      day = 4,
      failed = false,
    }: {
      profileId?: string
      runId?: string
      paidContinueCount?: number
      day?: number
      failed?: boolean
    } = {}): SavedSeasonSnapshot =>
      ({
        version: 1,
        profileId,
        savedAt: `2026-11-10T12:00:${String(day).padStart(2, '0')}.000Z`,
        game: {
          mode: 'survival',
          week: day,
          status: failed ? 'failed' : 'active',
          runId,
          gameId: runId,
          players: [
            {
              id: 'user',
              name: 'You',
              avatar: 'P',
              status: failed ? 'evicted' : 'active',
              isUser: true,
            },
          ],
          modeSpecific: {
            kind: 'survival',
            currentDay: day,
            bestDayReached: day,
            startingCastSize: 9,
            totalRoboContestantsEvicted: 0,
            nextRoboIndex: 0,
            paidContinueCount,
            competitionRotation: { usedKeys: [], round: 0 },
          },
        },
        finale: {},
        social: {},
      }) as unknown as SavedSeasonSnapshot

    it.each(['split', 'embedded'])(
      'keeps the paid recovery when an older terminal autosave arrives in %s format',
      (format) => {
        const recovered = makeSnapshot({ paidContinueCount: 1 })
        expect(saveRunSnapshot('profile-1', recovered)).toBe(true)
        if (format === 'embedded') {
          localStorage.setItem(
            savedRunsKeyForProfile('profile-1'),
            JSON.stringify(loadSavedRunProfile('profile-1'))
          )
          localStorage.removeItem(savedRunSlotKeyForProfile('profile-1', 'survival'))
        }

        // Older saves have no paid counter; their generation is zero.
        expect(saveRunSnapshot('profile-1', makeSnapshot({ failed: true }))).toBe(true)
        expect(loadSavedRunProfile('profile-1').runs.survival?.game).toMatchObject({
          status: 'active',
          modeSpecific: { paidContinueCount: 1 },
        })
      }
    )

    it('does not roll back a paid recovery to an earlier active snapshot', () => {
      expect(saveRunSnapshot('profile-1', makeSnapshot({ paidContinueCount: 2 }))).toBe(true)
      expect(saveRunSnapshot('profile-1', makeSnapshot({ paidContinueCount: 1, day: 3 }))).toBe(
        true
      )
      expect(loadSavedRunProfile('profile-1').runs.survival?.game).toMatchObject({
        week: 4,
        modeSpecific: { paidContinueCount: 2 },
      })
    })

    it('still removes the run when the recovered player is eliminated again', () => {
      expect(saveRunSnapshot('profile-1', makeSnapshot({ paidContinueCount: 1 }))).toBe(true)
      expect(
        saveRunSnapshot('profile-1', makeSnapshot({ paidContinueCount: 1, failed: true, day: 5 }))
      ).toBe(true)
      expect(loadSavedRunProfile('profile-1').runs.survival).toBeUndefined()
    })

    it('allows a new run to start with no paid recoveries', () => {
      expect(saveRunSnapshot('profile-1', makeSnapshot({ paidContinueCount: 3 }))).toBe(true)
      expect(saveRunSnapshot('profile-1', makeSnapshot({ runId: 'new-run', day: 1 }))).toBe(true)
      expect(loadSavedRunProfile('profile-1').runs.survival?.game).toMatchObject({
        runId: 'new-run',
        week: 1,
      })
    })

    it('does not compare paid recoveries across profiles', () => {
      expect(saveRunSnapshot('profile-1', makeSnapshot({ paidContinueCount: 3 }))).toBe(true)
      expect(saveRunSnapshot('profile-2', makeSnapshot({ profileId: 'profile-2' }))).toBe(true)
      expect(loadSavedRunProfile('profile-1').runs.survival?.game.modeSpecific).toMatchObject({
        paidContinueCount: 3,
      })
      expect(loadSavedRunProfile('profile-2').runs.survival?.game.runId).toBe('paid-run')
    })

    it('allows legitimate day changes within the same paid recovery generation', () => {
      expect(saveRunSnapshot('profile-1', makeSnapshot({ paidContinueCount: 1 }))).toBe(true)
      expect(saveRunSnapshot('profile-1', makeSnapshot({ paidContinueCount: 1, day: 3 }))).toBe(
        true
      )
      expect(loadSavedRunProfile('profile-1').runs.survival?.game.week).toBe(3)
    })

    it('continues saving older runs without a paid recovery counter', () => {
      expect(saveRunSnapshot('profile-1', makeSnapshot())).toBe(true)
      expect(saveRunSnapshot('profile-1', makeSnapshot({ day: 5 }))).toBe(true)
      expect(loadSavedRunProfile('profile-1').runs.survival?.game.week).toBe(5)
    })
  })

  it('prepares one complete campaign snapshot without independently persisted authoring data', () => {
    const snapshot = createSavedSeasonSnapshot(
      'profile-1',
      {
        game: {
          mode: 'classic',
          phase: 'loh_results',
          status: 'active',
          week: 1,
          tvFeed: [],
          players: [],
          seasonArchives: [{ seasonIndex: 1, seasonId: 'season-1', playerSummaries: [] }],
          broadcastOverrides: { 'loh.winner': { text: 'Custom copy' } },
          customBroadcasts: [],
        },
        finale: { winnerId: 'player-1' },
        social: { actionLog: [] },
        publicOpinion: { feed: [] },
        challenge: { pending: null, history: [], nextNonce: 2, debug: {} },
      } as unknown as SavedSeasonState,
      '2026-08-09T10:00:00.000Z'
    )

    expect(snapshot).toMatchObject({
      profileId: 'profile-1',
      savedAt: '2026-08-09T10:00:00.000Z',
      game: {
        mode: 'classic',
        phase: 'loh_results',
        saveVersion: 2,
        lastPlayedAt: Date.parse('2026-08-09T10:00:00.000Z'),
      },
      finale: { winnerId: 'player-1' },
      social: { actionLog: [] },
      publicOpinion: { feed: [] },
      challenge: { pending: null, history: [], nextNonce: 2, debug: {} },
    })
    expect(snapshot.game).not.toHaveProperty('seasonArchives')
    expect(snapshot.game).not.toHaveProperty('broadcastOverrides')
    expect(snapshot.game).not.toHaveProperty('customBroadcasts')
  })

  it('saves a resumable LOH result even when runtime data contains a circular reference', () => {
    const runtimeData: Record<string, unknown> = { label: 'leader result', sequence: 42n }
    runtimeData.self = runtimeData
    const snapshot = {
      version: 1,
      profileId: 'profile-1',
      savedAt: '2026-08-09T10:00:00.000Z',
      game: {
        mode: 'classic',
        phase: 'loh_results',
        status: 'active',
        week: 1,
        runId: 'run-1',
        gameId: 'game-1',
        players: [{ id: 'player-1', name: 'Player', avatar: 'P', status: 'loh', isUser: true }],
        runtimeData,
      },
      finale: {},
      social: {},
    } as unknown as SavedSeasonSnapshot

    expect(saveRunSnapshot('profile-1', snapshot)).toBe(true)
    expect(getLastSavePersistenceIssue()).toBeNull()

    const restoredGame = loadSavedRunProfile('profile-1').runs.classic?.game as unknown as {
      phase: string
      runtimeData: { label: string; sequence: string; self?: unknown }
    }
    expect(restoredGame.phase).toBe('loh_results')
    expect(restoredGame.runtimeData).toEqual({ label: 'leader result', sequence: '42' })
  })
})
