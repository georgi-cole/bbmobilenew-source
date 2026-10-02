import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  chooseHubSaysPlayer,
  continueHubSays,
  continueWeekendFeature,
  debugActivateWeekendInterlude,
  submitHubSaysVote,
} from '../../store/gameSlice'
import socialReducer, { recordSocialAction } from '../socialSlice'
import { socialMiddleware } from '../socialMiddleware'

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
}

describe('weekend incoming social activity', () => {
  it('adds autonomous arrivals when weekend social opens and a reply after a manual action', () => {
    const store = makeStore()
    store.dispatch(debugActivateWeekendInterlude(10))
    store.dispatch(continueWeekendFeature())
    store.dispatch(continueWeekendFeature())
    store.dispatch(continueWeekendFeature())

    const afterArrival = store.getState()
    expect(afterArrival.game.weekendInterlude?.stage).toBe('social')
    expect(afterArrival.social.incomingInteractions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({ scenarioKey: 'weekend_arrival' }),
        }),
        expect.objectContaining({
          payload: expect.objectContaining({ scenarioKey: 'weekend_buzz' }),
        }),
      ])
    )
    const weekendBuzz = afterArrival.social.incomingInteractions.find(
      (interaction) => interaction.payload?.scenarioKey === 'weekend_buzz'
    )
    const weekendBuzzSpeaker = afterArrival.game.players.find(
      (player) => player.id === weekendBuzz?.fromId
    )
    expect(weekendBuzz?.text).toMatch(/^I’ve been catching up/)
    expect(weekendBuzz?.text).not.toContain(weekendBuzzSpeaker?.name)

    const human = afterArrival.game.players.find((player) => player.isUser)!
    const target = afterArrival.game.players.find((player) => !player.isUser)!
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'reassure',
          actorId: human.id,
          targetId: target.id,
          cost: 1,
          delta: 4,
          outcome: 'success',
          newEnergy: 4,
          timestamp: 1_234_567,
          source: 'manual',
        },
      })
    )

    expect(store.getState().social.incomingInteractions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromId: target.id,
          payload: expect.objectContaining({ scenarioKey: 'weekend_action_reply' }),
        }),
      ])
    )
  })

  it('gives a Hub Says arrival a natural, relevant check-in instead of vague question copy', () => {
    const store = makeStore()
    store.dispatch(debugActivateWeekendInterlude(5))
    store.dispatch(continueWeekendFeature())
    store.dispatch(continueWeekendFeature())

    const target = store.getState().game.players.find((player) => !player.isUser)!
    const questionIds = store.getState().game.weekendInterlude!.hubSays!.questionIds
    for (let index = 0; index < questionIds.length; index += 1) {
      const questionId = questionIds[index]
      store.dispatch(chooseHubSaysPlayer(target.id))
      store.dispatch(submitHubSaysVote({ questionId, targetId: target.id }))
      store.dispatch(continueHubSays())
    }

    const arrival = store
      .getState()
      .social.incomingInteractions.find(
        (interaction) => interaction.payload?.scenarioKey === 'weekend_arrival'
      )
    expect(arrival?.text).toBe(
      'Those answers were more honest than I expected. Which one surprised you most?'
    )
    expect(arrival?.text).not.toMatch(/Hub Says question/i)
  })

  it('does not create weekend messages during ordinary social actions', () => {
    const store = makeStore()
    const state = store.getState()
    const human = state.game.players.find((player) => player.isUser)!
    const target = state.game.players.find((player) => !player.isUser)!

    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'reassure',
          actorId: human.id,
          targetId: target.id,
          cost: 1,
          delta: 4,
          outcome: 'success',
          newEnergy: 4,
          timestamp: 1_234_568,
          source: 'manual',
        },
      })
    )

    expect(store.getState().social.incomingInteractions).toEqual([])
  })
})
