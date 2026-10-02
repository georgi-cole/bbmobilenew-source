import type { GameState, WeekendSeasonFact } from '../../types'

interface FactCandidate extends WeekendSeasonFact {
  score: number
  dedupeKey: string
}

function activePlayers(state: GameState) {
  return state.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
}

function hubSaysWins(state: GameState, playerId: string): number {
  return (state.history ?? []).filter(
    (entry) =>
      entry.type === 'hub_says_result' &&
      typeof entry.data?.winnerId === 'string' &&
      entry.data.winnerId === playerId
  ).length
}

function buildCandidates(state: GameState, playerId: string): FactCandidate[] {
  const player = state.players.find((entry) => entry.id === playerId)
  if (!player) return []

  const active = activePlayers(state)
  const stats = player.stats ?? { lohWins: 0, posWins: 0, timesNominated: 0 }
  const lohWins = stats.lohWins ?? 0
  const posWins = stats.posWins ?? 0
  const timesNominated = stats.timesNominated ?? 0
  const powerWins = lohWins + posWins
  const maxLoh = Math.max(...active.map((entry) => entry.stats?.lohWins ?? 0), 0)
  const maxPos = Math.max(...active.map((entry) => entry.stats?.posWins ?? 0), 0)
  const maxPower = Math.max(
    ...active.map((entry) => (entry.stats?.lohWins ?? 0) + (entry.stats?.posWins ?? 0)),
    0
  )
  const maxNominations = Math.max(...active.map((entry) => entry.stats?.timesNominated ?? 0), 0)
  const hubWins = hubSaysWins(state, player.id)
  const candidates: FactCandidate[] = []

  if ((stats.battleBackWins ?? 0) > 0) {
    candidates.push({
      playerId: player.id,
      kind: 'battle_back',
      text:
        (stats.battleBackWins ?? 0) > 1
          ? `${player.name} has already fought back into the Hub ${stats.battleBackWins} times this season.`
          : `${player.name} has already left this Hub once — and fought their way back in.`,
      score: 100,
      dedupeKey: 'battle_back',
    })
  }

  if (stats.survivedDoubleEviction) {
    candidates.push({
      playerId: player.id,
      kind: 'double_eviction',
      text: `${player.name} survived the season's Double Elimination and is still here.`,
      score: 92,
      dedupeKey: 'double_eviction',
    })
  }

  if (hubWins > 0) {
    candidates.push({
      playerId: player.id,
      kind: 'hub_says',
      text:
        hubWins === 1
          ? `${player.name} was the Hub's answer to one of THE HUB SAYS… questions back on Weekend 1.`
          : `${player.name} was the Hub's answer to ${hubWins} different THE HUB SAYS… questions on Weekend 1.`,
      score: 76 + Math.min(8, hubWins * 2),
      dedupeKey: 'hub_says',
    })
  }

  if (timesNominated >= 2) {
    candidates.push({
      playerId: player.id,
      kind: 'nomination_survivor',
      text:
        timesNominated === maxNominations && maxNominations > 2
          ? `${player.name} has survived nomination ${timesNominated} times — more than anyone else left in the Hub.`
          : `${player.name} has survived nomination ${timesNominated} times and is still standing.`,
      score: 70 + Math.min(16, timesNominated * 3),
      dedupeKey: timesNominated === maxNominations ? 'nomination_record' : 'nomination_survivor',
    })
  }

  if (powerWins > 0 && powerWins === maxPower && maxPower >= 2) {
    candidates.push({
      playerId: player.id,
      kind: 'power_record',
      text: `${player.name} has won ${powerWins} power competitions — the most among the Hub players still here.`,
      score: 88,
      dedupeKey: 'power_record',
    })
  }

  if (lohWins > 0) {
    candidates.push({
      playerId: player.id,
      kind: 'loh_record',
      text:
        lohWins === maxLoh && maxLoh > 1
          ? `${player.name} has held the Leader title ${lohWins} times — the most among the Hub players left.`
          : `${player.name} has already held the Leader title ${lohWins} time${lohWins === 1 ? '' : 's'} this season.`,
      score: 64 + Math.min(12, lohWins * 3),
      dedupeKey: lohWins === maxLoh ? 'loh_record' : 'loh_win',
    })
  }

  if (posWins > 0) {
    candidates.push({
      playerId: player.id,
      kind: 'pos_record',
      text:
        posWins === maxPos && maxPos > 1
          ? `${player.name} has won Safety ${posWins} times — the most among the players still in the Hub.`
          : `${player.name} has already won Safety ${posWins} time${posWins === 1 ? '' : 's'} this season.`,
      score: 62 + Math.min(12, posWins * 3),
      dedupeKey: posWins === maxPos ? 'pos_record' : 'pos_win',
    })
  }

  if (timesNominated === 0) {
    candidates.push({
      playerId: player.id,
      kind: 'never_nominated',
      text: `${player.name} has reached Day ${state.week} without ever being nominated.`,
      score: 74,
      dedupeKey: 'never_nominated',
    })
  }

  if (player.lateEntrant) {
    candidates.push({
      playerId: player.id,
      kind: 'late_entrant',
      text: `${player.name} entered this season late and still made it all the way to Day ${state.week}.`,
      score: 82,
      dedupeKey: 'late_entrant',
    })
  }

  candidates.push({
    playerId: player.id,
    kind: 'still_here',
    text: `${player.name} is still in the Hub after ${state.week} numbered days of this season.`,
    score: 10,
    dedupeKey: `still_here:${player.id}`,
  })

  return candidates.sort(
    (left, right) => right.score - left.score || left.dedupeKey.localeCompare(right.dedupeKey)
  )
}

// Prefer distinctive, season-earned facts before falling back to simple survival context.
export function buildSeasonSoFarFacts(state: GameState): WeekendSeasonFact[] {
  const players = activePlayers(state)
  const usedKeys = new Set<string>()
  const facts: WeekendSeasonFact[] = []

  for (const player of players) {
    const candidates = buildCandidates(state, player.id)
    const selected =
      candidates.find((candidate) => !usedKeys.has(candidate.dedupeKey)) ?? candidates[0]
    if (!selected) continue
    usedKeys.add(selected.dedupeKey)
    facts.push({
      playerId: selected.playerId,
      kind: selected.kind,
      text: selected.text,
    })
  }

  return facts
}
