import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../../store/gameSlice'
import type { GameState, Player } from '../../../types'
import { buildMemoryLaneQuestionBank } from '../../DownMemoryLane/downMemoryLaneLogic'
import {
  buildSignalBoard,
  buildSignalRounds,
  EMPTY_SEQUENCE_TILE,
  isSequenceSolved,
  slideSequenceTile,
} from '../../FinalThreeCircuit/finalThreeCircuitLogic'
import {
  buildCompetitionBroadcastSimulation,
  competitionBroadcastFrameAt,
  COMPETITION_REPLAY_DURATION_MS,
  type CompetitionBroadcastSimulation,
} from '../competitionBroadcastSimulation'
import type { FinalThreeCompetitionPart } from '../competitionBroadcastTimeline'

const initial = createInitialGameState({ seed: 41 })

function gameFor(seed = 41): GameState {
  const base = initial.players[0]
  const players: Player[] = ['Aria', 'Dex', 'Ash', 'Blaze', 'You'].map((name, index) => ({
    ...base,
    id: name.toLowerCase(),
    name,
    isUser: name === 'You',
    status: index < 3 ? 'active' : 'jury',
    stats: {
      ...base.stats,
      lohWins: index === 0 ? 4 : index === 1 ? 2 : 0,
      posWins: index === 1 ? 3 : index === 2 ? 1 : 0,
      timesNominated: index,
    },
  }))
  return { ...initial, seed, players, history: [], tvFeed: [] }
}

function make(part: FinalThreeCompetitionPart, seed = 41, winner = 'aria') {
  const game = gameFor(seed)
  const competitorIds = part === 1 ? ['aria', 'dex', 'ash'] : ['aria', 'dex']
  const simulation = buildCompetitionBroadcastSimulation({
    game,
    part,
    competitorIds,
    expectedWinnerId: winner,
  })
  expect(simulation).not.toBeNull()
  return { game, simulation: simulation!, competitorIds }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

describe('Final Three spectator competition simulations', () => {
  it('uses one distinct competition and a different state model for every part', () => {
    const signal = make(1).simulation
    const sequence = make(2).simulation
    const memory = make(3).simulation
    expect([signal.kind, sequence.kind, memory.kind]).toEqual(['signal', 'sequence', 'memory'])
    expect([signal.title, sequence.title, memory.title]).toEqual([
      'Signal Hunt',
      'Sequence Builder',
      'Down Memory Lane',
    ])
    expect([signal.durationMs, sequence.durationMs, memory.durationMs]).toEqual([
      COMPETITION_REPLAY_DURATION_MS.signal,
      COMPETITION_REPLAY_DURATION_MS.sequence,
      COMPETITION_REPLAY_DURATION_MS.memory,
    ])
  })

  it.each([1, 2, 3] as const)(
    'part %s is deterministic, seekable and never mutates gameplay',
    (part) => {
      const game = deepFreeze(gameFor())
      const before = JSON.stringify(game)
      const args = {
        game,
        part,
        competitorIds: part === 1 ? ['aria', 'dex', 'ash'] : ['aria', 'dex'],
        expectedWinnerId: 'dex',
      }
      const first = buildCompetitionBroadcastSimulation(args)!
      expect(buildCompetitionBroadcastSimulation(args)).toEqual(first)
      expect(JSON.stringify(game)).toBe(before)
      expect(new Set(first.frames.map((frame) => frame.eventId)).size).toBe(first.frames.length)
      expect(
        first.frames.every(
          (frame, index) => index === 0 || frame.atMs > first.frames[index - 1].atMs
        )
      ).toBe(true)
      const opening = competitionBroadcastFrameAt(first, 0)
      const middle = competitionBroadcastFrameAt(first, first.durationMs / 2)
      expect(competitionBroadcastFrameAt(first, first.durationMs / 2)).toBe(middle)
      expect(competitionBroadcastFrameAt(first, 0)).toBe(opening)
      expect(competitionBroadcastFrameAt(first, -100)).toBe(opening)
      expect(competitionBroadcastFrameAt(first, Number.NaN)).toBe(opening)
      expect(competitionBroadcastFrameAt(first, Infinity)).toBe(first.frames.at(-1))
      expect(first.frames.at(-1)?.atMs).toBe(first.durationMs)
      expect(first.frames.at(-1)?.phase).toBe('finished')
      expect(first.frames.every((frame) => frame.atMs <= first.durationMs)).toBe(true)
    }
  )

  it.each([1, 2, 3] as const)(
    'part %s always resolves to the existing winner across seeds and cast positions',
    (part) => {
      for (const seed of [0, 1, 2, 7, 11, 19, 41, 72, 109, 997, 2147483647, 4294967295]) {
        for (const winnerId of part === 1 ? ['aria', 'dex', 'ash'] : ['aria', 'dex']) {
          const { simulation, competitorIds } = make(part, seed, winnerId)
          const final = competitionBroadcastFrameAt(simulation, simulation.durationMs)
          expect(final.leaderIds).toEqual([winnerId])
          expect(final.players.map((player) => player.id)).toEqual(competitorIds)
          const winner = final.players.find((player) => player.id === winnerId)!
          const others = final.players.filter((player) => player.id !== winnerId)
          if (part === 3) {
            expect(winner.lives).toBe(1)
            expect(others.every((player) => player.lives === 0)).toBe(true)
          } else {
            expect(others.every((player) => player.score < winner.score)).toBe(true)
            expect(winner.progress).toBe(winner.total)
          }
        }
      }
    }
  )

  it('preserves actual Signal Hunt targets, scrambled boards, hits and penalties', () => {
    const { game, simulation } = make(1)
    const round = buildSignalRounds(game.seed, 1)[0]
    const progress = new Map(simulation.competitorIds.map((id) => [id, 0]))
    const mistakes = new Map(simulation.competitorIds.map((id) => [id, 0]))
    for (const frame of simulation.frames) {
      if (frame.kind !== 'signal' || !['correct', 'wrong'].includes(frame.phase)) continue
      const id = frame.activePlayerId!
      const previous = progress.get(id)!
      expect(frame.signal.target).toBe(round.targetOrder[previous])
      expect(frame.signal.cells).toEqual(buildSignalBoard(game.seed, 0, previous, round.cellCount))
      expect(frame.signal.cells[frame.signal.selectedIndex!]).toBe(frame.signal.selectedValue)
      const current = frame.players.find((player) => player.id === id)!
      if (frame.phase === 'correct') {
        expect(frame.signal.selectedValue).toBe(frame.signal.target)
        progress.set(id, previous + 1)
      } else {
        expect(frame.signal.selectedValue).not.toBe(frame.signal.target)
        mistakes.set(id, mistakes.get(id)! + 1)
      }
      expect(current.progress).toBe(progress.get(id))
      expect(current.mistakes).toBe(mistakes.get(id))
      expect(frame.signal.remainingMs).toBeGreaterThan(0)
    }
    const final = simulation.frames.at(-1)!
    expect(final.players.find((player) => player.id === 'aria')?.progress).toBe(6)
    expect(
      final.players
        .filter((player) => player.id !== 'aria')
        .map((p) => p.progress)
        .sort()
    ).toEqual([4, 5])
    expect(
      simulation.frames.some(
        (frame) => frame.leaderIds.length === 1 && frame.leaderIds[0] !== 'aria'
      )
    ).toBe(true)
  })

  it('animates only legal Sequence Builder slides without hidden or future board changes', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const { simulation } = make(2, seed)
      const first = simulation.frames[0]
      if (first.kind !== 'sequence') throw new Error('Expected sequence')
      const seenOrders = new Map(first.sequence.boards.map((board) => [board.id, board.order]))
      let solvedBeforeEnd = false
      for (const frame of simulation.frames) {
        if (frame.kind !== 'sequence') throw new Error('Unexpected model')
        for (const board of frame.sequence.boards) {
          const previous = seenOrders.get(board.id)!
          if (board.order.join() !== previous.join()) {
            expect(board.id).toBe(frame.activePlayerId)
            expect(board.previousOrder).toEqual(previous)
            expect(board.toIndex).toBe(previous.indexOf(EMPTY_SEQUENCE_TILE))
            expect(board.movedTile).toBe(previous[board.fromIndex!])
            expect(
              slideSequenceTile(
                previous,
                board.fromIndex!,
                frame.sequence.rows,
                frame.sequence.columns
              )
            ).toEqual(board.order)
            expect(frame.phase).not.toBe('thinking')
            seenOrders.set(board.id, board.order)
          }
          const solved = isSequenceSolved(board.order, frame.sequence.target)
          if (board.id !== simulation.winnerId) expect(solved).toBe(false)
          if (solved) {
            solvedBeforeEnd = true
            expect(frame.atMs).toBeGreaterThanOrEqual(20_000)
          }
          const matched = board.order.filter(
            (tile, index) => tile !== EMPTY_SEQUENCE_TILE && tile === frame.sequence.target[index]
          ).length
          expect(frame.players.find((player) => player.id === board.id)?.progress).toBe(matched)
        }
      }
      expect(solvedBeforeEnd).toBe(true)
    }
  })

  it('uses real season questions, provides reading time and applies the actual memory-duel life rules', () => {
    const { game, simulation } = make(3)
    const actualQuestions = buildMemoryLaneQuestionBank(game, game.seed)
    const lives = new Map(simulation.competitorIds.map((id) => [id, 5]))
    let questionStart = 0
    let results = 0
    for (const frame of simulation.frames) {
      if (frame.kind !== 'memory') throw new Error('Unexpected model')
      expect(actualQuestions).toContainEqual(frame.memory.question)
      if (frame.phase === 'thinking') {
        questionStart = frame.atMs
        expect(frame.memory.answerPlayerId).toBeNull()
        expect(frame.memory.correctPlayerId).toBeNull()
        expect(frame.activePlayerId).toBeNull()
      }
      if (frame.phase === 'buzz') {
        expect(frame.atMs - questionStart).toBeGreaterThanOrEqual(2800)
        expect(frame.memory.answerPlayerId).toBeNull()
      }
      if (frame.phase === 'answer') {
        expect(frame.memory.question.optionPlayerIds).toContain(frame.memory.answerPlayerId)
        expect(frame.memory.correctPlayerId).toBeNull()
      }
      if (frame.phase === 'correct' || frame.phase === 'wrong') {
        results += 1
        const correct = frame.phase === 'correct'
        expect(frame.memory.answerPlayerId === frame.memory.question.correctPlayerId).toBe(correct)
        const damagedId = correct
          ? simulation.competitorIds.find((id) => id !== frame.activePlayerId)!
          : frame.activePlayerId!
        expect(frame.memory.damagedPlayerId).toBe(damagedId)
        lives.set(damagedId, lives.get(damagedId)! - 1)
      }
      for (const player of frame.players) expect(player.lives).toBe(lives.get(player.id))
    }
    expect(results).toBe(9)
    expect(lives).toEqual(
      new Map([
        ['aria', 1],
        ['dex', 0],
      ])
    )
  })

  it('returns no simulation if the winner, cast or season facts are unavailable', () => {
    const game = gameFor()
    const input = { game, part: 1 as const, competitorIds: ['aria', 'dex', 'ash'] }
    expect(buildCompetitionBroadcastSimulation(input)).toBeNull()
    expect(
      buildCompetitionBroadcastSimulation({ ...input, expectedWinnerId: 'missing' })
    ).toBeNull()
    expect(
      buildCompetitionBroadcastSimulation({
        ...input,
        expectedWinnerId: 'aria',
        competitorIds: ['aria', 'aria', 'ash'],
      })
    ).toBeNull()
    expect(
      buildCompetitionBroadcastSimulation({
        ...input,
        expectedWinnerId: 'aria',
        competitorIds: ['aria', 'missing', 'ash'],
      })
    ).toBeNull()
    expect(
      buildCompetitionBroadcastSimulation({
        ...input,
        expectedWinnerId: 'aria',
        competitorIds: ['aria', 'dex', 'you'],
      })
    ).toBeNull()
    expect(
      buildCompetitionBroadcastSimulation({
        ...input,
        part: 3,
        expectedWinnerId: 'aria',
        competitorIds: ['aria', 'dex'],
        game: { ...game, players: game.players.slice(0, 3) },
      })
    ).toBeNull()
  })

  it('cycles only existing real memories if a small legacy bank has fewer than nine questions', () => {
    const game = gameFor()
    game.players = game.players.map((player, index) => ({
      ...player,
      stats: { ...player.stats, lohWins: index === 0 ? 1 : 0, posWins: 0, timesNominated: 0 },
    }))
    const bank = buildMemoryLaneQuestionBank(game, game.seed)
    expect(bank.length).toBeGreaterThan(0)
    const replay = buildCompetitionBroadcastSimulation({
      game,
      part: 3,
      competitorIds: ['aria', 'dex'],
      expectedWinnerId: 'dex',
    }) as CompetitionBroadcastSimulation
    for (const frame of replay.frames) {
      if (frame.kind === 'memory') expect(bank).toContainEqual(frame.memory.question)
    }
    expect(replay.frames.at(-1)?.leaderIds).toEqual(['dex'])
  })
})
