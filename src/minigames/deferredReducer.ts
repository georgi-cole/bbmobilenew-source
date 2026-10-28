import { freeze, type Reducer, type UnknownAction } from '@reduxjs/toolkit'

type RegisteredReducer = (state: unknown, action: UnknownAction) => unknown

const registeredReducers = new Map<string, RegisteredReducer>()

/** A game registers during its module import, before its screen can dispatch an action. */
export function registerMinigameReducer<S>(key: string, reducer: Reducer<S>): Reducer<S> {
  registeredReducers.set(key, (state, action) => reducer(state as S | undefined, action))
  return reducer
}

/**
 * Preserve the existing state shape without importing a game's implementation or bank.
 * The stable facade also keeps existing store instances and selectors valid when a game loads.
 */
export function createDeferredReducer<S>(
  key: string,
  initialState: S,
  resetActionType: string
): Reducer<S> {
  const idleState = freeze(initialState, true)
  return (state = idleState, action) => {
    const reducer = registeredReducers.get(key)
    if (reducer) return reducer(state, action) as S
    return action.type === resetActionType ? idleState : state
  }
}
