import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as hybridResolver from '../../ai/competition/hybridScoreResolver'
import { store as baseline, type RootState } from '../store'
import gameReducer, {
  completeMinigame,
  hydrateGame,
  createInitialGameState,
  startMinigame,
  openBattleBackCompetition,
} from '../gameSlice'
import challengeReducer, {
  startChallenge,
  hydrateChallenge,
  beginChallengeAttempt,
  checkpointChallengeResult,
  prepareChallengeRetry,
} from '../challengeSlice'
import { createSavedSeasonSnapshot } from '../saveStatePersistence'
import { createEmptyStoreEntitlements } from '../../vip/vipStorage'
import { createInitialVoxPopuliState } from '../../features/twists/voxPopuli'
import { createCupidArrowPairs } from '../../features/twists/cupidArrow'
import { getDefaultCompetitionProfile } from '../../ai/competition'
import {
  simulateQuickTapVipAiRace,
  scoreQuickTapVipAiOnly,
} from '../../minigames/quickTapRace/vip/quickTapVipLogic'
import { effectiveSeasonProfile } from '../../ai/competition/seasonAiDifficulty'
import { SeasonAiContext } from '../../ai/competition/SeasonAiContext'
import memoryReducer, { simulateAiResult } from '../../features/memoryColors/memoryColorsSlice'
import MemoryColorsComp from '../../components/MemoryColorsComp/MemoryColorsComp'

function fixture(mode: 'classic' | 'vox' | 'cupid' | 'survival' = 'classic', vip = false) {
  const root = structuredClone(baseline.getState())
  const game = createInitialGameState({ seed: 104, seasonArchives: [] })
  game.mode = mode === 'survival' ? 'survival' : 'classic'
  game.status = 'active'
  game.phase = 'loh_comp'
  game.week = 2
  game.players = game.players.slice(0, 8).map((p, i) => ({
    ...p,
    isUser: i === 0,
    status: 'active',
    competitionProfile: getDefaultCompetitionProfile(),
  }))
  game.prevHohId = null
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
  const initial = {
    ...root,
    game,
    challenge: { ...root.challenge, pending: null, history: [] },
    vip: { ...root.vip, isActive: vip, entitlements: createEmptyStoreEntitlements() },
  }
  return configureStore({
    reducer: (state: RootState = initial, action): RootState => ({
      ...state,
      game: gameReducer(state.game, action),
      challenge: challengeReducer(state.challenge, action),
      memoryColors: memoryReducer(state.memoryColors, action),
    }),
    middleware: (get) => get({ serializableCheck: false, immutableCheck: false }),
  })
}

describe('season AI launch and recovery', () => {
  it('captures Battle Back once and preserves a pre-policy active competition', () => {
    const game = createInitialGameState({ seed: 5, seasonArchives: [] })
    game.mode = 'classic'
    game.status = 'active'
    game.battleBack = {
      used: false,
      active: true,
      competitionActive: false,
      weekDecided: 2,
      candidates: game.players.slice(0, 4).map((p) => p.id),
      winnerId: null,
    }
    const opened = gameReducer(game, openBattleBackCompetition())
    expect(opened.battleBack?.aiRuntime?.capability).toBe(1.2)
    expect(gameReducer(opened, openBattleBackCompetition()).battleBack?.aiRuntime).toEqual(
      opened.battleBack?.aiRuntime
    )
    game.battleBack.competitionActive = true
    expect(gameReducer(game, openBattleBackCompetition()).battleBack?.aiRuntime).toBeUndefined()
  })
  it.each(['classic', 'vox', 'cupid'] as const)(
    'captures base and effective profiles for %s without changing the roster',
    (mode) => {
      const store = fixture(mode)
      const players = store.getState().game.players
      store.dispatch(
        startChallenge(
          17,
          players.map((p) => p.id),
          { forceGameKey: 'quickTap', prizeType: 'LOH' }
        )
      )
      const pending = store.getState().challenge.pending!
      expect(pending.aiRuntime?.capability).toBe(1.2)
      const ai = players[1].id
      expect(pending.aiRuntime?.profiles[ai]).toMatchObject({
        base: { physical: 50 },
        effective: { physical: 60 },
      })
      expect(store.getState().game.players).toEqual(players)
      const saved = JSON.parse(JSON.stringify(createSavedSeasonSnapshot('owner', store.getState())))
      store.dispatch(hydrateChallenge(saved.challenge))
      expect(store.getState().challenge.pending?.aiRuntime).toEqual(pending.aiRuntime)
      store.dispatch(beginChallengeAttempt({ id: pending.id, number: 0 }))
      store.dispatch(
        checkpointChallengeResult({
          id: pending.id,
          number: 0,
          result: { rawValue: 0, partial: false },
        })
      )
      store.dispatch(prepareChallengeRetry({ id: pending.id, number: 0 }))
      expect(store.getState().challenge.pending?.attempt?.number).toBe(1)
      expect(store.getState().challenge.pending?.aiRuntime?.profiles[ai].effective.physical).toBe(
        60
      )
      expect(store.getState().challenge.pending?.aiScores).toEqual(pending.aiScores)
    }
  )

  it('keeps Surveyeval and pre-policy saves at their existing difficulty', () => {
    const store = fixture('survival')
    store.dispatch(
      startChallenge(
        17,
        store.getState().game.players.map((p) => p.id),
        { forceGameKey: 'quickTap' }
      )
    )
    expect(store.getState().challenge.pending?.aiRuntime).toBeUndefined()
    const classic = fixture()
    classic.dispatch(hydrateChallenge(store.getState().challenge))
    expect(classic.getState().challenge.pending?.aiRuntime).toBeUndefined()
  })

  it('uses the captured VIP profile in challenge precomputation and the native-session route', () => {
    const store = fixture('classic', true)
    const players = store.getState().game.players
    store.dispatch(
      startChallenge(
        17,
        players.map((p) => p.id),
        { forceGameKey: 'quickTap' }
      )
    )
    const pending = store.getState().challenge.pending!
    for (const ai of players.filter((p) => !p.isUser)) {
      expect(pending.aiScores[ai.id]).toBe(
        simulateQuickTapVipAiRace({
          seed: pending.seed,
          playerId: ai.id,
          profile: pending.aiRuntime?.profiles[ai.id].effective,
        }).score
      )
    }
    store.dispatch(
      startMinigame({
        key: 'quickTap',
        participants: players.map((p) => p.id),
        seed: 17,
        options: { timeLimit: 30 },
      })
    )
    expect(
      store.getState().game.pendingMinigame?.aiRuntime?.profiles[players[1].id].effective.physical
    ).toBe(60)
  })

  it('uses effective profiles for the separate VIP AI-only launch path', () => {
    const store = fixture('classic', true)
    const players = store.getState().game.players.filter((p) => !p.isUser)
    const ids = players.map((p) => p.id)
    const result = store.dispatch(
      startMinigame({ key: 'quickTap', participants: ids, seed: 17, options: { timeLimit: 30 } })
    )!
    expect(result.scores).toEqual(
      scoreQuickTapVipAiOnly({
        seed: result.seedUsed,
        participantIds: ids,
        mode: 'race',
        profiles: Object.fromEntries(
          players.map((p) => [p.id, effectiveSeasonProfile(p.competitionProfile)])
        ),
      })
    )
    expect(store.getState().game.pendingMinigame).toBeFalsy()
  })

  it('resolves deferred hybrid scores from the captured profiles after reload', () => {
    const original = hybridResolver.resolveHybridAiScores
    const captured: { id: string; physical?: number; mental?: number }[][] = []
    const resolver = vi
      .spyOn(hybridResolver, 'resolveHybridAiScores')
      .mockImplementation((args) => {
        captured.push(
          args.aiParticipants.map((p) => ({
            id: p.id,
            physical: p.profile?.physical,
            mental: p.profile?.mental,
          }))
        )
        return original(args)
      })
    const control = fixture()
    control.dispatch(
      startMinigame({
        key: 'estimationGame',
        participants: control.getState().game.players.map((p) => p.id),
        seed: 17,
        options: { timeLimit: 30 },
      })
    )
    const changed = structuredClone(control.getState().game)
    changed.players.forEach((p) => {
      p.competitionProfile = {
        ...getDefaultCompetitionProfile(),
        physical: 0,
        mental: 0,
        precision: 0,
        nerve: 0,
      }
    })
    const restored = fixture()
    restored.dispatch(hydrateGame(changed))
    control.dispatch(completeMinigame({ humanScore: 70 }))
    restored.dispatch(completeMinigame({ humanScore: 70 }))
    expect(captured.at(-1)).toContainEqual({
      id: changed.players.find((p) => !p.isUser)!.id,
      physical: 60,
      mental: 60,
    })
    expect(restored.getState().game.lastCompetitionResolution).toEqual(
      control.getState().game.lastCompetitionResolution
    )
    expect(restored.getState().game.lastCompetitionResolution?.winnerId).toBeTruthy()
    resolver.mockRestore()
  })

  it('delivers the saved policy to a real feature owner and keeps the human rules intact', () => {
    const store = fixture()
    const players = store.getState().game.players
    store.dispatch(
      startChallenge(
        17,
        players.map((p) => p.id),
        { forceGameKey: 'memoryMatch' }
      )
    )
    const pending = store.getState().challenge.pending!
    const view = render(
      <Provider store={store}>
        <SeasonAiContext.Provider value={pending.aiRuntime}>
          <MemoryColorsComp
            participantIds={pending.participants}
            participants={players.map((p) => ({
              id: p.id,
              name: p.name,
              isHuman: !!p.isUser,
              precomputedScore: pending.aiScores[p.id] ?? 0,
              previousPR: null,
            }))}
            seed={pending.seed}
            prizeType="LOH"
          />
        </SeasonAiContext.Provider>
      </Provider>
    )
    const memory = store.getState().memoryColors
    expect(memory.aiResults[players[1].id]).toEqual(
      simulateAiResult(pending.seed, players[1].id, 1.2)
    )
    expect(memory.aiResults[players[0].id]).toBeUndefined()
    expect(memory.mistakesUsed).toBe(0)
    view.unmount()
  })
})
