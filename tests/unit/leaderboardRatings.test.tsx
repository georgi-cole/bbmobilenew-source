import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import Leaderboard from '../../src/screens/Leaderboard/Leaderboard'
import gameReducer, { createInitialGameState } from '../../src/store/gameSlice'

describe('Hall of Fame season ratings', () => {
  it('keeps the archived public rating visible when season details are expanded', () => {
    const initial = createInitialGameState({ seed: 8801 })
    const human = initial.players.find((player) => player.isUser)
    if (!human) throw new Error('Expected a human player')

    const game = {
      ...initial,
      seasonArchives: [
        {
          seasonIndex: 1,
          seasonId: 'rating-season',
          playerSummaries: [
            {
              playerId: human.id,
              displayName: human.name,
              finalPlacement: 1,
              finalPublicApproval: 83,
              daysAlive: 14,
            },
            {
              playerId: initial.players[1].id,
              displayName: initial.players[1].name,
              finalPlacement: 2,
              daysAlive: 14,
            },
          ],
        },
      ],
    }
    const store = configureStore({
      reducer: { game: gameReducer },
      preloadedState: { game },
    })

    render(
      <Provider store={store}>
        <MemoryRouter>
          <Leaderboard />
        </MemoryRouter>
      </Provider>
    )

    const card = screen.getByRole('button', { name: /season 1.*public rating: 83%/i })
    expect(screen.getByText('★ 83%')).toBeTruthy()

    fireEvent.click(card)

    expect(screen.getByText('Runner-up')).toBeTruthy()
    expect(screen.getByText('★ 83%')).toBeTruthy()
  })

  it('uses a clear placeholder for archives created before ratings were stored', () => {
    const initial = createInitialGameState({ seed: 8802 })
    const human = initial.players.find((player) => player.isUser)
    if (!human) throw new Error('Expected a human player')

    const game = {
      ...initial,
      seasonArchives: [
        {
          seasonIndex: 1,
          seasonId: 'legacy-rating-season',
          playerSummaries: [
            {
              playerId: human.id,
              displayName: human.name,
              finalPlacement: 1,
              daysAlive: 14,
            },
          ],
        },
      ],
    }
    const store = configureStore({
      reducer: { game: gameReducer },
      preloadedState: { game },
    })

    render(
      <Provider store={store}>
        <MemoryRouter>
          <Leaderboard />
        </MemoryRouter>
      </Provider>
    )

    expect(screen.getByRole('button', { name: /public rating: not recorded/i })).toBeTruthy()
    expect(screen.getByText('★ Not recorded')).toBeTruthy()
  })
})
