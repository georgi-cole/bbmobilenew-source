import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  createInitialGameState,
  registerBatteryLowVoteEffects,
  submitHumanDoubleVote,
  submitHumanVote,
} from '../../src/store/gameSlice'
import { createBellaWillState } from '../../src/features/twists/bellasWill'
import type { GameState, Player } from '../../src/types'

function prepareClassicVoteState(): {
  state: GameState
  human: Player
  loh: Player
  nominees: [Player, Player]
} {
  const state = createInitialGameState({ seed: 9317 })
  state.mode = 'classic'
  state.phase = 'social_2'
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
  state.awaitingHumanVote = false
  state.votes = {}

  return { state, human, loh, nominees }
}

function inheritReward(
  state: GameState,
  heirId: string,
  reward: 'extra_vote' | 'remove_vote'
): void {
  const will = createBellaWillState({
    active: true,
    seed: state.seed,
    season: state.season,
    reward,
  })
  will.heirId = heirId
  will.inherited = true
  if (reward === 'extra_vote') will.extraVotePending = true
  else will.voteRemovalPending = true
  state.bellaWill = will
}

describe("Bella's Will vote effects", () => {
  it('lets a human heir choose a distinct inherited second ballot', () => {
    const { state, human, nominees } = prepareClassicVoteState()
    inheritReward(state, human.id, 'extra_vote')

    let next = gameReducer(state, advance())
    expect(next.awaitingHumanVote).toBe(true)
    expect(next.humanDoubleVoteActive).toBe(true)
    expect(next.bellaWill?.extraVoteChoiceActive).toBe(true)

    next = gameReducer(next, submitHumanDoubleVote([nominees[0].id, nominees[1].id]))

    expect(next.votes?.[human.id]).toBe(nominees[0].id)
    expect(next.votes?.[`${human.id}__bellaWill`]).toBe(nominees[1].id)
    expect(next.votes?.[`${human.id}__dv2`]).toBeUndefined()
    expect(next.bellaWill?.extraVotePending).toBe(false)
    expect(next.bellaWill?.extraVoteChoiceActive).toBe(false)
  })

  it('does not create a third ballot when Battery Low already grants a double vote', () => {
    const { state, human, nominees } = prepareClassicVoteState()
    inheritReward(state, human.id, 'extra_vote')

    let next = gameReducer(
      state,
      registerBatteryLowVoteEffects({ [human.id]: 'doubleVote' })
    )
    next = gameReducer(next, advance())

    expect(next.bellaWill?.extraVoteChoiceActive).toBe(false)
    expect(next.bellaWill?.extraVotePending).toBe(true)

    next = gameReducer(next, submitHumanVote(nominees[0].id))

    expect(next.votes?.[human.id]).toBe(nominees[0].id)
    expect(next.votes?.[`${human.id}__dv2`]).toBe(nominees[0].id)
    expect(next.votes?.[`${human.id}__bellaWill`]).toBeUndefined()
    expect(next.bellaWill?.extraVotePending).toBe(true)
  })

  it('preserves raw ballots while applying Bella vote removal as a tally adjustment', () => {
    const { state, human, loh, nominees } = prepareClassicVoteState()
    const heir = human
    heir.status = 'nominated'
    nominees[0].status = 'active'
    state.nomineeIds = [heir.id, nominees[1].id]
    state.phase = 'live_vote'
    state.awaitingHumanVote = false
    state.lohId = loh.id

    const voter = state.players.find(
      (player) =>
        player.id !== heir.id &&
        player.id !== loh.id &&
        !state.nomineeIds.includes(player.id)
    )!
    state.votes = { [voter.id]: heir.id }
    inheritReward(state, heir.id, 'remove_vote')

    const next = gameReducer(state, advance())

    expect(next.votes?.[voter.id]).toBe(heir.id)
    expect(next.voteResults?.[heir.id]).toBe(0)
    expect(next.bellaWill?.voteRemovalPending).toBe(false)
    expect(next.bellaWill?.lastVoteRemovalAdjustment).toEqual({
      week: state.week,
      targetId: heir.id,
      amount: 1,
    })
  })

  it('waits behind an eligible stored vote-deduction power instead of stacking reductions', () => {
    const { state, human, loh, nominees } = prepareClassicVoteState()
    const heir = human
    heir.status = 'nominated'
    nominees[0].status = 'active'
    state.nomineeIds = [heir.id, nominees[1].id]
    state.phase = 'live_vote'
    state.awaitingHumanVote = false
    state.lohId = loh.id

    const voters = state.players.filter(
      (player) =>
        player.id !== heir.id &&
        player.id !== loh.id &&
        !state.nomineeIds.includes(player.id)
    )
    state.votes = {
      [voters[0]!.id]: heir.id,
      [voters[1]!.id]: heir.id,
    }
    state.secretMission = {
      triggeredDay: 2,
      status: 'rewardClaimed',
      offeredDay: 2,
      offerCount: 1,
      declinedDay: null,
      tasks: [],
      templateId: 'silent_witness',
      reward: {
        type: 'voteDeduction',
        consumed: false,
        expired: false,
        eligible: true,
      },
    }
    inheritReward(state, heir.id, 'remove_vote')

    const next = gameReducer(state, advance())

    expect(next.voteResults?.[heir.id]).toBe(2)
    expect(next.bellaWill?.voteRemovalPending).toBe(true)
    expect(next.bellaWill?.lastVoteRemovalAdjustment).toBeNull()
    expect(next.awaitingVoteDeductionPrompt).toBe(true)
  })

  it('does not consume vote removal when nobody legally votes against the heir', () => {
    const { state, human, loh, nominees } = prepareClassicVoteState()
    const heir = human
    heir.status = 'nominated'
    nominees[0].status = 'active'
    state.nomineeIds = [heir.id, nominees[1].id]
    state.phase = 'live_vote'
    state.awaitingHumanVote = false
    state.lohId = loh.id

    const voter = state.players.find(
      (player) =>
        player.id !== heir.id &&
        player.id !== loh.id &&
        !state.nomineeIds.includes(player.id)
    )!
    state.votes = { [voter.id]: nominees[1].id }
    inheritReward(state, heir.id, 'remove_vote')

    const next = gameReducer(state, advance())

    expect(next.bellaWill?.voteRemovalPending).toBe(true)
    expect(next.bellaWill?.lastVoteRemovalAdjustment).toBeNull()
  })
})
