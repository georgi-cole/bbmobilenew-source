import type { Page } from '@playwright/test'
import type { GameState } from '../../../src/types'

export async function seedTwinScene(
  page: Page,
  storeModuleUrl: string,
  branch: 'combined' | 'ali_enters',
  cycle: number
) {
  const moduleBase = new URL('./', page.url()).href
  return page.evaluate(
    async ({ moduleBase, storeModuleUrl, branch, cycle }) => {
      const { store } = await import(storeModuleUrl)
      const game = await import(`${moduleBase}src/store/gameSlice.ts`)
      const profiles = await import(`${moduleBase}src/store/profilesSlice.ts`)
      store.dispatch(profiles.enterGuestMode())
      let state = game.createInitialGameState({ seed: 730 }) as GameState
      state = {
        ...state,
        gameId: `premium-twin-${branch}-${cycle}`,
        status: 'active',
        phase: 'eviction_results',
        week: 4,
        pendingEviction: null,
        voteResults: null,
        hasSeenConfessionalSpotlight: true,
        tvFeed: [],
        broadcastQueue: [],
        players: state.players.map((player) => ({
          ...player,
          status: player.id === 'lia' || player.isUser ? 'active' : player.status,
        })),
      }
      if (branch === 'combined') {
        state = game.default(state, game.advance())
        state = game.default(state, game.submitTwinShockAnswer('Maybe she has a twin sister?'))
      } else {
        const evictee = state.players.find((player) => !player.isUser && player.id !== 'lia')
        if (!evictee) throw new Error('Twin fixture needs an evicted roster slot')
        state = {
          ...state,
          week: 2,
          players: state.players.map((player) =>
            player.id === evictee.id
              ? {
                  ...player,
                  status: 'evicted',
                  evictedAtWeek: 1,
                  seasonPlacement: state.players.length,
                }
              : player
          ),
          twinShockConsumed: true,
          twinShockActivatedSeason: state.season,
          twinShock: {
            status: 'day4_asked_no_correct_guess',
            promptStage: null,
            queuedDay: 1,
            retryCount: 0,
            cluesShownDays: [],
            pendingRevealAnimation: null,
          },
        }
        state = game.default(state, game.advance())
        state = game.default(state, game.submitTwinShockAnswer('No idea'))
        state = game.default(state, game.submitTwinShockAnswer('I give up'))
      }
      if (state.twinShock?.pendingRevealAnimation?.type !== branch)
        throw new Error(
          `Twin fixture resolved the wrong branch: ${state.twinShock?.pendingRevealAnimation?.type}`
        )
      store.dispatch(game.hydrateGame(state))
      window.location.hash = '/game'
      return { rosterSize: state.players.length, resolution: state.twinShockResolution }
    },
    { moduleBase, storeModuleUrl, branch, cycle }
  )
}
