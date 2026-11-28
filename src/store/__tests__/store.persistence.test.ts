import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const persistenceMocks = vi.hoisted(() => ({
  saveRunSnapshot: vi.fn(() => true),
}))

vi.mock('../saveStatePersistence', async () => {
  const actual =
    await vi.importActual<typeof import('../saveStatePersistence')>('../saveStatePersistence')
  return {
    ...actual,
    saveRunSnapshot: persistenceMocks.saveRunSnapshot,
  }
})

describe('store background persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    persistenceMocks.saveRunSnapshot.mockReset().mockReturnValue(true)
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

  it('continues a profileless competition as a guest and keeps the current run', async () => {
    localStorage.removeItem('bbmobilenew:profiles:v1')
    const [{ store, persistCompetitionCheckpoint }, { hydrateGame }] = await Promise.all([
      import('../store'),
      import('../gameSlice'),
    ])
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        runId: 'run-without-profile',
        phase: 'loh_comp',
      })
    )

    expect(store.getState().profiles.isGuest).toBe(false)
    await expect(persistCompetitionCheckpoint()).resolves.toBe(true)
    expect(store.getState().profiles.isGuest).toBe(true)
    expect(store.getState().game.runId).toBe('run-without-profile')
    expect(store.getState().game.phase).toBe('loh_comp')
    expect(persistenceMocks.saveRunSnapshot).not.toHaveBeenCalled()
  })

  it('keeps the active profile and reports failure if its competition save fails', async () => {
    const { store, persistCompetitionCheckpoint } = await import('../store')
    persistenceMocks.saveRunSnapshot.mockReturnValue(false)

    await expect(persistCompetitionCheckpoint()).resolves.toBe(false)
    expect(persistenceMocks.saveRunSnapshot).toHaveBeenCalledWith(
      'profile-background-save',
      expect.objectContaining({ profileId: 'profile-background-save' })
    )
    expect(store.getState().profiles.isGuest).toBe(false)
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
})
