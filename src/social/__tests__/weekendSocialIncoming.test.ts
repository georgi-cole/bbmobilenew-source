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

  it('dedupes routine weekend replies, caps the open routine queue, and still allows conflict reactions', () => {
    const store = makeStore()
    store.dispatch(debugActivateWeekendInterlude(10))
    store.dispatch(continueWeekendFeature())
    store.dispatch(continueWeekendFeature())
    store.dispatch(continueWeekendFeature())

    const state = store.getState()
    const human = state.game.players.find((player) => player.isUser)!
    const targets = state.game.players.filter((player) => !player.isUser).slice(0, 6)
    expect(targets.length).toBeGreaterThanOrEqual(6)

    const dispatchManual = (
      actionId: string,
      targetId: string,
      timestamp: number,
      outcome: 'success' | 'failure' = 'success',
      delta = 3
    ) =>
      store.dispatch(
        recordSocialAction({
          entry: {
            actionId,
            actorId: human.id,
            targetId,
            cost: 1,
            delta,
            outcome,
            newEnergy: 20,
            timestamp,
            source: 'manual',
          },
        })
      )

    // Two different low-stakes actions toward the same person should create
    // only one open acknowledgement for that weekend day.
    dispatchManual('reassure', targets[0].id, 1_000)
    dispatchManual('compliment', targets[0].id, 1_001)

    let weekendReplies = store
      .getState()
      .social.incomingInteractions.filter(
        (interaction) => interaction.payload?.scenarioKey === 'weekend_action_reply'
      )
    expect(weekendReplies.filter((interaction) => interaction.fromId === targets[0].id)).toHaveLength(
      1
    )

    // Low-value replies are globally bounded so interacting with the whole
    // cast does not turn the inbox into a wall of identical check-ins.
    for (let index = 1; index < targets.length; index += 1) {
      dispatchManual('reassure', targets[index].id, 1_010 + index)
    }

    weekendReplies = store
      .getState()
      .social.incomingInteractions.filter(
        (interaction) => interaction.payload?.scenarioKey === 'weekend_action_reply'
      )
    const routineReplies = weekendReplies.filter(
      (interaction) => interaction.payload?.weekendActionPriority !== 'high'
    )
    expect(routineReplies).toHaveLength(4)

    // Every manual action still remains in Hub Wire/history even when its
    // redundant inbox acknowledgement is suppressed.
    expect(store.getState().social.sessionLogs).toHaveLength(7)

    // A real confrontation remains consequential and may still open a thread
    // even after the low-value cap has been reached.
    dispatchManual('confront', targets[5].id, 2_000)

    weekendReplies = store
      .getState()
      .social.incomingInteractions.filter(
        (interaction) => interaction.payload?.scenarioKey === 'weekend_action_reply'
      )
    expect(
      weekendReplies.some(
        (interaction) =>
          interaction.fromId === targets[5].id &&
          interaction.payload?.weekendActionPriority === 'high'
      )
    ).toBe(true)
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
