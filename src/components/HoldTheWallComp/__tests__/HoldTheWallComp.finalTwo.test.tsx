import { act, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer from '../../../store/gameSlice'
import type { GameState } from '../../../types'
import socialReducer from '../../../social/socialSlice'
import holdTheWallReducer from '../../../features/holdTheWall/holdTheWallSlice'
import HoldTheWallComp from '../HoldTheWallComp'

function makeStore() {
  const initialGame = gameReducer(undefined, { type: 'test/init' })
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      holdTheWall: holdTheWallReducer,
    },
    preloadedState: {
      game: { ...initialGame, phase: 'loh_comp' as GameState['phase'] },
    },
  })
}

function renderFinalTwo() {
  const store = makeStore()
  const players = store.getState().game.players
  const human = players.find((player) => player.isUser)!
  const rival = players.find((player) => !player.isUser)!

  render(
    <Provider store={store}>
      <HoldTheWallComp
        participantIds={[human.id, rival.id]}
        participants={[
          { id: human.id, name: human.name, isHuman: true },
          { id: rival.id, name: rival.name, isHuman: false },
        ]}
        prizeType="LOH"
        seed={1}
      />
    </Provider>
  )

  return { human, store }
}

function releaseToUseDealPopup(humanId: string, store: ReturnType<typeof makeStore>) {
  const wall = screen.getByTestId('htw-wall')
  fireEvent.pointerDown(wall, { pointerId: 1 })
  fireEvent.pointerUp(wall, { pointerId: 1 })

  expect(screen.getByTestId('htw-final-two-deal')).toBeInTheDocument()
  expect(store.getState().holdTheWall.droppedIds).not.toContain(humanId)

  fireEvent.click(screen.getByRole('button', { name: /reject|keep playing/i }))
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('HoldTheWallComp final-two regrip grace period', () => {
  let pointerCaptureDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    pointerCaptureDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'setPointerCapture'
    )
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    if (pointerCaptureDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', pointerCaptureDescriptor)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
    }
    vi.useRealTimers()
  })

  it('does not count the popup release as a drop and lets the player regrip within three seconds', async () => {
    const { human, store } = renderFinalTwo()
    releaseToUseDealPopup(human.id, store)

    expect(screen.getByText(/regrip within 3 seconds/i)).toBeInTheDocument()
    expect(store.getState().holdTheWall.droppedIds).not.toContain(human.id)

    await advance(2_000)
    expect(store.getState().holdTheWall.droppedIds).not.toContain(human.id)

    fireEvent.pointerDown(screen.getByTestId('htw-wall'), { pointerId: 2 })
    expect(screen.getByText(/hold steady/i)).toBeInTheDocument()

    await advance(3_000)
    expect(store.getState().holdTheWall.droppedIds).not.toContain(human.id)
  })

  it('drops the player if they do not regrip before the three-second grace expires', async () => {
    const { human, store } = renderFinalTwo()
    releaseToUseDealPopup(human.id, store)

    await advance(2_999)
    expect(store.getState().holdTheWall.droppedIds).not.toContain(human.id)

    await advance(1)
    expect(store.getState().holdTheWall.droppedIds).toContain(human.id)
  })
})
