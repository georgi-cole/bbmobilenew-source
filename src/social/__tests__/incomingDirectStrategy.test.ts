import { configureStore } from '@reduxjs/toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialVoxPopuliState } from '../../features/twists/voxPopuli'
import gameReducer, {
  commitNominees,
  createInitialGameState,
  hydrateGame,
  submitHumanVote,
} from '../../store/gameSlice'
import type { GameState, PlayerStatus } from '../../types'
import { getIncomingActionContent } from '../incomingActionContentBank'
import {
  createIncomingInteraction,
  normalizeIncomingInteractionContract,
} from '../incomingInteractionFactory'
import { getIncomingInteractionResponseOptions } from '../incomingInteractionPresentation'
import { getIncomingActionOutcome } from '../incomingOutcomeMatrix'
import {
  isIncomingInteractionInvalidated,
  isScheduledIncomingInteractionInvalidated,
  type InteractionValidityGameState,
} from '../incomingInteractionValidity'
import { respondToIncomingInteraction } from '../incomingInteractions'
import * as DramaPolicy from '../dramaAIPolicy'
import { setStore, start, stop } from '../socialAIDriver'
import { socialConfig } from '../socialConfig'
import { initManeuvers } from '../SocialManeuvers'
import { socialMiddleware } from '../socialMiddleware'
import * as SocialPolicy from '../SocialPolicy'
import socialReducer, {
  hydrateSocial,
  setEnergyBankEntry,
  setInfluenceBankEntry,
  setInfoBankEntry,
} from '../socialSlice'
import type { IncomingInteraction, ScheduledIncomingInteraction, SocialState } from '../types'

const day = 4
const roster = ['human', 'sender', 'subject', 'other', 'loh', 'pos', 'partner'].map((id) => ({
  id,
  status: 'active',
  isUser: id === 'human',
}))

const routes = [
  {
    action: 'pitch_target',
    scenario: 'direct_nomination_pitch',
    label: 'Back the nomination recommendation',
    game: { phase: 'social_1', lohId: 'human' },
    subject: 'subject',
    wrongRole: { lohId: 'loh' },
  },
  {
    action: 'ask_loh_target',
    scenario: 'loh_target_inquiry',
    label: 'Discuss what I’m weighing',
    game: { phase: 'social_1', lohId: 'human' },
    wrongRole: { lohId: 'sender' },
  },
  {
    action: 'ask_nomination_advice',
    scenario: 'nomination_advice_inquiry',
    label: 'Talk through possible nominees',
    game: { phase: 'social_1', lohId: 'sender' },
    wrongRole: { lohId: 'human' },
  },
  {
    action: 'suggest_replacement',
    scenario: 'direct_replacement_pitch',
    label: 'Back that choice as a backup',
    game: { phase: 'pos_results', posWinnerId: 'human', nomineeIds: ['other', 'partner'] },
    subject: 'subject',
    wrongRole: { posWinnerId: 'pos' },
  },
  {
    action: 'rally_votes_against',
    scenario: 'direct_vote_pitch',
    label: 'Back their case for eviction',
    game: { phase: 'social_2', nomineeIds: ['subject', 'sender'] },
    subject: 'subject',
    wrongRole: { lohId: 'human' },
  },
  {
    action: 'vote_rally',
    scenario: 'vote_rally_warning',
    label: 'Ask how much support they have',
    game: { phase: 'social_2', nomineeIds: ['human', 'other'] },
    wrongRole: { nomineeIds: ['subject', 'other'] },
  },
] satisfies {
  action: string
  scenario: string
  label: string
  game: Partial<GameState> & Pick<GameState, 'phase'>
  subject?: string
  wrongRole: Partial<InteractionValidityGameState>
}[]

function makeCard(action: string, phase: string, subject?: string): IncomingInteraction {
  const content = getIncomingActionContent(action)!
  return createIncomingInteraction({
    id: `incoming-${action}`,
    fromId: 'sender',
    type: content.interactionType,
    text: content.openings[0],
    week: day,
    phase,
    mode: 'normal',
    payload: {
      originActionId: action,
      source: 'background_social',
      scenarioKey: content.scenarioKey,
      ...(subject ? { subjectId: subject } : {}),
    },
  })
}

function oldRoute(card: IncomingInteraction): IncomingInteraction {
  const content = getIncomingActionContent(card.payload?.originActionId as string)!
  return {
    ...card,
    deadline: { day: day + 1, phase: 'eviction_results', policy: 'AUTO_IGNORE' },
    payload: { ...card.payload, scenarioKey: content.legacyScenarioKey },
  }
}

function makeGame(overrides: InteractionValidityGameState): InteractionValidityGameState {
  return { week: day, players: roster, lohId: 'loh', posWinnerId: 'pos', ...overrides }
}

describe('direct strategy inbox eligibility', () => {
  it.each(routes)('checks the live role and format for $action', (route) => {
    const card = makeCard(route.action, route.game.phase, route.subject)
    const game = makeGame(route.game)
    expect(card.payload?.scenarioKey).toBe(route.scenario)
    expect(isIncomingInteractionInvalidated(card, game)).toBe(false)
    expect(isIncomingInteractionInvalidated(card, { ...game, ...route.wrongRole })).toBe(true)
    expect(isIncomingInteractionInvalidated(card, { ...game, phase: 'eviction_results' })).toBe(
      true
    )
    expect(isIncomingInteractionInvalidated(card, { ...game, week: day + 1 })).toBe(true)
    expect(isIncomingInteractionInvalidated(card, { ...game, mode: 'survival' })).toBe(true)
    expect(
      isIncomingInteractionInvalidated(card, { ...game, voxPopuli: { status: 'active' } })
    ).toBe(true)
  })

  it.each(routes)(
    'upgrades pending $action saves and retains alliance scenes and history',
    (route) => {
      const saved = oldRoute(makeCard(route.action, route.game.phase, route.subject))
      const migrated = normalizeIncomingInteractionContract(saved)
      expect(migrated).toMatchObject({
        id: saved.id,
        text: saved.text,
        deadline: { day },
        resolved: false,
        requiresResponse: false,
        payload: { scenarioKey: route.scenario },
      })
      const alliance = { ...saved, payload: { ...saved.payload, allianceId: 'existing-alliance' } }
      expect(normalizeIncomingInteractionContract(alliance).payload?.scenarioKey).toBe(
        saved.payload?.scenarioKey
      )
      const history = { ...saved, resolved: true, reactionText: 'Previous reply.' }
      expect(normalizeIncomingInteractionContract(history)).toMatchObject(history)
    }
  )

  it('keeps nomination advice open only for a live slot and an eligible nominee', () => {
    const card = makeCard('pitch_target', 'social_1', 'subject')
    const game = makeGame({ phase: 'social_1', lohId: 'human' })
    const valid = (overrides: InteractionValidityGameState) =>
      !isIncomingInteractionInvalidated(card, { ...game, ...overrides })

    expect(valid({ phase: 'nomination_results', awaitingNominations: true })).toBe(true)
    expect(valid({ phase: 'nomination_results', awaitingNominations: false })).toBe(false)
    expect(valid({ coLohIds: ['human', 'loh'], coLohNomineeByCoLohId: { human: 'other' } })).toBe(
      false
    )
    expect(valid({ coLohIds: ['human', 'loh'], coLohNomineeByCoLohId: { loh: 'other' } })).toBe(
      true
    )
    expect(valid({ nomineeIds: ['subject'] })).toBe(false)
    expect(
      valid({
        storeNominationProtections: [{ week: day, targetId: 'subject', productKey: 'immunity' }],
      })
    ).toBe(false)
    expect(valid({ publicModeEnabled: true, lastHohCompFinisherId: 'subject' })).toBe(false)
    expect(
      valid({
        publicModeEnabled: true,
        lastHohCompFinisherId: 'subject',
        doubleEviction: { weekActive: true },
      })
    ).toBe(true)
  })

  it('follows replacement authority, the protected players and completed picks', () => {
    const card = makeCard('suggest_replacement', 'pos_results', 'subject')
    const game = makeGame({ phase: 'pos_results', lohId: 'human', nomineeIds: ['other'] })
    const valid = (overrides: InteractionValidityGameState) =>
      !isIncomingInteractionInvalidated(card, { ...game, ...overrides })

    expect(valid({})).toBe(true)
    expect(valid({ phase: 'pos_ceremony_results', replacementNeeded: false })).toBe(false)
    expect(valid({ phase: 'pos_ceremony_results', replacementNeeded: true })).toBe(true)
    expect(
      valid({ phase: 'pos_ceremony_results', replacementNeeded: true, povSavedId: 'subject' })
    ).toBe(false)
    expect(
      valid({
        phase: 'pos_ceremony_results',
        replacementNeeded: true,
        coLohIds: ['human', 'loh'],
        coLohReplacementOwnerId: 'loh',
      })
    ).toBe(false)
    expect(
      valid({
        phase: 'pos_ceremony_results',
        lohId: 'loh',
        missionPowers: { backupChooserId: 'human' },
      })
    ).toBe(false)
    const detox: InteractionValidityGameState = {
      phase: 'pos_ceremony_results',
      posWinnerId: 'human',
      lohId: 'subject',
      nomineeIds: [],
      specialVeto: { activeType: 'coup', awaitingCoupReplacement1: true },
    }
    expect(valid(detox)).toBe(true)
    expect(
      valid({
        ...detox,
        specialVeto: {
          activeType: 'coup',
          awaitingCoupReplacement2: true,
          coupReplacement1Id: 'subject',
        },
      })
    ).toBe(false)
  })

  it('separates scheduling a Classic house-vote pitch from delivering it to a locked ballot', () => {
    const card = makeCard('rally_votes_against', 'social_2', 'subject')
    const game = makeGame({
      phase: 'social_2',
      publicModeEnabled: true,
      nomineeIds: ['subject', 'other'],
      awaitingHumanVote: false,
    })
    const entry: ScheduledIncomingInteraction = {
      interaction: card,
      scheduledAt: 1,
      scheduledForDay: day,
      scheduledForPhase: 'live_vote',
      priority: 'high',
    }
    expect(isScheduledIncomingInteractionInvalidated(entry, game)).toBe(false)
    expect(
      isScheduledIncomingInteractionInvalidated({ ...entry, scheduledForDay: day + 1 }, game)
    ).toBe(true)
    const live = { ...game, phase: 'live_vote', awaitingHumanVote: true }
    expect(isScheduledIncomingInteractionInvalidated(entry, live)).toBe(false)
    expect(
      isScheduledIncomingInteractionInvalidated(entry, { ...live, awaitingHumanVote: false })
    ).toBe(true)
    expect(
      isScheduledIncomingInteractionInvalidated(entry, { ...live, votes: { human__dv2: 'other' } })
    ).toBe(true)
    expect(
      isScheduledIncomingInteractionInvalidated(entry, {
        ...game,
        batteryLowVoteEffects: { human: { type: 'skipVote', cyclesRemaining: 1 } },
      })
    ).toBe(true)
    expect(
      isScheduledIncomingInteractionInvalidated(entry, { ...game, nomineeIds: ['other'] })
    ).toBe(true)
    expect(
      isScheduledIncomingInteractionInvalidated(entry, { ...game, replacementNeeded: true })
    ).toBe(true)
  })

  it('uses Cupid’s shared offices, protected pairs and joint ballot', () => {
    const cupidArrow = {
      status: 'active' as const,
      pairs: [
        { memberIds: ['human', 'partner'] as [string, string] },
        { memberIds: ['subject', 'other'] as [string, string] },
      ],
    }
    const nomination = makeCard('pitch_target', 'social_1', 'subject')
    const before = makeGame({ phase: 'social_1', lohId: 'partner', cupidArrow })
    expect(isIncomingInteractionInvalidated(nomination, before)).toBe(false)
    expect(
      isIncomingInteractionInvalidated(nomination, {
        ...before,
        storeNominationProtections: [{ week: day, targetId: 'other', productKey: 'protection' }],
      })
    ).toBe(true)
    const replacement = makeCard('suggest_replacement', 'pos_results', 'subject')
    expect(
      isIncomingInteractionInvalidated(replacement, {
        ...before,
        phase: 'pos_results',
        lohId: 'loh',
        posWinnerId: 'partner',
        nomineeIds: ['sender'],
      })
    ).toBe(false)
    const ballot = makeCard('rally_votes_against', 'social_2', 'subject')
    const live = {
      ...before,
      phase: 'live_vote',
      nomineeIds: ['subject', 'other'],
      awaitingHumanVote: true,
    }
    expect(isIncomingInteractionInvalidated(ballot, live)).toBe(true)
    expect(isIncomingInteractionInvalidated(ballot, { ...live, lohId: 'loh' })).toBe(false)
    expect(
      isIncomingInteractionInvalidated(ballot, {
        ...live,
        lohId: 'loh',
        votes: { partner: 'subject' },
      })
    ).toBe(true)
  })

  it('keeps Safety consultations and regular conversations available during Vox', () => {
    const game = makeGame({
      phase: 'pos_results',
      posWinnerId: 'human',
      nomineeIds: ['subject', 'other'],
      voxPopuli: { status: 'active' },
    })
    expect(isIncomingInteractionInvalidated(makeCard('ask_safety_plan', 'pos_results'), game)).toBe(
      false
    )
    expect(isIncomingInteractionInvalidated(makeCard('compliment', 'pos_results'), game)).toBe(
      false
    )
  })
})

function makeLiveGame(overrides: Partial<GameState>): GameState {
  const game = createInitialGameState({ seed: 48 })
  const players = roster.map((player, index) => ({
    ...game.players[index],
    ...player,
    aiGameIdentity: undefined,
    name: player.id === 'subject' ? 'Alex' : player.id,
    status: (overrides.lohId === player.id
      ? 'loh'
      : overrides.posWinnerId === player.id
        ? 'pos'
        : overrides.nomineeIds?.includes(player.id)
          ? 'nominated'
          : 'active') as PlayerStatus,
  }))
  return {
    ...game,
    mode: 'classic',
    dramaSocialMode: true,
    week: day,
    lohId: 'loh',
    posWinnerId: 'pos',
    players,
    voxPopuli: createInitialVoxPopuliState(null),
    ...overrides,
  }
}

function makeStore(game: GameState) {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState: { game },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
}

function runBackgroundAction(
  store: ReturnType<typeof makeStore>,
  action: string,
  subject?: string
): IncomingInteraction | undefined {
  vi.useFakeTimers()
  initManeuvers(store)
  setStore(store)
  store.dispatch(setEnergyBankEntry({ playerId: 'sender', value: 10 }))
  store.dispatch(setInfluenceBankEntry({ playerId: 'sender', value: 1_000 }))
  store.dispatch(setInfoBankEntry({ playerId: 'sender', value: 1_000 }))
  vi.spyOn(DramaPolicy, 'chooseUtilityDramaAIMove').mockReturnValue(null)
  vi.spyOn(SocialPolicy, 'chooseActionFor').mockReturnValue(action)
  vi.spyOn(SocialPolicy, 'chooseTargetsFor').mockReturnValue(
    subject ? ['human', subject] : ['human']
  )
  start()
  vi.advanceTimersByTime(socialConfig.tickIntervalMs)
  stop()
  return store
    .getState()
    .social.incomingInteractions.find((item) => item.payload?.originActionId === action)
}

function restoreSocial(store: ReturnType<typeof makeStore>, saved: SocialState) {
  store.dispatch(hydrateSocial(JSON.parse(JSON.stringify(saved)) as SocialState))
}

describe('direct strategy inbox through the AI driver and saved-game lifecycle', () => {
  afterEach(() => {
    stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(routes)('delivers $action without an alliance and applies its reply once', (route) => {
    const store = makeStore(makeLiveGame(route.game))
    const incoming = runBackgroundAction(store, route.action, route.subject)
    expect(incoming?.payload?.scenarioKey).toBe(route.scenario)
    expect(incoming?.payload?.allianceId).toBeUndefined()
    expect(incoming?.text).not.toMatch(/\{\w+\}/)
    if (route.subject) expect(incoming?.text).toContain('Alex')
    const card = incoming!
    const options = getIncomingInteractionResponseOptions(card.type, card)
    const [choice] = options
    expect(choice.label).toBe(route.label)
    expect(choice.createsCommitment).not.toBe(true)
    const outcomes = options.map(({ label }) =>
      getIncomingActionOutcome({
        scenarioKey: route.scenario,
        responseLabel: label,
        fromName: 'sender',
        subjectName: route.subject ? 'Alex' : undefined,
        phase: route.game.phase,
        senderIsNominated: route.game.nomineeIds?.includes('sender') ?? false,
      })
    )
    expect(outcomes.every(Boolean)).toBe(true)
    expect(new Set(outcomes).size).toBe(options.length)

    const before = store.getState()
    const link = card.payload?.realityInteractionId as string
    expect(before.social.reality.interactions[link]?.status).toBe('AWAITING_HUMAN')
    const reply = respondToIncomingInteraction({ interactionId: card.id, choiceId: choice.id })
    store.dispatch(reply as never)
    store.dispatch(reply as never)
    const { social, game } = store.getState()
    const resolved = social.incomingInteractions.find(({ id }) => id === card.id)
    expect(resolved).toMatchObject({ resolved: true, resolvedLabel: route.label })
    expect(resolved?.reactionText).toBeTruthy()
    expect(resolved?.outcomeText).toBe(outcomes[0])
    expect(social.reality.interactions[link].status).toBe('RESOLVED')
    expect(social.reality.events.filter((event) => event.interactionId === link)).toHaveLength(1)
    expect(social.relationships.sender?.human).toBeDefined()
    expect(game.nomineeIds).toEqual(before.game.nomineeIds)
    expect(game.votes).toEqual(before.game.votes)
  })

  it('closes an open nomination pitch on the same-phase slate commit', () => {
    const store = makeStore(makeLiveGame({ phase: 'social_1', lohId: 'human' }))
    const incoming = runBackgroundAction(store, 'pitch_target', 'subject')!
    const live = store.getState().game
    store.dispatch(hydrateGame({ ...live, phase: 'nomination_results', awaitingNominations: true }))
    expect(store.getState().social.incomingInteractions[0].resolved).toBe(false)
    store.dispatch(commitNominees(['subject', 'other']))
    expect(store.getState().game.nomineeIds).toEqual(['subject', 'other'])
    expect(store.getState().social.incomingInteractions[0]).toMatchObject({
      id: incoming.id,
      resolved: true,
      resolvedWith: 'dismiss',
    })
  })

  it('restores a legacy vote pitch with its scene link and closes it when the actual ballot locks', () => {
    const first = makeStore(makeLiveGame({ phase: 'social_2', nomineeIds: ['subject', 'other'] }))
    const incoming = runBackgroundAction(first, 'rally_votes_against', 'subject')!
    const firstState = first.getState()
    const legacy = oldRoute(incoming)
    delete legacy.payload?.nominationBlockIds
    const saved = { ...firstState.social, incomingInteractions: [legacy] }
    const game = { ...firstState.game, phase: 'live_vote' as const, awaitingHumanVote: true }
    const resumed = makeStore(game)
    restoreSocial(resumed, saved)
    const [restored] = resumed.getState().social.incomingInteractions
    expect(restored).toMatchObject({
      id: incoming.id,
      resolved: false,
      deadline: { day, phase: 'live_vote' },
      payload: {
        scenarioKey: 'direct_vote_pitch',
        realityInteractionId: incoming.payload?.realityInteractionId,
      },
    })
    resumed.dispatch(submitHumanVote('other'))
    expect(resumed.getState().game.votes?.human).toBe('other')
    expect(resumed.getState().social.incomingInteractions[0].resolvedWith).toBe('dismiss')

    const stale = makeStore({ ...game, nomineeIds: ['subject', 'partner'] })
    restoreSocial(stale, saved)
    const { social } = stale.getState()
    expect(social.incomingInteractions[0].resolvedWith).toBe('dismiss')
    expect(
      social.reality.interactions[incoming.payload?.realityInteractionId as string].status
    ).toBe('INVALIDATED')
    expect(social.relationships.sender?.human).toEqual(saved.relationships.sender?.human)

    const answered = makeStore(game)
    restoreSocial(answered, saved)
    const [choice] = getIncomingInteractionResponseOptions(restored.type, restored)
    answered.dispatch(
      respondToIncomingInteraction({ interactionId: restored.id, choiceId: choice.id }) as never
    )
    expect(answered.getState().social.incomingInteractions[0]).toMatchObject({
      resolved: true,
      resolvedLabel: 'Back their case for eviction',
    })
    expect(
      answered.getState().social.reality.interactions[
        incoming.payload?.realityInteractionId as string
      ].status
    ).toBe('RESOLVED')
  })

  it('keeps Cupid’s vote pitch open until the joint ballot is cast', () => {
    const game = makeLiveGame({ phase: 'social_2', nomineeIds: ['subject', 'other'] })
    game.cupidArrow = {
      ...game.cupidArrow!,
      status: 'active',
      pairs: [
        { id: 'human-pair', memberIds: ['human', 'partner'], color: 'pink' },
        { id: 'block-pair', memberIds: ['subject', 'other'], color: 'red' },
      ],
    }
    const store = makeStore(game)
    const incoming = runBackgroundAction(store, 'rally_votes_against', 'subject')
    expect(incoming?.payload?.scenarioKey).toBe('direct_vote_pitch')
    store.dispatch(hydrateGame({ ...game, phase: 'live_vote', awaitingHumanVote: true }))
    expect(store.getState().social.incomingInteractions[0].resolved).toBe(false)
    store.dispatch(submitHumanVote('other'))
    expect(store.getState().game.votes).toMatchObject({ human: 'other', partner: 'other' })
    expect(store.getState().social.incomingInteractions[0].resolvedWith).toBe('dismiss')
  })

  it('blocks private vote pressure in active Vox while ordinary social contact still reaches the queue', () => {
    const game = makeLiveGame({
      phase: 'social_2',
      nomineeIds: ['human', 'other'],
      voxPopuli: { ...createInitialVoxPopuliState(null), status: 'active' },
    })
    const store = makeStore(game)
    runBackgroundAction(store, 'vote_rally')
    expect(store.getState().social.scheduledIncomingInteractions).toHaveLength(0)
    expect(store.getState().social.incomingInteractions).toHaveLength(0)
    expect(Object.values(store.getState().social.reality.interactions)).toHaveLength(0)

    runBackgroundAction(store, 'compliment')
    expect(
      store.getState().social.scheduledIncomingInteractions[0]?.interaction.payload
    ).toMatchObject({
      originActionId: 'compliment',
    })
  })
})
