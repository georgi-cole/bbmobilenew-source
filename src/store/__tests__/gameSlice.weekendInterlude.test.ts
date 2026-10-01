import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  advanceWeekendDay,
  completeWeekendInterlude,
  continueHubSays,
  continueWeekendFeature,
  createInitialGameState,
  recordWeekendPartyBeat,
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
      (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
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

  it('starts Weekend 2 after Day 10 as a two-day Hub Party and resumes Day 11', () => {
    let state = gameReducer(
      {
        ...createInitialGameState({ seed: 1010 }),
        week: 10,
        phase: 'week_end' as const,
        weekendsEnabledForSeason: true,
        completedWeekendDays: [5],
        weekendInterlude: null,
        finalThree: null,
      },
      advance()
    )
    expect(state.week).toBe(10)
    expect(state.weekendInterlude).toMatchObject({
      afterDay: 10,
      weekendDay: 1,
      episode: 'party',
      stage: 'party',
    })
    expect(state.weekendInterlude?.party?.beats).toEqual([])

    state = gameReducer(state, continueWeekendFeature())
    expect(state.weekendInterlude?.stage).toBe('social')

    const firstBeat = {
      id: 'party-test-day-1',
      weekendDay: 1 as const,
      kind: 'opinion_spill' as const,
      text: 'A grounded party opinion.',
      visibility: 'private' as const,
      speakerId: 'ai-a',
      subjectIds: ['ai-b'],
    }
    state = gameReducer(state, recordWeekendPartyBeat(firstBeat))
    state = gameReducer(state, recordWeekendPartyBeat({ ...firstBeat, id: 'duplicate' }))
    expect(state.weekendInterlude?.party?.beats).toHaveLength(1)

    state = gameReducer(state, advanceWeekendDay())
    expect(state.weekendInterlude?.weekendDay).toBe(2)

    state = gameReducer(
      state,
      recordWeekendPartyBeat({
        id: 'party-test-day-2',
        weekendDay: 2,
        kind: 'rivalry_moment',
        text: 'A grounded house moment.',
        visibility: 'house',
        subjectIds: ['ai-a', 'ai-b'],
      })
    )
    expect(state.weekendInterlude?.party?.beats).toHaveLength(2)

    state = gameReducer(state, completeWeekendInterlude())
    expect(state.weekendInterlude).toBeNull()
    expect(state.completedWeekendDays).toContain(10)

    state = gameReducer(state, advance())
    expect(state.week).toBe(11)
    expect(state.phase).toBe('week_start')
  })

  it('starts Weekend 3 after Day 15 with one grounded season fact per remaining player', () => {
    const initial = {
      ...createInitialGameState({ seed: 1515 }),
      week: 15,
      phase: 'week_end' as const,
      weekendsEnabledForSeason: true,
      completedWeekendDays: [5, 10],
      weekendInterlude: null,
      finalThree: null,
    }
    const activeCount = initial.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    ).length

    let state = gameReducer(initial, advance())
    expect(state.weekendInterlude).toMatchObject({
      afterDay: 15,
      weekendDay: 1,
      episode: 'season_so_far',
      stage: 'season_so_far',
    })
    expect(state.weekendInterlude?.seasonSoFar?.facts).toHaveLength(activeCount)
    expect(
      new Set(state.weekendInterlude?.seasonSoFar?.facts.map((fact) => fact.playerId)).size
    ).toBe(activeCount)

    state = gameReducer(state, continueWeekendFeature())
    expect(state.weekendInterlude?.stage).toBe('social')
    state = gameReducer(state, advanceWeekendDay())
    state = gameReducer(state, completeWeekendInterlude())
    state = gameReducer(state, advance())

    expect(state.week).toBe(16)
    expect(state.phase).toBe('week_start')
  })

  it('does not start the late weekend when only three housemates remain', () => {
    const initial = createInitialGameState({ seed: 1516 })
    let kept = 0
    const players = initial.players.map((player) => {
      if (kept < 3) {
        kept += 1
        return { ...player, status: 'active' as const }
      }
      return { ...player, status: 'evicted' as const }
    })
    const state = gameReducer(
      {
        ...initial,
        players,
        week: 15,
        phase: 'week_end' as const,
        weekendsEnabledForSeason: true,
        completedWeekendDays: [5, 10],
        weekendInterlude: null,
        finalThree: null,
      },
      advance()
    )

    expect(state.weekendInterlude).toBeNull()
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
