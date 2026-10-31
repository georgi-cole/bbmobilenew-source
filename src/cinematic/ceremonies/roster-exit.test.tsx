import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configureStore, type UnknownAction } from '@reduxjs/toolkit'
import type { RootState } from '../../store/store'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { store as baseline } from '../../store/store'
import RosterExit from './roster-exit'
import { hasCoveredRosterExit, useRosterExitPreview } from './roster-exit-state'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
function fixture() {
  const state = structuredClone(baseline.getState())
  state.game.gameId = 'roster-confirmation'
  state.game.week = 2
  state.game.players = state.game.players.slice(0, 2).map((p, i) => ({
    ...p,
    id: ['nova', 'lia'][i],
    name: ['Nova', 'Lia'][i],
    status: 'nominated',
  }))
  return configureStore({
    reducer: (current: RootState = state, action: UnknownAction) =>
      action.type === 'finish'
        ? {
            ...current,
            game: {
              ...current.game,
              players: current.game.players.map((p) =>
                p.id === action.payload ? { ...p, status: 'evicted' as const } : p
              ),
            },
          }
        : current,
  })
}
function Preview() {
  const preview = useRosterExitPreview()
  return <output data-testid="preview">{JSON.stringify(preview)}</output>
}
it('reveals the coloured roster first, applies its existing mark, then commits once', () => {
  const store = fixture()
  const done = vi.fn(() => store.dispatch({ type: 'finish', payload: 'nova' }))
  const view = render(
    <Provider store={store}>
      <Preview />
      <RosterExit evictee={store.getState().game.players[0]} onDone={done} />
    </Provider>
  )
  expect(screen.getByTestId('preview').textContent).toContain('"marked":false')
  act(() => vi.advanceTimersByTime(220))
  expect(screen.getByTestId('preview').textContent).toContain('"marked":true')
  expect(done).not.toHaveBeenCalled()
  expect(view.container.querySelector('.seo')).toBeNull()
  expect(document.querySelector('.seo__hero-photo')).toBeNull()
  act(() => vi.advanceTimersByTime(700))
  expect(done).toHaveBeenCalledTimes(1)
  expect(store.getState().game.players[0].status).toBe('evicted')
  expect(screen.getByTestId('preview').textContent).toContain('"ids":[]')
  act(() => vi.advanceTimersByTime(5000))
  expect(done).toHaveBeenCalledTimes(1)
})
it('marks a Cupid pair together and consumes the queued partner without another movie or portrait', () => {
  const store = fixture()
  const [nova, lia] = store.getState().game.players
  const doneFirst = vi.fn(() => store.dispatch({ type: 'finish', payload: nova.id }))
  const doneSecond = vi.fn(() => store.dispatch({ type: 'finish', payload: lia.id }))
  const view = render(
    <Provider store={store}>
      <Preview />
      <RosterExit key="nova" evictee={nova} rosterIds={['nova', 'lia']} onDone={doneFirst} />
    </Provider>
  )
  act(() => vi.advanceTimersByTime(920))
  expect(doneFirst).toHaveBeenCalledTimes(1)
  expect(hasCoveredRosterExit(store, store.getState().game, lia.id)).toBe(true)
  view.rerender(
    <Provider store={store}>
      <Preview />
      <RosterExit key="lia" evictee={lia} onDone={doneSecond} />
    </Provider>
  )
  act(() => vi.advanceTimersByTime(1))
  expect(doneSecond).toHaveBeenCalledTimes(1)
  expect(store.getState().game.players.every((p) => p.status === 'evicted')).toBe(true)
  expect(hasCoveredRosterExit(store, store.getState().game, lia.id)).toBe(false)
})
it('cancels an interrupted roster confirmation without committing an eviction', () => {
  const store = fixture()
  const done = vi.fn()
  const view = render(
    <Provider store={store}>
      <RosterExit evictee={store.getState().game.players[0]} onDone={done} />
    </Provider>
  )
  act(() => vi.advanceTimersByTime(300))
  view.unmount()
  act(() => vi.advanceTimersByTime(1000))
  expect(done).not.toHaveBeenCalled()
  expect(hasCoveredRosterExit(store, store.getState().game, 'nova')).toBe(false)
})

it('Skip cannot leave a late cosmetic mark or commit twice', () => {
  const store = fixture()
  const done = vi.fn(() => store.dispatch({ type: 'finish', payload: 'nova' }))
  render(
    <Provider store={store}>
      <Preview />
      <RosterExit evictee={store.getState().game.players[0]} onDone={done} />
    </Provider>
  )
  act(() => vi.advanceTimersByTime(200))
  fireEvent.click(screen.getByRole('button', { name: 'Skip roster elimination' }))
  act(() => vi.advanceTimersByTime(1200))
  expect(done).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('preview').textContent).toContain('"ids":[]')
})
