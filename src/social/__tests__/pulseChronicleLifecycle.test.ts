import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  advanceWeekendDay,
  beginWeekendDayTransition,
  completeWeekendInterlude,
  createInitialGameState,
  finalizeFinal3Eviction,
} from '../../store/gameSlice'
import socialReducer, { recordSocialAction, replaceRealityDomain } from '../socialSlice'
import { socialMiddleware } from '../socialMiddleware'
import { appendRealityEvent, createInitialRealityDomainState } from '../reality'

function makeStore(game = createInitialGameState(), reality = createInitialRealityDomainState()) {
  game.dramaSocialMode = true
  let social = socialReducer(undefined, { type: 'test/init' })
  social = socialReducer(social, replaceRealityDomain(reality))
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState: { game, social },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
}

describe('Hub Chronicles episode lifecycle', () => {
  it('archives each weekend day once and carries the event and action cutoffs forward', () => {
    const game = createInitialGameState({ seed: 731 })
    game.week = 5
    game.phase = 'week_end'
    game.weekendInterlude = {
      active: true,
      afterDay: 5,
      weekendNumber: 1,
      weekendDay: 1,
      episode: 'hub_says',
      stage: 'social',
      wallet: { energy: 10, influence: 0, info: 0 },
    }
    const reality = createInitialRealityDomainState()
    const human = game.players.find((player) => player.isUser)!
    const earlierTarget = game.players.find((player) => !player.isUser)!
    const dayOneTarget = game.players.find(
      (player) => !player.isUser && player.id !== earlierTarget.id
    )!
    const dayTwoTarget = game.players.find(
      (player) => !player.isUser && player.id !== earlierTarget.id && player.id !== dayOneTarget.id
    )!
    appendRealityEvent(reality, {
      day: 5,
      phase: 'loh_results',
      type: 'CEREMONY_POWER_WON',
      actorId: earlierTarget.id,
      targetIds: [],
      participantIds: [earlierTarget.id],
      witnessIds: game.players.map((player) => player.id),
      visibility: 'CEREMONY_PUBLIC',
      outcome: 'SYSTEM',
      reason: 'Weekday competition result',
      tags: ['loh'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: true,
      juryEligible: true,
    })
    game.pulseChronicles = [
      {
        season: game.season,
        day: 5,
        episodeKey: 'day:5',
        episodeLabel: 'Day 5',
        capturedThroughTimestamp: 0,
        capturedThroughRealitySequence: reality.nextSequence - 1,
        title: 'Weekday',
        paragraphs: [],
        note: '',
        sourceEventIds: [],
        complete: true,
      },
    ]
    const store = makeStore(game, reality)

    store.dispatch(
      recordSocialAction({
        entry: {
          id: 'weekend-day-one-action',
          actionId: 'compliment',
          actorId: human.id,
          targetId: dayOneTarget.id,
          cost: 1,
          delta: 2,
          outcome: 'success',
          newEnergy: 4,
          timestamp: 1_000_000,
          week: 5,
          source: 'manual',
        },
      })
    )
    store.dispatch(beginWeekendDayTransition())

    const dayOne = store
      .getState()
      .game.pulseChronicles?.find((entry) => entry.episodeKey === 'weekend:1:5:1')
    expect(dayOne?.episodeLabel).toBe('Weekend 1 · Day 1')
    expect(dayOne?.paragraphs.join(' ')).toContain(`connect with ${dayOneTarget.name}`)
    expect(dayOne?.paragraphs.join(' ')).not.toContain('captured the LOH crown')

    store.dispatch(advanceWeekendDay())
    store.dispatch(
      recordSocialAction({
        entry: {
          id: 'weekend-day-two-action',
          actionId: 'compliment',
          actorId: human.id,
          targetId: dayTwoTarget.id,
          cost: 1,
          delta: 2,
          outcome: 'success',
          newEnergy: 3,
          timestamp: 2_000_000,
          week: 5,
          source: 'manual',
        },
      })
    )
    store.dispatch(completeWeekendInterlude())

    const episodes = store.getState().game.pulseChronicles ?? []
    const dayTwo = episodes.find((entry) => entry.episodeKey === 'weekend:1:5:2')
    expect(dayTwo?.paragraphs.join(' ')).toContain(`connect with ${dayTwoTarget.name}`)
    expect(dayTwo?.paragraphs.join(' ')).not.toContain(`connect with ${dayOneTarget.name}`)
    expect(dayTwo?.capturedThroughTimestamp).toBe(2_000_000)
    expect(dayTwo?.capturedThroughRealitySequence).toBe(reality.nextSequence - 1)
    expect(episodes.filter((entry) => entry.episodeKey?.startsWith('weekend:1:5:'))).toHaveLength(2)
  })

  it('records and archives the Final Three eviction as a public ceremony event', () => {
    const game = createInitialGameState({ seed: 812 })
    game.dramaSocialMode = true
    game.week = 15
    game.phase = 'final3_decision'
    const human = game.players.find((player) => player.isUser)!
    const finalists = [human, ...game.players.filter((player) => !player.isUser).slice(0, 2)]
    game.players.forEach((player) => {
      player.status = finalists.includes(player) ? 'active' : 'jury'
    })
    const [holder, evictee, remaining] = finalists
    holder.status = 'loh'
    evictee.status = 'nominated'
    remaining.status = 'nominated'
    game.lohId = holder.id
    game.nomineeIds = [evictee.id, remaining.id]
    game.awaitingFinal3Eviction = true
    const store = makeStore(game)

    store.dispatch(finalizeFinal3Eviction(evictee.id))

    const state = store.getState()
    expect(state.social.reality?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CEREMONY_EVICTION',
          actorId: holder.id,
          targetIds: [evictee.id],
          tags: expect.arrayContaining(['finale_choice']),
        }),
      ])
    )
    expect(
      state.game.pulseChronicles
        ?.find((entry) => entry.episodeKey === 'day:15')
        ?.paragraphs.join(' ')
    ).toContain(`The Final LOH chose ${evictee.name} to leave`)
  })
})
