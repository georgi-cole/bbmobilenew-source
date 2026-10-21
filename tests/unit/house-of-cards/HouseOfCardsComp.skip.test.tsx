import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/features/houseOfCards/houseOfCardsAi', () => ({
  createHouseOfCardsAiProfiles: (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { sessionAbility: 55 }])),
  chooseHouseOfCardsAiTool: () => 'peek',
  simulateHouseOfCardsAiRound: ({ pairCount }: { pairCount: number }) => ({
    score: 9_999,
    completedPairs: pairCount,
    mistakes: 0,
    scoringMistakes: 0,
    timeMs: 1_000,
    bestStreak: pairCount,
    tool: 'peek',
    toolDelta: 0,
    toolOutcome: 'Peeked privately',
    brightPairBonus: 120,
  }),
}))

import HouseOfCardsComp from '../../../src/components/HouseOfCardsComp/HouseOfCardsComp'
import { buildHouseOfCardsBoard } from '../../../src/components/HouseOfCardsComp/houseOfCardsUtils'
import houseOfCardsReducer from '../../../src/features/houseOfCards/houseOfCardsSlice'

function pairIndexes(seed: number, round: number, pairCount: number): number[][] {
  const roundSeed = round === 1 ? seed : seed ^ Math.imul(round, 0x85ebca6b)
  const bySymbol = new Map<string, number[]>()
  buildHouseOfCardsBoard(roundSeed, pairCount).forEach((card) => {
    bySymbol.set(card.symbol, [...(bySymbol.get(card.symbol) ?? []), card.index])
  })
  return [...bySymbol.values()]
}

async function finishRound(seed: number, round: number, pairCount: number) {
  fireEvent.click(screen.getByRole('button', { name: /^Peek/ }))
  for (const [first, second] of pairIndexes(seed, round, pairCount)) {
    await act(async () => {
      fireEvent.click(screen.getAllByRole('gridcell')[first])
    })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('gridcell')[second])
    })
    act(() => {
      vi.advanceTimersByTime(260)
    })
  }
}

describe('HouseOfCardsComp spectator skip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => vi.useRealTimers())

  it('takes an eliminated player directly to final results', async () => {
    const store = configureStore({
      reducer: {
        game: (state = { phase: 'loh_comp' }) => state,
        houseOfCards: houseOfCardsReducer,
      },
    })
    render(
      <Provider store={store}>
        <HouseOfCardsComp
          participantIds={['human', 'ai-one', 'ai-two']}
          participants={[
            { id: 'human', name: 'You', isHuman: true },
            { id: 'ai-one', name: 'AI One', isHuman: false },
            { id: 'ai-two', name: 'AI Two', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>
    )

    for (const [round, pairCount] of [
      [1, 4],
      [2, 6],
      [3, 8],
    ] as const) {
      await finishRound(42, round, pairCount)
      if (round < 3) {
        expect(screen.getByText(`Round ${round} complete`)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Next round' }))
      }
    }

    expect(screen.getByRole('button', { name: 'Skip to results' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip to results' }))

    expect(screen.getByLabelText('Final standings')).toBeInTheDocument()
    expect(screen.getByText(/wins Deck of Light/)).toBeInTheDocument()
  })
})
