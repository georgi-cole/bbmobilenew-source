import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  finalizePendingEviction,
  clearSurvivorReplacementTransition,
  hydrateGame,
  revealSurvivorReplacement,
} from '../src/store/gameSlice'
import { survivorMiddleware } from '../src/modes/survivorMiddleware'
import { createSurvivorRun, SURVIVOR_STARTING_CAST_SIZE } from '../src/modes/survivorRun'

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(survivorMiddleware),
  })
}

describe('Survivor replacement transition', () => {
  it('preserves both arrivals through a double elimination and reload between replacements', () => {
    let store = makeStore()
    const run = createSurvivorRun()
    const [first, second] = run.players.filter((player) => player.isRobo)
    store.dispatch(
      hydrateGame({
        ...run,
        phase: 'eviction_results',
        pendingEviction: { evicteeId: first.id, evictionMessage: 'First exit' },
        doubleEviction: {
          ...run.doubleEviction!,
          weekActive: true,
          pendingSecondEviction: { evicteeId: second.id, evictionMessage: 'Second exit' },
        },
      })
    )
    store.dispatch(finalizePendingEviction(first.id))
    store.dispatch(finalizePendingEviction(second.id))
    let game = store.getState().game
    expect(game.modeSpecific?.kind).toBe('survival')
    if (game.modeSpecific?.kind !== 'survival') throw new Error('Expected Survival')
    expect(game.modeSpecific.replacementPending?.outgoingPlayerSnapshot.id).toBe(first.id)
    expect(
      game.modeSpecific.replacementQueue?.map((entry) => entry.outgoingPlayerSnapshot.id)
    ).toEqual([second.id])

    store.dispatch(revealSurvivorReplacement())
    game = structuredClone(store.getState().game)
    store = makeStore()
    store.dispatch(hydrateGame(game))
    store.dispatch(clearSurvivorReplacementTransition())
    store.dispatch(revealSurvivorReplacement())
    game = store.getState().game
    if (game.modeSpecific?.kind !== 'survival') throw new Error('Expected Survival')
    expect(game.modeSpecific.totalRoboContestantsEvicted).toBe(2)
    expect(game.modeSpecific.replacementPending).toBeNull()
    expect(game.modeSpecific.replacementQueue).toEqual([])
    expect(game.players).toHaveLength(8)
    expect(new Set(game.players.map((player) => player.id)).size).toBe(8)
    expect([...game.players.map((player) => player.survivorSlot)].sort()).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
    expect(game.players.some((player) => player.id === first.id || player.id === second.id)).toBe(
      false
    )
  })

  it('repairs duplicate slots in old saves without removing living contestants', () => {
    const store = makeStore()
    const run = createSurvivorRun()
    run.players[1].survivorSlot = 7
    run.players[2].survivorSlot = 7
    run.players[1].status = 'loh'
    run.lohId = run.players[1].id
    const ids = run.players.map((player) => player.id)
    store.dispatch(hydrateGame(run))
    const game = store.getState().game
    expect(game.players.map((player) => player.id)).toEqual(ids)
    expect(game.players[1].status).toBe('loh')
    expect(game.lohId).toBe(run.lohId)
    expect([...game.players.map((player) => player.survivorSlot)].sort()).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
  })

  it('replaces the departing ID even when an old save has duplicate slots', () => {
    const run = createSurvivorRun()
    const innocent = run.players[1]
    const outgoing = run.players[2]
    innocent.survivorSlot = 7
    outgoing.survivorSlot = 7
    outgoing.status = 'evicted'
    if (run.modeSpecific?.kind !== 'survival') throw new Error('Expected Survival')
    const incoming = { ...outgoing, id: 'specific-replacement', status: 'active' as const }
    run.modeSpecific.replacementPending = {
      mode: 'survival',
      outgoingPlayerSnapshot: outgoing,
      incomingPlayer: incoming,
      slot: 7,
      queuedAt: 1,
    }
    const game = gameReducer(run, revealSurvivorReplacement())
    expect(game.players.some((player) => player.id === innocent.id)).toBe(true)
    expect(game.players.some((player) => player.id === outgoing.id)).toBe(false)
    expect(game.players.some((player) => player.id === incoming.id)).toBe(true)
  })

  it('holds the evicted tile until Play reveals the replacement', () => {
    const store = makeStore()
    const survivorRun = createSurvivorRun()
    const outgoing = survivorRun.players.find((player) => player.isRobo)
    expect(outgoing).toBeTruthy()

    store.dispatch(
      hydrateGame({
        ...survivorRun,
        pendingEviction: {
          evicteeId: outgoing!.id,
          evictionMessage: `${outgoing!.name} has been evicted.`,
        },
      })
    )

    store.dispatch(finalizePendingEviction(outgoing!.id))

    const pausedGame = store.getState().game
    const pending =
      pausedGame.modeSpecific?.kind === 'survival'
        ? pausedGame.modeSpecific.replacementPending
        : null
    expect(pending?.outgoingPlayerSnapshot.id).toBe(outgoing!.id)
    expect(pausedGame.players.some((player) => player.id === outgoing!.id)).toBe(true)
    expect(pausedGame.players.find((player) => player.id === outgoing!.id)?.status).toBe('evicted')

    store.dispatch(revealSurvivorReplacement())

    const game = store.getState().game
    const transition =
      game.modeSpecific?.kind === 'survival' ? game.modeSpecific.replacementTransition : null
    const activePlayers = game.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    )
    const replacement = transition
      ? game.players.find((player) => player.id === transition.incomingPlayerId)
      : null

    expect(activePlayers).toHaveLength(SURVIVOR_STARTING_CAST_SIZE)
    expect(game.players.some((player) => player.id === outgoing!.id)).toBe(false)
    expect(transition?.outgoingPlayerSnapshot.id).toBe(outgoing!.id)
    expect(transition?.outgoingPlayerSnapshot.status).toBe('evicted')
    expect(transition?.slot).toBe(outgoing!.survivorSlot)
    expect(transition?.durationMs).toBe(2000)
    expect(replacement?.isRobo).toBe(true)
    expect(replacement?.survivorSlot).toBe(outgoing!.survivorSlot)
    expect(game.tvFeed[0]?.text).toContain('replacement synthetic contestant')
    expect(game.tvFeed[0]?.meta?.phase).toBe('eviction_results')
    expect(game.tvFeed[0]?.meta?.forceOnTv).toBe(true)
  })
})
