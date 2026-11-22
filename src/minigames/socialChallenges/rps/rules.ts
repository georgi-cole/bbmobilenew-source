import { challengeRng, shuffle } from '../shared'

export const HANDS = ['rock', 'paper', 'scissors'] as const
export const STARTING_BANKROLL = 100
export const STARTING_LIVES = 3
export const MIN_WAGER = 5
export const EXTRA_LIFE_COST = 50

export type Hand = (typeof HANDS)[number]
export type Pair = readonly [string, string]
export type Phase = 'wager' | 'duel-reveal' | 'showdown' | 'showdown-reveal' | 'finished'

export interface HandPlay {
  playerId: string
  hand: Hand
}

export interface WagerPlay extends HandPlay {
  wager: number
  buyLife?: boolean
}

type Preference = (from: string, to: string) => number

export interface Clash {
  pair: Pair
  hands: readonly [Hand, Hand]
  winner: string | null
  loser: string | null
  wagers: Record<string, number>
  bankrollChanges: Record<string, number>
  lifePurchases: Record<string, boolean>
  loot: number
  knockout: boolean
}

export interface Tournament {
  seed: number | undefined
  ids: string[]
  phase: Phase
  waves: Pair[][]
  wave: number
  pairs: Pair[]
  bankrolls: Record<string, number>
  lives: Record<string, number>
  wins: Record<string, number>
  losses: Record<string, number>
  eliminated: string[][]
  results: Clash[]
  showdownRound: number
  showdownContenders: string[]
  showdownAdvances: string[]
  champion: string | null
}

const BEATS: Record<Hand, Hand> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
}

export function roundRobinWaves(ids: readonly string[], seed?: number): Pair[][] {
  if (ids.length < 2) return []
  const ring: Array<string | null> = shuffle(ids, challengeRng(seed, 'rps', 'cast'))
  if (ring.length % 2 !== 0) ring.push(null)

  return Array.from({ length: ring.length - 1 }, () => {
    const matches: Pair[] = []
    for (let i = 0; i < ring.length / 2; i += 1) {
      const a = ring[i]
      const b = ring[ring.length - 1 - i]
      if (a !== null && b !== null) matches.push([a, b])
    }
    const rotatingSeat = ring.pop() ?? null
    ring.splice(1, 0, rotatingSeat)
    return matches
  })
}

export function createTournament(ids: readonly string[], seed?: number): Tournament {
  const cast = [...new Set(ids)]
  const waves = roundRobinWaves(cast, seed)
  return {
    seed,
    ids: cast,
    phase: waves.length > 0 ? 'wager' : 'finished',
    waves,
    wave: 0,
    pairs: waves[0] ?? [],
    bankrolls: Object.fromEntries(cast.map((id) => [id, STARTING_BANKROLL])),
    lives: Object.fromEntries(cast.map((id) => [id, STARTING_LIVES])),
    wins: Object.fromEntries(cast.map((id) => [id, 0])),
    losses: Object.fromEntries(cast.map((id) => [id, 0])),
    eliminated: [],
    results: [],
    showdownRound: 0,
    showdownContenders: [],
    showdownAdvances: [],
    champion: cast.length === 1 ? cast[0] : null,
  }
}

export function canBuyLife(game: Tournament, id: string): boolean {
  return (
    game.phase === 'wager' &&
    game.lives[id] === 1 &&
    game.bankrolls[id] >= EXTRA_LIFE_COST &&
    game.pairs.some((pair) => pair.includes(id))
  )
}

export function wagerLimits(
  game: Tournament,
  id: string,
  buyLife = false
): { min: number; max: number } {
  const cost = buyLife && canBuyLife(game, id) ? EXTRA_LIFE_COST : 0
  const max = (game.bankrolls[id] ?? 0) - cost
  return { min: Math.min(MIN_WAGER, max), max }
}

export function defaultWager(game: Tournament, id: string, buyLife = false): number {
  return wagerLimits(game, id, buyLife).min
}

function boundedWager(wager: number, { min, max }: { min: number; max: number }): number {
  return Number.isFinite(wager) ? Math.min(max, Math.max(min, Math.round(wager))) : min
}

function botWager(game: Tournament, id: string, rival: string, preference: Preference): WagerPlay {
  const roll = challengeRng(game.seed, 'rps', 'wager', game.wave, id)
  const affinity = preference(id, rival)
  const trust = Number.isFinite(affinity) ? Math.max(-1, Math.min(1, affinity)) : 0
  const buyLife = canBuyLife(game, id) && roll() < 0.85 + trust * 0.1
  const limits = wagerLimits(game, id, buyLife)
  // Bots tend to risk more against a rival, with enough variation to surprise either side.
  const share = 0.15 + roll() * 0.32 - trust * 0.1
  return {
    playerId: id,
    buyLife,
    wager: boundedWager(limits.max * share, limits),
    hand: randomHand(game, 'wager-hand', game.wave, id),
  }
}

function randomHand(game: Tournament, phase: string, round: number, id: string): Hand {
  return HANDS[Math.floor(challengeRng(game.seed, 'rps', phase, round, id)() * HANDS.length)]
}

function clashFor(pair: Pair, hands: readonly [Hand, Hand]): Clash {
  const firstWins = BEATS[hands[0]] === hands[1]
  const drawn = hands[0] === hands[1]
  return {
    pair,
    hands,
    winner: drawn ? null : pair[firstWins ? 0 : 1],
    loser: drawn ? null : pair[firstWins ? 1 : 0],
    wagers: { [pair[0]]: 0, [pair[1]]: 0 },
    bankrollChanges: { [pair[0]]: 0, [pair[1]]: 0 },
    lifePurchases: { [pair[0]]: false, [pair[1]]: false },
    loot: 0,
    knockout: false,
  }
}

/** Settle disjoint duels in one wave, each based on the same pre-duel tournament state. */
export function playWagerWave(
  game: Tournament,
  plays: readonly WagerPlay[] = [],
  preference: Preference = () => 0
): Tournament {
  if (game.phase !== 'wager') return game
  const choices = new Map(plays.map((play) => [play.playerId, play]))
  const bankrolls = { ...game.bankrolls }
  const lives = { ...game.lives }
  const wins = { ...game.wins }
  const losses = { ...game.losses }
  const eliminated: string[] = []
  const results = game.pairs.map((pair) => {
    const [a, b] = pair
    const choiceA = choices.get(a) ?? botWager(game, a, b, preference)
    const choiceB = choices.get(b) ?? botWager(game, b, a, preference)
    const clash = clashFor(pair, [choiceA.hand, choiceB.hand])

    for (const choice of [choiceA, choiceB]) {
      const id = choice.playerId
      const buyLife = choice.buyLife === true && canBuyLife(game, id)
      clash.lifePurchases[id] = buyLife
      clash.wagers[id] = boundedWager(choice.wager, wagerLimits(game, id, buyLife))
      if (buyLife) {
        bankrolls[id] -= EXTRA_LIFE_COST
        lives[id] += 1
      }
    }

    const { winner, loser } = clash
    if (winner !== null && loser !== null) {
      bankrolls[winner] += clash.wagers[winner]
      bankrolls[loser] -= clash.wagers[loser]
      wins[winner] += 1
      losses[loser] += 1
      lives[loser] -= 1
      if (lives[loser] === 0) {
        clash.loot = bankrolls[loser]
        clash.knockout = true
        bankrolls[winner] += clash.loot
        bankrolls[loser] = 0
        eliminated.push(loser)
      }
    }

    for (const id of pair) clash.bankrollChanges[id] = bankrolls[id] - game.bankrolls[id]
    return clash
  })
  return {
    ...game,
    phase: 'duel-reveal',
    bankrolls,
    lives,
    wins,
    losses,
    results,
    eliminated: eliminated.length === 0 ? game.eliminated : [...game.eliminated, eliminated],
  }
}

function compareAlive(game: Tournament, a: string, b: string): number {
  return (
    game.bankrolls[b] - game.bankrolls[a] ||
    game.lives[b] - game.lives[a] ||
    game.wins[b] - game.wins[a] ||
    game.losses[a] - game.losses[b]
  )
}

export function rankAlive(game: Tournament): string[] {
  return game.ids.filter((id) => game.lives[id] > 0).sort((a, b) => compareAlive(game, a, b))
}

function finish(game: Tournament, champion: string | null): Tournament {
  return { ...game, champion, phase: 'finished', pairs: [], results: [] }
}

function startShowdownRound(game: Tournament, contenders: string[]): Tournament {
  if (contenders.length < 2) return finish(game, contenders[0] ?? null)
  const seeded = shuffle(
    contenders,
    challengeRng(game.seed, 'rps', 'showdown-seating', game.showdownRound)
  )
  const pairs: Pair[] = []
  for (let i = 0; i + 1 < seeded.length; i += 2) {
    pairs.push([seeded[i], seeded[i + 1]])
  }

  return {
    ...game,
    phase: 'showdown',
    pairs,
    results: [],
    showdownContenders: seeded,
    showdownAdvances: seeded.length % 2 === 0 ? [] : seeded.slice(-1),
  }
}

export function playShowdown(game: Tournament, plays: readonly HandPlay[] = []): Tournament {
  if (game.phase !== 'showdown') return game
  const choices = new Map(plays.map(({ playerId, hand }) => [playerId, hand]))
  return {
    ...game,
    phase: 'showdown-reveal',
    results: game.pairs.map((pair) => {
      const handFor = (id: string) =>
        choices.get(id) ?? randomHand(game, 'showdown-hand', game.showdownRound, id)
      return clashFor(pair, [handFor(pair[0]), handFor(pair[1])])
    }),
  }
}

export function advanceTournament(game: Tournament): Tournament {
  if (game.phase === 'duel-reveal') {
    const alive = rankAlive(game)
    if (alive.length < 2) return finish(game, alive[0] ?? null)

    for (let wave = game.wave + 1; wave < game.waves.length; wave += 1) {
      const pairs = game.waves[wave].filter((pair) => pair.every((id) => game.lives[id] > 0))
      if (pairs.length > 0) {
        return { ...game, phase: 'wager', wave, pairs, results: [] }
      }
    }

    const leaders = alive.filter((id) => compareAlive(game, id, alive[0]) === 0)
    return startShowdownRound(game, leaders)
  }
  if (game.phase === 'showdown-reveal') {
    const showdownAdvances = [...game.showdownAdvances]
    const pairs: Pair[] = []
    for (const result of game.results) {
      if (result.winner === null) pairs.push(result.pair)
      else showdownAdvances.push(result.winner)
    }
    const next = {
      ...game,
      phase: 'showdown' as const,
      showdownRound: game.showdownRound + 1,
      showdownAdvances,
      showdownContenders: [...showdownAdvances, ...pairs.flat()],
      pairs,
      results: [],
    }
    if (pairs.length > 0) return next
    return startShowdownRound(next, showdownAdvances)
  }
  return game
}

export function finalStandings(game: Tournament): string[][] {
  if (game.phase !== 'finished') return []
  const aliveGroups: string[][] = []
  for (const id of rankAlive(game)) {
    if (id === game.champion) continue
    const last = aliveGroups.at(-1)
    if (last && compareAlive(game, last[0], id) === 0) last.push(id)
    else aliveGroups.push([id])
  }
  return [
    ...(game.champion === null ? [] : [[game.champion]]),
    ...aliveGroups,
    ...[...game.eliminated].reverse(),
  ]
}

export function simulateRpsTournament(
  ids: readonly string[],
  seed?: number,
  preference: Preference = () => 0
): string[][] {
  let game = createTournament(ids, seed)
  while (game.phase !== 'finished') {
    if (game.phase === 'wager') game = playWagerWave(game, [], preference)
    else if (game.phase === 'showdown') game = playShowdown(game)
    else game = advanceTournament(game)
  }
  return finalStandings(game)
}
