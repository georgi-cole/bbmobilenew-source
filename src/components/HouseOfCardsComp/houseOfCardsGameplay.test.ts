import { describe, expect, it } from 'vitest'
import {
  buildPortraitPairBoard,
  buildHouseOfCardsBoard,
  chooseHouseOfCardsAiPair,
  chooseHouseOfCardsBrightPairSymbol,
  resolveHouseOfCardsRoundScore,
  type HouseOfCardsBoardCard,
} from './houseOfCardsUtils'
import {
  chooseHouseOfCardsAiTool,
  simulateHouseOfCardsAiRound,
} from '../../features/houseOfCards/houseOfCardsAi'

const roster = [
  { id: 'host', name: 'Host', avatar: '/host.webp' },
  { id: 'rival-a', name: 'Rival A', avatar: '/a.webp' },
  { id: 'rival-b', name: 'Rival B', avatar: '/b.webp' },
]

describe('Deck of Light gameplay edge cases', () => {
  it('builds exactly two cards for each portrait identity, even when variants are needed', () => {
    const board = buildPortraitPairBoard(9, 7, roster, ['rival-b', 'host'])
    const identities = new Map<string, HouseOfCardsBoardCard[]>()
    for (const card of board)
      identities.set(card.symbol, [...(identities.get(card.symbol) ?? []), card])

    expect(board).toHaveLength(14)
    expect([...identities.values()].every((cards) => cards.length === 2)).toBe(true)
    expect(new Set(board.map((card) => card.symbol)).size).toBe(7)
    expect(board.some((card) => card.portraitPlayerId === 'rival-b')).toBe(true)
    expect(board.some((card) => card.portraitBadge?.startsWith('Variant'))).toBe(true)
  })

  it('keeps the Bright Pair objective tied to a real pair and seeded across replays', () => {
    const board = buildHouseOfCardsBoard(424242, 8)
    const symbol = chooseHouseOfCardsBrightPairSymbol(424242, 3, board)
    expect(symbol).toBe(chooseHouseOfCardsBrightPairSymbol(424242, 3, board))
    expect(board.filter((card) => card.symbol === symbol)).toHaveLength(2)
  })

  it('caps scores for unfinished AI simulations and applies a single Shield penalty reduction', () => {
    const finished = resolveHouseOfCardsRoundScore({
      pairCount: 4,
      matchedPairs: 4,
      mistakes: 2,
      timeMs: 20_000,
      bestStreak: 2,
    })
    const unfinished = resolveHouseOfCardsRoundScore({
      pairCount: 4,
      matchedPairs: 2,
      mistakes: 2,
      timeMs: 20_000,
      bestStreak: 2,
    })
    const shielded = resolveHouseOfCardsRoundScore({
      pairCount: 4,
      mistakes: 2,
      scoringMistakes: 1,
      timeMs: 20_000,
      bestStreak: 2,
    })
    expect(finished - unfinished).toBe(2_000)
    expect(shielded - finished).toBe(90)
    expect(
      resolveHouseOfCardsRoundScore({
        pairCount: 4,
        matchedPairs: 99,
        mistakes: 0,
        timeMs: 0,
        bestStreak: 0,
      })
    ).toBe(4_000)
  })

  it('makes strategic AI tool choices reproducibly, with seeded variation across contestants and rounds', () => {
    const choose = (tournamentSeed: number) =>
      chooseHouseOfCardsAiTool({
        playerId: 'ai-1',
        round: 2,
        tournamentSeed,
        sessionAbility: 68,
        isBehind: true,
        recentMistakes: 2,
        pairCount: 6,
      })
    expect(choose(17)).toBe(choose(17))
    const choices = new Set(Array.from({ length: 96 }, (_, seed) => choose(seed)))
    expect(choices.size).toBeGreaterThan(1)
  })

  it('simulates fallible AI memory with deterministic outcomes and score-consistent bonuses', () => {
    const params = {
      playerId: 'ai-2',
      round: 3,
      pairCount: 8,
      tournamentSeed: 711,
      sessionAbility: 61,
      tool: 'bonus-bet' as const,
      isBehind: true,
    }
    const first = simulateHouseOfCardsAiRound(params)
    const replay = simulateHouseOfCardsAiRound(params)
    expect(first).toEqual(replay)
    expect(first.completedPairs).toBeGreaterThanOrEqual(0)
    expect(first.completedPairs).toBeLessThanOrEqual(params.pairCount)
    expect(first.scoringMistakes).toBeLessThanOrEqual(first.mistakes)
    expect([0, 120]).toContain(first.brightPairBonus)
    expect([0, -120, 150]).toContain(first.toolDelta)
    expect(first.score).toBe(
      resolveHouseOfCardsRoundScore({
        pairCount: params.pairCount,
        matchedPairs: first.completedPairs,
        mistakes: first.mistakes,
        scoringMistakes: first.scoringMistakes,
        timeMs: first.timeMs,
        bestStreak: first.bestStreak,
        toolBonus: first.toolDelta,
        brightPairBonus: first.brightPairBonus,
      })
    )
  })

  it('does not let final-round AI recall become perfectly reliable', () => {
    const board: HouseOfCardsBoardCard[] = [
      { index: 0, symbol: 'a', isFlipped: false, isMatched: false, isMismatch: false },
      { index: 1, symbol: 'a', isFlipped: false, isMatched: false, isMismatch: false },
      { index: 2, symbol: 'b', isFlipped: false, isMatched: false, isMismatch: false },
      { index: 3, symbol: 'b', isFlipped: false, isMatched: false, isMismatch: false },
    ]
    const remembered = new Set(board.map((card) => card.index))
    const outcomes = Array.from({ length: 64 }, (_, seed) => {
      const pair = chooseHouseOfCardsAiPair({
        board,
        rememberedIndexes: remembered,
        seed,
        skill: 65,
      })
      expect(pair).not.toBeNull()
      expect(pair?.[0]).not.toBe(pair?.[1])
      return board[pair![0]]!.symbol === board[pair![1]]!.symbol
    })
    expect(outcomes.some(Boolean)).toBe(true)
    expect(outcomes.some((isMatch) => !isMatch)).toBe(true)
  })
})
