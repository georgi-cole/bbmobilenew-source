import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import FamousFiguresComp from '../../../src/components/FamousFiguresComp/FamousFiguresComp'
import famousFiguresReducer, {
  type FamousFiguresState,
} from '../../../src/features/famousFigures/famousFiguresSlice'
import gameReducer from '../../../src/store/gameSlice'

describe('Famous Figures tied final scoreboard', () => {
  it('shows the actual winner first, explains the draw, and reports the human as second', () => {
    const roundScores = {
      human: [8, 5, 8, 3, 5, 8],
      finn: [5, 8, 8, 3, 8, 5],
      rae: [8, 8, 0, 8, 5, 5],
    }
    const completed: FamousFiguresState = {
      ...famousFiguresReducer(undefined, { type: 'init' }),
      status: 'complete',
      competitionType: 'LOH',
      currentRound: 5,
      totalRounds: 6,
      winnerId: 'finn',
      playerScores: { human: 37, finn: 37, rae: 34 },
      playerRoundScores: roundScores,
      playerPersonalRoundScores: roundScores,
      tieBreakOrder: ['finn', 'human', 'rae'],
    }
    const store = configureStore({
      reducer: { game: gameReducer, famousFigures: () => completed },
    })
    const onComplete = vi.fn()
    render(
      <Provider store={store}>
        <FamousFiguresComp
          participantIds={['human', 'finn', 'rae']}
          participants={[
            { id: 'human', name: 'Kiara', isHuman: true },
            { id: 'finn', name: 'Finn', isHuman: false },
            { id: 'rae', name: 'Rae', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
          skipWinnerAnimation
          onComplete={onComplete}
        />
      </Provider>
    )
    const table = screen.getByRole('table', { name: 'Player points by round' })
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Finn')
    expect(rows[2]).toHaveTextContent('You')
    expect(screen.getByText(/Tied at 37 points and 6 correct answers/)).toHaveTextContent(
      'pre-drawn tie-break order is Finn, then you'
    )
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      authoritativeWinnerId: 'finn',
      authoritativeRankedIds: ['finn', 'human', 'rae'],
    })
  })
})
