import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameplayAnalyticsMiddleware, shouldTrackSeasonReset } from './gameplayAnalyticsMiddleware'
import type { RootState } from '../../store/store'
import { trackProductEvent } from '../liveOps/productTelemetry'

vi.mock('../liveOps/productTelemetry', () => ({ trackProductEvent: vi.fn() }))
vi.mock('../../modes/seasonLaunchIntent', () => ({ getSeasonLaunchIntent: () => 'classic' }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('shouldTrackSeasonReset', () => {
  it('ignores resets that are not an explicit new-season launch', () => {
    expect(shouldTrackSeasonReset(null, true)).toBe(false)
  })

  it('tracks an explicit season launch when a game roster was created', () => {
    expect(shouldTrackSeasonReset('voxPopuli', true)).toBe(true)
  })

  it('ignores an explicit launch that did not create a game roster', () => {
    expect(shouldTrackSeasonReset('classic', false)).toBe(false)
  })
})

function guestState() {
  return {
    profiles: { isGuest: true, activeProfileId: null, profiles: [] },
    game: {
      mode: 'classic',
      expansionMode: null,
      phase: 'week_start',
      week: 1,
      season: 1,
      gameId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      players: [{ id: 'human', isUser: true, status: 'active' }],
      pendingMinigame: null,
      seasonArchives: [],
      tribunalInvitationAcknowledged: false,
    },
    challenge: { pending: null, history: [] },
    social: { panelOpen: false, actionHistory: [] },
    finale: { awaitingHumanJurorId: null, votes: {} },
  } as unknown as RootState
}

function dispatchTransition(before: RootState, after: RootState, type: string) {
  let state = before
  const handle = gameplayAnalyticsMiddleware({ getState: () => state, dispatch: vi.fn() })((
    action
  ) => {
    state = after
    return action
  })
  handle({ type })
}

describe('guest and Tribunal analytics', () => {
  it('does not send new event names until the account migration is enabled', () => {
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'false')
    const before = guestState()
    before.game.players[0].status = 'jury'
    const after = {
      ...before,
      game: {
        ...before.game,
        tribunalInvitationAcknowledged: true,
        tribunalInvitationTransition: 'sequester' as const,
      },
    }
    dispatchTransition(before, after, 'game/chooseTribunalInvitation')
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('records guest season starts and attributed abandonment without inventing a profile', () => {
    const before = guestState()
    const after = {
      ...before,
      game: { ...before.game, season: 2, gameId: '22222222-2222-4222-8222-222222222222' },
    }
    dispatchTransition(before, after, 'game/resetGame')
    expect(trackProductEvent).toHaveBeenCalledWith(
      'season_started',
      expect.objectContaining({ season_index: 2, game_id: after.game.gameId }),
      null
    )
    expect(trackProductEvent).toHaveBeenCalledWith(
      'season_abandoned',
      expect.objectContaining({ season_index: 1, game_id: before.game.gameId }),
      null
    )
    expect(
      vi.mocked(trackProductEvent).mock.calls.some(([name]) => name === 'profile_created')
    ).toBe(false)
  })

  it('keeps distinct guest runs identifiable when the displayed season number repeats', () => {
    const first = guestState()
    const second = {
      ...first,
      game: { ...first.game, gameId: '22222222-2222-4222-8222-222222222222' },
    }
    const third = {
      ...second,
      game: { ...second.game, gameId: '33333333-3333-4333-8333-333333333333' },
    }
    dispatchTransition(first, second, 'game/resetGame')
    dispatchTransition(second, third, 'game/resetGame')
    const starts = vi
      .mocked(trackProductEvent)
      .mock.calls.filter(([name]) => name === 'season_started')
    expect(starts.map(([, properties]) => [properties?.season_index, properties?.game_id])).toEqual(
      [
        [1, second.game.gameId],
        [1, third.game.gameId],
      ]
    )
  })

  it('ties completion to the live run and does not count imported archives as new completions', () => {
    const before = guestState()
    const after = {
      ...before,
      game: {
        ...before.game,
        seasonArchives: [
          {
            seasonIndex: 1,
            seasonId: 'season-1-timestamp',
            playerSummaries: [{ playerId: 'human', displayName: 'Player', finalPlacement: 1 }],
          },
        ],
      },
    }
    dispatchTransition(before, after, 'game/hydrateGame')
    expect(trackProductEvent).not.toHaveBeenCalledWith(
      'season_completed',
      expect.anything(),
      expect.anything()
    )
    dispatchTransition(before, after, 'game/archiveSeason')
    expect(trackProductEvent).toHaveBeenCalledWith(
      'season_completed',
      expect.objectContaining({ season_index: 1, game_id: before.game.gameId }),
      null
    )
  })

  it('records an accepted Tribunal invitation once, including a guest player', () => {
    const before = guestState()
    before.game.players[0].status = 'jury'
    const after = {
      ...before,
      game: {
        ...before.game,
        tribunalInvitationAcknowledged: true,
        tribunalInvitationTransition: 'sequester' as const,
      },
    }
    dispatchTransition(before, after, 'game/chooseTribunalInvitation')
    expect(trackProductEvent).toHaveBeenCalledWith(
      'tribunal_action',
      expect.objectContaining({ action_id: 'invitation_accepted', season_index: 1 }),
      null
    )
    vi.clearAllMocks()
    dispatchTransition(after, after, 'game/chooseTribunalInvitation')
    expect(trackProductEvent).not.toHaveBeenCalledWith(
      'tribunal_action',
      expect.anything(),
      expect.anything()
    )
  })

  it('does not count declining the invitation or background updates as Tribunal engagement', () => {
    const before = guestState()
    before.game.players[0].status = 'jury'
    const after = {
      ...before,
      game: {
        ...before.game,
        tribunalInvitationAcknowledged: true,
        tribunalInvitationTransition: 'exit' as const,
      },
    }
    dispatchTransition(before, after, 'game/chooseTribunalInvitation')
    dispatchTransition(after, after, 'game/completeTribunalArrival')
    expect(trackProductEvent).not.toHaveBeenCalledWith(
      'tribunal_action',
      expect.anything(),
      expect.anything()
    )
  })

  it('counts an accepted human finale vote but ignores AI and rejected votes', () => {
    const before = guestState()
    before.game.players[0].status = 'jury'
    before.finale.awaitingHumanJurorId = 'human'
    dispatchTransition(before, before, 'finale/castVote')
    expect(trackProductEvent).not.toHaveBeenCalled()
    const aiVote = { ...before, finale: { ...before.finale, votes: { ai: 'finalist' } } }
    dispatchTransition(before, aiVote, 'finale/castVote')
    expect(trackProductEvent).not.toHaveBeenCalled()
    const humanVote = {
      ...before,
      finale: {
        ...before.finale,
        awaitingHumanJurorId: null,
        votes: { human: 'finalist' },
      },
    }
    dispatchTransition(before, humanVote, 'finale/castVote')
    expect(trackProductEvent).toHaveBeenCalledWith(
      'tribunal_action',
      expect.objectContaining({ action_id: 'finale_vote_cast' }),
      null
    )
  })
})
