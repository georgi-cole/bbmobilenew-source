import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PressurePlank from './PressurePlank'
import { PLANK_REFERENCE_CONTROLLERS, simulatePressurePlankRun } from './pressurePlankAi'

describe('Pressure Plank real pointer replay', () => {
  const originalRAF = window.requestAnimationFrame
  const originalCAF = window.cancelAnimationFrame
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 })
    window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16)
    window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  })
  afterEach(() => {
    cleanup()
    window.requestAnimationFrame = originalRAF
    window.cancelAnimationFrame = originalCAF
    vi.useRealTimers()
  })

  it.each([16, 125])(
    'matches opponent action survival through live touch handlers at %d ms frames',
    async (frameMs) => {
      window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), frameMs)
      const seed = 52
      const run = simulatePressurePlankRun({
        seed,
        playerId: 'reference',
        controller: PLANK_REFERENCE_CONTROLLERS.strong,
      })
      const store = configureStore({ reducer: { game: (state = { players: [] }) => state } })
      const onFinish = vi.fn()
      render(
        <Provider store={store}>
          <PressurePlank
            seed={seed}
            autoStart
            participantIds={['human', 'opponent']}
            participants={[
              { id: 'human', name: 'You', isHuman: true, precomputedScore: 0 },
              { id: 'opponent', name: 'Opponent', isHuman: false, precomputedScore: run.score },
            ]}
            onFinish={onFinish}
          />
        </Provider>
      )
      const origin = Date.now()
      let elapsed = 0
      for (const action of run.actions) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(action.atMs - elapsed)
        })
        elapsed = action.atMs
        const button = screen.getByRole('button', {
          name:
            action.direction === -1
              ? 'Tap left to shift balance left'
              : 'Tap right to shift balance right',
        })
        fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'touch' })
        fireEvent.pointerUp(button, { pointerId: 1, pointerType: 'touch' })
        // Native compatibility clicks must not apply a second impulse.
        fireEvent.click(button, { detail: 1 })
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_100 - (Date.now() - origin))
      })
      fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
      expect(onFinish).toHaveBeenCalledOnce()
      expect(onFinish.mock.calls[0][0]).toBe(run.score)
      expect(onFinish.mock.calls[0][2].rawResults).toEqual({
        human: run.score,
        opponent: run.score,
      })
    }
  )
})
