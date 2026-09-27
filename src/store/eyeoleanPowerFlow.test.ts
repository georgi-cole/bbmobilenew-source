import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  activateStoreExtraVote,
  activateStoreVoxExtraVote,
  applyStoreVoxVoteRemoval,
  commitNominees,
  applyStoreVoteRemoval,
  createInitialGameState,
  hydrateGame,
  submitHumanDoubleVote,
} from './gameSlice'
import profilesReducer, {
  armEyeoleanStorePower,
  createProfile,
  debugGrantEyeoleans,
  purchaseEyeoleanStoreProduct,
} from './profilesSlice'
import { eyeoleanPowerMiddleware } from './eyeoleanPowerMiddleware'
import {
  canTriggerStoreExtraVote,
  canTriggerStoreVoteRemoval,
  canTriggerStoreVoxExtraVote,
  canTriggerStoreVoxVoteRemoval,
  getEyeoleanPowerArmAvailability,
  getEyeoleanPowerModeResolution,
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

function prepareVoxNominationState(): { state: GameState; human: Player; targets: string[] } {
  const state = createInitialGameState({ seed: 7712 })
  state.mode = 'classic'
  state.phase = 'nomination_results'
  state.awaitingNominations = true
  state.doubleEviction = { usedCount: 0, weekActive: false, pendingSecondEviction: null }
  if (!state.voxPopuli) throw new Error('Expected Vox Populi state')
  state.voxPopuli.status = 'active'

  const human = state.players.find((player) => player.isUser)!
  const others = state.players.filter((player) => player.id !== human.id)
  const immunityWinner = others[0]!
  const automaticNominee = others[1]!
  const targets = others.slice(2, 5).map((player) => player.id)
  state.lohId = immunityWinner.id
  state.lastHohCompFinisherId = automaticNominee.id
  state.voxPopuli.immunityWinnerId = immunityWinner.id
  state.voxPopuli.autoNomineeId = automaticNominee.id

  const fallbackTargets = targets.length >= 2 ? targets : others.slice(2).map((player) => player.id)
  state.voxPopuli.nominationBallots = Object.fromEntries(
    state.players
      .filter((player) => !player.isUser)
      .map((voter) => {
        const ballot = fallbackTargets.filter((targetId) => targetId !== voter.id).slice(0, 2)
        return [voter.id, ballot]
      })
  )

  return { state, human, targets }
}

describe('Eyeolean Store voting powers', () => {
  it('applies Vox Remove a Nomination alongside Extra Vote after the ballot resolves', () => {
    const { state, human } = prepareVoxNominationState()
    if (!state.voxPopuli) throw new Error('Expected Vox Populi state')
    state.storeVoxExtraNominationChoiceActive = true

    const others = state.players.filter((player) => player.id !== human.id)
    const immunityWinner = others[0]!
    const automaticNominee = others[1]!
    const firstTarget = others[2]!
    const secondTarget = others[3]!
    state.lohId = immunityWinner.id
    state.lastHohCompFinisherId = automaticNominee.id
    state.voxPopuli.immunityWinnerId = immunityWinner.id
    state.voxPopuli.autoNomineeId = automaticNominee.id

    const aiVoters = state.players.filter((player) => !player.isUser)
    const assignedTargets = new Map<string, string>()
    for (const [targetId, count] of [
      [firstTarget.id, 5],
      [secondTarget.id, 4],
      [human.id, 4],
    ] as const) {
      for (const voter of aiVoters) {
        if (assignedTargets.has(voter.id) || voter.id === targetId) continue
        const existingCount = [...assignedTargets.values()].filter((id) => id === targetId).length
        if (existingCount >= count) break
        assignedTargets.set(voter.id, targetId)
      }
    }
    const decoys = others
      .filter(
        (player) =>
          player.id !== immunityWinner.id &&
          player.id !== automaticNominee.id &&
          player.id !== firstTarget.id &&
          player.id !== secondTarget.id
      )
      .map((player) => player.id)
    const decoyCounts: Record<string, number> = {}
    state.voxPopuli.nominationBallots = Object.fromEntries(
      aiVoters.map((voter, index) => {
        const primary = assignedTargets.get(voter.id) ?? decoys[index % decoys.length]!
        const secondary = decoys.find(
          (id) => id !== primary && id !== voter.id && (decoyCounts[id] ?? 0) < 2
        )
        if (secondary) decoyCounts[secondary] = (decoyCounts[secondary] ?? 0) + 1
        return [voter.id, [primary, ...(secondary ? [secondary] : [])]]
      })
    )

    const store = configureStore({
      reducer: { game: gameReducer, profiles: profilesReducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(eyeoleanPowerMiddleware),
    })
    store.dispatch(createProfile({ name: 'QA Power Test', avatar: '🧪' }))
    store.dispatch(debugGrantEyeoleans({ grantId: 'qa-powers', amount: 30_000 }))
    store.dispatch(
      purchaseEyeoleanStoreProduct({ transactionId: 'qa-extra', productKey: 'extra_vote' })
    )
    store.dispatch(
      purchaseEyeoleanStoreProduct({ transactionId: 'qa-remove', productKey: 'remove_vote' })
    )
    store.dispatch(hydrateGame(state))
    for (const productKey of ['extra_vote', 'remove_vote'] as const) {
      store.dispatch(
        armEyeoleanStorePower({
          productKey,
          gameId: state.gameId,
          season: state.season,
          week: state.week,
        })
      )
    }

    expect(store.getState().profiles.profiles[0]?.eyeoleanPowerReservations).toHaveProperty(
      'remove_vote'
    )
    expect(
      Object.values(state.voxPopuli.nominationBallots).filter((ballot) => ballot.includes(human.id))
    ).toHaveLength(4)
    const ballotTargets = decoys.slice(0, 3)
    store.dispatch(commitNominees(ballotTargets))

    const result = store.getState()
    expect(result.game.voxPopuli?.nominationVoteCounts[human.id]).toBe(3)
    expect(result.game.nomineeIds).not.toContain(human.id)
    expect(result.profiles.profiles[0]?.eyeoleanPowerReservations).toEqual({})
  })

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

  it('adapts Extra Vote to a third distinct Vox nomination target', () => {
    const { state, human, targets } = prepareVoxNominationState()

    expect(getEyeoleanPowerModeResolution(state, 'extra_vote').rule).toMatchObject({
      available: true,
      votingMoment: 'nomination',
      title: 'Extra Vote',
    })
    expect(canTriggerStoreVoxExtraVote(state)).toBe(true)

    let next = gameReducer(state, activateStoreVoxExtraVote())
    expect(next.storeVoxExtraNominationChoiceActive).toBe(true)

    next = gameReducer(next, commitNominees(targets))

    expect(next.voxPopuli?.nominationBallots[human.id]).toEqual(targets)
    expect(next.storeVoxExtraNominationChoiceActive).toBe(false)
    targets.forEach((targetId) => {
      expect(next.voxPopuli?.nominationVoteCounts[targetId]).toBeGreaterThanOrEqual(1)
    })
  })

  it('adapts Remove a Vote to one secret Vox nomination against the human', () => {
    const { state, human, targets } = prepareVoxNominationState()
    if (!state.voxPopuli) throw new Error('Expected Vox Populi state')
    const voters = state.players.filter((player) => !player.isUser).slice(0, 3)
    voters.forEach((voter) => {
      state.voxPopuli!.nominationBallots[voter.id] = [human.id, targets[0]!]
    })
    state.awaitingNominations = false
    state.nomineeIds = [human.id, targets[0]!]
    human.status = 'nominated'
    state.players.find((player) => player.id === targets[0])!.status = 'nominated'
    state.voxPopuli.nominationVoteCounts = {
      [human.id]: 3,
      [targets[0]!]: 3,
    }

    expect(getEyeoleanPowerModeResolution(state, 'remove_vote').rule).toMatchObject({
      available: true,
      votingMoment: 'nomination',
      title: 'Remove a Vote',
    })
    expect(canTriggerStoreVoxVoteRemoval(state)).toBe(true)

    const next = gameReducer(state, applyStoreVoxVoteRemoval())

    expect(next.voxPopuli?.nominationVoteCounts[human.id]).toBe(2)
    expect(
      Object.values(next.voxPopuli?.nominationBallots ?? {}).filter((ballot) =>
        ballot.includes(human.id)
      )
    ).toHaveLength(2)
  })

  it('makes voting powers unavailable in a ruleset without an adapted contract', () => {
    const { state } = prepareVoteState()
    if (!state.cupidArrow) throw new Error('Expected Cupid Arrow state')
    state.cupidArrow.status = 'active'

    expect(getEyeoleanPowerArmAvailability(state, 'extra_vote')).toEqual({
      available: false,
      reason: 'This voting power is not available in this season format.',
    })
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
