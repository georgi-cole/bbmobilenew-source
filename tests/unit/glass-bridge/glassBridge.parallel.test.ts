import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import glassBridgeReducer, {
  MOVE_TIME_LIMIT_MS,
  finaliseOrderSelection,
  initGlassBridge,
  recordNumberChoice,
  resolveStep,
  startPlaying,
  tickBridge,
} from '../../../src/features/glassBridge/glassBridgeSlice'
import { mulberry32 } from '../../../src/store/rng'

const T0 = 50_000

function startedStore(rowsCount = 16) {
  const store = configureStore({ reducer: { glassBridge: glassBridgeReducer } })
  store.dispatch(
    initGlassBridge({
      participantIds: ['human', 'ai-1', 'ai-2'],
      participants: [
        { id: 'human', name: 'You', isHuman: true },
        { id: 'ai-1', name: 'AI 1', isHuman: false },
        { id: 'ai-2', name: 'AI 2', isHuman: false },
      ],
      competitionType: 'LOH',
      seed: 18,
      rowsCount,
      humanPlayerId: 'human',
    })
  )
  const pickedNumbers = [1, 2, 3]
  const orderRng = mulberry32(18 + 1)
  for (let i = pickedNumbers.length - 1; i > 0; i--) {
    const j = Math.floor(orderRng() * (i + 1))
    ;[pickedNumbers[i], pickedNumbers[j]] = [pickedNumbers[j], pickedNumbers[i]]
  }
  ;['human', 'ai-1', 'ai-2'].forEach((playerId, index) => {
    store.dispatch(recordNumberChoice({ playerId, number: pickedNumbers[index] }))
  })
  store.dispatch(finaliseOrderSelection())
  store.dispatch(startPlaying({ now: T0 }))
  return store
}

describe('The Crystal Path turn clock', () => {
  it('keeps the crossing strictly sequential until the active player moves or forfeits', () => {
    const store = startedStore()

    store.dispatch(tickBridge({ now: T0 + 8_000 }))
    let state = store.getState().glassBridge
    expect(state.turnOrder[state.currentTurnIndex]).toBe('human')
    expect(state.progress.human.forfeited).not.toBe(true)
    expect(state.progress['ai-1'].firstStepAtMs).toBeUndefined()

    store.dispatch(tickBridge({ now: T0 + MOVE_TIME_LIMIT_MS }))
    state = store.getState().glassBridge
    expect(state.progress.human.forfeited).toBe(true)
    expect(state.turnOrder[state.currentTurnIndex]).toBe('ai-1')
    expect(state.progress['ai-1'].eliminated).toBe(false)
    expect(state.progress['ai-1'].moveStartedAtMs).toBe(T0 + MOVE_TIME_LIMIT_MS)
  })

  it('does not collapse the field when total elapsed time exceeds a former round deadline', () => {
    const store = startedStore()
    store.dispatch(tickBridge({ now: T0 + 60_001 }))

    const state = store.getState().glassBridge
    expect(state.progress.human.forfeited).toBe(true)
    expect(state.progress['ai-1'].eliminated).toBe(false)
    expect(state.turnOrder[state.currentTurnIndex]).toBe('ai-1')
  })

  it('lets a selection made before the turn deadline finish its reveal animation', () => {
    const store = startedStore()
    const row = store.getState().glassBridge.rows[0]
    const chosenAt = T0 + MOVE_TIME_LIMIT_MS - 100

    store.dispatch(
      tickBridge({
        now: T0 + MOVE_TIME_LIMIT_MS + 500,
        pendingPlayerId: 'human',
        pendingChosenAtMs: chosenAt,
      })
    )
    expect(store.getState().glassBridge.progress.human.forfeited).not.toBe(true)

    store.dispatch(resolveStep({ chosenSide: row.safeSide, now: chosenAt }))
    const state = store.getState().glassBridge
    expect(state.progress.human.furthestRowReached).toBe(1)
    expect(state.turnOrder[state.currentTurnIndex]).toBe('human')
  })

  it('resets the same player clock after each safe tile instead of releasing opponents', () => {
    const store = startedStore()
    const firstSafe = store.getState().glassBridge.rows[0].safeSide
    store.dispatch(resolveStep({ chosenSide: firstSafe, now: T0 + 1_000 }))

    let state = store.getState().glassBridge
    expect(state.currentPlayerRow).toBe(2)
    expect(state.turnOrder[state.currentTurnIndex]).toBe('human')
    expect(state.progress.human.moveStartedAtMs).toBe(T0 + 1_000)
    expect(state.progress['ai-1'].firstStepAtMs).toBeUndefined()

    store.dispatch(tickBridge({ now: T0 + 1_000 + MOVE_TIME_LIMIT_MS }))
    state = store.getState().glassBridge
    expect(state.progress.human.forfeited).toBe(true)
    expect(state.turnOrder[state.currentTurnIndex]).toBe('ai-1')
  })
})
