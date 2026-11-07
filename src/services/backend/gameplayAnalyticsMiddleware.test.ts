import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MiddlewareAPI } from '@reduxjs/toolkit'
import type { RootState } from '../../store/store'
import { gameplayAnalyticsMiddleware } from './gameplayAnalyticsMiddleware'
import { trackProductEvent } from '../liveOps/productTelemetry'

vi.mock('../liveOps/productTelemetry', () => ({ trackProductEvent: vi.fn() }))

function state() {
  return {
    profiles: { profiles: [{ id: 'p' }], activeProfileId: 'p', isGuest: false },
    game: {
      mode: 'classic',
      status: 'active',
      week: 2,
      phase: 'social',
      players: [{ id: 'human', isUser: true }, { id: 'ai' }],
      seasonArchives: [],
    },
    challenge: { pending: null, history: [] },
    social: { actionHistory: [] },
  } as unknown as RootState
}

function dispatch(before: RootState, after: RootState, type: string) {
  let current = before
  const api = { getState: () => current, dispatch: vi.fn() } as MiddlewareAPI
  const next = () => {
    current = after
    return 'accepted'
  }
  return gameplayAnalyticsMiddleware(api)(next)({ type, payload: { message: 'private' } })
}

describe('gameplay analytics instrumentation', () => {
  beforeEach(() => vi.clearAllMocks())
  it('counts human social actions without copying player IDs or messages', () => {
    const before = state()
    const after = {
      ...before,
      social: {
        ...before.social,
        actionHistory: [{ actorId: 'human', targetId: 'ai', actionId: 'chat', text: 'private' }],
      },
    } as unknown as RootState
    expect(dispatch(before, after, 'social/recordSocialAction')).toBe('accepted')
    expect(trackProductEvent).toHaveBeenCalledWith('social_action', {
      action_id: 'chat',
      phase: 'social',
      week: 2,
    })
    expect(JSON.stringify(vi.mocked(trackProductEvent).mock.calls)).not.toContain('private')
  })
  it('does not count AI social actions as player engagement', () => {
    const before = state()
    const after = {
      ...before,
      social: { ...before.social, actionHistory: [{ actorId: 'ai', actionId: 'chat' }] },
    } as unknown as RootState
    dispatch(before, after, 'social/recordSocialAction')
    expect(trackProductEvent).not.toHaveBeenCalled()
  })
  it('records the human minigame result and partial completion', () => {
    const before = state()
    const after = {
      ...before,
      challenge: {
        ...before.challenge,
        history: [
          {
            gameKey: 'quick_tap',
            participants: ['human', 'ai'],
            canonicalScores: { human: 300 },
            winnerId: 'ai',
            partial: true,
          },
        ],
      },
    } as unknown as RootState
    dispatch(before, after, 'challenge/recordRun')
    expect(trackProductEvent).toHaveBeenCalledWith('minigame_completed', {
      game_key: 'quick_tap',
      score: 300,
      won: false,
      partial: true,
    })
  })
  it('ignores guest actions and hydrated archives', () => {
    const before = state()
    const guest = { ...before, profiles: { ...before.profiles, isGuest: true } }
    dispatch(before, guest, 'game/resetGame')
    const hydrated = {
      ...before,
      game: { ...before.game, seasonArchives: [{}] },
    } as unknown as RootState
    dispatch(before, hydrated, 'game/hydrateGame')
    expect(trackProductEvent).not.toHaveBeenCalled()
  })
})
