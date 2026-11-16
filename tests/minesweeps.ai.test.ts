import { describe, expect, it } from 'vitest'
import {
  chooseLowestRiskCell,
  simulateMinesweepsAiRun,
} from '../src/components/Minesweeps/minesweepsAi'
import { buildBoard, revealCell } from '../src/components/Minesweeps/minesweepsLogic'
import { minigameAiRegistry } from '../src/ai/competition/minigameAiRegistry'
import { getDefaultCompetitionProfile, simulateMinigameAiScore } from '../src/ai/competition'

describe('Minesweeps AI competition scoring', () => {
  it('resolves the same seeded board and profile deterministically', () => {
    const first = simulateMinesweepsAiRun({ seed: 81, playerId: 'rival', skill: 0.72 })
    const second = simulateMinesweepsAiRun({ seed: 81, playerId: 'rival', skill: 0.72 })

    expect(second).toEqual(first)
  })

  it('chooses from visible clues without inspecting hidden mine placements', () => {
    const board = revealCell(buildBoard({ seed: 318, safeCell: { row: 4, col: 4 } }), 4, 4).board
    const alternateHiddenLayout = board.map((row) =>
      row.map((cell) => (cell.revealed ? { ...cell } : { ...cell, mine: !cell.mine }))
    )
    const randomFirst = () => 0.37
    const firstChoice = chooseLowestRiskCell(board, randomFirst, 0.75)
    const alternateChoice = chooseLowestRiskCell(alternateHiddenLayout, randomFirst, 0.75)

    expect(firstChoice).not.toBeNull()
    expect(alternateChoice).toEqual(firstChoice)
  })

  it('uses native clear and partial-loss score ranges across a seeded board sample', () => {
    const startedAt = performance.now()
    const runs = Array.from({ length: 300 }, (_, index) =>
      simulateMinesweepsAiRun({ seed: index + 1, playerId: `solver-${index}`, skill: 0.5 })
    )
    const totalCpuMs = performance.now() - startedAt
    const wins = runs.filter((run) => run.won)
    const losses = runs.filter((run) => !run.won)

    expect(wins.length).toBeGreaterThan(0)
    expect(losses.length).toBeGreaterThan(0)
    expect(wins.every((run) => run.score >= 650 && run.score <= 980)).toBe(true)
    expect(losses.every((run) => run.score >= 0 && run.score <= 500)).toBe(true)
    expect(
      runs.every(
        (run) =>
          run.attempts >= 1 && run.attempts <= 81 && run.revealedSafeCells <= run.totalSafeCells
      )
    ).toBe(true)
    expect(totalCpuMs).toBeLessThan(2_500)
  })

  it('lets stronger deduction and risk selection improve seeded clear outcomes', () => {
    const seeds = Array.from({ length: 300 }, (_, index) => index + 1)
    const clearRate = (skill: number) =>
      seeds.filter((seed) => simulateMinesweepsAiRun({ seed, playerId: 'same-rival', skill }).won)
        .length / seeds.length

    expect(clearRate(0.8)).toBeGreaterThanOrEqual(clearRate(0.2))
  })

  it('benchmarks clear times and native scores across weak, neutral, and strong skills', () => {
    const skills = [0.2, 0.5, 0.8]
    const summaries = skills.map((skill) => {
      const runs = Array.from({ length: 300 }, (_, seed) =>
        simulateMinesweepsAiRun({ seed: seed + 1, playerId: `paced-${seed}`, skill })
      )
      const scores = runs.map((run) => run.score).sort((a, b) => a - b)
      const clearTimes = runs
        .filter((run) => run.won)
        .map((run) => run.elapsedMs)
        .sort((a, b) => a - b)

      return {
        skill,
        clearRate: clearTimes.length / runs.length,
        scoreP10P50P90: [0.1, 0.5, 0.9].map(
          (fraction) => scores[Math.floor(scores.length * fraction)]
        ),
        clearTimeP10P50P90: [0.1, 0.5, 0.9].map(
          (fraction) => clearTimes[Math.floor(clearTimes.length * fraction)]
        ),
      }
    })

    expect(
      summaries.every(
        ({ clearRate, scoreP10P50P90, clearTimeP10P50P90 }) =>
          clearRate > 0 &&
          scoreP10P50P90.every((score) => score >= 0 && score <= 980) &&
          clearTimeP10P50P90[0] <= clearTimeP10P50P90[1] &&
          clearTimeP10P50P90[1] <= clearTimeP10P50P90[2]
      )
    ).toBe(true)
    expect(summaries[0].clearRate).toBeLessThanOrEqual(summaries[1].clearRate)
    expect(summaries[0].scoreP10P50P90[1]).toBeLessThan(summaries[1].scoreP10P50P90[1])
    expect(summaries[1].scoreP10P50P90[1]).toBeLessThan(summaries[2].scoreP10P50P90[1])
    expect(summaries[0].scoreP10P50P90[2]).toBeLessThan(summaries[1].scoreP10P50P90[2])
    expect(summaries[1].scoreP10P50P90[2]).toBeLessThan(summaries[2].scoreP10P50P90[2])
    expect(summaries[2].clearTimeP10P50P90[1]).toBeLessThan(summaries[1].clearTimeP10P50P90[1])
    expect(summaries[2].clearTimeP10P50P90[2]).toBeLessThan(summaries[1].clearTimeP10P50P90[2])
  })

  it('routes competition scores through the Minesweeps solver and permits partial scores', () => {
    const profile = getDefaultCompetitionProfile()
    const model = minigameAiRegistry.minesweeps
    const scores = Array.from({ length: 120 }, (_, seed) =>
      simulateMinigameAiScore({
        gameKey: 'minesweeps',
        seed,
        playerId: `dispatch-${seed}`,
        profile,
        minigameModel: model,
      })
    )

    expect(model.minScore).toBe(0)
    expect(model.maxScore).toBe(980)
    expect(scores.every((score) => score >= 0 && score <= 980)).toBe(true)
    expect(scores.some((score) => score <= 500)).toBe(true)
    expect(scores.some((score) => score >= 650)).toBe(true)
  })

  it('resolves a full fifteen-rival field without a long synchronous stall', () => {
    const startedAt = Date.now()
    const scores = Array.from({ length: 15 }, (_, index) =>
      simulateMinigameAiScore({
        gameKey: 'minesweeps',
        seed: 19_004,
        playerId: `field-rival-${index}`,
        profile: getDefaultCompetitionProfile(),
        minigameModel: minigameAiRegistry.minesweeps,
      })
    )
    const elapsedMs = Date.now() - startedAt

    expect(scores).toHaveLength(15)
    expect(elapsedMs).toBeLessThan(2_500)
  })

  it('keeps seeded fifteen-rival field scores from clustering at the clear ceiling', () => {
    const profile = getDefaultCompetitionProfile()
    const fieldBestScores = Array.from({ length: 100 }, (_, seed) => {
      const scores = Array.from({ length: 15 }, (_, index) =>
        simulateMinigameAiScore({
          gameKey: 'minesweeps',
          seed,
          playerId: `benchmark-field-${index}`,
          profile,
          minigameModel: minigameAiRegistry.minesweeps,
        })
      )
      return Math.max(...scores)
    }).sort((a, b) => a - b)

    expect(fieldBestScores[Math.floor(fieldBestScores.length * 0.5)]).toBeLessThan(980)
  })
})
