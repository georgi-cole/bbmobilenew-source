import { describe, expect, it } from 'vitest'
import gameReducer, {
  activateDepressionShock,
  addTvEvent,
  claimActiveBroadcastEvent,
  consumeBroadcastEvent,
  setPhase,
  syncPhaseBroadcasts,
} from '../gameSlice'

describe('Depression Shock broadcast recovery', () => {
  it('does not replay an existing consumed comfort-card broadcast', () => {
    const text = 'The Big Eye has left chocolates for everyone.'
    let state = gameReducer(undefined, { type: '@@INIT' })

    state = gameReducer(
      state,
      addTvEvent({
        text,
        type: 'social',
        channels: ['mainLog'],
        source: 'system',
        meta: { week: state.week },
      })
    )
    const existing = state.tvFeed.find((event) => event.text === text)
    expect(existing).toBeDefined()

    state = gameReducer(state, consumeBroadcastEvent(existing!.id))
    state = gameReducer(
      state,
      addTvEvent({
        text,
        type: 'social',
        channels: ['tv', 'mainLog'],
        source: 'system',
        meta: {
          week: state.week,
          broadcastTemplateId: 'depression-shock.chocolates',
          broadcastLevel: 'major',
          major: 'depression_shock_chocolates',
          forceOnTv: true,
          depressionShockQueued: true,
        },
      })
    )

    expect(state.broadcastQueue).not.toContain(existing!.id)
    expect(state.tvFeed.filter((event) => event.text === text)).toHaveLength(1)
    expect(state.tvFeed.find((event) => event.id === existing!.id)?.meta?.broadcastConsumed).toBe(
      true
    )
  })

  it('updates both storm days without publishing a second opening or color-drain card', () => {
    let state = gameReducer(undefined, activateDepressionShock({ source: 'debug' }))
    expect(state.depressionShock?.activeDay).toBe(1)
    state = { ...state, week: state.week + 1 }
    state = gameReducer(state, activateDepressionShock({ source: 'debug' }))
    expect(state.depressionShock?.activeDay).toBe(2)
    expect(
      state.tvFeed.filter((event) =>
        ['depression_shock_start', 'depression_shock_day_2'].includes(event.major ?? '')
      )
    ).toHaveLength(0)
  })

  it('keeps a claimed opening and clears its duplicate when a saved morning is synced', () => {
    const major = 'depression_shock_start'
    let state = gameReducer(undefined, setPhase('week_start'))
    state = gameReducer(
      state,
      addTvEvent({ text: 'The legacy opening.', type: 'twist', meta: { major } })
    )
    const retainedId = state.tvFeed.find((event) => event.major === major)!.id
    state = gameReducer(state, claimActiveBroadcastEvent(retainedId))
    state = gameReducer(
      state,
      addTvEvent({ text: 'A second copy of the opening.', type: 'twist', meta: { major } })
    )
    state = gameReducer(state, syncPhaseBroadcasts({ phase: 'week_start', cardMajor: null }))

    expect(state.tvFeed.filter((event) => event.major === major)).toHaveLength(2)
    expect(
      state.tvFeed
        .filter((event) => event.major === major && event.meta?.broadcastConsumed !== true)
        .map((event) => event.id)
    ).toEqual([retainedId])
    expect(state.broadcastQueue).toContain(retainedId)
    expect(state.activeBroadcastEventId).toBe(retainedId)
  })
})
