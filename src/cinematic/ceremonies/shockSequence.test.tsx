import { configureStore } from '@reduxjs/toolkit'
import { render, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { expect, it, vi } from 'vitest'
import { store as baseline } from '../../store/store'
import Shock from './shock'

const { prepare, mount } = vi.hoisted(() => ({ prepare: vi.fn(async () => ({})), mount: vi.fn() }))
vi.mock('./renderer.js', () => ({
  createClip: () => ({
    prepare,
    mount: (_parent: HTMLElement, _handoff: () => void, done: () => void) => {
      mount()
      queueMicrotask(done)
    },
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setVisible: vi.fn(),
  }),
}))

it('completes follow-up cards and an alias without replaying the Back 2 the Game renderer', async () => {
  const fixture = structuredClone(baseline.getState())
  fixture.vip.isActive = true
  fixture.settings.gameUX.animations = true
  fixture.settings.gameUX.animationMode = 'cinematic'
  fixture.settings.display.reduceMotion = false
  fixture.game.gameId = 'single-bb-reveal'
  fixture.game.week = 5
  const store = configureStore({ reducer: (state = fixture) => state })
  const done = vi.fn()
  const view = (key: string) => (
    <Provider store={store}>
      <Shock key={key} active shockKey={key} onComplete={done} />
    </Provider>
  )
  const { rerender } = render(view('battle_back'))
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1))
  expect(prepare).toHaveBeenCalledTimes(1)
  expect(mount).toHaveBeenCalledTimes(1)
  for (const [i, key] of [
    'battle_back_rules',
    'battle_back_challenge',
    'battle_back_shock',
  ].entries()) {
    rerender(view(key))
    await waitFor(() => expect(done).toHaveBeenCalledTimes(i + 2))
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(mount).toHaveBeenCalledTimes(1)
  }
  expect(document.querySelector('.shock-intro')).toBeNull()
  expect(document.querySelector('[data-cinematic-active]')).toBeNull()
})
