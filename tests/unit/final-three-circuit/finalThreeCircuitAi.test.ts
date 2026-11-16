import { describe, expect, it } from 'vitest'
import {
  normalizeCircuitAiAbility,
  simulateAiCircuitScores,
  simulateAiSignalRun,
  simulateAiSignalScore,
  simulateAiSequenceRun,
  simulateAiSequenceScore,
} from '../../../src/components/FinalThreeCircuit/finalThreeCircuitAi'
import {
  buildSequenceBoards,
  scoreSequenceBoard,
} from '../../../src/components/FinalThreeCircuit/finalThreeCircuitLogic'

describe('Final Three Circuit AI calibration', () => {
  it('interprets both lab 0-100 input and native circuit-range input as ability signals', () => {
    expect(normalizeCircuitAiAbility(0)).toBe(0)
    expect(normalizeCircuitAiAbility(100)).toBe(1)
    expect(normalizeCircuitAiAbility(150)).toBe(0)
    expect(normalizeCircuitAiAbility(285)).toBe(1)
  })

  it('is deterministic for the same seed and player', () => {
    const first = simulateAiCircuitScores(78, 424242, 'ai-1')
    expect(simulateAiCircuitScores(78, 424242, 'ai-1')).toEqual(first)
  })

  it('keeps each discipline inside a realistic human range rather than producing automatic near-perfect scores', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const [signal, sequence, risk] = simulateAiCircuitScores(100, seed, 'elite')
      expect(signal).toBeGreaterThanOrEqual(0)
      expect(signal).toBeLessThanOrEqual(100)
      expect(sequence).toBeGreaterThanOrEqual(0)
      expect(sequence).toBeLessThanOrEqual(100)
      expect(risk).toBeGreaterThanOrEqual(18)
      expect(risk).toBeLessThanOrEqual(94)
    }
  })

  it('models the shorter Signal Hunt clock with the human round scoring rules', () => {
    let part1Total = 0
    let part2Total = 0

    for (const rawAbility of [0, 35, 75, 100, 180, 225, 270]) {
      for (let seed = 1; seed <= 120; seed += 1) {
        const playerId = `signal-profile-${rawAbility}-${seed}`
        const part1 = simulateAiSignalScore(rawAbility, seed, playerId, 1)
        const part2 = simulateAiSignalScore(rawAbility, seed, playerId, 2)

        expect(part1).toBeGreaterThanOrEqual(0)
        expect(part1).toBeLessThanOrEqual(100)
        expect(part2).toBeGreaterThanOrEqual(0)
        expect(part2).toBeLessThanOrEqual(100)
        part1Total += part1
        part2Total += part2
      }
    }

    expect(part2Total).toBeLessThan(part1Total)
  })

  it('retries Signal Hunt mistakes on the same target and never accepts a tap after time expires', () => {
    const runs = Array.from({ length: 240 }, (_unused, index) =>
      simulateAiSignalRun(0, index + 1, `mistake-profile-${index}`, 1)
    )
    const sawRetryOnSameTarget = runs.some((run) =>
      run.rounds.some((round) =>
        round.attempts.some(
          (attempt, index) =>
            !attempt.correct && round.attempts[index + 1]?.targetStep === attempt.targetStep
        )
      )
    )

    expect(sawRetryOnSameTarget).toBe(true)
    for (const run of runs) {
      for (const round of run.rounds) {
        expect(round.attempts.every((attempt) => attempt.elapsedMs < round.timeLimitMs)).toBe(true)
        expect(round.attempts.filter((attempt) => attempt.correct)).toHaveLength(round.found)
        for (let index = 1; index < round.attempts.length; index += 1) {
          const previous = round.attempts[index - 1]
          const current = round.attempts[index]
          expect(current.targetStep).toBe(previous.targetStep + (previous.correct ? 1 : 0))
        }
        if (round.found === round.targetCount) {
          expect(round.elapsedMs).toBeLessThan(round.timeLimitMs)
        }
      }
    }
  })

  it('applies Part 2 Signal Hunt time pressure to Signal only for an otherwise identical run', () => {
    let part1SignalTotal = 0
    let part2SignalTotal = 0
    for (let seed = 1; seed <= 100; seed += 1) {
      const part1 = simulateAiCircuitScores(225, seed, `same-player-${seed}`, 1)
      const part2 = simulateAiCircuitScores(225, seed, `same-player-${seed}`, 2)

      part1SignalTotal += part1[0]
      part2SignalTotal += part2[0]
      expect(part2[2]).toBe(part1[2])
    }
    expect(part2SignalTotal).toBeLessThan(part1SignalTotal)
  })

  it('scores a completed no-reset Sequence Builder run on the same human completion floor', () => {
    const boards = buildSequenceBoards(4242, 2)
    const minimumSolvedTotal = boards.reduce(
      (total, board) =>
        total + scoreSequenceBoard(board, board.target, board.scrambleMoves * 2, 0, true),
      0
    )

    expect(minimumSolvedTotal).toBe(82)
  })

  it('keeps Sequence Builder skill-sensitive and makes the harder Part 2 score lower on average', () => {
    const averageSequenceScore = (ability: number, part: 1 | 2) => {
      let total = 0
      for (let seed = 1; seed <= 500; seed += 1) {
        total += simulateAiSequenceScore(ability, seed, `player-${seed}`, part)
      }
      return total / 500
    }

    expect(averageSequenceScore(258, 2)).toBeGreaterThan(averageSequenceScore(218, 2))
    expect(averageSequenceScore(225, 1)).toBeGreaterThan(averageSequenceScore(225, 2))
  })

  it('gives competent AI the human 82-point floor when both boards are completed without resets', () => {
    const completedRuns = Array.from({ length: 300 }, (_unused, index) =>
      simulateAiSequenceRun(285, index + 1, `elite-${index}`, 2)
    ).filter((run) => run.completedBoards === 2)

    expect(completedRuns.length).toBeGreaterThan(0)
    expect(completedRuns.every((run) => run.score >= 82)).toBe(true)
    expect(completedRuns.some((run) => run.score < 100)).toBe(true)
  })

  it('preserves a broad profile trend without forcing Sequence Builder back to a fixed mean', () => {
    const averageTotal = (ability: number) => {
      let total = 0
      for (let seed = 1; seed <= 300; seed += 1) {
        total += simulateAiCircuitScores(ability, seed, `player-${seed}`).reduce(
          (sum, score) => sum + score,
          0
        )
      }
      return total / 300
    }

    expect(averageTotal(218)).toBeGreaterThan(averageTotal(180))
    expect(averageTotal(258)).toBeGreaterThan(averageTotal(218))
    expect(averageTotal(95)).toBeLessThan(285)

    const scores = Array.from({ length: 30 }, (_unused, index) =>
      simulateAiCircuitScores(218, index + 1, 'same-finalist')
    )
    expect(new Set(scores.map((stages) => stages.join(','))).size).toBeGreaterThan(20)
  })

  it('does not guarantee either outcome against human competitors across the profile range', () => {
    for (const profileScore of [180, 225, 270]) {
      let wins = 0
      let losses = 0
      for (let seed = 1; seed <= 600; seed += 1) {
        const aiTotal = simulateAiCircuitScores(profileScore, seed, `player-${seed}`).reduce(
          (sum, score) => sum + score,
          0
        )
        if (aiTotal > profileScore) wins += 1
        if (aiTotal < profileScore) losses += 1
      }

      expect(wins, `profile ${profileScore} never wins`).toBeGreaterThan(0)
      expect(losses, `profile ${profileScore} never loses`).toBeGreaterThan(0)
    }
  })
})
