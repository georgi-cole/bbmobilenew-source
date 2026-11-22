import { describe, expect, it } from 'vitest'
import {
  advanceTournament,
  canBuyLife,
  createTournament,
  defaultWager,
  finalStandings,
  playShowdown,
  playWagerWave,
  rankAlive,
  roundRobinWaves,
  simulateRpsTournament,
  wagerLimits,
  type Tournament,
} from './rules'

const CAST = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

function endOfSchedule(game: Tournament): Tournament {
  return { ...game, wave: game.waves.length - 1, phase: 'duel-reveal' }
}

describe('Rock, Paper, Scissors round robin', () => {
  it.each([5, 6, 7, 8])('matches each of %i players with every other player once', (count) => {
    const waves = roundRobinWaves(CAST.slice(0, count), 1)
    const pairs = waves.flat()
    expect(waves).toHaveLength(count - (count % 2 === 0 ? 1 : 0))
    expect(pairs).toHaveLength((count * (count - 1)) / 2)
    expect(new Set(pairs.map((pair) => [...pair].sort().join(':'))).size).toBe(pairs.length)
    for (const wave of waves) expect(new Set(wave.flat()).size).toBe(wave.length * 2)
    for (const id of CAST.slice(0, count)) {
      expect(pairs.filter((pair) => pair.includes(id))).toHaveLength(count - 1)
    }
  })

  it('starts players even, paying a win at double the stake and taking one life from the loser', () => {
    const game = createTournament(['a', 'b'], 1)
    expect(game.bankrolls).toEqual({ a: 100, b: 100 })
    expect(game.lives).toEqual({ a: 3, b: 3 })

    const reveal = playWagerWave(game, [
      { playerId: 'a', hand: 'rock', wager: 20 },
      { playerId: 'b', hand: 'scissors', wager: 35 },
    ])
    expect(reveal.phase).toBe('duel-reveal')
    expect(reveal.bankrolls).toEqual({ a: 120, b: 65 })
    expect(reveal.lives).toEqual({ a: 3, b: 2 })
    expect(reveal.wins).toEqual({ a: 1, b: 0 })
    expect(reveal.losses).toEqual({ a: 0, b: 1 })
    expect(reveal.results[0]).toMatchObject({
      winner: 'a',
      loser: 'b',
      wagers: { a: 20, b: 35 },
      bankrollChanges: { a: 20, b: -35 },
      loot: 0,
      knockout: false,
    })
    expect(game.bankrolls).toEqual({ a: 100, b: 100 })
    expect(game.lives).toEqual({ a: 3, b: 3 })
  })

  it('refunds both wagers on a draw and permits a smaller or empty bet when broke', () => {
    const game = { ...createTournament(['a', 'b'], 2), bankrolls: { a: 0, b: 3 } }
    expect(wagerLimits(game, 'a')).toEqual({ min: 0, max: 0 })
    expect(wagerLimits(game, 'b')).toEqual({ min: 3, max: 3 })
    expect(defaultWager(game, 'b')).toBe(3)
    const draw = playWagerWave(game, [
      { playerId: 'a', hand: 'paper', wager: 10 },
      { playerId: 'b', hand: 'paper', wager: -30 },
    ])
    expect(draw.results[0]).toMatchObject({
      winner: null,
      loser: null,
      wagers: { a: 0, b: 3 },
      bankrollChanges: { a: 0, b: 0 },
    })
    expect(draw.bankrolls).toEqual(game.bankrolls)
    expect(draw.lives).toEqual(game.lives)
    expect(draw.wins).toEqual(game.wins)
    expect(draw.losses).toEqual(game.losses)
    expect(advanceTournament(draw).phase).toBe('finished')
  })

  it('buys a life for 50 only for a duelist at one life and clamps the stake to the new balance', () => {
    const game = {
      ...createTournament(['a', 'b'], 1),
      lives: { a: 1, b: 2 },
      bankrolls: { a: 50, b: 200 },
    }
    expect(canBuyLife(game, 'a')).toBe(true)
    expect(canBuyLife(game, 'b')).toBe(false)
    expect(wagerLimits(game, 'a', true)).toEqual({ min: 0, max: 0 })
    expect(canBuyLife({ ...game, bankrolls: { ...game.bankrolls, a: 49 } }, 'a')).toBe(false)
    const result = playWagerWave(game, [
      { playerId: 'a', hand: 'rock', wager: 20, buyLife: true },
      { playerId: 'b', hand: 'paper', wager: 5, buyLife: true },
    ])
    expect(result.lives).toEqual({ a: 1, b: 2 })
    expect(result.bankrolls).toEqual({ a: 0, b: 205 })
    expect(result.eliminated).toEqual([])
    expect(result.results[0]).toMatchObject({
      lifePurchases: { a: true, b: false },
      wagers: { a: 0, b: 5 },
    })
  })

  it('keeps the purchased life even when the wager is refunded', () => {
    const game = { ...createTournament(['a', 'b'], 1), lives: { a: 1, b: 1 } }
    const result = playWagerWave(game, [
      { playerId: 'a', hand: 'rock', wager: 20, buyLife: true },
      { playerId: 'b', hand: 'rock', wager: 50 },
    ])
    expect(result.lives).toEqual({ a: 2, b: 1 })
    expect(result.bankrolls).toEqual({ a: 50, b: 100 })
  })

  it('awards post-stake loot, skips eliminated players, and groups same-wave exits', () => {
    const game = createTournament(CAST.slice(0, 4), 1)
    const [first, second] = game.pairs
    const lastLife = { ...game.lives, [first[1]]: 1, [second[1]]: 1 }
    const reveal = playWagerWave(
      { ...game, lives: lastLife },
      game.pairs.flatMap(([winner, loser]) => [
        { playerId: winner, hand: 'rock', wager: 20 },
        { playerId: loser, hand: 'scissors', wager: 35 },
      ])
    )
    expect(reveal.results[0]).toMatchObject({ loot: 65, knockout: true })
    expect(reveal.bankrolls).toEqual({
      [first[0]]: 185,
      [second[0]]: 185,
      [first[1]]: 0,
      [second[1]]: 0,
    })
    expect(reveal.eliminated).toEqual([[first[1], second[1]]])
    const next = advanceTournament(reveal)
    expect(next.phase).toBe('wager')
    expect(next.pairs).toHaveLength(1)
    expect(next.pairs[0]).toEqual(expect.arrayContaining([first[0], second[0]]))
  })

  it('finishes when there is one survivor even if other waves were scheduled', () => {
    const game = createTournament(['a', 'b', 'c'], 1)
    const [winner, loser] = game.pairs[0]
    const prior = game.ids.find((id) => !game.pairs[0].includes(id))!
    const reveal = playWagerWave(
      { ...game, lives: { [winner]: 2, [loser]: 1, [prior]: 0 }, eliminated: [[prior]] },
      [
        { playerId: winner, hand: 'rock', wager: 10 },
        { playerId: loser, hand: 'scissors', wager: 10 },
      ]
    )
    const next = advanceTournament(reveal)
    expect(next.phase).toBe('finished')
    expect(finalStandings(next)).toEqual([[winner], [loser], [prior]])
  })

  it('ranks by bankroll, then lives, then wins, then fewer losses', () => {
    const game = {
      ...createTournament(CAST, 1),
      bankrolls: { a: 100, b: 95, c: 95, d: 95, e: 95, f: 95, g: 95, h: 0 },
      lives: { a: 1, b: 1, c: 2, d: 2, e: 2, f: 2, g: 2, h: 0 },
      wins: { a: 1, b: 4, c: 2, d: 3, e: 3, f: 3, g: 3, h: 0 },
      losses: { a: 3, b: 1, c: 1, d: 2, e: 3, f: 3, g: 3, h: 3 },
      eliminated: [['h']],
    }
    expect(rankAlive(game)).toEqual(['a', 'd', 'e', 'f', 'g', 'c', 'b'])
    expect(finalStandings(advanceTournament(endOfSchedule(game)))).toEqual([
      ['a'],
      ['d'],
      ['e', 'f', 'g'],
      ['c'],
      ['b'],
      ['h'],
    ])
  })

  it('replays a tied showdown hand without touching lives, money or wagering records', () => {
    const setup = createTournament(['a', 'b', 'c'], 1)
    const game = endOfSchedule({ ...setup, bankrolls: { a: 115, b: 115, c: 110 } })
    const showdown = advanceTournament(game)
    expect(showdown.phase).toBe('showdown')
    expect(showdown.pairs[0]).toEqual(expect.arrayContaining(['a', 'b']))
    const draw = playShowdown(showdown, [
      { playerId: 'a', hand: 'rock' },
      { playerId: 'b', hand: 'rock' },
    ])
    expect(draw.results[0].winner).toBeNull()
    const retry = advanceTournament(draw)
    expect(retry.pairs).toEqual(showdown.pairs)
    expect(retry.showdownRound).toBe(1)
    const decisive = playShowdown(retry, [
      { playerId: 'a', hand: 'rock' },
      { playerId: 'b', hand: 'paper' },
    ])
    expect(decisive.lives).toEqual(game.lives)
    expect(decisive.bankrolls).toEqual(game.bankrolls)
    expect(decisive.wins).toEqual(game.wins)
    expect(decisive.losses).toEqual(game.losses)
    expect(finalStandings(advanceTournament(decisive))).toEqual([['b'], ['a'], ['c']])
  })

  it('advances bracket winners and byes while only redrawing the still-tied pair', () => {
    const game = advanceTournament(endOfSchedule(createTournament(CAST.slice(0, 5), 1)))
    const [tied, decisive] = game.pairs
    const bye = game.showdownContenders.find((id) => !game.pairs.flat().includes(id))
    const retry = advanceTournament(
      playShowdown(game, [
        { playerId: tied[0], hand: 'rock' },
        { playerId: tied[1], hand: 'rock' },
        { playerId: decisive[0], hand: 'rock' },
        { playerId: decisive[1], hand: 'paper' },
      ])
    )
    expect(retry.pairs).toEqual([tied])
    expect(retry.showdownContenders).toEqual(expect.arrayContaining([bye, decisive[1], ...tied]))

    const nextRound = advanceTournament(
      playShowdown(retry, [
        { playerId: tied[0], hand: 'rock' },
        { playerId: tied[1], hand: 'paper' },
      ])
    )
    expect(nextRound.showdownContenders).toHaveLength(3)
    expect(nextRound.showdownContenders).toEqual(
      expect.arrayContaining([bye, decisive[1], tied[1]])
    )
  })

  it('lets relationships influence AI wager size independently of the hand', () => {
    const game = createTournament(['a', 'b'], 1)
    const trusting = playWagerWave(game, [], () => 1).results[0]
    const suspicious = playWagerWave(game, [], () => -1).results[0]
    expect(trusting.hands).toEqual(suspicious.hands)
    expect(suspicious.wagers.a).toBeGreaterThan(trusting.wagers.a)
    expect(suspicious.wagers.b).toBeGreaterThan(trusting.wagers.b)
  })

  it.each([5, 6, 7, 8])('simulates complete deterministic placements for %i players', (count) => {
    const cast = CAST.slice(0, count)
    const ranks = simulateRpsTournament(cast, 745215)
    expect(ranks[0]).toHaveLength(1)
    expect(ranks.flat().sort()).toEqual(cast)
    expect(simulateRpsTournament(cast, 745215)).toEqual(ranks)
  })
})
