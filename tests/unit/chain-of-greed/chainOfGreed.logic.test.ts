import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../../src/store/rng'
import {
  buildFinalRawResults,
  CHAIN_LADDER,
  CHAIN_SHOE_TOTAL_CARDS,
  createInitialChainState,
  createChainOfGreedRng,
  drawNextNumber,
  decideAiAction,
  getNextNumberOdds,
  getRemainingNumberCount,
  getStandardRoundEliminationCount,
  getStandardRoundTurnCap,
  rankSoloRushPlayers,
  resolveChainAction,
  resolvePawnedRoundBank,
  resolveVoteElimination,
  type ChainOfGreedPlayerState,
} from '../../../src/components/ChainOfGreed/chainOfGreedLogic'

function buildPlayer(id: string): ChainOfGreedPlayerState {
  return {
    id,
    name: id,
    isHuman: id === 'human',
    avatar: '◉',
    precomputedScore: 50,
    isEliminated: false,
    safetyAvailable: true,
    totalContribution: 0,
    roundContribution: 0,
    totalBanked: 0,
    roundBanked: 0,
    totalRecovered: 0,
    roundRecovered: 0,
    roundLost: 0,
    roundCorrectGuesses: 0,
    roundWrongGuesses: 0,
    roundBanks: 0,
    roundBusts: 0,
    totalCorrectGuesses: 0,
    totalWrongGuesses: 0,
    totalBanks: 0,
    totalBusts: 0,
    voteCount: 0,
    semifinalScore: 0,
    finalScore: 0,
    finalWrongGuesses: 0,
    finalCorrectGuesses: 0,
    finalBanks: 0,
    turnsTakenThisRound: 0,
    personality: { aggression: 0.5, caution: 0.5, volatility: 0.5, social: 0.5 },
    lastRoundPerformance: 0,
    latestMoment: null,
  }
}

describe('chainOfGreedLogic', () => {
  it('doubles a pawned Round Bank on a hit and clears it on a miss', () => {
    expect(resolvePawnedRoundBank(250, 250, true)).toBe(500)
    expect(resolvePawnedRoundBank(250, 250, false)).toBe(0)
    expect(resolvePawnedRoundBank(250, 250, false, 25)).toBe(25)
  })

  it('ranks Solo Rush players by bank, then correct calls, then mistakes', () => {
    const players = [
      { ...buildPlayer('top'), finalWrongGuesses: 8, finalCorrectGuesses: 1 },
      { ...buildPlayer('middle'), finalWrongGuesses: 0, finalCorrectGuesses: 1 },
      { ...buildPlayer('fewer-misses'), finalWrongGuesses: 7, finalCorrectGuesses: 0 },
      { ...buildPlayer('fewest-correct'), finalWrongGuesses: 0, finalCorrectGuesses: 0 },
      { ...buildPlayer('more-correct'), finalWrongGuesses: 9, finalCorrectGuesses: 4 },
    ]

    const ranking = rankSoloRushPlayers(
      {
        top: 300,
        middle: 50,
        'fewer-misses': 50,
        'fewest-correct': 50,
        'more-correct': 50,
      },
      players
    )

    expect(ranking.ordered.map((player) => player.id)).toEqual([
      'top',
      'more-correct',
      'middle',
      'fewest-correct',
      'fewer-misses',
    ])
    expect(ranking.eliminatedIds).toEqual(['fewer-misses'])
  })

  it('eliminates the inactive player when an equal-bank rival has more correct calls', () => {
    const players = [
      buildPlayer('leader'),
      { ...buildPlayer('human'), finalWrongGuesses: 0, finalCorrectGuesses: 0 },
      { ...buildPlayer('active-rival'), finalWrongGuesses: 6, finalCorrectGuesses: 5 },
    ]

    const ranking = rankSoloRushPlayers({ leader: 300, human: 0, 'active-rival': 0 }, players)

    expect(ranking.ordered.map((player) => player.id)).toEqual(['leader', 'active-rival', 'human'])
    expect(ranking.eliminatedIds).toEqual(['human'])
  })

  it('cuts Solo Rush to the top two after Round 3', () => {
    const players = [
      buildPlayer('leader'),
      buildPlayer('finalist'),
      buildPlayer('third'),
      buildPlayer('last'),
    ]

    const ranking = rankSoloRushPlayers(
      { leader: 900, finalist: 700, third: 300, last: 100 },
      players,
      3
    )

    expect(ranking.ordered.slice(0, 2).map((player) => player.id)).toEqual(['leader', 'finalist'])
    expect(ranking.eliminatedIds).toEqual(['third', 'last'])
  })

  it('keeps immune players safe and eliminates the lowest unprotected bank', () => {
    const players = [buildPlayer('leader'), buildPlayer('immune'), buildPlayer('unprotected')]
    const ranking = rankSoloRushPlayers({ leader: 300, immune: 0, unprotected: 0 }, players, 1, [
      'immune',
    ])
    expect(ranking.eliminatedIds).toEqual(['unprotected'])
  })

  it('eliminates nobody when every player earns immunity', () => {
    const players = [buildPlayer('one'), buildPlayer('two'), buildPlayer('three')]
    const ranking = rankSoloRushPlayers({ one: 300, two: 100, three: 0 }, players, 2, [
      'one',
      'two',
      'three',
    ])
    expect(ranking.eliminatedIds).toEqual([])
  })

  it('keeps immune players in Round 3 and fills remaining finalist places by rank', () => {
    const players = [
      buildPlayer('leader'),
      buildPlayer('immune'),
      buildPlayer('third'),
      buildPlayer('last'),
    ]
    const ranking = rankSoloRushPlayers(
      { leader: 900, immune: 100, third: 300, last: 50 },
      players,
      3,
      ['immune']
    )
    expect(ranking.eliminatedIds).toEqual(['third', 'last'])
  })

  it('makes every immune finalist a co-winner in the final round', () => {
    const players = [buildPlayer('immune-one'), buildPlayer('immune-two'), buildPlayer('other')]
    const ranking = rankSoloRushPlayers(
      { 'immune-one': 100, 'immune-two': 0, other: 500 },
      players,
      4,
      ['immune-one', 'immune-two']
    )
    expect(ranking.eliminatedIds).toEqual(['other'])
  })

  it('eliminates everyone fully tied at the lowest Solo Rush rank', () => {
    const players = [
      buildPlayer('leader'),
      { ...buildPlayer('tied-one'), finalWrongGuesses: 2, finalCorrectGuesses: 1 },
      { ...buildPlayer('tied-two'), finalWrongGuesses: 2, finalCorrectGuesses: 1 },
      { ...buildPlayer('higher-bank'), finalWrongGuesses: 8, finalCorrectGuesses: 0 },
    ]

    const ranking = rankSoloRushPlayers(
      { leader: 300, 'tied-one': 50, 'tied-two': 50, 'higher-bank': 100 },
      players
    )

    expect(ranking.eliminatedIds).toEqual(['tied-one', 'tied-two'])
  })

  it('uses the requested elimination schedule', () => {
    expect(getStandardRoundEliminationCount(14, 1, 14)).toBe(2)
    expect(getStandardRoundEliminationCount(14, 4, 8)).toBe(1)
    expect(getStandardRoundEliminationCount(10, 2, 8)).toBe(2)
    expect(getStandardRoundEliminationCount(8, 1, 8)).toBe(1)
  })

  it('gives every contestant the same number of scheduled calls', () => {
    expect(getStandardRoundTurnCap(13)).toBe(13)
    expect(getStandardRoundTurnCap(12)).toBe(12)
    expect(getStandardRoundTurnCap(11)).toBe(22)
    expect(getStandardRoundTurnCap(9)).toBe(18)
    expect(getStandardRoundTurnCap(5)).toBe(10)
  })

  it('keeps seed zero deterministic', () => {
    const first = createChainOfGreedRng(0)
    const second = createChainOfGreedRng(0)
    expect(first.seed).toBe(0)
    expect(first.rng()).toBe(second.rng())
  })

  it('bank secures the active pot and keeps the current reference number', () => {
    const chain = {
      step: 3,
      pot: CHAIN_LADDER[2],
      referenceNumber: 61,
      recentNumbers: [18, 44, 61],
    }

    const resolution = resolveChainAction('bank', chain, () => 0.5)
    expect(resolution.securedDelta).toBe(150)
    expect(resolution.updatedChain.referenceNumber).toBe(61)
    expect(resolution.updatedChain.step).toBe(0)
    expect(resolution.updatedChain.pot).toBe(0)
  })

  it('treats equal reveals as a miss for higher/lower guesses', () => {
    const chain = {
      step: 2,
      pot: CHAIN_LADDER[1],
      referenceNumber: 44,
      recentNumbers: [20, 44],
    }

    const resolution = resolveChainAction('higher', chain, () => 0.4343434343)
    expect(resolution.revealedNumber).toBe(44)
    expect(resolution.wasCorrect).toBe(false)
    expect(resolution.equalMiss).toBe(true)
    expect(resolution.lostAmount).toBe(100)
    expect(resolution.updatedChain.referenceNumber).toBe(44)
  })

  it('spends Safety on a miss, recovering half the active pot', () => {
    const chain = {
      step: 2,
      pot: CHAIN_LADDER[1],
      referenceNumber: 44,
      recentNumbers: [20, 44],
    }
    const resolution = resolveChainAction('higher', chain, () => 0.1, true)
    expect(resolution).toMatchObject({
      wasCorrect: false,
      safetyUsed: true,
      recoveredDelta: 50,
      securedDelta: 0,
      individualDelta: 50,
      lostAmount: 50,
      busted: true,
    })
  })

  it('keeps Safety armed through a bank so it applies to the required guess', () => {
    const chain = { step: 2, pot: 100, referenceNumber: 44, recentNumbers: [20, 44] }
    const resolution = resolveChainAction('bank', chain, () => 0.1, true)
    expect(resolution).toMatchObject({
      securedDelta: 100,
      recoveredDelta: 0,
      safetyUsed: false,
      updatedChain: { step: 0, pot: 0, referenceNumber: 44 },
    })
  })

  it('reports exact next-number odds across ordinary and extreme references', () => {
    for (const chain of [
      { step: 1, pot: 50, referenceNumber: 5, recentNumbers: [5, 12, 18] },
      { step: 1, pot: 50, referenceNumber: 47, recentNumbers: [12, 25, 46] },
      { step: 1, pot: 50, referenceNumber: 96, recentNumbers: [72, 89, 96] },
    ]) {
      const odds = getNextNumberOdds(chain)
      expect(odds.lower + odds.equal + odds.higher).toBeCloseTo(1, 10)
      expect(odds.equal).toBeGreaterThan(0)
      expect(odds.lower).toBeGreaterThan(0)
      expect(odds.higher).toBeGreaterThan(0)
    }
  })

  it('matches the displayed odds against seeded draws from the live number generator', () => {
    const chain = { step: 2, pot: 100, referenceNumber: 7, recentNumbers: [31, 52, 7] }
    const expected = getNextNumberOdds(chain)
    const rng = mulberry32(90421)
    const sampleCount = 50_000
    const actual = { lower: 0, equal: 0, higher: 0 }

    for (let index = 0; index < sampleCount; index += 1) {
      const value = drawNextNumber(chain, rng)
      if (value < chain.referenceNumber) actual.lower += 1
      else if (value > chain.referenceNumber) actual.higher += 1
      else actual.equal += 1
    }

    expect(actual.lower / sampleCount).toBeCloseTo(expected.lower, 2)
    expect(actual.equal / sampleCount).toBeCloseTo(expected.equal, 3)
    expect(actual.higher / sampleCount).toBeCloseTo(expected.higher, 2)
  })

  it('builds winner-take-all raw results', () => {
    const players = [buildPlayer('human'), buildPlayer('ai-1'), buildPlayer('ai-2')]
    expect(buildFinalRawResults(players, 'ai-1', 3450)).toEqual({
      human: 0,
      'ai-1': 3450,
      'ai-2': 0,
    })
  })

  it('deals the opening number from the shared shoe', () => {
    const chain = createInitialChainState(() => 0)
    expect(chain.referenceNumber).toBeGreaterThanOrEqual(1)
    expect(chain.referenceNumber).toBeLessThanOrEqual(100)
    expect(chain.drawnNumbers).toEqual([chain.referenceNumber])
    expect(getRemainingNumberCount(chain)).toBe(CHAIN_SHOE_TOTAL_CARDS - 1)
  })

  it('makes public card history shift the higher/lower odds', () => {
    const chain = {
      step: 1,
      pot: 50,
      referenceNumber: 50,
      recentNumbers: [50],
      drawnNumbers: [50, ...Array.from({ length: 50 }, (_, index) => index + 51)],
    }
    const odds = getNextNumberOdds(chain)

    expect(odds.lower).toBeGreaterThan(odds.higher)
    expect(odds.lower + odds.equal + odds.higher).toBeCloseTo(1, 10)
    expect(getRemainingNumberCount(chain)).toBe(CHAIN_SHOE_TOTAL_CARDS - 51)
  })

  it('does not create a fake vote tie when one player clearly has the highest tally', () => {
    const players = [
      buildPlayer('human'),
      buildPlayer('ai-1'),
      buildPlayer('ai-2'),
      buildPlayer('ai-3'),
    ]
    const elimination = resolveVoteElimination({
      activePlayers: players,
      votes: [
        {
          voterId: 'human',
          voterName: 'human',
          targetId: 'ai-1',
          targetName: 'ai-1',
          reason: 'clear miss',
        },
        {
          voterId: 'ai-2',
          voterName: 'ai-2',
          targetId: 'ai-1',
          targetName: 'ai-1',
          reason: 'clear miss',
        },
        {
          voterId: 'ai-3',
          voterName: 'ai-3',
          targetId: 'ai-1',
          targetName: 'ai-1',
          reason: 'clear miss',
        },
      ],
      eliminateCount: 1,
      rng: () => 0.5,
    })

    expect(elimination.eliminatedIds).toEqual(['ai-1'])
    expect(elimination.tieBreaks).toEqual([])
  })

  it('prevents AI from banking twice in the same turn', () => {
    const player = {
      ...buildPlayer('ai-1'),
      precomputedScore: 88,
      roundContribution: 40,
      personality: { aggression: 0.35, caution: 0.92, volatility: 0.1, social: 0.5 },
    }

    const choice = decideAiAction({
      player,
      chain: {
        step: 4,
        pot: CHAIN_LADDER[3],
        referenceNumber: 58,
        recentNumbers: [24, 39, 58],
      },
      remainingTurns: 2,
      phase: 'standard',
      activePlayers: [player, buildPlayer('ai-2')],
      bankAvailable: false,
    })

    expect(choice).not.toBe('bank')
  })
})
