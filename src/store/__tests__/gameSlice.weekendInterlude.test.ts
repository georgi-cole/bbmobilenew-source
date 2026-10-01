import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  advanceWeekendDay,
  completeWeekendInterlude,
  continueHubSays,
  createInitialGameState,
  hydrateGame,
  submitHubSaysVote,
} from '../gameSlice'

describe('Weekend 1 interlude', () => {
  function dayFiveEnd() {
    return {
      ...createInitialGameState({ seed: 5105 }),
      week: 5,
      phase: 'week_end' as const,
      weekendsEnabledForSeason: true,
      completedWeekendDays: [],
      weekendInterlude: null,
      finalThree: null,
    }
  }

  it('pauses after Day 5 without changing the numbered game day', () => {
    const weekend = gameReducer(dayFiveEnd(), advance())

    expect(weekend.week).toBe(5)
    expect(weekend.phase).toBe('week_end')
    expect(weekend.weekendInterlude?.afterDay).toBe(5)
    expect(weekend.weekendInterlude?.weekendDay).toBe(1)
    expect(weekend.weekendInterlude?.wallet).toEqual({
      energy: 30,
      influence: 999,
      info: 999,
    })
    expect(weekend.weekendInterlude?.hubSays?.questionIds).toHaveLength(5)
  })

  it('blocks ordinary advance while the weekend owns progression', () => {
    const weekend = gameReducer(dayFiveEnd(), advance())
    const blocked = gameReducer(weekend, advance())

    expect(blocked.week).toBe(5)
    expect(blocked.phase).toBe('week_end')
    expect(blocked.weekendInterlude).toEqual(weekend.weekendInterlude)
  })

  it('runs winner-only Hub Says rounds, then provides two social days before Day 6', () => {
    let state = gameReducer(dayFiveEnd(), advance())
    const humanId = state.players.find((player) => player.isUser)?.id
    const firstTargetId = state.players.find(
      (player) =>
        !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
    )?.id

    expect(humanId).toBeTruthy()
    expect(firstTargetId).toBeTruthy()

    while (state.weekendInterlude?.stage === 'hub_says') {
      const hub = state.weekendInterlude.hubSays
      const questionId = hub?.questionIds[hub.currentQuestionIndex]
      expect(questionId).toBeTruthy()

      state = gameReducer(
        state,
        submitHubSaysVote({ questionId: questionId!, targetId: firstTargetId! })
      )
      const result = state.weekendInterlude?.hubSays?.results.find(
        (entry) => entry.questionId === questionId
      )
      expect(result?.winnerId).toBeTruthy()
      expect(result?.voteCounts).toBeTruthy()

      state = gameReducer(state, continueHubSays())
    }

    expect(state.weekendInterlude?.stage).toBe('social')
    expect(state.weekendInterlude?.weekendDay).toBe(1)

    state = gameReducer(state, advanceWeekendDay())
    expect(state.weekendInterlude?.weekendDay).toBe(2)
    expect(state.week).toBe(5)

    state = gameReducer(state, completeWeekendInterlude())
    expect(state.weekendInterlude).toBeNull()
    expect(state.completedWeekendDays).toContain(5)
    expect(state.week).toBe(5)

    state = gameReducer(state, advance())
    expect(state.week).toBe(6)
    expect(state.phase).toBe('week_start')
  })

  it('does not retroactively enable weekends for a legacy saved season', () => {
    const current = createInitialGameState({ seed: 5106 })
    const legacy = { ...current }
    delete legacy.weekendsEnabledForSeason
    delete legacy.completedWeekendDays
    delete legacy.weekendInterlude

    const hydrated = gameReducer(current, hydrateGame(legacy))

    expect(hydrated.weekendsEnabledForSeason).toBe(false)
    expect(hydrated.completedWeekendDays).toEqual([])
    expect(hydrated.weekendInterlude).toBeNull()
  })
})
