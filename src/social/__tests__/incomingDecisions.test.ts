import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { advance, createInitialGameState } from '../../store/gameSlice'
import type { GameState } from '../../types'
import { createIncomingInteraction } from '../incomingInteractionFactory'
import { selectRequiredIncomingDecision } from '../incomingDecisions'
import { CAMPAIGN_VOTE_PROMISE } from '../reality/campaignVotePromises'
import type { RealityPromise } from '../reality/types'
import { socialMiddleware } from '../socialMiddleware'
import socialReducer, {
  markIncomingInteractionRead,
  pushIncomingInteraction,
  resolveIncomingInteraction,
} from '../socialSlice'

function makeGame(): GameState {
  return { ...createInitialGameState(), phase: 'social_1', week: 4 }
}

function makeStore(game: GameState, promise?: RealityPromise) {
  const social = socialReducer(undefined, { type: '@@init' })
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState: {
      game,
      social: promise
        ? { ...social, reality: { ...social.reality, promises: { [promise.id]: promise } } }
        : social,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
}

function makeDeal(game: GameState, id = 'deal') {
  return createIncomingInteraction({
    id,
    fromId: game.players.find((player) => !player.isUser)!.id,
    type: 'deal_offer',
    text: 'Can I count on you for the vote?',
    week: game.week,
    phase: game.phase,
    mode: 'normal',
  })
}

describe('important Incoming decisions', () => {
  it('holds real phase progression until every important conversation is resolved', () => {
    const game = makeGame()
    const store = makeStore(game)
    const first = makeDeal(game)
    const second = makeDeal(game, 'second-deal')
    for (const interaction of [first, second]) {
      store.dispatch(pushIncomingInteraction(interaction))
    }
    store.dispatch(markIncomingInteractionRead(first.id))
    store.dispatch(advance())
    expect(store.getState().game.phase).toBe('social_1')

    const resolve = (interactionId: string) =>
      store.dispatch(
        resolveIncomingInteraction({
          interactionId,
          resolvedWith: 'decline',
          resolvedAt: 10,
          resolvedWeek: game.week,
        })
      )
    resolve(first.id)
    store.dispatch(advance())
    expect(store.getState().game.phase).toBe('social_1')
    expect(selectRequiredIncomingDecision(store.getState())?.id).toBe(second.id)

    resolve(second.id)
    store.dispatch(advance())
    expect(store.getState().game.phase).toBe('nominations')
  })

  it('keeps optional, expired, withdrawn, and deferred conversations out of the gate', () => {
    const game = makeGame()
    const interaction = makeDeal(game)
    const withdrawn = {
      ...game,
      players: game.players.map((player) =>
        player.id === interaction.fromId ? { ...player, status: 'evicted' as const } : player
      ),
    }
    const state = { game, social: { incomingInteractions: [interaction] } }
    expect(selectRequiredIncomingDecision(state)).toBe(interaction)

    for (const pending of [
      { ...interaction, payload: { ...interaction.payload, responsePolicy: 'optional' } },
      { ...interaction, payload: { ...interaction.payload, responsePolicy: 'readOnly' } },
      {
        ...interaction,
        deadline: { day: 3, phase: 'eviction_results', policy: 'AUTO_IGNORE' as const },
      },
      { ...interaction, payload: { ...interaction.payload, pactTimeRequested: true } },
    ]) {
      expect(
        selectRequiredIncomingDecision({ game, social: { incomingInteractions: [pending] } })
      ).toBeNull()
    }
    expect(selectRequiredIncomingDecision({ ...state, game: withdrawn })).toBeNull()
    expect(
      selectRequiredIncomingDecision({ ...state, game: { ...game, mode: 'survival' } })
    ).toBeNull()
  })
})

it('can change an actual eviction ballot with an accepted private campaign promise', () => {
  const base = makeGame()
  const [human, loh, voter, nominee, other] = base.players
  const game: GameState = {
    ...base,
    phase: 'social_2',
    seed: 539,
    lohId: loh.id,
    nomineeIds: [nominee.id, other.id],
    players: base.players.map((player) => {
      if (player.id === loh.id) return { ...player, status: 'loh' }
      if (player.id === nominee.id || player.id === other.id) {
        return { ...nominee, id: player.id, name: player.name, status: 'nominated' }
      }
      return player
    }),
  }
  const control = makeStore(game)
  control.dispatch(advance())
  const original = control.getState().game.votes?.[voter.id]
  const promisedTarget = game.nomineeIds.find((id) => id !== original)!
  expect(game.nomineeIds).toContain(original)

  const negotiated = makeStore(game, {
    id: 'a-private-deal',
    kind: CAMPAIGN_VOTE_PROMISE,
    status: 'ACTIVE',
    promisorId: voter.id,
    beneficiaryIds: [human.id],
    witnessIds: [],
    createdAt: { day: game.week, phase: 'social_2' },
    deadline: { day: game.week, phase: 'live_vote' },
    visibility: 'PAIR_ONLY',
    stakes: 0.65,
    scope: { targetId: promisedTarget },
  })
  negotiated.dispatch(advance())
  expect(negotiated.getState().game.votes?.[voter.id]).toBe(promisedTarget)
})
