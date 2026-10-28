import { configureStore, type Middleware } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import { batchNestedDispatchSubscriptions } from './nestedDispatchBatching'

function setup(batched: boolean) {
  const observed: number[] = []
  const actions: string[] = []
  const middleware: Middleware<object, number> = (api) => (next) => (action) => {
    const type = (action as { type: string }).type
    actions.push(type)
    const result = next(action)
    observed.push(api.getState())
    if (type === 'advance') {
      api.dispatch({ type: 'consequence' })
      api.dispatch({ type: 'announcement' })
    }
    if (type === 'failure') {
      api.dispatch({ type: 'consequence' })
      throw new Error('after commit')
    }
    return result
  }
  const store = configureStore({
    reducer: (state = 0, action) => (action.type.startsWith('@@') ? state : state + 1),
    middleware: (getDefault) => getDefault().concat(middleware),
    enhancers: (getDefault) =>
      batched ? getDefault().prepend(batchNestedDispatchSubscriptions) : getDefault(),
  })
  return { store, actions, observed }
}

describe('nested gameplay subscription batching', () => {
  it('keeps actions, intermediate middleware reads and final outcomes identical', () => {
    const original = setup(false),
      batched = setup(true)
    const notifications: number[] = []
    const immediate: number[] = []
    batched.store.subscribe(() => notifications.push(batched.store.getState()))
    if (!('subscribeImmediate' in batched.store)) throw new Error('Expected batching enhancer')
    batched.store.subscribeImmediate(() => immediate.push(batched.store.getState()))
    for (const fixture of [original, batched]) {
      const action = { type: 'advance' }
      expect(fixture.store.dispatch(action)).toBe(action)
    }
    expect(batched.actions).toEqual(original.actions)
    expect(batched.observed).toEqual(original.observed)
    expect(batched.store.getState()).toBe(original.store.getState())
    expect(notifications).toEqual([3])
    expect(immediate).toEqual([1, 2, 3])
    batched.store.dispatch({ type: 'next' })
    expect(notifications).toEqual([3, 4])
  })

  it('flushes committed changes after an error and restores normal notifications', () => {
    const { store } = setup(true)
    const listener = vi.fn()
    store.subscribe(listener)
    expect(() => store.dispatch({ type: 'failure' })).toThrow('after commit')
    expect(store.getState()).toBe(2)
    expect(listener).toHaveBeenCalledTimes(1)
    store.dispatch({ type: 'next' })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('supports unsubscribe and dispatch from subscribers without losing updates', () => {
    const { store } = setup(true)
    const states: number[] = []
    const unsubscribe = store.subscribe(() => {
      states.push(store.getState())
      if (store.getState() === 3) store.dispatch({ type: 'subscriber' })
    })
    store.dispatch({ type: 'advance' })
    expect(states).toEqual([3, 4])
    unsubscribe()
    store.dispatch({ type: 'next' })
    expect(states).toEqual([3, 4])
  })
})
