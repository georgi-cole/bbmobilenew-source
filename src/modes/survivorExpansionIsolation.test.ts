import { beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  activateVoxPopuliNow,
  createInitialGameState,
  setSeasonExpansion,
} from '../store/gameSlice'
import { createSurvivorRun } from './survivorRun'

describe('season expansion isolation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not schedule an expansion in an ordinary unowned Classic season', () => {
    const game = createInitialGameState({ seed: 42 })

    expect(game.expansionMode).toBeNull()
    expect(game.cupidArrow?.status).toBe('inactive')
    expect(game.voxPopuli?.status).toBe('inactive')
  })

  it('strips expansion state from Surveyeval and rejects expansion activation', () => {
    let game = createSurvivorRun()

    game = gameReducer(game, setSeasonExpansion('cupidArrow'))
    game = gameReducer(game, activateCupidArrowNow())
    game = gameReducer(game, activateVoxPopuliNow())

    expect(game.mode).toBe('survival')
    expect(game.expansionMode).toBeNull()
    expect(game.cupidArrow?.status).toBe('inactive')
    expect(game.voxPopuli?.status).toBe('inactive')
  })

  it('uses the supplied season seed in E2E runs and a fresh seed otherwise', () => {
    const previousE2E = window.__E2E__
    const previousFixture = window.__bbE2ENewSeason
    try {
      window.__E2E__ = true
      window.__bbE2ENewSeason = { rosterSeed: 101, seasonSeed: 202 }
      expect(createSurvivorRun().seed).toBe(202)

      window.__E2E__ = false
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      vi.spyOn(Date, 'now').mockReturnValue(12345)
      expect(createSurvivorRun().seed).toBe((0x80000000 ^ 12345) >>> 0)
    } finally {
      window.__E2E__ = previousE2E
      window.__bbE2ENewSeason = previousFixture
      vi.restoreAllMocks()
    }
  })
})
