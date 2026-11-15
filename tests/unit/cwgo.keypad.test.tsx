import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ClosestWithoutGoingOverComp from '../../src/components/ClosestWithoutGoingOverComp'
import cwgoReducer, {
  startCwgoCompetition,
  type CwgoState,
} from '../../src/features/cwgo/cwgoCompetitionSlice'
import { CWGO_QUESTIONS } from '../../src/features/cwgo/cwgoQuestions'
import { parseCwgoGuess } from '../../src/features/cwgo/cwgoDisplay'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Don’t Go Over fixed number pad', () => {
  it.each(['mass_input', 'duel_input'] as const)(
    'submits scaled decimal guesses from %s without a native keyboard',
    (status) => {
      vi.useFakeTimers()
      const ids = ['human', 'ai-1', 'ai-2']
      let state: CwgoState = cwgoReducer(
        undefined,
        startCwgoCompetition({ participantIds: ids, prizeType: 'LOH', seed: 42 })
      )
      state = {
        ...state,
        questionIdx: CWGO_QUESTIONS.findIndex((q) => Boolean(q.scale)),
        status,
        ...(status === 'duel_input'
          ? {
              stage: 'final',
              aliveIds: ids.slice(0, 2),
              duelPair: ['human', 'ai-1'],
              playerScores: { human: 3, 'ai-1': 3 },
            }
          : {}),
      }
      const store = configureStore({
        reducer: {
          cwgo: (current: CwgoState | undefined, action: { type: string }) =>
            current &&
            (action.type === 'cwgo/startCwgoCompetition' || action.type === 'cwgo/resetCwgo')
              ? current
              : cwgoReducer(current, action),
          game: (
            current = {
              players: ids.map((id) => ({ id, name: id, avatar: '', isUser: id === 'human' })),
            }
          ) => current,
        },
        preloadedState: { cwgo: state },
      })
      render(
        <Provider store={store}>
          <ClosestWithoutGoingOverComp participantIds={ids} prizeType="LOH" seed={42} />
        </Provider>
      )
      const input = screen.getByRole('textbox', { name: 'Your guess' })
      expect(input).toHaveAttribute('readonly')
      expect(input).toHaveAttribute('inputmode', 'none')
      expect(input).not.toHaveFocus()
      for (const name of ['1', 'Decimal point', '5'])
        fireEvent.click(screen.getByRole('button', { name, exact: true }))
      fireEvent.click(screen.getByRole('button', { name: 'Decimal point' }))
      expect(input).toHaveValue('1.5')
      fireEvent.click(screen.getByRole('button', { name: 'Delete last digit' }))
      fireEvent.click(screen.getByRole('button', { name: '2', exact: true }))
      expect(input).toHaveValue('1.2')
      act(() => vi.advanceTimersByTime(2000))
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(store.getState().cwgo.guesses.human).toBe(
        parseCwgoGuess('1.2', CWGO_QUESTIONS[state.questionIdx])
      )
      expect(store.getState().cwgo.responseTimesMs.human).toBeGreaterThanOrEqual(2000)
      expect(store.getState().cwgo.status).toBe(
        status === 'mass_input' ? 'mass_reveal' : 'duel_reveal'
      )
    }
  )
})
