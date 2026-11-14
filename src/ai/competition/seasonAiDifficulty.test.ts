import { describe, expect, it } from 'vitest'
import { getAllGames } from '../../minigames/registry'
import { getDefaultCompetitionProfile, simulateMinigameAiScore } from './index'
import { resolveHybridAiScores } from './hybridScoreResolver'
import { SEASON_AI_OWNERS } from './seasonAiOwners'
import {
  captureSeasonAiRuntime,
  DIRECT_SEASON_AI_GAMES,
  effectiveSeasonProfile,
  runtimeCompetitionProfile,
} from './seasonAiDifficulty'
import { mulberry32 } from '../../store/rng'
import {
  aiPickSide,
  createRowStream,
  pickAiPersonality,
  simulateAiRun,
  STARTING_SP,
  STARTING_HINTS,
  type PlayerState,
} from '../../minigames/crystalPathShattered/shatteredLogic'
import { simulateAiResult } from '../../features/memoryColors/memoryColorsSlice'
import {
  createPercentagePanic,
  simulatedPercentageGuess,
} from '../../features/percentagePanic/logic'
import { buildAiDropSchedule } from '../../features/holdTheWall/holdTheWallSlice'
import { shouldFinalDuelAiDrop } from '../../features/holdTheWall/deal'
import riskReducer, { initRiskWheel, performSpin } from '../../features/riskWheel/riskWheelSlice'
import { computeAiSolveProfile } from '../../components/CodeBreakerComp/codeBreakerLogic'
import { createHouseOfCardsAiProfiles } from '../../features/houseOfCards/houseOfCardsAi'
import { simulateTiltLabyrinthAiRun } from '../../components/TiltLabyrinthComp/tiltLabyrinthAi'
import { simulateQuickTapVipAiRace } from '../../minigames/quickTapRace/vip/quickTapVipLogic'
import { simulateSnakeAiScore } from './snakeAiSimulator'

const profileAt = (skill: number) =>
  Object.fromEntries(
    Object.keys(getDefaultCompetitionProfile()).map((k) => [k, skill])
  ) as unknown as ReturnType<typeof getDefaultCompetitionProfile>

describe('season AI capability policy', () => {
  it('bounds skill, reduces choke, preserves luck and the base roster', () => {
    const base = Object.freeze({ ...profileAt(50), mental: 90, chokeRisk: 60, luck: 73 })
    expect(effectiveSeasonProfile(base)).toMatchObject({
      physical: 60,
      mental: 100,
      overall: 60,
      chokeRisk: 50,
      luck: 73,
    })
    expect(base.physical).toBe(50)
    expect(effectiveSeasonProfile()).toMatchObject({ physical: 60, overall: 60, luck: 50 })
  })

  it('requires an active Classic run; Survival and unscoped previews keep baseline difficulty', () => {
    const players = [{ id: 'ai', competitionProfile: profileAt(50) }]
    const game = { mode: 'classic', status: 'active', gameId: 'run-a' }
    const runtime = captureSeasonAiRuntime(game, players)!
    expect(runtimeCompetitionProfile(runtime, 'ai')?.precision).toBe(60)
    expect(runtimeCompetitionProfile(JSON.parse(JSON.stringify(runtime)), 'ai')?.precision).toBe(60)
    expect(runtimeCompetitionProfile(runtime, 'ai', undefined, 'cardClash')?.precision).toBe(50)
    for (const excluded of [
      { ...game, mode: 'survival' },
      { ...game, gameId: '' },
      { ...game, status: 'completed' },
      {},
    ]) {
      expect(captureSeasonAiRuntime(excluded, players)).toBeUndefined()
    }
    expect(runtime.profiles.ai.base.precision).toBe(50)
  })

  it('requires an explicit actual AI owner for every registry game', () => {
    const games = getAllGames()
    expect(Object.keys(SEASON_AI_OWNERS).sort()).toEqual(games.map((g) => g.key).sort())
    for (const game of games) {
      if (!game.retired) {
        expect(DIRECT_SEASON_AI_GAMES.has(game.key), game.key).toBe(
          SEASON_AI_OWNERS[game.key].strategy !== 'profile'
        )
      }
      expect(SEASON_AI_OWNERS[game.key].strategy === 'retired', game.key).toBe(
        game.retired === true
      )
    }
  })

  it('improves generic and specialist performance in 1,000 seeded runs per profile band', () => {
    const summary: Record<
      string,
      { base: number; season: number; baseWins: number; seasonWins: number }
    > = {}
    for (const key of ['estimationGame', 'quickTap', 'quickTapSeasons', 'tiltLabyrinth']) {
      for (const band of [25, 50, 75]) {
        const base = profileAt(band),
          effective = effectiveSeasonProfile(base)
        const lower = key === 'tiltLabyrinth'
        const totals = { base: 0, season: 0, baseWins: 0, seasonWins: 0 }
        for (let seed = 1; seed <= 1000; seed++) {
          const a = simulateMinigameAiScore({
            gameKey: key,
            seed,
            playerId: 'rival',
            profile: base,
          })
          const b = simulateMinigameAiScore({
            gameKey: key,
            seed,
            playerId: 'rival',
            profile: effective,
          })
          expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true)
          // A specialist's stronger choices can change later RNG consumption;
          // compare the seeded distribution rather than promise every run wins.
          if (seed <= 3)
            expect(
              simulateMinigameAiScore({ gameKey: key, seed, playerId: 'rival', profile: effective })
            ).toBe(b)
          totals.base += a
          totals.season += b
          const benchmark =
            key === 'quickTap' ? 200 : key === 'quickTapSeasons' ? 200 : lower ? 60 : 70
          totals.baseWins += Number(lower ? a < benchmark : a > benchmark)
          totals.seasonWins += Number(lower ? b < benchmark : b > benchmark)
        }
        expect(lower ? totals.season < totals.base : totals.season > totals.base).toBe(true)
        summary[`${key}:${band}`] = totals
      }
    }
    console.info(`AI_CALIBRATION ${JSON.stringify(summary)}`)
  })

  it('never turns higher profile skill into a slower hybrid result, including different casts', () => {
    for (const count of [2, 6, 12, 16]) {
      const players = Array.from({ length: count - 1 }, (_, i) => ({
        id: `ai-${i}`,
        profile: profileAt(50),
      }))
      for (let seed = 1; seed <= 100; seed++) {
        const base = resolveHybridAiScores({
          gameKey: 'tiltLabyrinth',
          humanScore: 60,
          aiParticipants: players,
          seed,
        })
        const season = resolveHybridAiScores({
          gameKey: 'tiltLabyrinth',
          humanScore: 60,
          aiParticipants: players.map((p) => ({
            ...p,
            profile: effectiveSeasonProfile(p.profile),
          })),
          seed,
        })
        for (const p of players) expect(season[p.id]).toBeLessThanOrEqual(base[p.id])
      }
    }
  })

  it('improves actual Tilt, Snake and VIP tapping simulations before standings are produced', () => {
    const totals: Record<string, { base: number; season: number }> = {}
    for (const band of [25, 50, 75]) {
      const base = profileAt(band),
        season = effectiveSeasonProfile(base)
      const tilt = { base: 0, season: 0 },
        snake = { base: 0, season: 0 },
        vip = { base: 0, season: 0 }
      for (let seed = 1; seed <= 1000; seed++) {
        tilt.base += simulateTiltLabyrinthAiRun(base, 100, mulberry32(seed)).adjustedTimeMs
        tilt.season += simulateTiltLabyrinthAiRun(season, 100, mulberry32(seed)).adjustedTimeMs
        snake.base += simulateSnakeAiScore({
          sessionSeed: seed,
          playerId: 'rival',
          profile: base,
        }).score
        snake.season += simulateSnakeAiScore({
          sessionSeed: seed,
          playerId: 'rival',
          profile: season,
        }).score
        if (seed <= 100) {
          vip.base += simulateQuickTapVipAiRace({ seed, playerId: 'rival', profile: base }).score
          vip.season += simulateQuickTapVipAiRace({
            seed,
            playerId: 'rival',
            profile: season,
          }).score
        }
      }
      expect(tilt.season).toBeLessThan(tilt.base)
      expect(snake.season).toBeGreaterThan(snake.base)
      expect(vip.season).toBeGreaterThan(vip.base)
      totals[`tilt:${band}`] = tilt
      totals[`snake:${band}`] = snake
      totals[`vip:${band}`] = vip
    }
    console.info(`SPECIALIST_CALIBRATION ${JSON.stringify(totals)}`)
  }, 180000)

  it('uses 0..100 nerve units and strengthens actual Crystal Path decisions/runs', () => {
    expect(pickAiPersonality(profileAt(25), () => 0.9)).toBe('cautious')
    expect(pickAiPersonality(profileAt(50), () => 0.9)).toBe('balanced')
    expect(pickAiPersonality(profileAt(75), () => 0.9)).toBe('gambler')
    const base = profileAt(50),
      effective = effectiveSeasonProfile(base)
    const row = createRowStream(mulberry32(17)).take(1)[0]
    expect(aiPickSide(row, 'balanced', () => 0.52, base)).not.toBe(row.safeSide)
    expect(aiPickSide(row, 'balanced', () => 0.52, effective)).toBe(row.safeSide)
    let baseRows = 0,
      seasonRows = 0
    for (let seed = 1; seed <= 1000; seed++) {
      const rows = createRowStream(mulberry32(seed)).take(350)
      const player: PlayerState = {
        id: 'rival',
        name: 'Rival',
        isHuman: false,
        profile: base,
        sp: STARTING_SP,
        hints: STARTING_HINTS,
        furthestRow: 0,
        effects: [],
        eliminated: false,
        eliminatedRow: null,
        finishedAtMs: null,
        survivalIndex: 0,
      }
      baseRows += simulateAiRun(player, rows, 'balanced', mulberry32(seed)).player.furthestRow
      seasonRows += simulateAiRun(
        { ...player, profile: effective },
        rows,
        'balanced',
        mulberry32(seed)
      ).player.furthestRow
    }
    expect(seasonRows).toBeGreaterThan(baseRows)
    console.info(`CRYSTAL_PATH_ROWS ${baseRows} -> ${seasonRows}`)
  })

  it('improves native skill inputs without multiplying their final scores', () => {
    let memoryBase = 0,
      memorySeason = 0,
      estimateBase = 0,
      estimateSeason = 0
    for (let seed = 1; seed <= 1000; seed++) {
      memoryBase += simulateAiResult(seed, 'rival').roundsCleared
      memorySeason += simulateAiResult(seed, 'rival', 1.2).roundsCleared
      const state = createPercentagePanic(['human', 'rival'], 'human', seed)
      estimateBase += Math.abs(
        simulatedPercentageGuess(state, 'rival').guess - state.question.answerPercent
      )
      estimateSeason += Math.abs(
        simulatedPercentageGuess({ ...state, aiCapability: 1.2 }, 'rival').guess -
          state.question.answerPercent
      )
      const baseline = computeAiSolveProfile(seed, 'rival')
      const season = computeAiSolveProfile(seed, 'rival', undefined, 1.2)
      expect(season.attempts).toBe(baseline.attempts)
      expect(season.elapsedMs).toBeLessThanOrEqual(baseline.elapsedMs)
      const drops = buildAiDropSchedule(seed, ['human', 'rival'], 'human')
      expect(buildAiDropSchedule(seed, ['human', 'rival'], 'human', 1.2).rival).toBe(
        Math.round(drops.rival * 1.2)
      )
      expect(
        shouldFinalDuelAiDrop(seed, 'rival', 10, 1.2) && !shouldFinalDuelAiDrop(seed, 'rival', 10)
      ).toBe(false)
    }
    expect(memorySeason).toBeGreaterThan(memoryBase)
    expect(estimateSeason).toBeLessThan(estimateBase)
    const baseCards = createHouseOfCardsAiProfiles(['human', 'rival'], 'human', 17)
    const seasonCards = createHouseOfCardsAiProfiles(['human', 'rival'], 'human', 17, 1.2)
    expect(seasonCards.rival.sessionAbility).toBe(
      Math.min(100, baseCards.rival.sessionAbility * 1.2)
    )
    console.info(
      `NATIVE_CALIBRATION ${JSON.stringify({ memoryBase, memorySeason, estimateBase, estimateSeason })}`
    )
  })

  it('leaves Risk Wheel sector RNG identical for the same seed and spin input', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const args = {
        participantIds: ['human', 'rival'],
        competitionType: 'LOH' as const,
        seed,
        humanPlayerId: 'human',
      }
      const base = riskReducer(riskReducer(undefined, initRiskWheel(args)), performSpin())
      const season = riskReducer(
        riskReducer(undefined, initRiskWheel({ ...args, aiCapability: 1.2 })),
        performSpin()
      )
      expect(season.lastSectorIndex).toBe(base.lastSectorIndex)
      expect(season.roundScores).toEqual(base.roundScores)
      expect(season.rngCallCount).toBe(base.rngCallCount)
    }
  })
})
