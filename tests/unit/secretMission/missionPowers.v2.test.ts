import {
  createProfile,
  debugGrantEyeoleans,
  purchaseEyeoleanStoreProduct,
  armEyeoleanStorePower,
} from '../../../src/store/profilesSlice'
import { eyeoleanPowerMiddleware } from '../../../src/store/eyeoleanPowerMiddleware'
import { secretMissionMiddleware } from '../../../src/store/secretMissionMiddleware'
import {
  resolveVoxNominations,
  resolveVoxReplacementNominees,
} from '../../../src/features/twists/voxPopuli'
import { withLohNominationPlanning } from '../../../src/store/lohNominationPlanning'
import { getNominationTargetScore } from '../../../src/store/gameSlice'
import { socialMiddleware } from '../../../src/social/socialMiddleware'
import publicOpinionReducer from '../../../src/publicOpinion/publicOpinionSlice'
import { describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { produce } from 'immer'
import gameReducer, {
  advance,
  createInitialGameState,
  getEligibleNominationTargets,
  getEligibleReplacementNominees,
  hydrateGame,
  setWeekendsEnabledForSeason,
  submitPovSaveTarget,
} from '../../../src/store/gameSlice'
import settingsReducer, { DEFAULT_SETTINGS } from '../../../src/store/settingsSlice'
import profilesReducer from '../../../src/store/profilesSlice'
import socialReducer, {
  commitRealityDomainUpdate,
  grantSecretMissionResourceCache,
} from '../../../src/social/socialSlice'
import {
  createInitialRealityDomainState,
  createRealityAlliance,
  getRealityAllianceKnowledgeView,
} from '../../../src/social/reality'
import { missionPowerMiddleware } from '../../../src/store/missionPowerMiddleware'
import * as actions from '../../../src/store/missionPowerActions'
import {
  canUseMissionPower,
  createMissionPowerReward,
  drawMissionBoxes,
  getMissionOutgoingIds,
  getMissionPowerPool,
  isMissionBackupProtected,
  isMissionOpeningProtected,
  type MissionPowerType,
} from '../../../src/bb/missionPowers'
import type { GameState } from '../../../src/types'

function fixture(type: MissionPowerType = 'vetoSafety', count = 8): GameState {
  const game = createInitialGameState({ seed: 4242 })
  game.players = Array.from({ length: count }, (_, i) => ({
    id: i ? `ai${i}` : 'human',
    name: i ? `Player ${i}` : 'You',
    avatar: '',
    isUser: i === 0,
    status: 'active',
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
  }))
  game.season = 2
  game.week = 6
  game.phase = 'pos_ceremony_results'
  game.lohId = 'ai1'
  game.posWinnerId = 'ai2'
  game.nomineeIds = ['ai3', 'ai4']
  game.awaitingPovSaveTarget = true
  game.players[1].status = 'loh'
  game.players[2].status = 'pos'
  game.players[3].status = 'nominated'
  if (game.players[4]) game.players[4].status = 'nominated'
  game.cupidArrow = undefined
  game.voxPopuli = undefined
  game.democracia = undefined
  game.specialVeto = undefined
  game.dayStartShock = null
  game.twistActivatedThisWeek = false
  game.pendingForcedShock = null
  game.seasonDirectorPlan = undefined
  game.missionPowers = {}
  game.weekendsEnabledAtSeasonStart = false
  game.weekendsEnabledForSeason = false
  game.secretMission = {
    triggeredDay: 3,
    startDay: 3,
    endDay: 6,
    survivalWindowEndDay: 6,
    targetDeadlineDay: 6,
    status: 'rewardClaimed',
    offeredDay: 3,
    offerCount: 1,
    declinedDay: null,
    tasks: [],
    templateId: 'test',
    rewardVersion: 2,
    rewardSet: {
      version: 2,
      id: 'mission-test',
      availableDay: 6,
      claimUntilDay: 7,
      boxes: [type, type, type, type],
      selectedIndex: 0,
    },
    reward: createMissionPowerReward(type, 6, 'week_start'),
  }
  return game
}
function setup(game = fixture()) {
  return configureStore({
    reducer: {
      game: withLohNominationPlanning(gameReducer, getNominationTargetScore),
      publicOpinion: publicOpinionReducer,
      settings: settingsReducer,
      social: socialReducer,
      profiles: profilesReducer,
    },
    preloadedState: {
      game,
      settings: { ...DEFAULT_SETTINGS, sim: { ...DEFAULT_SETTINGS.sim, enableTwists: false } },
    },
    middleware: (getDefault) =>
      getDefault({ immutableCheck: false, serializableCheck: false }).concat(
        missionPowerMiddleware,
        socialMiddleware,
        secretMissionMiddleware,
        eyeoleanPowerMiddleware
      ),
  })
}

describe('Secret Mission v2 selection and lifecycle', () => {
  it('persists a deterministic four-box draw, unique while the pool permits it', () => {
    const pool = getMissionPowerPool(fixture(), true)
    expect(pool).toHaveLength(9)
    expect(drawMissionBoxes(pool, 'run:1')).toEqual(drawMissionBoxes(pool, 'run:1'))
    expect(new Set(drawMissionBoxes(pool, 'run:1')).size).toBe(4)
    expect(drawMissionBoxes(['noSkip'], 'run:1')).toEqual(['noSkip', 'noSkip', 'noSkip', 'noSkip'])
    expect(drawMissionBoxes([], 'run:1')).toEqual([])
  })
  it('limits Season 1 to eligible introductory rewards and restores the full pool in Season 2', () => {
    const game = fixture()
    game.season = 1
    expect(getMissionPowerPool(game, true)).toEqual(['resourceCache', 'allianceReveal'])
    expect(getMissionPowerPool(game, false)).toEqual(['resourceCache'])
    game.weekendsEnabledAtSeasonStart = true
    expect(getMissionPowerPool(game, true)).toEqual(['allianceReveal'])
    expect(drawMissionBoxes(getMissionPowerPool(game, true), 'intro')).toEqual(
      Array(4).fill('allianceReveal')
    )
    expect(getMissionPowerPool(game, false)).toEqual([])
    game.season = 2
    game.weekendsEnabledAtSeasonStart = false
    expect(getMissionPowerPool(game, true)).toHaveLength(9)
  })
  it('rejects an old unclaimed Season 1 ceremony-power box at the reducer boundary', () => {
    const game = fixture('noSkip')
    game.season = 1
    game.secretMission!.status = 'rewardPending'
    game.secretMission!.reward = undefined
    game.secretMission!.rewardSet!.selectedIndex = undefined
    const result = gameReducer(
      game,
      actions.claimMissionBox({ missionId: 'mission-test', index: 0 })
    )
    expect(result.secretMission?.status).toBe('rewardPending')
    expect(result.secretMission?.reward).toBeUndefined()
    const store = setup(game)
    store.dispatch({ type: 'test/reconcile' })
    expect(store.getState().game.secretMission?.rewardSet?.boxes).toEqual(
      Array(4).fill('resourceCache')
    )
    store.dispatch(actions.claimMissionBox({ missionId: 'mission-test', index: 0 }))
    expect(store.getState().game.secretMission?.reward?.type).toBe('resourceCache')
  })
  it('excludes cache based on both original and current weekend settings', () => {
    const game = fixture()
    game.weekendsEnabledAtSeasonStart = true
    expect(getMissionPowerPool(game, true)).not.toContain('resourceCache')
    game.weekendsEnabledAtSeasonStart = false
    game.weekendsEnabledForSeason = true
    expect(getMissionPowerPool(game, true)).not.toContain('resourceCache')
  })
  it('uses the claim day if Safety is still ahead, otherwise starts tomorrow', () => {
    expect(createMissionPowerReward('vetoSafety', 6, 'nominations')).toMatchObject({
      activeFromDay: 6,
      activeUntilDay: 7,
    })
    expect(createMissionPowerReward('vetoSafety', 6, 'social_2')).toMatchObject({
      activeFromDay: 7,
      activeUntilDay: 8,
    })
  })
  it('counts shock days against the deadline and spends the expired power', () => {
    const game = fixture()
    game.week = 8
    game.missionPowers = { shockDay: 8 }
    const store = setup(game)
    store.dispatch({ type: 'test/reconcile' })
    expect(store.getState().game.secretMission?.reward).toMatchObject({
      expired: true,
      consumed: true,
      eligible: false,
    })
  })
  it('preserves Overthrow at Final 4 but excludes Safety powers', () => {
    const game = fixture('overthrowLoh', 4)
    expect(getMissionPowerPool(game, true)).toContain('overthrowLoh')
    expect(getMissionPowerPool(game, true)).not.toContain('vetoSafety')
    expect(getMissionPowerPool(game, true)).not.toContain('coLoh')
  })
  it('expires an unclaimed offer after its availability day and next day', () => {
    const game = fixture()
    game.secretMission!.status = 'rewardPending'
    game.secretMission!.reward = undefined
    game.week = 8
    const store = setup(game)
    store.dispatch({ type: 'test/reconcile' })
    expect(store.getState().game.secretMission?.status).toBe('expired')
  })
  it('claims only a valid persisted box once and rejects stale or invalid indexes', () => {
    let game = fixture('resourceCache')
    game.secretMission!.status = 'rewardPending'
    game.secretMission!.reward = undefined
    game.secretMission!.rewardSet!.selectedIndex = undefined
    for (const index of [-1, 4, 0.5]) {
      game = gameReducer(game, actions.claimMissionBox({ missionId: 'mission-test', index }))
      expect(game.secretMission?.status).toBe('rewardPending')
    }
    game = gameReducer(game, actions.claimMissionBox({ missionId: 'mission-test', index: 2 }))
    expect(game.secretMission?.rewardSet?.selectedIndex).toBe(2)
    const again = gameReducer(
      game,
      actions.claimMissionBox({ missionId: 'mission-test', index: 0 })
    )
    expect(again.secretMission?.rewardSet?.selectedIndex).toBe(2)
  })
})

describe('staged Safety and earned-power decisions', () => {
  it('announces intention without changing the block, then cancels the save after confirmation', () => {
    const store = setup()
    store.dispatch(submitPovSaveTarget('ai3'))
    expect(store.getState().game.nomineeIds).toEqual(['ai3', 'ai4'])
    expect(store.getState().game.povProtectedIds).not.toContain('ai3')
    expect(store.getState().game.tvFeed[0].text).toContain('Player 3')
    const decision = store.getState().game.missionPowers!.decision!
    expect(decision.kind).toBe('vetoSafety')
    store.dispatch(answer(decision.id, true))
    expect(store.getState().game.nomineeIds).toEqual(['ai3', 'ai4'])
    expect(store.getState().game.missionPowers?.safetyIntent).toBeUndefined()
    expect(store.getState().game.secretMission?.reward?.consumed).toBe(true)
    expect(store.getState().social.energyBank.ai3).toBeUndefined()
  })
  it('declines Veto, commits the save once, and keeps the unused power', () => {
    const store = setup()
    store.dispatch(submitPovSaveTarget('ai3'))
    const id = store.getState().game.missionPowers!.decision!.id
    store.dispatch(answer(id, false))
    expect(store.getState().game.nomineeIds).not.toContain('ai3')
    expect(store.getState().social.energyBank.ai3).toBe(2)
    expect(store.getState().game.secretMission?.reward?.eligible).toBe(true)
    const snapshot = store.getState().game
    store.dispatch(answer(id, true))
    expect(store.getState().game).toEqual(snapshot)
  })
  it('restores the same pending Veto after a JSON save and reload', () => {
    const store = setup()
    store.dispatch(submitPovSaveTarget('ai3'))
    const snapshot = JSON.parse(JSON.stringify(store.getState().game)) as GameState
    const resumed = setup(snapshot)
    resumed.dispatch(hydrateGame(snapshot))
    expect(resumed.getState().game.missionPowers?.decision?.id).toBe(
      snapshot.missionPowers?.decision?.id
    )
    resumed.dispatch(answer(snapshot.missionPowers!.decision!.id, true))
    expect(resumed.getState().game.nomineeIds).toEqual(['ai3', 'ai4'])
  })
  it('offers no self-veto and lets Play commit the intended save', () => {
    const game = fixture()
    game.posWinnerId = 'human'
    const store = setup(game)
    store.dispatch(submitPovSaveTarget('ai3'))
    expect(store.getState().game.missionPowers?.decision).toBeUndefined()
    store.dispatch(advance())
    expect(store.getState().game.nomineeIds).not.toContain('ai3')
  })
  it('spends declined No Ambush and activates accepted protection only for backups', () => {
    for (const accept of [false, true]) {
      const store = setup(fixture('noAmbush'))
      store.dispatch(submitPovSaveTarget('ai3'))
      const id = store.getState().game.missionPowers!.decision!.id
      store.dispatch(answer(id, accept))
      expect(store.getState().game.secretMission?.reward?.consumed).toBe(true)
      expect(isMissionBackupProtected(store.getState().game, 'human')).toBe(accept)
      expect(isMissionOpeningProtected(store.getState().game, 'human')).toBe(false)
    }
  })
  it('gives Pick the Backup an optional use decision and rejects illegal targets', () => {
    const store = setup(fixture('pickBackup'))
    store.dispatch(submitPovSaveTarget('ai3'))
    store.dispatch(advance())
    const decision = store.getState().game.missionPowers!.decision!
    expect(decision.kind).toBe('pickBackup')
    store.dispatch(answer(decision.id, true))
    const id = store.getState().game.missionPowers!.decision!.id
    expect(id).not.toBe(decision.id)
    store.dispatch(answer(decision.id, false))
    expect(store.getState().game.missionPowers?.decision?.kind).toBe('backupTarget')
    for (const targetId of ['ai1', 'ai2', 'ai3', 'ai4'])
      store.dispatch(actions.selectMissionBackup({ id, targetId }))
    expect(store.getState().game.missionPowers?.decision?.kind).toBe('backupTarget')
    store.dispatch(actions.selectMissionBackup({ id, targetId: 'ai5' }))
    expect(store.getState().game.nomineeIds).toContain('ai5')
    expect(store.getState().game.missionPowers?.backupChooserId).toBe('human')
    expect(store.getState().game.secretMission?.reward?.consumed).toBe(true)
  })
})

function answer(id: string, accept: boolean) {
  return actions.answerMissionPowerDecision({ id, accept })
}

describe('leadership, opening shield, and economy', () => {
  it('protects the next opening ceremony but permits a later backup', () => {
    const game = fixture('nextNominationShield')
    game.phase = 'nominations'
    game.missionPowers!.openingShieldPending = true
    const shielded = gameReducer(game, actions.armMissionOpeningShield())
    expect(getEligibleNominationTargets(shielded, 'ai1').map((p) => p.id)).not.toContain('human')
    expect(getEligibleReplacementNominees(shielded).map((p) => p.id)).toContain('human')
  })
  it('moves automatic nomination to the next-worst eligible finisher', () => {
    const game = fixture('nextNominationShield')
    game.phase = 'nominations'
    game.missionPowers!.openingShieldPending = true
    game.lastHohCompFinisherId = 'human'
    const shielded = gameReducer(game, actions.armMissionOpeningShield())
    expect(shielded.lastHohCompFinisherId).not.toBe('human')
    expect(shielded.lastHohCompFinisherId).not.toBe('ai1')
  })
  it('transfers the crown without falsifying the AI competition win', () => {
    const game = fixture('overthrowLoh')
    game.phase = 'loh_results'
    game.players[1].stats!.lohWins = 1
    const store = setup(game)
    store.dispatch({ type: 'test/reconcile' })
    const decision = store.getState().game.missionPowers!.decision!
    store.dispatch(answer(decision.id, true))
    expect(store.getState().game.lohId).toBe('human')
    expect(store.getState().game.players[0].stats!.lohWins).toBe(0)
    expect(store.getState().game.players[1].stats!.lohWins).toBe(1)
  })
  it('consumes Overthrow when declined at its next eligible AI victory', () => {
    const game = fixture('overthrowLoh')
    game.phase = 'loh_results'
    const store = setup(game)
    store.dispatch({ type: 'test/reconcile' })
    store.dispatch(answer(store.getState().game.missionPowers!.decision!.id, false))
    expect(store.getState().game.lohId).toBe('ai1')
    expect(store.getState().game.secretMission?.reward?.consumed).toBe(true)
  })
  it('lets both co-leaders nominate and records both next-day exclusions', () => {
    const game = fixture('coLoh')
    game.phase = 'loh_results'
    const store = setup(game)
    store.dispatch({ type: 'test/reconcile' })
    store.dispatch(answer(store.getState().game.missionPowers!.decision!.id, true))
    expect(store.getState().game.coLohIds).toEqual(['ai1', 'human'])
    const tomorrow = { ...store.getState().game, week: 7, phase: 'loh_comp' as const }
    expect(getMissionOutgoingIds(tomorrow)).toEqual(expect.arrayContaining(['ai1', 'human']))
    tomorrow.democracia = { ...createInitialGameState().democracia!, active: true }
    expect(getMissionOutgoingIds(tomorrow)).toEqual([])
  })
  it('No Skip applies immediately when claimed during an existing human tenure', () => {
    const game = fixture('noSkip')
    game.lohId = 'human'
    game.secretMission!.status = 'rewardPending'
    game.secretMission!.reward = undefined
    game.secretMission!.rewardSet!.selectedIndex = undefined
    const claimed = gameReducer(
      game,
      actions.claimMissionBox({ missionId: 'mission-test', index: 0 })
    )
    expect(claimed.missionPowers?.noSkipDay).toBe(7)
    expect(
      getMissionOutgoingIds({
        ...claimed,
        week: 7,
        prevHohId: 'human',
        missionPowers: { ...claimed.missionPowers, outgoingLohIds: ['human'] },
      })
    ).not.toContain('human')
  })
  it('keeps already-used Store powers authoritative for the day', () => {
    const game = fixture()
    game.missionPowers!.storeUsedDay = 6
    expect(canUseMissionPower(game, 'vetoSafety')).toBe(false)
    const store = setup(game)
    store.dispatch(submitPovSaveTarget('ai3'))
    expect(store.getState().game.missionPowers?.decision).toBeUndefined()
  })
  it('pays cache once, respects caps, and resumes without another payout', () => {
    const store = setup(fixture('resourceCache'))
    store.dispatch({ type: 'test/reconcile' })
    const banks = store.getState().social
    store.dispatch({ type: 'test/reconcile' })
    expect(store.getState().social.energyBank.human).toBe(banks.energyBank.human)
    expect(store.getState().social.influenceBank.human).toBe(500)
    store.dispatch(
      grantSecretMissionResourceCache({ playerId: 'human', receiptId: 'mission-test' })
    )
    expect(store.getState().social.influenceBank.human).toBe(500)
  })
  it('locks current-season weekends from Day 6 and after the first weekend starts', () => {
    const game = fixture()
    game.firstRealWeekendStarted = true
    expect(gameReducer(game, setWeekendsEnabledForSeason(true)).weekendsEnabledForSeason).toBe(
      false
    )
  })
  it('privately reveals a real alliance, including all members, without joining it', () => {
    const store = setup(fixture('allianceReveal'))
    const domain = produce(createInitialRealityDomainState(), (draft) => {
      createRealityAlliance(draft, {
        id: 'others',
        founderIds: ['ai1'],
        memberIds: ['ai2', 'ai3', 'ai4'],
        purpose: 'Control votes',
        at: { day: 3, phase: 'social_1' },
      })
    })
    store.dispatch(commitRealityDomainUpdate({ domain }))
    const after = store.getState()
    expect(after.game.secretMission?.allianceReveal?.memberIds).toHaveLength(4)
    expect(after.social.reality.alliances.others.memberIds).not.toContain('human')
    expect(
      getRealityAllianceKnowledgeView(after.social.reality, 'others', 'human').fullMembershipKnown
    ).toBe(true)
    const fact = Object.values(after.social.reality.facts).find(
      (f) => f.sourceEventId === 'mission-alliance:mission-test'
    )!
    expect(fact.publicVisible).toBe(false)
    expect(fact.juryVisible).toBe(false)
    expect(after.game.tvFeed.some((e) => e.text.includes('others'))).toBe(false)
  })
})

describe('mode and priority regressions', () => {
  it('keeps only compatible Vox rewards and fills four hidden positions with repeats when needed', () => {
    const game = fixture()
    game.voxPopuli = { ...createInitialGameState().voxPopuli!, status: 'active' }
    game.weekendsEnabledAtSeasonStart = true
    expect(getMissionPowerPool(game, true)).toEqual([
      'noAmbush',
      'nextNominationShield',
      'vetoSafety',
      'allianceReveal',
    ])
    expect(drawMissionBoxes(getMissionPowerPool(game, false), 'vox')).toHaveLength(4)
  })
  it('does not offer anything while Cupid couples are active', () => {
    const game = fixture()
    game.cupidArrow = { ...createInitialGameState().cupidArrow!, status: 'active' }
    expect(getMissionPowerPool(game, true)).toEqual([])
  })
  it('prevents even zero-vote opening ties from nominating a shielded Vox player, but permits a later backup', () => {
    const activeIds = ['human', 'ai1', 'ai2', 'ai3', 'ai4', 'ai5']
    const opening = resolveVoxNominations({
      activeIds,
      immunityWinnerId: 'ai1',
      autoNomineeId: 'ai2',
      ballots: {},
      protectedIds: ['human'],
      ballotNomineeCount: 2,
      seed: 9,
    })
    expect(opening.nomineeIds).not.toContain('human')
    expect(
      resolveVoxReplacementNominees({
        activeIds,
        immunityWinnerId: 'ai1',
        currentNomineeIds: ['ai2'],
        protectedIds: [],
        nominationVoteCounts: { human: 4 },
        seed: 9,
      })
    ).toContain('human')
  })
  it('lets AI self-save intentions survive No Ambush without changing the locked save target', () => {
    const game = fixture('noAmbush')
    game.phase = 'pos_ceremony'
    game.awaitingPovSaveTarget = false
    game.nomineeIds = ['ai2', 'ai4']
    game.players[2].status = 'nominated+pos'
    const store = setup(game)
    store.dispatch(advance())
    expect(store.getState().game.nomineeIds).toContain('ai2')
    expect(store.getState().game.missionPowers?.safetyIntent?.targetId).toBe('ai2')
    store.dispatch(answer(store.getState().game.missionPowers!.decision!.id, true))
    store.dispatch(advance())
    expect(store.getState().game.nomineeIds).not.toContain('ai2')
    expect(store.getState().game.players.find((p) => p.id === 'ai2')?.status).toBe('pos')
    expect(getEligibleReplacementNominees(store.getState().game).map((p) => p.id)).not.toContain(
      'human'
    )
  })
  it('does not offer Co-LOH if the public automatic slot leaves too few spare candidates', () => {
    const game = fixture('coLoh', 5)
    game.phase = 'loh_results'
    game.publicModeEnabled = true
    const store = setup(game)
    store.dispatch({ type: 'test/reconcile' })
    expect(store.getState().game.missionPowers?.decision).toBeUndefined()
  })
  it('returns an unused armed Store power and interrupts an already pending mission choice', () => {
    const gameWithCrown = fixture('overthrowLoh')
    gameWithCrown.phase = 'loh_results'
    const store = setup(gameWithCrown)
    store.dispatch(createProfile({ name: 'Power owner', avatar: 'eye' }))
    expect(store.getState().game.missionPowers?.decision?.kind).toBe('overthrowLoh')
    store.dispatch(debugGrantEyeoleans({ grantId: 'mission-store-test', amount: 100000 }))
    const game = store.getState().game
    store.dispatch(
      purchaseEyeoleanStoreProduct({
        transactionId: 'mission-store-buy',
        productKey: 'extra_vote',
        gameId: game.gameId,
        season: game.season,
      })
    )
    store.dispatch(
      armEyeoleanStorePower({
        productKey: 'extra_vote',
        gameId: game.gameId,
        season: game.season,
        week: 6,
      })
    )
    const decision = store.getState().game.missionPowers!.decision!
    expect(decision.kind).toBe('storeConflict')
    store.dispatch(answer(decision.id, true))
    const profile = store
      .getState()
      .profiles.profiles.find((p) => p.id === store.getState().profiles.activeProfileId)!
    expect(profile.eyeoleanPowerReservations?.extra_vote).toBeUndefined()
    expect(profile.eyeoleanInventory?.extra_vote).toBe(1)
    expect(store.getState().game.missionPowers?.storeChoiceDay).toBe(6)
    expect(store.getState().game.missionPowers?.decision?.kind).toBe('overthrowLoh')
    store.dispatch(
      armEyeoleanStorePower({
        productKey: 'extra_vote',
        gameId: game.gameId,
        season: game.season,
        week: 6,
      })
    )
    expect(
      store
        .getState()
        .profiles.profiles.find((p) => p.id === store.getState().profiles.activeProfileId)
        ?.eyeoleanPowerReservations?.extra_vote
    ).toBeUndefined()
  })
  it('keeps Store priority when chosen and does not offer Veto on that day', () => {
    const game = fixture()
    game.missionPowers!.decision = { id: 'store-choice', kind: 'storeConflict' }
    const store = setup(game)
    store.dispatch(answer('store-choice', false))
    expect(canUseMissionPower(store.getState().game, 'vetoSafety')).toBe(false)
    store.dispatch(submitPovSaveTarget('ai3'))
    expect(store.getState().game.missionPowers?.decision).toBeUndefined()
  })
})

it('keeps No Skip for tomorrow when Democracia naturally permits a consecutive human win', () => {
  const game = fixture('noSkip')
  game.week = 7
  game.phase = 'loh_results'
  game.lohId = 'human'
  game.democracia = { ...createInitialGameState().democracia!, active: true }
  game.missionPowers = { noSkipPending: true, noSkipDay: 7 }
  const next = gameReducer(game, { type: 'test/electionResolved' })
  expect(next.missionPowers?.noSkipDay).toBe(8)
  expect(next.secretMission?.reward?.consumed).toBe(false)
})

it('honors both Co-LOH exclusions even if the scalar outgoing leader is no longer present', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const game = fixture('coLoh')
    game.week = 7
    game.phase = 'loh_comp'
    game.seed = seed
    game.lohId = null
    game.prevHohId = null
    game.awaitingPovSaveTarget = false
    game.missionPowers = {
      coLohBan: { day: 7, ids: ['human', 'ai1'] },
      outgoingLohIds: ['human', 'ai1'],
    }
    const result = gameReducer(game, advance())
    expect(result.lohId).toBeTruthy()
    expect(['human', 'ai1']).not.toContain(result.lohId)
  }
})

it('keeps the claimed reward and Store tradeoff receipt out of public broadcasts', () => {
  const game = fixture('noAmbush')
  game.secretMission!.status = 'rewardPending'
  game.secretMission!.reward = undefined
  game.secretMission!.rewardSet!.selectedIndex = undefined
  const claimed = gameReducer(
    game,
    actions.claimMissionBox({ missionId: 'mission-test', index: 0 })
  )
  expect(claimed.secretMission?.privateRewardMessages?.join(' ')).toContain('No Ambush')
  expect(claimed.tvFeed.some((event) => event.text.includes('No Ambush'))).toBe(false)
  const switched = gameReducer(claimed, actions.recordMissionStoreChoice({ day: 6, mission: true }))
  expect(switched.secretMission?.privateRewardMessages?.join(' ')).toContain(
    'returned to inventory'
  )
  expect(switched.tvFeed.some((event) => event.text.includes('returned to inventory'))).toBe(false)
})
