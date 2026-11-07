import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import gameReducer, { applyMinigameWinner, createInitialGameState, hydrateGame } from '../gameSlice'
import challengeReducer, {
  beginChallengeAttempt,
  checkpointChallengeResult,
  completeChallenge,
  hydrateChallenge,
  prepareChallengeRetry,
  type PendingChallenge,
} from '../challengeSlice'
import socialReducer from '../../social/socialSlice'
import { store as baseline, type RootState } from '../store'
import { createSavedSeasonSnapshot } from '../saveStatePersistence'
import { getGame, getPoolByFilter } from '../../minigames/registry'
import { createAbandonedChallengeResult } from '../challengeResults'
import { createInitialVoxPopuliState } from '../../features/twists/voxPopuli'
import { createCupidArrowPairs } from '../../features/twists/cupidArrow'
import { createSurvivorModeState } from '../../modes/survivorRun'
import { useCompetitionFlow } from '../../screens/GameScreen/flows/useCompetitionFlow'
import type { CompetitionResult } from '../../minigames/competitionResult'

vi.mock('../store', async () => ({
  ...(await vi.importActual<typeof import('../store')>('../store')),
  persistCompetitionCheckpoint: vi.fn(async () => true),
}))

type Mode = 'classic' | 'cupid' | 'vox' | 'survival'
function fixture(
  mode: Mode = 'classic',
  phase: 'loh_comp' | 'pos_comp' = 'loh_comp',
  key = 'quickTap'
) {
  const root = structuredClone(baseline.getState())
  const game = createInitialGameState({ seed: 702, seasonArchives: [] })
  game.players = game.players.slice(0, mode === 'survival' ? 8 : 6).map((player, index) => ({
    ...player,
    isUser: index === 0,
    status: 'active' as const,
  }))
  game.week = 2
  game.phase = phase
  game.lohId = null
  game.posWinnerId = null
  game.prevHohId = null
  if (mode === 'survival') {
    game.mode = 'survival'
    game.modeSpecific = createSurvivorModeState(game.players.length)
  }
  if (mode === 'vox')
    game.voxPopuli = { ...createInitialVoxPopuliState(game.season), status: 'active' }
  if (mode === 'cupid')
    game.cupidArrow = {
      scheduledSeason: game.season,
      status: 'active',
      activatedSeason: game.season,
      activatedWeek: 1,
      pairs: createCupidArrowPairs(game.players, game.seed),
      eliminatedPairCount: 0,
      pendingPartnerEvictionId: null,
      visualsRevealed: true,
    }
  const pending: PendingChallenge = {
    id: 'campaign-attempt',
    game: getGame(key)!,
    seed: 88,
    participants: game.players.map((player) => player.id),
    phase: 'rules',
    aiScores: Object.fromEntries(
      game.players.slice(1).map((player, index) => [player.id, 100 - index])
    ),
    prizeType: phase === 'loh_comp' ? 'LOH' : 'POS',
    attempt: { number: 0, status: 'ready' },
    origin: { gameId: game.gameId, week: game.week, phase },
  }
  return { ...root, game, challenge: { ...root.challenge, pending, history: [] } }
}

function makeStore(initial: RootState) {
  return configureStore({
    reducer: (state: RootState = initial, action): RootState => ({
      ...state,
      game: gameReducer(state.game, action),
      challenge: challengeReducer(state.challenge, action),
      social: socialReducer(state.social, action),
    }),
    middleware: (get) => get({ serializableCheck: false, immutableCheck: false }),
  })
}

function reload(store: ReturnType<typeof makeStore>) {
  const saved = JSON.parse(JSON.stringify(createSavedSeasonSnapshot('owner', store.getState())))
  const restored = makeStore(structuredClone(store.getState()))
  restored.dispatch(hydrateGame(saved.game))
  restored.dispatch(hydrateChallenge(saved.challenge))
  return restored
}

function mountFlow(store: ReturnType<typeof makeStore>) {
  return renderHook(
    () => {
      const game = store.getState().game
      return useCompetitionFlow({
        game,
        humanPlayer: game.players.find((player) => player.isUser),
        aliveIds: game.players.map((player) => player.id),
        hohCompParticipants: game.players.map((player) => player.id),
        humanIsOutgoingHoh: false,
        spectatorReactEnabled: false,
        spectatorMode: false,
        dispatch: store.dispatch,
      })
    },
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    }
  )
}

function winningResult(state: RootState): CompetitionResult {
  const ids = state.challenge.pending!.participants
  return {
    rawValue: 900,
    partial: false,
    completion: {
      rawValue: 900,
      rawResults: Object.fromEntries(ids.map((id, index) => [id, 900 - index * 100])),
      authoritativeWinnerId: ids[0],
      authoritativeLastPlaceId: ids.at(-1),
      authoritativeRankedIds: ids,
    },
  }
}

describe('durable competition attempts', () => {
  it.each(['rules', 'demo', 'countdown'] as const)(
    'does not consume a pregame %s screen or infer a penalty for a legacy save',
    (phase) => {
      const state = fixture()
      state.challenge.pending!.phase = phase
      const restored = challengeReducer(state.challenge, hydrateChallenge(state.challenge))
      expect(restored.pending?.attempt?.status).toBe('ready')
      expect(restored.pending?.restored).toBe(false)
      delete state.challenge.pending!.attempt
      state.challenge.pending!.phase = 'playing'
      expect(
        challengeReducer(state.challenge, hydrateChallenge(state.challenge)).pending?.restored
      ).toBe(false)
    }
  )

  it.each(getPoolByFilter({ retired: false }).map((game) => game.key))(
    'records an interrupted %s attempt as a loss even with zero scores or a producer-selected human winner',
    (key) => {
      const state = fixture('classic', 'loh_comp', key)
      const pending = state.challenge.pending!
      pending.aiScores = Object.fromEntries(pending.participants.slice(1).map((id) => [id, 0]))
      pending.forcedWinnerId = pending.participants[0]
      const result = createAbandonedChallengeResult(pending, pending.participants[0])
      const store = makeStore(state)
      const winner = store.dispatch(
        completeChallenge(
          pending.participants.map((playerId) => ({
            playerId,
            rawValue: result.completion?.rawResults?.[playerId] ?? 0,
          })),
          {
            partial: true,
            authoritativeWinnerId: result.completion?.authoritativeWinnerId,
            authoritativeRankedIds: result.completion?.authoritativeRankedIds,
          }
        )
      )
      expect(winner).not.toBe(pending.participants[0])
      expect(store.getState().challenge.history[0].ranking?.at(-1)).toBe(pending.participants[0])
      expect(store.getState().challenge.history[0].canonicalScores[pending.participants[0]]).toBe(0)
    }
  )

  it.each([
    ['classic', 'loh_comp'],
    ['classic', 'pos_comp'],
    ['cupid', 'loh_comp'],
    ['cupid', 'pos_comp'],
    ['vox', 'loh_comp'],
    ['vox', 'pos_comp'],
    ['survival', 'loh_comp'],
  ] as const)(
    'restores one losing result in %s/%s without rerolling or starting another game',
    (mode, phase) => {
      const initial = makeStore(fixture(mode, phase))
      initial.dispatch(beginChallengeAttempt({ id: 'campaign-attempt', number: 0 }))
      const restored = reload(initial)
      const first = mountFlow(restored)
      const attempt = restored.getState().challenge.pending!.attempt!
      expect(attempt.status).toBe('finished')
      if (!('result' in attempt)) throw new Error('Missing recovered result')
      expect(attempt.result.partial).toBe(true)
      const winnerId = attempt.result.completion!.authoritativeWinnerId
      first.unmount()
      const reopened = reload(restored)
      const flow = mountFlow(reopened)
      expect(reopened.getState().challenge.pending!.attempt).toEqual(attempt)
      expect(reopened.getState().challenge.history).toHaveLength(0)
      act(() =>
        flow.result.current.handleChallengeDone(
          attempt.result.rawValue,
          true,
          attempt.result.completion
        )
      )
      act(() => flow.result.current.handleWinnerCeremonyDone())
      const game = reopened.getState().game
      expect(phase === 'pos_comp' ? game.posWinnerId : game.lohId).toBe(winnerId)
      expect(game.phase).not.toBe(phase)
      expect(reopened.getState().challenge.pending).toBeNull()
      expect(reopened.getState().challenge.history).toHaveLength(1)
      if (mode === 'vox' && phase === 'loh_comp')
        expect(game.voxPopuli?.autoNomineeId).toBe(game.players[0].id)
      if (mode === 'cupid' && phase === 'loh_comp') {
        const pair = game.cupidArrow?.pairs.find((pair) => pair.memberIds.includes(winnerId!))
        expect(
          pair?.memberIds.every(
            (id) => game.players.find((player) => player.id === id)?.status === 'loh'
          )
        ).toBe(true)
      }
    }
  )

  it('keeps a finished winning score before Continue, including through an interrupted winner ceremony', () => {
    const store = makeStore(fixture())
    const outcome = winningResult(store.getState())
    store.dispatch(
      checkpointChallengeResult({ id: 'campaign-attempt', number: 0, result: outcome })
    )
    let restored = reload(store)
    expect(restored.getState().challenge.pending?.attempt).toMatchObject({
      status: 'finished',
      result: outcome,
    })
    expect(restored.getState().game.lohId).toBeNull()
    const flow = mountFlow(restored)
    act(() => flow.result.current.handleChallengeDone(outcome.rawValue, false, outcome.completion))
    expect(restored.getState().challenge.pending?.attempt?.status).toBe('accepted')
    expect(restored.getState().game.lohId).toBeNull()
    const savedDuringCeremony = reload(restored)
    flow.unmount()
    restored = savedDuringCeremony
    mountFlow(restored)
    expect(restored.getState().game.lohId).toBe(outcome.completion!.authoritativeWinnerId)
    expect(restored.getState().game.players[0].stats?.lohWins).toBe(1)
    expect(restored.getState().challenge.history).toHaveLength(1)
    expect(restored.getState().challenge.pending).toBeNull()
    const again = reload(restored)
    mountFlow(again)
    expect(again.getState().game.players[0].stats?.lohWins).toBe(1)
  })

  it('keeps a rewarded retry ready across a restart and rejects a stale result from its preceding attempt', () => {
    const store = makeStore(fixture())
    const result = createAbandonedChallengeResult(
      store.getState().challenge.pending!,
      store.getState().game.players[0].id
    )
    store.dispatch(checkpointChallengeResult({ id: 'campaign-attempt', number: 0, result }))
    store.dispatch(prepareChallengeRetry({ id: 'campaign-attempt', number: 0 }))
    const restored = reload(store)
    expect(restored.getState().challenge.pending?.attempt).toEqual({ number: 1, status: 'ready' })
    restored.dispatch(
      checkpointChallengeResult({
        id: 'campaign-attempt',
        number: 0,
        result: winningResult(restored.getState()),
      })
    )
    expect(restored.getState().challenge.pending?.attempt?.status).toBe('ready')
  })

  it('preserves a feature-owned winner without awarding competition boosts twice', () => {
    const store = makeStore(fixture('classic', 'loh_comp', 'holdWall'))
    const result = winningResult(store.getState())
    const winnerId = result.completion!.authoritativeWinnerId!
    store.dispatch(
      applyMinigameWinner({
        winnerId,
        participants: store.getState().challenge.pending!.participants,
      })
    )
    const before = structuredClone(store.getState().game.competitionSeasonStateByPlayerId)
    store.dispatch(checkpointChallengeResult({ id: 'campaign-attempt', number: 0, result }))
    const restored = reload(store)
    const flow = mountFlow(restored)
    act(() => flow.result.current.handleChallengeDone(result.rawValue, false, result.completion))
    act(() => flow.result.current.handleWinnerCeremonyDone())
    expect(restored.getState().game.players[0].stats?.lohWins).toBe(1)
    expect(restored.getState().game.competitionSeasonStateByPlayerId).toEqual(before)
  })

  it.each(['batteryLow', 'mysticChamber'])(
    'preserves %s one-shot effects through a reload during the winner ceremony',
    (key) => {
      const store = makeStore(fixture('classic', 'loh_comp', key))
      const outcome = winningResult(store.getState())
      const [humanId, aiId] = store.getState().challenge.pending!.participants
      if (key === 'batteryLow')
        outcome.completion!.batteryLowVoteEffects = { [humanId]: 'doubleVote' }
      else
        outcome.completion!.mysticChamberRelationships = [
          { source: aiId, target: humanId, delta: -4 },
        ]
      const before = structuredClone(store.getState().social.relationships)
      store.dispatch(
        checkpointChallengeResult({ id: 'campaign-attempt', number: 0, result: outcome })
      )
      const flow = mountFlow(store)
      act(() =>
        flow.result.current.handleChallengeDone(outcome.rawValue, false, outcome.completion)
      )
      const savedEffects = structuredClone(store.getState().social.relationships)
      if (key === 'mysticChamber') expect(savedEffects).not.toEqual(before)
      else expect(store.getState().game.batteryLowVoteEffects?.[humanId]?.type).toBe('doubleVote')
      const restored = reload(store)
      flow.unmount()
      mountFlow(restored)
      expect(restored.getState().social.relationships).toEqual(savedEffects)
      if (key === 'batteryLow')
        expect(restored.getState().game.batteryLowVoteEffects?.[humanId]?.type).toBe('doubleVote')
      expect(restored.getState().challenge.history).toHaveLength(1)
    }
  )

  it('retains the complete co-winner list of a finished Chain of Greed attempt', () => {
    const store = makeStore(fixture('classic', 'loh_comp', 'chainOfGreed'))
    const outcome = winningResult(store.getState())
    const winners = store.getState().challenge.pending!.participants.slice(0, 2)
    outcome.completion!.authoritativeWinnerIds = winners
    store.dispatch(
      checkpointChallengeResult({ id: 'campaign-attempt', number: 0, result: outcome })
    )
    const restored = reload(store)
    const flow = mountFlow(restored)
    act(() => flow.result.current.handleChallengeDone(outcome.rawValue, false, outcome.completion))
    act(() => flow.result.current.handleWinnerCeremonyDone())
    expect(restored.getState().game.coLohIds).toEqual(winners)
  })

  it.each(['scored', 'survival'] as const)(
    'preserves the %s last-place nomination label after restoring a finished competition',
    (lastPlaceType) => {
      const store = makeStore(fixture('vox', 'loh_comp', 'glass_bridge_brutal'))
      const outcome = winningResult(store.getState())
      outcome.completion!.lastPlaceType = lastPlaceType
      store.dispatch(
        checkpointChallengeResult({ id: 'campaign-attempt', number: 0, result: outcome })
      )
      const restored = reload(store)
      const flow = mountFlow(restored)
      act(() =>
        flow.result.current.handleChallengeDone(outcome.rawValue, false, outcome.completion)
      )
      act(() => flow.result.current.handleWinnerCeremonyDone())
      expect(restored.getState().game.lastHohCompFinisherType).toBe(lastPlaceType)
      expect(restored.getState().game.lastHohCompFinisherId).toBe(
        outcome.completion!.authoritativeLastPlaceId
      )
    }
  )

  it.each([1, 2, 3] as const)(
    'restores the real result of Final 3 part %s without awarding an ordinary LOH/POS',
    (part) => {
      const state = fixture()
      state.game.players = state.game.players.slice(0, 3)
      const phase = `final3_comp${part}_minigame` as const
      state.game.phase = phase
      state.game.minigameContext = {
        phaseKey: `final3_comp${part}`,
        participants: state.game.players.map((player) => player.id),
        seed: 88,
      }
      state.game.f3Part1WinnerId = state.game.players[1].id
      state.game.f3Part2WinnerId = state.game.players[2].id
      state.challenge.pending!.participants = state.game.minigameContext.participants
      state.challenge.pending!.origin!.phase = phase
      const store = makeStore(state)
      const outcome = winningResult(state)
      store.dispatch(
        checkpointChallengeResult({ id: 'campaign-attempt', number: 0, result: outcome })
      )
      const restored = reload(store)
      const flow = mountFlow(restored)
      act(() =>
        flow.result.current.handleChallengeDone(outcome.rawValue, false, outcome.completion)
      )
      expect(restored.getState().game.phase).not.toBe(phase)
      expect(restored.getState().challenge.pending).toBeNull()
      if (part < 3) expect(restored.getState().game.lohId).toBeNull()
      else expect(restored.getState().game.lohId).toBe(state.game.players[0].id)
    }
  )

  it('discards a checkpoint from a different campaign without applying its winner', () => {
    const state = fixture()
    const outcome = winningResult(state)
    state.challenge.pending!.attempt = { number: 0, status: 'accepted', result: outcome }
    state.challenge.pending!.restored = true
    state.challenge.pending!.origin!.gameId = 'another-campaign'
    state.game.phase = 'week_start'
    const store = makeStore(state)
    mountFlow(store)
    expect(store.getState().game.lohId).toBeNull()
    expect(store.getState().challenge.history).toHaveLength(0)
    expect(store.getState().challenge.pending).toBeNull()
  })
})
