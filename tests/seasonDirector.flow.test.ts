import { afterEach, describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, {
  tryActivateBattleBack,
  tryActivateDoubleEviction,
  tryActivateSpecialVeto,
} from '../src/store/gameSlice'
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice'
import type { GameState, Player } from '../src/types'
import {
  DEFAULT_SEASON_DIRECTOR_POLICY,
  buildSeasonDirectorPlan,
  sanitiseRemoteSeasonDirectorConfig,
  setRemoteSeasonDirectorConfig,
  type SeasonDirectorPlan,
} from '../src/features/twists/seasonDirector'

function clonePolicy() {
  return structuredClone(DEFAULT_SEASON_DIRECTOR_POLICY)
}

function makePlan(options?: {
  doubleElimination?: boolean
  specialSafetyType?: SeasonDirectorPlan['selections']['specialSafetyType']
  aiBattleBack?: boolean
}): SeasonDirectorPlan {
  return {
    schemaVersion: 1,
    revision: 'test-director',
    season: 1,
    seed: 42,
    policy: clonePolicy(),
    selections: {
      firstSecretMission: true,
      secondSecretMission: false,
      doubleElimination: options?.doubleElimination ?? false,
      specialSafetyType: options?.specialSafetyType ?? null,
      morningShock: false,
      aiBattleBack: options?.aiBattleBack ?? false,
    },
  }
}

function playersWithStatuses(options: {
  active: number
  evicted?: number
  jurors?: number
  humanStatus?: Player['status']
}): Player[] {
  const players: Player[] = []
  const humanStatus = options.humanStatus ?? 'active'
  players.push({
    id: 'user',
    name: 'You',
    avatar: '🧑',
    status: humanStatus,
    isUser: true,
  })

  const humanCountsAsActive = humanStatus !== 'evicted' && humanStatus !== 'jury'
  const activeAiCount = Math.max(0, options.active - (humanCountsAsActive ? 1 : 0))
  for (let index = 0; index < activeAiCount; index += 1) {
    players.push({
      id: `active-${index}`,
      name: `Active ${index}`,
      avatar: '🧑',
      status: 'active',
      isUser: false,
    })
  }

  const humanCountsAsEvicted = humanStatus === 'evicted'
  for (
    let index = 0;
    index < Math.max(0, (options.evicted ?? 0) - (humanCountsAsEvicted ? 1 : 0));
    index += 1
  ) {
    players.push({
      id: `evicted-${index}`,
      name: `Evicted ${index}`,
      avatar: '🧑',
      status: 'evicted',
      isUser: false,
    })
  }

  const humanCountsAsJuror = humanStatus === 'jury'
  for (
    let index = 0;
    index < Math.max(0, (options.jurors ?? 0) - (humanCountsAsJuror ? 1 : 0));
    index += 1
  ) {
    players.push({
      id: `juror-${index}`,
      name: `Juror ${index}`,
      avatar: '🧑',
      status: 'jury',
      isUser: false,
    })
  }

  return players
}

function makeStore(gameOverrides: Partial<GameState>) {
  const base = {
    gameId: 'director-test-game',
    season: 1,
    week: 6,
    phase: 'nominations',
    seed: 42,
    lohId: null,
    prevHohId: null,
    nomineeIds: [],
    posWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    players: playersWithStatuses({ active: 10, evicted: 6 }),
    tvFeed: [],
    isLive: true,
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    twistActivatedThisWeek: false,
  } as GameState

  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer },
    preloadedState: {
      game: { ...base, ...gameOverrides },
      settings: DEFAULT_SETTINGS,
    },
  })
}

afterEach(() => {
  setRemoteSeasonDirectorConfig(null)
})

describe('Season Director policy', () => {
  it('does not create a Director plan unless remote orchestration is explicitly enabled', () => {
    setRemoteSeasonDirectorConfig(null)
    expect(buildSeasonDirectorPlan(1, 42)).toBeUndefined()

    setRemoteSeasonDirectorConfig({ enabled: false })
    expect(buildSeasonDirectorPlan(1, 42)).toBeUndefined()
  })

  it('pre-rolls one deterministic season plan and honors remote weights', () => {
    setRemoteSeasonDirectorConfig({
      enabled: true,
      revision: 'test-remote',
      secretMissions: {
        first: { chance: 100 },
        second: { chance: 0 },
      },
      doubleElimination: { enabled: true, seasonChance: 100 },
      specialSafety: {
        enabled: true,
        seasonChance: 100,
        selection: {
          weights: { vip: 0, diamond: 1, coup: 0, spotlight: 0 },
        },
      },
      morningShock: { enabled: true, seasonChance: 0 },
      battleBack: { enabled: true, aiOnly: { seasonChance: 0 } },
    })

    const first = buildSeasonDirectorPlan(3, 91234)
    const second = buildSeasonDirectorPlan(3, 91234)

    expect(first).toEqual(second)
    expect(first?.revision).toBe('test-remote')
    expect(first?.selections).toMatchObject({
      firstSecretMission: true,
      secondSecretMission: false,
      doubleElimination: true,
      specialSafetyType: 'diamond',
      morningShock: false,
      aiBattleBack: false,
    })
  })

  it('sanitises remote frequencies and roster windows', () => {
    const result = sanitiseRemoteSeasonDirectorConfig({
      enabled: true,
      doubleElimination: {
        seasonChance: 160,
        minPlayers: 1,
        maxPlayers: 99,
        maxPerSeason: 9,
      },
      specialSafety: {
        seasonChance: -10,
        minPlayers: 6,
        maxPlayers: 9,
      },
    })

    expect(result?.doubleElimination).toMatchObject({
      seasonChance: 100,
      minPlayers: 2,
      maxPlayers: 32,
      maxPerSeason: 1,
    })
    expect(result?.specialSafety).toMatchObject({
      seasonChance: 0,
      minPlayers: 6,
      maxPlayers: 9,
    })
  })
})

describe('Director shock orchestration', () => {
  it('activates the selected Double Elimination only inside the 10-to-7 window', () => {
    const plan = makePlan({ doubleElimination: true })

    const tooEarly = makeStore({
      phase: 'nominations',
      players: playersWithStatuses({ active: 11, evicted: 5 }),
      seasonDirectorPlan: plan,
    })
    expect(tooEarly.dispatch(tryActivateDoubleEviction()) as unknown as boolean).toBe(false)

    const eligible = makeStore({
      phase: 'nominations',
      players: playersWithStatuses({ active: 10, evicted: 6 }),
      seasonDirectorPlan: plan,
    })
    expect(eligible.dispatch(tryActivateDoubleEviction()) as unknown as boolean).toBe(true)
    expect(eligible.getState().game.doubleEviction?.usedCount).toBe(1)

    const alreadyUsed = makeStore({
      phase: 'nominations',
      players: playersWithStatuses({ active: 8, evicted: 8 }),
      seasonDirectorPlan: plan,
      doubleEviction: { usedCount: 1, weekActive: false, pendingSecondEviction: null },
      twistActivatedThisWeek: false,
    })
    expect(alreadyUsed.dispatch(tryActivateDoubleEviction()) as unknown as boolean).toBe(false)
  })

  it('keeps Special Safety in the agreed 9-to-6 player window', () => {
    const plan = makePlan({ specialSafetyType: 'diamond' })

    const tooEarly = makeStore({
      phase: 'pos_results',
      players: playersWithStatuses({ active: 10, evicted: 6 }),
      seasonDirectorPlan: plan,
    })
    expect(tooEarly.dispatch(tryActivateSpecialVeto()) as unknown as boolean).toBe(false)

    const eligible = makeStore({
      phase: 'pos_results',
      players: playersWithStatuses({ active: 9, evicted: 7 }),
      seasonDirectorPlan: plan,
    })
    expect(eligible.dispatch(tryActivateSpecialVeto()) as unknown as boolean).toBe(true)
    expect(eligible.getState().game.specialVeto?.activeType).toBe('diamond')

    const tooLate = makeStore({
      phase: 'pos_results',
      players: playersWithStatuses({ active: 5, evicted: 11 }),
      seasonDirectorPlan: plan,
    })
    expect(tooLate.dispatch(tryActivateSpecialVeto()) as unknown as boolean).toBe(false)
  })

  it('ends Battle Back orchestration when the human is eliminated before the Tribunal', () => {
    const plan = makePlan({ aiBattleBack: true })
    const store = makeStore({
      phase: 'eviction_results',
      players: playersWithStatuses({
        active: 7,
        evicted: 3,
        jurors: 3,
        humanStatus: 'evicted',
      }),
      seasonDirectorPlan: plan,
      seasonDirectorHumanReturnUsed: false,
    })

    expect(store.dispatch(tryActivateBattleBack()) as unknown as boolean).toBe(false)
    expect(store.getState().game.battleBack).toBeUndefined()
  })

  it('uses Tribunal members only for an AI Battle Back while the human is still active', () => {
    const plan = makePlan({ aiBattleBack: true })
    const store = makeStore({
      phase: 'eviction_results',
      players: playersWithStatuses({
        active: 7,
        evicted: 3,
        jurors: 3,
        humanStatus: 'active',
      }),
      seasonDirectorPlan: plan,
    })

    expect(store.dispatch(tryActivateBattleBack()) as unknown as boolean).toBe(true)
    expect(
      store
        .getState()
        .game.battleBack?.candidates.every((id) => id.startsWith('juror-'))
    ).toBe(true)
    expect(store.getState().game.battleBack?.candidates).not.toContain('evicted-0')
  })

  it('guarantees a Tribunal-member human a return opportunity even after an earlier AI Battle Back', () => {
    const plan = makePlan({ aiBattleBack: false })
    const store = makeStore({
      phase: 'eviction_results',
      players: playersWithStatuses({
        active: 6,
        evicted: 2,
        jurors: 2,
        humanStatus: 'jury',
      }),
      seasonDirectorPlan: plan,
      seasonDirectorHumanReturnUsed: false,
      battleBack: {
        used: true,
        active: false,
        competitionActive: false,
        weekDecided: 4,
        candidates: ['juror-0'],
        winnerId: 'active-0',
        returnAnimationPending: false,
      },
    })

    expect(store.dispatch(tryActivateBattleBack()) as unknown as boolean).toBe(true)
    expect(store.getState().game.battleBack?.candidates).toContain('user')
    expect(store.getState().game.battleBack?.candidates).not.toContain('evicted-0')
    expect(store.getState().game.seasonDirectorHumanReturnUsed).toBe(true)
  })

  it('does not grant a Tribunal-member human a second guaranteed return opportunity', () => {
    const plan = makePlan({ aiBattleBack: false })
    const store = makeStore({
      phase: 'eviction_results',
      players: playersWithStatuses({
        active: 6,
        evicted: 2,
        jurors: 2,
        humanStatus: 'jury',
      }),
      seasonDirectorPlan: plan,
      seasonDirectorHumanReturnUsed: true,
      battleBack: {
        used: true,
        active: false,
        competitionActive: false,
        weekDecided: 7,
        candidates: ['user', 'juror-0'],
        winnerId: null,
        returnAnimationPending: false,
      },
    })

    expect(store.dispatch(tryActivateBattleBack()) as unknown as boolean).toBe(false)
  })

  it('applies a live kill switch without rewriting the snapshotted season plan', () => {
    const plan = makePlan({ doubleElimination: true })
    const store = makeStore({
      phase: 'nominations',
      players: playersWithStatuses({ active: 9, evicted: 7 }),
      seasonDirectorPlan: plan,
    })
    setRemoteSeasonDirectorConfig({
      enabled: true,
      killSwitches: { doubleElimination: true },
    })

    expect(store.dispatch(tryActivateDoubleEviction()) as unknown as boolean).toBe(false)
    expect(store.getState().game.seasonDirectorPlan).toEqual(plan)
  })
})
