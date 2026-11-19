import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  claimActiveBroadcastEvent,
  consumeBroadcastEvent,
  getLohDialogueCandidateIds,
  getNominationTargetScore,
  hydrateGame,
  syncPhaseBroadcasts,
} from '../../store/gameSlice'
import { selectCurrentBroadcastEvents } from '../../broadcasting/fauxTvPresentation'
import { withLohNominationPlanning } from '../../store/lohNominationPlanning'
import settingsReducer from '../../store/settingsSlice'
import type { RootState } from '../../store/store'
import type { GameState, Player } from '../../types'
import { executeAction, initManeuvers } from '../SocialManeuvers'
import { getLohOpeningWarningFollowUp } from '../lohNominationPlanCopy'
import { buildLohConsultationSummary } from '../reality/humanFlow'
import socialReducer from '../socialSlice'

const reducer = withLohNominationPlanning(gameReducer, getNominationTargetScore)
const init = { type: 'test/init' }
const player = (id: string, name: string, status: Player['status'] = 'active', isUser = false) =>
  ({
    id,
    name,
    status,
    isUser,
    avatar: '',
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
  }) as Player

function safetyGame(): GameState {
  return {
    ...reducer(undefined, init),
    status: 'active',
    mode: 'classic',
    gameId: 'ash-remy',
    week: 6,
    phase: 'pos_results',
    lohId: 'ash',
    posWinnerId: 'remy',
    nomineeIds: ['remy', 'mimi'],
    players: [
      player('lance', 'Lance', 'active', true),
      player('ash', 'Ash', 'loh'),
      player('aria', 'Aria'),
      player('remy', 'Remy', 'nominated+pos'),
      player('mimi', 'Mimi', 'nominated'),
      player('bea', 'Bea'),
    ],
    tvFeed: [],
    broadcastQueue: [],
    lohNominationPlan: {
      week: 6,
      lohId: 'ash',
      targetId: 'bea',
      backupTargetId: 'aria',
      strategy: 'backdoor',
      initialNomineeIds: ['remy', 'mimi'],
      pawnIds: ['remy', 'mimi'],
      status: 'initial_block_set',
      selectionBasis: 'strategy',
      targetScore: 10,
      backdoorChance: 0.4,
    },
    lohSocialPlan: {
      week: 6,
      lohId: 'ash',
      currentTargetId: 'remy',
      backupTargetId: 'bea',
      askCountsByPlayerId: {},
    },
  }
}

describe('LOH decision continuity', () => {
  it('reuses an eligible answer after restoring the game and updates it when the seat actually opens', () => {
    const settings = settingsReducer(undefined, init)
    const store = configureStore({
      reducer: { game: reducer, social: socialReducer, settings: settingsReducer },
      preloadedState: {
        game: safetyGame(),
        social: socialReducer(undefined, init),
        settings: {
          ...settings,
          gameUX: { ...settings.gameUX, dramaMode: true, dramaModeAdminOverride: true },
        },
      },
    })
    initManeuvers(store)
    const ask = (draws: number[]) => {
      const result = executeAction('lance', 'ash', 'ask_loh_target', {
        waiveCosts: true,
        random: () => draws.shift() ?? 0,
      })
      expect(result.success, result.summary).toBe(true)
      return buildLohConsultationSummary(
        store.getState() as RootState,
        { actorId: 'lance', targetId: 'ash', actionId: 'ask_loh_target' },
        result.summary
      )
    }

    const first = ask([0, 0.99])
    expect(first).toBe('Aria is the name I am willing to give you if Safety opens the block.')
    store.dispatch(hydrateGame(JSON.parse(JSON.stringify(store.getState().game))))
    expect(ask([0.99])).toBe(first)
    const beforeSafety = store.getState().game
    expect(beforeSafety.lohSocialPlan?.askCountsByPlayerId.lance).toBe(2)
    store.dispatch(
      hydrateGame({
        ...beforeSafety,
        phase: 'pos_ceremony_results',
        aiReplacementStep: 1,
        nomineeIds: ['mimi'],
        povSavedId: 'remy',
      })
    )
    const next = ask([0])
    expect(next).toContain('Safety opened')
    expect(next).not.toContain('Remy')
    expect(store.getState().game.lohSocialPlan?.askCountsByPlayerId.lance).toBe(1)
  })

  it('excludes the whole Cupid Safety pair and other protected players from conditional replacements', () => {
    const game = safetyGame()
    game.cupidArrow = {
      scheduledSeason: null,
      status: 'active',
      activatedSeason: 1,
      activatedWeek: 1,
      pairs: [{ id: 'safety', memberIds: ['remy', 'aria'], color: 'pink' }],
      eliminatedPairCount: 0,
      pendingPartnerEvictionId: null,
      visualsRevealed: true,
    }
    game.storeNominationProtections = [{ week: 6, targetId: 'bea', productKey: 'protection' }]
    expect(getLohDialogueCandidateIds(game, 'ash', 'conditional_replacement')).toEqual(['lance'])
  })

  it('continues a plan that the LOH already disclosed instead of repeating the opening warning', () => {
    const game = safetyGame()
    game.phase = 'social_1'
    game.lohNominationPlan = {
      ...game.lohNominationPlan!,
      status: 'planned',
      strategy: 'direct',
      targetId: 'lance',
      initialNomineeIds: ['lance', 'mimi'],
    }
    expect(getLohOpeningWarningFollowUp(game, 'ash', 'lance')).toBeUndefined()
    game.lohSocialPlan = {
      ...game.lohSocialPlan!,
      askCountsByPlayerId: { lance: 1 },
      disclosedTargetByPlayerId: { lance: 'lance' },
      disclosureOutcomeByPlayerId: { lance: 'truthful' },
    }
    expect(getLohOpeningWarningFollowUp(game, 'ash', 'lance')).toContain(
      'I already told you I want you out'
    )
    game.lohNominationPlan.targetId = 'mimi'
    expect(getLohOpeningWarningFollowUp(game, 'ash', 'lance')).toContain(
      'Here is where I stand now'
    )
  })

  it('publishes an executed Ambush once, retains it unread across restore and drops it on acknowledgment', () => {
    const fixture = safetyGame()
    fixture.phase = 'pos_ceremony_results'
    fixture.povSavedId = 'remy'
    fixture.povProtectedIds = ['remy']
    fixture.nomineeIds = ['mimi', 'bea']
    fixture.replacementNomineeIds = ['bea']
    fixture.lohNominationPlan = {
      ...fixture.lohNominationPlan!,
      status: 'executed',
      revealPending: true,
    }
    const id = 'backdoor:ash-remy:6:bea'
    expect(fixture.tvFeed.some((event) => event.id === id)).toBe(false)
    let after = reducer(fixture, advance())
    expect(after.tvFeed.find((event) => event.id === id)?.text).toContain(
      'Ash kept Bea off the opening block.'
    )
    expect(after.phase).toBe('social_2')
    const legacySave = JSON.parse(JSON.stringify(after)) as GameState
    const legacyEvent = legacySave.tvFeed.find((event) => event.id === id)!
    delete legacyEvent.meta!.broadcastManaged
    legacySave.broadcastQueue = []
    expect(reducer(after, hydrateGame(legacySave)).broadcastQueue).toContain(id)
    after = reducer(after, claimActiveBroadcastEvent(id))
    after = reducer(after, hydrateGame(JSON.parse(JSON.stringify(after))))
    const pending = (game: GameState) =>
      selectCurrentBroadcastEvents(
        game.broadcastQueue,
        game.tvFeed,
        game.phase,
        game.week,
        game.activeBroadcastEventId
      )
    expect(pending(after)[0]?.id).toBe(id)
    after = reducer(after, consumeBroadcastEvent(id))
    after = reducer(after, syncPhaseBroadcasts({ phase: after.phase }))
    expect(pending(after).some((event) => event.id === id)).toBe(false)
    expect(after.tvFeed.filter((event) => event.id === id)).toHaveLength(1)
  })
})
