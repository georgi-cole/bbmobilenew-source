import type { GameState } from '../../../types'

export type FinalThreeCompetitionPart = 1 | 2 | 3

/** Snapshot identity used by presentation callbacks, never as a source of game results. */
export function finalThreePhaseIdentity(game: GameState): string {
  return JSON.stringify([
    game.gameId ?? null,
    game.season,
    game.week,
    game.phase,
    game.seed,
    game.voxPopuli?.status === 'active' ? 'vox_populi' : 'classic',
    game.finalThree?.part1?.winnerId ?? game.f3Part1WinnerId ?? null,
    game.finalThree?.part2?.winnerId ?? game.f3Part2WinnerId ?? null,
    game.players.map((player) => [player.id, player.status, Boolean(player.isUser)]),
  ])
}

/** The broadcast may only own a round in which no active competitor is human. */
export function getFinalThreeSpectatorRound(game: GameState, part: FinalThreeCompetitionPart) {
  const human = game.players.find((player) => player.isUser)
  if (!human || game.weekendInterlude?.active) return null
  const alive = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  const part1WinnerId = game.finalThree?.part1?.winnerId ?? game.f3Part1WinnerId
  const part2WinnerId = game.finalThree?.part2?.winnerId ?? game.f3Part2WinnerId
  let competitors = alive

  if (part === 1) {
    if (
      !(
        (game.phase === 'final3' && game.finalThree?.openingSeen === true) ||
        game.phase === 'final3_comp1'
      )
    )
      return null
  } else if (part === 2) {
    if (game.phase !== 'final3_comp2' || !part1WinnerId) return null
    competitors = alive.filter((player) => player.id !== part1WinnerId)
  } else {
    if (game.phase !== 'final3_comp3' || !part1WinnerId || !part2WinnerId) return null
    competitors = alive.filter(
      (player) => player.id === part1WinnerId || player.id === part2WinnerId
    )
    if (competitors.length !== 2) return null
    const hasBlockSetup = alive.some((player) => game.nomineeIds.includes(player.id))
    if (
      game.voxPopuli?.status !== 'active' &&
      game.finalThree?.blockRevealSeen !== true &&
      hasBlockSetup
    )
      return null
  }

  if (competitors.length === 0 || competitors.some((player) => player.isUser)) return null
  return {
    key: `${finalThreePhaseIdentity(game)}:part-${part}`,
    competitorIds: competitors.map((player) => player.id),
  }
}
