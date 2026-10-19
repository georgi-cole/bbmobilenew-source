import { describe, expect, it } from 'vitest'
import { getPresentedRosterPlayers } from '../../features/reserveEntrants/wildcardReplacement'
import gameReducer, {
  advance,
  activateDayStartShock,
  confirmDayStartShock,
  completeWeekendInterlude,
  createInitialGameState,
  finalizePendingEviction,
  forceWildcardEntryForQa,
  selfEvict,
} from '../gameSlice'

function prepareEligibleGame(priorExitCount = 5) {
  const state = createInitialGameState({ seed: 51601 })
  state.week = 5
  state.phase = 'week_end'
  state.weekendsEnabledForSeason = false
  state.weekendInterlude = null
  state.twinShockConsumed = true
  state.tribunalPhaseAnnounced = false
  state.cupidArrow = { ...state.cupidArrow!, status: 'inactive' }
  state.voxPopuli = { ...state.voxPopuli!, status: 'inactive' }
  state.wildcardOpportunity = { status: 'none' }

  const eliminated = state.players.filter((player) => !player.isUser).slice(0, priorExitCount)
  eliminated.forEach((player, index) => {
    player.status = 'evicted'
    player.evictedAtWeek = index + 1
    player.seasonPlacement = 16 - index
  })
  return { state, eliminated }
}

describe('wildcard replacement', () => {
  it('queues a reserve through QA and admits them at the next day start with weekends disabled', () => {
    const { state, eliminated } = prepareEligibleGame()

    const queued = gameReducer(state, forceWildcardEntryForQa('pax'))
    expect(queued.wildcardOpportunity).toMatchObject({
      status: 'pending',
      playerId: 'pax',
      triggerType: 'qa',
      triggerDay: 5,
      arrivalDay: 6,
      qaForced: true,
    })

    const nextDay = gameReducer(queued, advance())
    expect(nextDay.week).toBe(6)
    expect(nextDay.wildcardOpportunity).toMatchObject({ status: 'admitted', playerId: 'pax' })
    expect(nextDay.wildcardAdmissions).toEqual([
      expect.objectContaining({
        playerId: 'pax',
        displacedPlayerId: eliminated[0].id,
        enteredAtDay: 6,
        forcedByQa: true,
      }),
    ])
    expect(nextDay.players).toHaveLength(17)
    expect(nextDay.players.find((player) => player.id === eliminated[0].id)?.status).toBe('evicted')
    expect(getPresentedRosterPlayers(nextDay)).toHaveLength(16)
    const displacedIndex = state.players.findIndex((player) => player.id === eliminated[0].id)
    expect(getPresentedRosterPlayers(nextDay)[displacedIndex]?.id).toBe('pax')
    expect(nextDay.players.find((player) => player.id === eliminated[0].id)?.seasonPlacement).toBe(
      17
    )
  })

  it('lets QA queue from during the current numbered day', () => {
    const { state } = prepareEligibleGame()
    state.phase = 'social_1'

    const queued = gameReducer(state, forceWildcardEntryForQa('noa'))

    expect(queued.wildcardOpportunity).toMatchObject({
      status: 'pending',
      playerId: 'noa',
      triggerType: 'qa',
      triggerDay: 5,
      arrivalDay: 6,
    })
    expect(queued.players.find((player) => player.id === 'noa')).toBeUndefined()
  })

  it('waits through an enabled weekend and admits at the following numbered day start', () => {
    const { state } = prepareEligibleGame()
    state.weekendsEnabledForSeason = true
    const queued = gameReducer(state, forceWildcardEntryForQa('rey'))

    const weekend = gameReducer(queued, advance())
    expect(weekend.week).toBe(5)
    expect(weekend.weekendInterlude?.active).toBe(true)
    expect(weekend.wildcardAdmissions ?? []).toHaveLength(0)

    const weekendAtDayTwo = {
      ...weekend,
      weekendInterlude: {
        ...weekend.weekendInterlude!,
        weekendDay: 2 as const,
        stage: 'social' as const,
      },
    }
    const afterWeekend = gameReducer(weekendAtDayTwo, completeWeekendInterlude())
    expect(afterWeekend.wildcardOpportunity?.status).toBe('pending')
    expect(afterWeekend.week).toBe(5)

    const nextDay = gameReducer(afterWeekend, advance())
    expect(nextDay.week).toBe(6)
    expect(nextDay.phase).toBe('week_start')
    expect(nextDay.wildcardOpportunity).toMatchObject({ status: 'admitted', playerId: 'rey' })
  })

  it('schedules the next-day chance after an AI self-elimination rather than immediately', () => {
    const { state } = prepareEligibleGame(3)
    state.wildcardOpportunity = { status: 'selected', playerId: 'noa' }
    state.phase = 'social_1'
    const exitingPlayer = state.players.find(
      (player) => !player.isUser && player.status === 'active'
    )
    expect(exitingPlayer).toBeDefined()

    const afterExit = gameReducer(state, selfEvict(exitingPlayer!.id))
    expect(afterExit.wildcardOpportunity).toMatchObject({
      status: 'pending',
      playerId: 'noa',
      triggerType: 'self_elimination',
      triggerDay: 5,
      arrivalDay: 6,
    })
    expect(afterExit.players.find((player) => player.id === 'noa')).toBeUndefined()
  })

  it('opens the chance after a Morning Shock exit', () => {
    const { state } = prepareEligibleGame(3)
    state.week = 5
    state.phase = 'week_start'
    state.wildcardOpportunity = { status: 'selected', playerId: 'rey' }
    const target = state.players.find((player) => !player.isUser && player.status === 'active')!

    let next = gameReducer(
      state,
      activateDayStartShock({
        targetId: target.id,
        reason: `${target.name} leaves after a Morning Shock.`,
        templateId: 'wildcard-test',
        triggeredWeek: state.week,
        source: 'debug',
      })
    )
    next = gameReducer(next, confirmDayStartShock())
    next = gameReducer(next, finalizePendingEviction(target.id))

    expect(next.wildcardOpportunity).toMatchObject({
      status: 'pending',
      playerId: 'rey',
      triggerType: 'morning_shock',
      triggerDay: 5,
      arrivalDay: 6,
    })
  })

  it('waits until both double-elimination exits resolve before opening the chance', () => {
    const { state } = prepareEligibleGame(3)
    state.wildcardOpportunity = { status: 'selected', playerId: 'pax' }
    state.phase = 'eviction_results'
    const targets = state.players.filter((player) => !player.isUser && player.status === 'active')
    const [first, second] = targets
    state.doubleEviction = {
      ...state.doubleEviction!,
      weekActive: true,
      pendingSecondEviction: {
        evicteeId: second.id,
        evictionMessage: `${second.name} is the second exit.`,
      },
    }
    state.pendingEviction = {
      evicteeId: first.id,
      evictionMessage: `${first.name} is the first exit.`,
    }

    const afterFirst = gameReducer(state, finalizePendingEviction(first.id))
    expect(afterFirst.wildcardOpportunity?.status).toBe('selected')
    const afterSecond = gameReducer(afterFirst, finalizePendingEviction(second.id))

    expect(afterSecond.wildcardOpportunity).toMatchObject({
      status: 'pending',
      playerId: 'pax',
      triggerType: 'double_elimination',
      triggerDay: 5,
      arrivalDay: 6,
    })
  })
})
