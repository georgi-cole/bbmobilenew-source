import { describe, expect, it } from 'vitest'
import gameReducer, {
  activateStoreExtraVote,
  applyStoreVoteRemoval,
  createInitialGameState,
  submitHumanDoubleVote,
} from './gameSlice'
import {
  canTriggerStoreExtraVote,
  canTriggerStoreVoteRemoval,
  getEyeoleanPowerArmAvailability,
  isEyeoleanPowerEndgameLocked,
} from '../economy/eyeoleanPowerRules'
import type { GameState, Player } from '../types'

function prepareVoteState(): {
  state: GameState
  human: Player
  loh: Player
  nominees: [Player, Player]
} {
  const state = createInitialGameState({ seed: 7711 })
  state.mode = 'classic'
  state.phase = 'live_vote'
  if (state.voxPopuli) state.voxPopuli.status = 'inactive'
  if (state.cupidArrow) state.cupidArrow.status = 'inactive'
  state.doubleEviction = { usedCount: 0, weekActive: false, pendingSecondEviction: null }

  const human = state.players.find((player) => player.isUser)!
  const others = state.players.filter((player) => player.id !== human.id)
  const loh = others[0]!
  const nominees = [others[1]!, others[2]!] as [Player, Player]

  state.players.forEach((player) => {
    if (player.id === loh.id) player.status = 'loh'
    else if (nominees.some((nominee) => nominee.id === player.id)) player.status = 'nominated'
    else player.status = 'active'
  })
  state.lohId = loh.id
  state.nomineeIds = nominees.map((player) => player.id)
  state.awaitingHumanVote = true
  state.votes = {}

  return { state, human, loh, nominees }
}

describe('Eyeolean Store voting powers', () => {
  it('records a purchased Extra Vote as a distinct legal second ballot', () => {
    const { state, human, nominees } = prepareVoteState()

    let next = gameReducer(state, activateStoreExtraVote())
    expect(next.humanDoubleVoteActive).toBe(true)
    expect(next.storeExtraVoteChoiceActive).toBe(true)

    next = gameReducer(next, submitHumanDoubleVote([nominees[0].id, nominees[1].id]))

    expect(next.votes?.[human.id]).toBe(nominees[0].id)
    expect(next.votes?.[`${human.id}__storeExtraVote`]).toBe(nominees[1].id)
    expect(next.votes?.[`${human.id}__dv2`]).toBeUndefined()
    expect(next.storeExtraVoteChoiceActive).toBe(false)
    expect(next.humanDoubleVoteActive).toBe(false)
  })

  it('does not trigger Store Extra Vote while another bonus-ballot source has priority', () => {
    const { state, human } = prepareVoteState()
    state.batteryLowVoteEffects = {
      [human.id]: { type: 'doubleVote', cyclesRemaining: 1 },
    }

    expect(canTriggerStoreExtraVote(state)).toBe(false)

    delete state.batteryLowVoteEffects
    state.awaitingDoubleVoteOffer = true
    expect(canTriggerStoreExtraVote(state)).toBe(false)
  })

  it('applies Remove a Vote to the effective tally without mutating raw ballots', () => {
    const { state, human, loh, nominees } = prepareVoteState()
    human.status = 'nominated'
    nominees[0].status = 'active'
    state.nomineeIds = [human.id, nominees[1].id]
    state.phase = 'eviction_results'
    state.awaitingHumanVote = false

    const voters = state.players.filter(
      (player) =>
        player.id !== human.id && player.id !== loh.id && !state.nomineeIds.includes(player.id)
    )
    state.votes = {
      [voters[0]!.id]: human.id,
      [voters[1]!.id]: human.id,
      [voters[2]!.id]: nominees[1].id,
    }
    state.voteResults = {
      [human.id]: 2,
      [nominees[1].id]: 1,
    }
    state.pendingExitContext = {
      week: state.week,
      leaderIds: [loh.id],
      nomineeIds: [...state.nomineeIds],
      votesByVoterId: { ...state.votes },
      voteCounts: { ...state.voteResults },
    }
    state.pendingEviction = {
      evicteeId: human.id,
      evictionMessage: 'pending',
    }

    expect(canTriggerStoreVoteRemoval(state)).toBe(true)

    const next = gameReducer(state, applyStoreVoteRemoval())

    expect(next.voteResults?.[human.id]).toBe(1)
    expect(next.votes).toEqual(state.votes)
    expect(next.pendingExitContext?.voteCounts[human.id]).toBe(1)
  })

  it('keeps Remove a Vote waiting when there is nothing to remove', () => {
    const { state, human, nominees } = prepareVoteState()
    human.status = 'nominated'
    nominees[0].status = 'active'
    state.nomineeIds = [human.id, nominees[1].id]
    state.phase = 'eviction_results'
    state.awaitingHumanVote = false
    state.voteResults = {
      [human.id]: 0,
      [nominees[1].id]: 3,
    }

    expect(canTriggerStoreVoteRemoval(state)).toBe(false)
  })

  it('locks purchased voting powers from Final 4 onward', () => {
    const { state } = prepareVoteState()
    const alive = state.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    )
    alive.slice(4).forEach((player) => {
      player.status = 'jury'
    })

    expect(isEyeoleanPowerEndgameLocked(state)).toBe(true)
    expect(getEyeoleanPowerArmAvailability(state, 'extra_vote')).toEqual({
      available: false,
      reason: 'Voting powers are disabled from Final 4 onward.',
    })
    expect(getEyeoleanPowerArmAvailability(state, 'remove_vote')).toEqual({
      available: false,
      reason: 'Voting powers are disabled from Final 4 onward.',
    })
  })
})
