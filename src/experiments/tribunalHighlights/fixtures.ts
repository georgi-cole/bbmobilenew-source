import { createInitialGameState } from '../../store/gameSlice'
import type { GameState } from '../../types'
import { withInitialSeasonAppearance } from '../../appearance/initialSeasonAppearance'

export type TribunalScenario =
  | 'your_elimination'
  | 'invitation'
  | 'arrival'
  | 'double'
  | 'final_four'
  | 'finalists'
  | 'battle_back'

/** Deliberately constructed review scenarios. Progression uses the real season engine. */
export function createTribunalScenario(
  scenario: TribunalScenario = 'arrival',
  seed = 7101
): GameState {
  const game = withInitialSeasonAppearance(createInitialGameState({ seed }), {
    kind: 'catalog',
    lookId: 'pc-001',
    revision: 1,
  })
  game.week = 8
  game.phase = 'week_end'
  game.tribunalInvitationAcknowledged = true
  game.tribunalInvitationTransition = null
  game.tribunalViewingMode = 'highlights'
  game.weekendsEnabledForSeason = true
  game.completedWeekendDays = [5]
  game.seasonDirectorHumanReturnUsed = scenario !== 'battle_back'
  game.tvFeed = []
  game.broadcastQueue = []
  const activeCount = scenario === 'finalists' ? 2 : scenario === 'final_four' ? 4 : 6
  let activeIndex = 0
  const out = []
  for (const player of game.players) {
    if (player.isUser) {
      player.status = 'jury'
      player.evictedAtWeek = 7
      player.seasonPlacement = activeCount + 1
      out.push(player)
    } else if (activeIndex++ < activeCount) {
      player.status = 'active'
      player.stats = {
        ...player.stats,
        lohWins: activeIndex % 3,
        posWins: (activeIndex + 1) % 3,
        timesNominated: activeIndex % 4,
      }
    } else {
      player.status = out.length < game.players.length - activeCount - 5 ? 'jury' : 'evicted'
      player.evictedAtWeek = Math.max(1, 7 - out.length)
      player.seasonPlacement = activeCount + out.length + 1
      out.push(player)
    }
  }
  game.history = [...out].reverse().map((player, index) => ({
    type: 'seasonExit',
    week: player.evictedAtWeek ?? 1,
    data: { playerId: player.id },
    timestamp: 1600 + index,
  }))
  const active = game.players.filter((player) => player.status === 'active')
  if (scenario === 'invitation' || scenario === 'your_elimination') {
    game.tribunalInvitationAcknowledged = false
    const human = game.players.find((player) => player.isUser)!
    human.tribunalEligible = true
    if (scenario === 'your_elimination') {
      human.status = 'nominated'
      delete human.evictedAtWeek
      delete human.seasonPlacement
      game.history = game.history.filter((event) => event.data?.playerId !== human.id)
      game.phase = 'eviction_results'
      game.lohId = active[0].id
      game.posWinnerId = active[1].id
      const rival = active[2]
      rival.status = 'nominated'
      game.nomineeIds = [human.id, rival.id]
      const voters = active.filter((player) => player.id !== game.lohId && player.id !== rival.id)
      game.votes = Object.fromEntries(
        voters.map((player, index) => [
          player.id,
          index === voters.length - 1 ? rival.id : human.id,
        ])
      )
      game.voteResults = { [human.id]: voters.length - 1, [rival.id]: 1 }
      game.pendingExitContext = {
        week: game.week,
        leaderIds: [game.lohId],
        nomineeIds: [...game.nomineeIds],
        votesByVoterId: { ...game.votes },
        voteCounts: { ...game.voteResults },
      }
      game.pendingEviction = {
        evicteeId: human.id,
        evictionMessage: 'You are eliminated. Your place in the Tribunal is waiting.',
      }
    }
  }
  if (scenario === 'finalists') game.phase = 'jury_announcement'
  if (scenario === 'final_four') {
    game.phase = 'final4_eviction'
    game.posWinnerId = active[0].id
    active[0].status = 'pos'
    game.nomineeIds = active.slice(1, 3).map((player) => player.id)
    active.slice(1, 3).forEach((player) => {
      player.status = 'nominated'
    })
  }
  if (scenario === 'double') {
    game.phase = 'eviction_results'
    game.lohId = active[0].id
    game.posWinnerId = active[1].id
    game.nomineeIds = active.slice(2, 5).map((player) => player.id)
    game.voteResults = { [active[2].id]: 3, [active[3].id]: 2, [active[4].id]: 0 }
    game.pendingExitContext = {
      week: 8,
      leaderIds: [active[0].id],
      nomineeIds: [...game.nomineeIds],
      votesByVoterId: {},
      voteCounts: { ...game.voteResults },
    }
    game.pendingEviction = {
      evicteeId: active[2].id,
      evictionMessage: `${active[2].name} is eliminated.`,
    }
    game.doubleEviction = {
      ...game.doubleEviction!,
      weekActive: true,
      pendingSecondEviction: {
        evicteeId: active[3].id,
        evictionMessage: `${active[3].name} is also eliminated.`,
      },
    }
  }
  if (scenario === 'battle_back') game.phase = 'eviction_results'
  return game
}
