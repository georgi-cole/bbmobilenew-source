import { SocialEngine } from '../SocialEngine'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer from '../../store/gameSlice'
import settingsReducer from '../../store/settingsSlice'
import vipReducer from '../../store/vipSlice'
import socialReducer from '../socialSlice'
import type { AppDispatch, RootState } from '../../store/store'
import {
  formatAllianceVoteReactions,
  getAllianceVoteSway,
  swayAllianceVote,
} from '../allianceVoteSway'
import { createRealityAlliance, removeRealityAllianceMember } from '../reality/relationshipForms'
import { createInitialRealityDomainState } from '../reality/state'
import { getRealityRelationship } from '../reality/relationships'
import { createInitialRealitySimulationState } from '../realitySimulation'
function fixture(memberIds = ['human', 'ally', 'loh']) {
  const initial = gameReducer(undefined, { type: '@@test' })
  const reality = createInitialRealityDomainState()
  const alliance = createRealityAlliance(reality, {
    id: 'team',
    kind: 'GROUP',
    founderIds: memberIds.length < 3 ? [...memberIds, 'spare'] : memberIds,
    memberIds: [],
    purpose: 'Mutual protection',
    at: { day: 4, phase: 'social_1' },
  })
  alliance.status = 'ACTIVE'
  if (memberIds.length < 3)
    removeRealityAllianceMember(reality, {
      allianceId: alliance.id,
      memberId: 'spare',
      actorId: 'spare',
      kind: 'ELIMINATED',
      at: { day: 4, phase: 'social_1' },
    })
  const state = {
    game: {
      ...initial,
      mode: 'classic',
      week: 4,
      phase: 'pos_results',
      lohId: 'loh',
      posWinnerId: 'nominee-a',
      nomineeIds: ['nominee-a', 'nominee-b'],
      players: ['human', 'ally', 'loh', 'nominee-a', 'nominee-b', 'outside', 'spare'].map((id) => ({
        id,
        name: id,
        isUser: id === 'human',
        status: id === 'loh' ? 'loh' : 'active',
        stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
      })),
    },
    social: { ...socialReducer(undefined, { type: '@@test' }), reality },
  } as unknown as RootState
  return { state, reality, alliance }
}

function setup(double = false, simulationSeed = 0) {
  const { state, alliance } = fixture(['human', 'ally', 'loh'])
  Object.assign(state.game, {
    status: 'active',
    seed: 17,
    gameId: 'alliance-vote-sway-test',
    phase: 'social_2',
    lohId: 'human',
    dramaSocialMode: true,
    publicModeEnabled: false,
    replacementNeeded: false,
    weekendInterlude: null,
    doubleEviction: { ...state.game.doubleEviction, weekActive: double },
  })
  for (const player of state.game.players)
    player.status =
      player.id === 'human'
        ? 'loh'
        : state.game.nomineeIds.includes(player.id)
          ? 'nominated'
          : 'active'
  for (const id of alliance.memberIds) {
    alliance.memberCommitment[id] = 1
    for (const other of alliance.memberIds.filter((x) => x !== id))
      Object.assign(getRealityRelationship(state.social.reality, id, other), {
        trust: 95,
        loyalty: 95,
        warmth: 80,
      })
  }
  state.social.energyBank = { ...state.social.energyBank, human: 20 }
  state.social.influenceBank = { ...state.social.influenceBank, human: 1000 }
  state.social.infoBank = { ...state.social.infoBank, human: 1000 }
  state.social.realitySimulation = createInitialRealitySimulationState(simulationSeed)
  const settings = structuredClone(settingsReducer(undefined, { type: '@@test' }))
  settings.gameUX.dramaMode = true
  settings.gameUX.dramaModeAdminOverride = true
  const store = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      settings: settingsReducer,
      vip: vipReducer,
    },
    preloadedState: { game: state.game, social: state.social, settings },
  })
  SocialEngine.init(store as unknown as Parameters<typeof SocialEngine.init>[0])
  return store
}
const stateOf = (store: ReturnType<typeof setup>) => store.getState() as unknown as RootState

describe('alliance-wide vote sway', () => {
  it('approaches all eligible allies and charges the quoted aggregate pitch costs', () => {
    const store = setup()
    const before = stateOf(store)
    const quote = getAllianceVoteSway(before, 'team', ['nominee-a'])
    expect(quote.eligible).toBe(true)
    expect(quote.voters.map((p) => p.id)).toEqual(['ally', 'loh'])
    expect((store.dispatch as AppDispatch)(swayAllianceVote('team', ['nominee-a'])).success).toBe(
      true
    )
    const receipts = stateOf(store).social.sessionLogs.filter(
      (entry) => entry.actionId === 'rally_votes_against'
    )
    expect(receipts.map((entry) => entry.targetId).sort()).toEqual(['ally', 'loh'])
    expect(receipts.reduce((total, entry) => total + (entry.costs?.energy ?? 0), 0)).toBe(
      quote.costs.energy
    )
    expect(receipts.reduce((total, entry) => total + (entry.costs?.influence ?? 0), 0)).toBe(
      quote.costs.influence
    )
    expect(stateOf(store).social.energyBank.human).toBe(
      before.social.energyBank.human - quote.costs.energy
    )
    expect(stateOf(store).social.influenceBank.human).toBe(
      before.social.influenceBank.human -
        quote.costs.influence +
        receipts.reduce((total, entry) => total + (entry.yieldsApplied?.influence ?? 0), 0)
    )
  })
  it('records an ally counteroffer penalty separately from the quoted request costs', () => {
    const store = setup(false, 1)
    const before = stateOf(store)
    const quote = getAllianceVoteSway(before, 'team', ['nominee-a'])
    ;(store.dispatch as AppDispatch)(swayAllianceVote('team', ['nominee-a']))
    const receipts = stateOf(store).social.sessionLogs.filter(
      (entry) => entry.actionId === 'rally_votes_against'
    )
    expect(receipts.map((entry) => entry.targetId).sort()).toEqual(['ally', 'loh'])
    expect(receipts.some((entry) => entry.targetReactions?.[entry.targetId] === 'COUNTER')).toBe(
      true
    )
    expect(receipts.reduce((total, entry) => total + (entry.costs?.influence ?? 0), 0)).toBe(
      quote.costs.influence
    )
    expect(
      receipts.reduce((total, entry) => total + (entry.yieldsApplied?.influence ?? 0), 0)
    ).toBe(-3)
    expect(stateOf(store).social.influenceBank.human).toBe(
      before.social.influenceBank.human - quote.costs.influence - 3
    )
  })
  it('rejects illegal or stale selections without spending', () => {
    const store = setup()
    for (const ids of [[], ['missing'], ['nominee-a', 'nominee-b']]) {
      const before = stateOf(store).social
      expect((store.dispatch as AppDispatch)(swayAllianceVote('team', ids)).success).toBe(false)
      expect(stateOf(store).social).toBe(before)
    }
    const state = structuredClone(stateOf(store))
    state.game.replacementNeeded = true
    expect(getAllianceVoteSway(state, 'team', ['nominee-a']).eligible).toBe(false)
    state.game.replacementNeeded = false
    state.game.publicModeEnabled = true
    expect(getAllianceVoteSway(state, 'team', ['nominee-a']).eligible).toBe(true)
    state.game.voxPopuli = { ...state.game.voxPopuli!, status: 'active' }
    expect(getAllianceVoteSway(state, 'team', ['nominee-a']).groups).toEqual([])
  })
  it('retains both accepted targets in double elimination', () => {
    const store = setup(true)
    expect(getAllianceVoteSway(stateOf(store), 'team', ['nominee-a', 'nominee-b']).eligible).toBe(
      true
    )
    expect(
      (store.dispatch as AppDispatch)(swayAllianceVote('team', ['nominee-a', 'nominee-b'])).success
    ).toBe(true)
    expect(stateOf(store).social.reality.alliances.team.currentTargetIds).toEqual([
      'nominee-a',
      'nominee-b',
    ])
  })
  it('excludes nominated allies and checks the total cost before any pitch', () => {
    const state = structuredClone(stateOf(setup()))
    state.game.nomineeIds.push('ally')
    expect(getAllianceVoteSway(state, 'team', ['nominee-a']).voters.map((p) => p.id)).toEqual([
      'loh',
    ])
    state.social.energyBank.human = 0
    expect(getAllianceVoteSway(state, 'team', ['nominee-a']).eligible).toBe(false)
  })
})

describe('group vote result wording', () => {
  const nominees = [
    { id: 'mimi', name: 'Mimi' },
    { id: 'blue', name: 'Blue' },
  ]
  it('describes matching reactions once, instead of repeating the same sentence per ally', () => {
    expect(
      formatAllianceVoteReactions(
        [
          { voterId: 'kian', name: 'Kian', subjectId: 'mimi', reaction: 'ACCEPT' },
          { voterId: 'nova', name: 'Nova', subjectId: 'mimi', reaction: 'ACCEPT' },
        ],
        nominees
      )
    ).toBe('Kian and Nova said they would back the plan.')
  })
  it('keeps differing responses distinct without revealing false loyalty', () => {
    expect(
      formatAllianceVoteReactions(
        [
          { voterId: 'kian', name: 'Kian', subjectId: 'mimi', reaction: 'LIE' },
          { voterId: 'nova', name: 'Nova', subjectId: 'mimi', reaction: 'COUNTER' },
        ],
        nominees
      )
    ).toBe('Kian said they would back the plan. Nova wanted different terms.')
  })
  it('summarizes a shared double-elimination response once and explains partial support', () => {
    expect(
      formatAllianceVoteReactions(
        [
          { voterId: 'kian', name: 'Kian', subjectId: 'mimi', reaction: 'ACCEPT' },
          { voterId: 'kian', name: 'Kian', subjectId: 'blue', reaction: 'ACCEPT' },
          { voterId: 'nova', name: 'Nova', subjectId: 'mimi', reaction: 'ACCEPT' },
          { voterId: 'nova', name: 'Nova', subjectId: 'blue', reaction: 'REJECT' },
        ],
        nominees
      )
    ).toBe(
      'Kian said they would back the plan. Nova said they would target Mimi and opposed targeting Blue.'
    )
  })
})
