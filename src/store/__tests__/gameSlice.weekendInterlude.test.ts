import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  advanceWeekendSeasonFact,
  advanceWeekendDay,
  beginWeekendDayTransition,
  completeWeekendInterlude,
  continueHubSays,
  continueWeekendFeature,
  createInitialGameState,
  debugActivateWeekendInterlude,
  debugExitWeekendInterlude,
  debugRestartWeekendInterlude,
  debugSkipToWeekendDayTwo,
  recordWeekendPartyBeat,
  hydrateGame,
  chooseHubSaysPlayer,
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
    expect(weekend.weekendInterlude?.stage).toBe('intro')
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

    state = gameReducer(state, continueWeekendFeature())
    expect(state.weekendInterlude?.stage).toBe('instructions')
    state = gameReducer(state, continueWeekendFeature())
    while (state.weekendInterlude?.stage === 'hub_says') {
      const hub = state.weekendInterlude.hubSays
      const questionId = hub?.questionIds[hub.currentQuestionIndex]
      expect(questionId).toBeTruthy()

      state = gameReducer(state, chooseHubSaysPlayer(humanId!))
      expect(state.weekendInterlude?.hubSays?.selectedPlayerId).toBeFalsy()
      state = gameReducer(state, chooseHubSaysPlayer(firstTargetId!))
      expect(state.weekendInterlude?.hubSays?.selectedPlayerId).toBe(firstTargetId)
      expect(state.weekendInterlude?.hubSays?.beat).toBe('choice')
      state = gameReducer(
        state,
        submitHubSaysVote({ questionId: questionId!, targetId: firstTargetId! })
      )
      const result = state.weekendInterlude?.hubSays?.results.find(
        (entry) => entry.questionId === questionId
      )
      expect(result?.winnerId).toBeTruthy()
      expect(result?.voteCounts).toBeTruthy()
      expect(state.weekendInterlude?.hubSays?.beat).toBe('result')

      state = gameReducer(state, continueHubSays())
    }

    expect(state.weekendInterlude?.stage).toBe('social')
    expect(state.weekendInterlude?.weekendDay).toBe(1)

    state = gameReducer(state, beginWeekendDayTransition())
    expect(state.weekendInterlude?.stage).toBe('day_transition')
    state = gameReducer(state, advanceWeekendDay())
    expect(state.weekendInterlude).toMatchObject({ weekendDay: 2, stage: 'social' })
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
      stage: 'intro',
    })
    expect(state.weekendInterlude?.party?.beats).toEqual([])

    state = gameReducer(state, continueWeekendFeature())
    expect(state.weekendInterlude?.stage).toBe('instructions')
    state = gameReducer(state, continueWeekendFeature())
    expect(state.weekendInterlude?.stage).toBe('party')

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

    state = gameReducer(state, continueWeekendFeature())
    expect(state.weekendInterlude?.stage).toBe('social')
    state = gameReducer(state, beginWeekendDayTransition())
    state = gameReducer(state, advanceWeekendDay())
    expect(state.weekendInterlude?.weekendDay).toBe(2)
    expect(state.weekendInterlude?.stage).toBe('party')

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

    state = gameReducer(state, continueWeekendFeature())
    expect(state.weekendInterlude?.stage).toBe('social')
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
      stage: 'intro',
    })
    expect(state.weekendInterlude?.seasonSoFar?.facts).toHaveLength(activeCount)
    expect(
      new Set(state.weekendInterlude?.seasonSoFar?.facts.map((fact) => fact.playerId)).size
    ).toBe(activeCount)

    state = gameReducer(state, continueWeekendFeature())
    expect(state.weekendInterlude?.stage).toBe('instructions')
    state = gameReducer(state, continueWeekendFeature())
    while (state.weekendInterlude?.stage === 'season_so_far') {
      state = gameReducer(state, advanceWeekendSeasonFact())
    }
    expect(state.weekendInterlude?.stage).toBe('social')
    state = gameReducer(state, beginWeekendDayTransition())
    state = gameReducer(state, advanceWeekendDay())
    state = gameReducer(state, continueWeekendFeature())
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

  it('opens each debug weekend without changing the current numbered day or phase', () => {
    const initial = {
      ...createInitialGameState({ seed: 5150 }),
      week: 3,
      phase: 'social_2' as const,
    }

    for (const [afterDay, episode, stage] of [
      [5, 'hub_says', 'intro'],
      [10, 'party', 'intro'],
      [15, 'season_so_far', 'intro'],
    ] as const) {
      const preview = gameReducer(initial, debugActivateWeekendInterlude(afterDay))

      expect(preview.week).toBe(3)
      expect(preview.phase).toBe('social_2')
      expect(preview.weekendInterlude).toMatchObject({
        active: true,
        debug: true,
        afterDay,
        episode,
        stage,
      })
    }
  })

  it('does not consume a real weekend when a debug preview finishes', () => {
    const initial = {
      ...createInitialGameState({ seed: 5151 }),
      week: 3,
      phase: 'social_2' as const,
    }
    const preview = gameReducer(initial, debugActivateWeekendInterlude(10))
    const social = gameReducer(preview, continueWeekendFeature())
    const partyMoment = gameReducer(social, continueWeekendFeature())
    const socialDayOne = gameReducer(partyMoment, continueWeekendFeature())
    const transition = gameReducer(socialDayOne, beginWeekendDayTransition())
    const dayTwo = gameReducer(transition, advanceWeekendDay())
    expect(dayTwo.weekendInterlude?.stage).toBe('party')
    const dayTwoSocial = gameReducer(dayTwo, continueWeekendFeature())
    const finished = gameReducer(dayTwoSocial, completeWeekendInterlude())

    expect(finished.week).toBe(3)
    expect(finished.phase).toBe('social_2')
    expect(finished.completedWeekendDays).toEqual(initial.completedWeekendDays)
    expect(finished.weekendInterlude).toBeNull()
  })

  it('restarts, skips ahead, and exits a weekend preview without changing the season', () => {
    const initial = {
      ...createInitialGameState({ seed: 5152 }),
      week: 7,
      phase: 'social_2' as const,
      players: createInitialGameState({ seed: 5152 }).players.map((player) =>
        player.isUser ? { ...player, status: 'jury' as const } : player
      ),
    }
    const preview = gameReducer(initial, debugActivateWeekendInterlude(5))
    expect(preview.players.find((player) => player.isUser)?.status).toBe('active')

    const restarted = gameReducer(preview, debugRestartWeekendInterlude(15))
    expect(restarted.weekendInterlude).toMatchObject({ afterDay: 15, debug: true, stage: 'intro' })
    expect(restarted.week).toBe(7)

    const dayTwo = gameReducer(restarted, debugSkipToWeekendDayTwo())
    expect(dayTwo.weekendInterlude).toMatchObject({ weekendDay: 2, stage: 'social' })
    const exited = gameReducer(dayTwo, debugExitWeekendInterlude())
    expect(exited.weekendInterlude).toBeNull()
    expect(exited.week).toBe(7)
    expect(exited.phase).toBe('social_2')
    expect(exited.players.find((player) => player.isUser)?.status).toBe('jury')
  })
})
