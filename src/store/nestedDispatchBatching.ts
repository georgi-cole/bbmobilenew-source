import type { Store, StoreEnhancer } from 'redux'

/**
 * A synchronous gameplay dispatch can trigger many ordered middleware actions.
 * Keep every reducer/getState result immediate, but notify views
 * once the outer transaction settles. No timer, delayed action or state replay.
 */
export const batchNestedDispatchSubscriptions: StoreEnhancer<{
  subscribeImmediate: Store['subscribe']
}> =
  (next) =>
  (...args) => {
    const store = next(...args)
    let depth = 0
    const pending = new Set<() => void>()
    const dispatch: typeof store.dispatch = (action) => {
      depth++
      try {
        return store.dispatch(action)
      } finally {
        depth--
        if (!depth && pending.size) {
          const listeners = [...pending]
          pending.clear()
          for (const listener of listeners) listener()
        }
      }
    }
    return {
      ...store,
      // Lifecycle persistence and analytics retain every original observation.
      subscribeImmediate: store.subscribe,
      dispatch,
      subscribe(listener) {
        const notify = () => listener()
        const unsubscribe = store.subscribe(() => {
          if (depth) pending.add(notify)
          else notify()
        })
        return () => {
          pending.delete(notify)
          unsubscribe()
        }
      },
    }
  }
