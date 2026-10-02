import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  chooseHubSaysPlayer,
  continueWeekendFeature,
  createInitialGameState,
  debugActivateWeekendInterlude,
  debugSkipToWeekendDayTwo,
  submitHubSaysVote,
} from '../../../store/gameSlice'
import socialReducer from '../../../social/socialSlice'
import WeekendInterludeOverlay from '../WeekendInterludeOverlay'

function renderWeekend(afterDay: 5 | 10 | 15 = 5) {
  const base = createInitialGameState({ seed: 87231 })
  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState: { game: base, social: socialReducer(undefined, { type: 'init' }) },
  })
  store.dispatch(debugActivateWeekendInterlude(afterDay))
  return {
    store,
    ...render(
      <Provider store={store}>
        <WeekendInterludeOverlay />
      </Provider>
    ),
  }
}

describe('Weekend Faux TV beats', () => {
  it.each([5, 10, 15] as const)(
    'keeps Sunday concise and populated for weekend after Day %s',
    (afterDay) => {
      const { store } = renderWeekend(afterDay)
      act(() => store.dispatch(debugSkipToWeekendDayTwo()))
      expect(store.getState().game.weekendInterlude?.stage).toBe(
        afterDay === 10 ? 'party' : 'social'
      )
      if (afterDay === 10) act(() => store.dispatch(continueWeekendFeature()))
      const beat = document.querySelector('.weekend-interlude__beat--message')!
      expect(beat.textContent!.trim().length).toBeGreaterThan(0)
      expect(within(beat as HTMLElement).queryByRole('heading')).not.toBeInTheDocument()
      expect(screen.queryByText(/The Big Eye has left you/)).not.toBeInTheDocument()
    }
  )

  it('presents a welcome and instructions before the Hub Says carousel, without visible counters', () => {
    const { store } = renderWeekend()

    expect(screen.getByRole('heading', { name: 'Welcome to the weekend' })).toBeInTheDocument()
    expect(screen.getByText(/Get ready for a little honesty/)).toBeInTheDocument()

    act(() => store.dispatch(continueWeekendFeature()))
    expect(screen.getByRole('heading', { name: 'Five questions are coming.' })).toBeInTheDocument()
    act(() => store.dispatch(continueWeekendFeature()))

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    const carousel = screen.getByRole('group', { name: /Choose a Hubmate/ })
    expect(
      within(carousel)
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-pressed'))
    ).toHaveLength(4)
    const firstSelectable = store.getState().game.players.find((player) => !player.isUser)!
    const firstPlayer = within(carousel).getByRole('button', { name: firstSelectable.name })
    act(() => fireEvent.click(firstPlayer))
    expect(firstPlayer).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/\b\d+\s*\/\s*\d+\b/)).not.toBeInTheDocument()
    expect(screen.queryByText(/questions?\s+\d+\s+of\s+\d+/i)).not.toBeInTheDocument()
  })

  it('uses a welcome and instruction card for the party weekend too', () => {
    const { store } = renderWeekend(10)

    expect(screen.getByRole('heading', { name: 'Welcome to the weekend' })).toBeInTheDocument()
    act(() => store.dispatch(continueWeekendFeature()))
    expect(screen.getByRole('heading', { name: 'Follow the music.' })).toBeInTheDocument()
  })

  it('shows the Hub Says reveal as avatar, name, and percentage only', () => {
    const { store } = renderWeekend()
    act(() => {
      store.dispatch(continueWeekendFeature())
      store.dispatch(continueWeekendFeature())
    })
    const target = store.getState().game.players.find((player) => !player.isUser)!
    const questionId = store.getState().game.weekendInterlude!.hubSays!.questionIds[0]
    act(() => {
      store.dispatch(chooseHubSaysPlayer(target.id))
      store.dispatch(submitHubSaysVote({ questionId, targetId: target.id }))
    })

    expect(document.querySelector('.weekend-interlude__result-percentage')?.textContent).toMatch(
      /^\d+%$/
    )
    expect(document.querySelector('.weekend-interlude__hub')?.textContent).not.toMatch(
      /Weekend\s+1|\b1\s*\/\s*5\b/i
    )
  })
})
