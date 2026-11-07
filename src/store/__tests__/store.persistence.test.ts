import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const persistenceMocks = vi.hoisted(() => ({
  saveRunSnapshot: vi.fn(() => true),
  flushSavePersistence: vi.fn(async () => true),
}))

vi.mock('../saveStatePersistence', async () => {
  const actual =
    await vi.importActual<typeof import('../saveStatePersistence')>('../saveStatePersistence')
  return {
    ...actual,
    saveRunSnapshot: persistenceMocks.saveRunSnapshot,
    flushSavePersistence: persistenceMocks.flushSavePersistence,
  }
})

describe('store background persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    persistenceMocks.saveRunSnapshot.mockClear()
    persistenceMocks.saveRunSnapshot.mockReturnValue(true)
    persistenceMocks.flushSavePersistence.mockReset().mockResolvedValue(true)
    localStorage.clear()
    localStorage.setItem(
      'bbmobilenew:profiles:v1',
      JSON.stringify({
        activeProfileId: 'profile-background-save',
        isGuest: false,
        profiles: [
          {
            avatar: 'P',
            createdAt: '2026-07-22T00:00:00.000Z',
            id: 'profile-background-save',
            name: 'Persistence Player',
          },
        ],
      })
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  it('saves meaningful active-profile progress when the app becomes hidden', async () => {
    const [{ store }, { hydrateGame }] = await Promise.all([
      import('../store'),
      import('../gameSlice'),
    ])

    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        runId: 'run-background-save',
        week: 2,
      })
    )
    persistenceMocks.saveRunSnapshot.mockClear()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(persistenceMocks.saveRunSnapshot).toHaveBeenCalledTimes(1)
    expect(persistenceMocks.saveRunSnapshot).toHaveBeenCalledWith(
      'profile-background-save',
      expect.objectContaining({
        game: expect.objectContaining({
          runId: 'run-background-save',
          week: 2,
        }),
        profileId: 'profile-background-save',
        version: 1,
      })
    )
  })

  it('does not confirm a competition checkpoint until the durable write completes', async () => {
    const [{ store, persistCompetitionCheckpoint }, { hydrateGame }, { setPendingChallenge }] =
      await Promise.all([import('../store'), import('../gameSlice'), import('../challengeSlice')])
    const { getGame } = await import('../../minigames/registry')
    store.dispatch(hydrateGame({ ...store.getState().game, week: 2, phase: 'loh_comp' }))
    store.dispatch(
      setPendingChallenge({
        id: 'durable-start',
        game: getGame('quickTap')!,
        seed: 1,
        participants: store.getState().game.players.map((player) => player.id),
        phase: 'countdown',
        aiScores: {},
        attempt: { number: 0, status: 'playing' },
      })
    )
    let completeWrite!: (ok: boolean) => void
    persistenceMocks.flushSavePersistence.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        completeWrite = resolve
      })
    )
    let confirmed = false
    const writing = persistCompetitionCheckpoint().then((saved) => {
      confirmed = saved
    })
    await Promise.resolve()
    expect(confirmed).toBe(false)
    expect(persistenceMocks.saveRunSnapshot).toHaveBeenLastCalledWith(
      'profile-background-save',
      expect.objectContaining({
        challenge: expect.objectContaining({
          pending: expect.objectContaining({
            id: 'durable-start',
            attempt: { number: 0, status: 'playing' },
          }),
        }),
      })
    )
    completeWrite(true)
    await writing
    expect(confirmed).toBe(true)
  })

  it('reports a failed checkpoint instead of allowing gameplay to rely on a failed save', async () => {
    const { store, persistCompetitionCheckpoint, flushPendingRunSnapshots } =
      await import('../store')
    const { hydrateGame } = await import('../gameSlice')
    store.dispatch(hydrateGame({ ...store.getState().game, week: 2, phase: 'loh_comp' }))
    persistenceMocks.saveRunSnapshot.mockReturnValue(false)
    expect(await persistCompetitionCheckpoint()).toBe(false)
    flushPendingRunSnapshots()
  })
})
