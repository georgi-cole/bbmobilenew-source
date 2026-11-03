import { describe, expect, it } from 'vitest'
import { createBattleBackIntroGuard, createCeremonyQueue, shouldPlayCinematic } from './runtime.mjs'

describe('cinematic ceremony routing', () => {
  it('requires VIP, animations and motion; explicit Standard wins over the automatic VIP style', () => {
    const state = {
      settings: {
        gameUX: { animations: true, animationMode: 'auto' },
        display: { reduceMotion: false },
      },
    }
    expect(shouldPlayCinematic(state, true)).toBe(true)
    expect(shouldPlayCinematic(state, false)).toBe(false)
    state.settings.gameUX.animationMode = 'standard'
    expect(shouldPlayCinematic(state, true)).toBe(false)
    state.settings.gameUX.animationMode = 'cinematic'
    state.settings.gameUX.animations = false
    expect(shouldPlayCinematic(state, true)).toBe(false)
    state.settings.gameUX.animations = true
    state.settings.display.reduceMotion = true
    expect(shouldPlayCinematic(state, true)).toBe(false)
  })
  it('holds ownership through native handoff; queued shocks do not interrupt an active result', async () => {
    const queue = createCeremonyQueue(),
      events: string[] = []
    const finishWinner = queue.acquire(() => events.push('winner'))
    await Promise.resolve()
    const finishOrdinary = queue.acquire(() => events.push('ordinary'), 1)
    const finishShock = queue.acquire(() => events.push('shock'), 2)
    expect(events).toEqual(['winner'])
    finishWinner()
    finishWinner()
    await Promise.resolve()
    expect(events).toEqual(['winner', 'shock'])
    finishShock()
    await Promise.resolve()
    expect(events).toEqual(['winner', 'shock', 'ordinary'])
    finishOrdinary()
    expect(queue.counts).toEqual({ active: 0, queued: 0 })
  })
  it('cancels StrictMode probes and releases a failed startup', async () => {
    const queue = createCeremonyQueue(),
      events: string[] = []
    queue.acquire(() => events.push('cancelled'))()
    queue.acquire(() => {
      throw new Error('unavailable renderer')
    })
    const release = queue.acquire(() => events.push('fallback'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual(['fallback'])
    release()
    expect(queue.counts).toEqual({ active: 0, queued: 0 })
  })
  it('plays one Back 2 the Game reveal and skips rules, challenge and duplicate aliases', () => {
    const guard = createBattleBackIntroGuard()
    const state = {
      game: {
        gameId: 'one',
        week: 5,
        battleBack: { weekDecided: 5, candidates: ['aria', 'ash'], attemptIndex: 0 },
      },
    }
    expect(guard.shouldSkip(state, 'battle_back_rules')).toBe(true)
    expect(guard.shouldSkip(state, 'battle_back_challenge')).toBe(true)
    expect(guard.shouldSkip(state, 'battle_back')).toBe(false)
    expect(guard.shouldSkip(state, 'battle_back_shock')).toBe(false)
    guard.mark(state, 'battle_back')
    expect(guard.shouldSkip(state, 'battle_back_shock')).toBe(true)
    state.game.week = 6
    state.game.battleBack.attemptIndex = 1
    expect(guard.shouldSkip(state, 'battle_back')).toBe(true)
    expect(guard.shouldSkip(state, 'cupid_arrow')).toBe(false)
    expect(
      guard.shouldSkip({ ...state, game: { ...state.game, gameId: 'two' } }, 'battle_back')
    ).toBe(false)
    expect(
      guard.shouldSkip({ ...state, profiles: { activeProfileId: 'other' } }, 'battle_back')
    ).toBe(false)
    expect(
      guard.shouldSkip({ game: { ...state.game, battleBack: { winnerId: 'aria' } } }, 'battle_back')
    ).toBe(true)
  })
})
