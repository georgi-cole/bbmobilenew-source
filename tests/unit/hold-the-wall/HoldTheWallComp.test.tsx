import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import HoldTheWallComp from '../../../src/components/HoldTheWallComp/HoldTheWallComp'
import holdTheWallReducer, {
  offerFinalTwoDeal,
} from '../../../src/features/holdTheWall/holdTheWallSlice'
import gameReducer from '../../../src/store/gameSlice'
import socialReducer from '../../../src/social/socialSlice'

vi.mock('../../../src/ui/games/HoldTheWall/hooks/useHoldTheWallEffects', () => ({
  useHoldTheWallEffects: () => ({ activeEffects: {}, isAutoDropped: false }),
}))

vi.mock('../../../src/ui/games/HoldTheWall/effects/EffectsOverlay', () => ({
  default: () => null,
}))

vi.mock('../../../src/ui/games/HoldTheWall/Hourglass', () => ({
  default: () => null,
}))

describe('HoldTheWallComp final-two negotiation', () => {
  it('pauses the initial no-hold deadline while the Final Two deal choice is open', async () => {
    vi.useFakeTimers()
    const gameState = {
      ...gameReducer(undefined, { type: 'test/init' }),
      phase: 'loh_comp' as const,
    }
    const store = configureStore({
      reducer: {
        game: gameReducer,
        holdTheWall: holdTheWallReducer,
        social: socialReducer,
      },
      preloadedState: {
        game: gameState,
        social: socialReducer(undefined, { type: 'test/init' }),
      },
    })
    const { unmount } = render(
      <Provider store={store}>
        <HoldTheWallComp
          participantIds={['human', 'rival']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'rival', name: 'Rival', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>
    )

    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_300)
      })
      expect(store.getState().holdTheWall.status).toBe('active')
      expect(store.getState().holdTheWall.droppedIds).not.toContain('human')
      expect(screen.getByTestId('htw-final-two-deal')).toBeInTheDocument()
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it('does not count releasing the wall to reject a deal as a drop and lets the player resume holding', async () => {
    const gameState = {
      ...gameReducer(undefined, { type: 'test/init' }),
      phase: 'loh_comp' as const,
    }
    const store = configureStore({
      reducer: {
        game: gameReducer,
        holdTheWall: holdTheWallReducer,
        social: socialReducer,
      },
      preloadedState: {
        game: gameState,
        social: socialReducer(undefined, { type: 'test/init' }),
      },
    })

    const { unmount } = render(
      <Provider store={store}>
        <HoldTheWallComp
          participantIds={['human', 'rival']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'rival', name: 'Rival', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>
    )

    const wall = await screen.findByTestId('htw-wall')
    await act(async () => {
      store.dispatch(
        offerFinalTwoDeal({
          promisorId: 'rival',
          beneficiaryId: 'human',
          offeredBy: 'ai',
          affinityAtDeal: 0,
          tagsAtDeal: [],
        })
      )
    })
    expect(await screen.findByTestId('htw-final-two-deal')).toBeInTheDocument()
    Object.defineProperty(wall, 'setPointerCapture', { configurable: true, value: vi.fn() })

    fireEvent.pointerDown(wall, { pointerId: 1 })
    fireEvent.pointerUp(wall, { pointerId: 1 })
    expect(store.getState().holdTheWall.droppedIds).not.toContain('human')

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(store.getState().holdTheWall.finalTwoDeal?.status).toBe('declined')
    expect(store.getState().holdTheWall.droppedIds).not.toContain('human')

    fireEvent.pointerDown(wall, { pointerId: 2 })
    expect(screen.getByText('YOU ARE HOLDING')).toBeInTheDocument()
    expect(store.getState().holdTheWall.droppedIds).not.toContain('human')

    unmount()
  })
})
