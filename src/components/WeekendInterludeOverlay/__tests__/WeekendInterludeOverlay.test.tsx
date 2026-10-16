import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  chooseHubSaysPlayer,
  continueWeekendFeature,
  beginFinaleReunionSocial,
  beginWeekendTribunalGlimpse,
  createInitialGameState,
  debugEndFinaleReunionPreview,
  debugActivateWeekendInterlude,
  debugPrepareFinaleReunionPreview,
  debugSkipToWeekendDayTwo,
  beginWeekendReunionDeparture,
  finishWeekendReunionDeparture,
  openWeekendTribunalStream,
  returnFromWeekendTribunalStream,
  submitHubSaysVote,
  hydrateGame,
} from '../../../store/gameSlice'
import socialReducer, { pushIncomingInteraction } from '../../../social/socialSlice'
import type { IncomingInteraction } from '../../../social/types'
import WeekendInterludeOverlay from '../WeekendInterludeOverlay'

function renderWeekend(afterDay: 5 | 10 | 15 | 'finale' = 5) {
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
  it('keeps the reunion return out of the Faux TV and continues to the Tribunal invitation', () => {
    const { store, container } = renderWeekend('finale')
    const originalStatuses = store.getState().game.players.map(({ id, status }) => [id, status])
    act(() => store.dispatch(debugPrepareFinaleReunionPreview()))

    expect(screen.queryByTestId('finale-reunion-preview')).not.toBeInTheDocument()
    expect(container.querySelector('.weekend-interlude')).toBeNull()
    expect(store.getState().game.players.map(({ id, status }) => [id, status])).toEqual(
      originalStatuses
    )

    act(() => store.dispatch(debugEndFinaleReunionPreview()))
    expect(store.getState().game.weekendInterlude?.stage).toBe('tribunal_invitation')
    expect(screen.queryByTestId('finale-reunion-preview')).not.toBeInTheDocument()
  })

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

  it('gives the finale-weekend opening one clear title instead of repeating the welcome', () => {
    renderWeekend('finale')

    expect(screen.getByRole('heading', { name: 'The Final Weekend' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Welcome to the weekend' })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Three finalists\. One last night to prepare/)).toBeInTheDocument()
  })

  it('shows the full-screen reunion, social invitation, sequester announcement, and farewell in order', () => {
    const { store, container } = renderWeekend('finale')
    act(() => store.dispatch(debugSkipToWeekendDayTwo()))

    const beforeAnnouncement = store.getState().game
    const returnedPlayers = beforeAnnouncement.players.map((player, index) => ({
      ...player,
      status:
        index < 3 ? ('active' as const) : index % 2 ? ('jury' as const) : ('evicted' as const),
    }))
    const originalStatuses = returnedPlayers.map(({ id, status }) => [id, status])
    act(() =>
      store.dispatch(
        hydrateGame({
          ...beforeAnnouncement,
          players: returnedPlayers,
          weekendInterlude: beforeAnnouncement.weekendInterlude
            ? {
                ...beforeAnnouncement.weekendInterlude,
                debug: undefined,
                tribunalGlimpse: undefined,
              }
            : null,
        })
      )
    )

    expect(store.getState().game.weekendInterlude).toMatchObject({
      weekendDay: 2,
      stage: 'tribunal_invitation',
    })
    expect(screen.getByTestId('finale-reunion-announcement')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Look who's back." })).toBeInTheDocument()
    expect(
      screen.getByText(
        'All of them. One last party before the finale—for old scores and words left unsaid.'
      )
    ).toBeInTheDocument()
    expect(container.querySelector('.weekend-interlude')).toBeNull()
    expect(screen.getAllByAltText(/returning for the finale reunion/)).toHaveLength(
      returnedPlayers.length - 3
    )
    expect(
      screen.getAllByAltText(/returning for the finale reunion/)[0].getAttribute('src')
    ).toContain('Informal_attires')

    act(() => store.dispatch(beginFinaleReunionSocial()))
    expect(store.getState().game.weekendInterlude?.stage).toBe('finale_reunion_social')
    expect(
      screen.getByRole('heading', { name: 'Reconnect before the finale.' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Your former Hubmates are back. Visit profiles, make amends, clear the air.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Messages await in your inbox.')).not.toBeInTheDocument()

    act(() => store.dispatch(beginWeekendTribunalGlimpse()))
    expect(store.getState().game.weekendInterlude?.stage).toBe('finale_sequester_announcement')
    expect(screen.getByRole('heading', { name: 'Special footage is ready.' })).toBeInTheDocument()
    expect(container.querySelector('.weekend-interlude__sequester-badge')).toBeInTheDocument()
    expect(screen.getByText('Go to the Confessional for a special stream.')).toBeInTheDocument()
    expect(store.getState().game.weekendInterlude?.tribunalGlimpse?.opened).toBe(false)

    act(() => store.dispatch(openWeekendTribunalStream()))
    act(() => store.dispatch(returnFromWeekendTribunalStream()))
    expect(store.getState().game.weekendInterlude?.stage).toBe('finale_battle_ready')
    expect(screen.getByRole('heading', { name: 'It’s time to say goodbye.' })).toBeInTheDocument()

    act(() => store.dispatch(beginWeekendReunionDeparture()))
    expect(screen.getByRole('heading', { name: 'The reunion is over.' })).toBeInTheDocument()
    expect(screen.getByText(/Some relationships may be beyond repair/)).toBeInTheDocument()
    act(() => store.dispatch(finishWeekendReunionDeparture()))
    expect(
      screen.getByRole('heading', { name: 'The eliminated players have left.' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/The Tribunal is in place\. The Final Power Battle is next/)
    ).toBeInTheDocument()
    expect(container.querySelector('.weekend-interlude__reunion-departure')).not.toBeNull()
    expect(store.getState().game.players.map(({ id, status }) => [id, status])).toEqual(
      originalStatuses
    )
  })

  it('invites the player to socialize while keeping reunion messages in the inbox', () => {
    const { store } = renderWeekend('finale')
    const initialGame = store.getState().game
    const human = initialGame.players.find((player) => player.isUser)!
    const activeIds = new Set([
      human.id,
      ...initialGame.players
        .filter((player) => !player.isUser)
        .slice(0, 2)
        .map((player) => player.id),
    ])
    const weekend = {
      ...initialGame.weekendInterlude!,
      debug: undefined,
      weekendDay: 2 as const,
      stage: 'finale_reunion_social' as const,
      tribunalGlimpse: undefined,
    }
    const players = initialGame.players.map((player) => {
      if (activeIds.has(player.id)) return { ...player, status: 'active' as const }
      return { ...player, status: 'jury' as const }
    })
    const guest = players.find((player) => player.status === 'jury')!
    const message: IncomingInteraction = {
      id: `finale-reunion-message:${guest.id}`,
      fromId: guest.id,
      type: 'check_in',
      text: 'I owe you an apology for how we left things.',
      createdAt: 1,
      createdWeek: initialGame.week,
      expiresAtWeek: initialGame.week + 1,
      read: false,
      requiresResponse: true,
      resolved: false,
      payload: {
        scenarioKey: 'finale_reunion_guest',
        weekendNumber: weekend.weekendNumber,
        weekendAfterDay: weekend.afterDay,
        weekendDay: 2,
        reunionOrder: 0,
      },
    }
    act(() => {
      store.dispatch(hydrateGame({ ...initialGame, players, weekendInterlude: weekend }))
      store.dispatch(pushIncomingInteraction(message))
    })

    expect(
      screen.getByRole('heading', { name: 'Reconnect before the finale.' })
    ).toBeInTheDocument()
    expect(screen.queryByText(message.text)).not.toBeInTheDocument()
    expect(store.getState().social.incomingInteractions).toContainEqual(message)
  })

  it('shows that the guests have left after the QA farewell wave', () => {
    const { store, container } = renderWeekend('finale')
    const originalStatuses = store.getState().game.players.map((player) => player.status)

    act(() => {
      store.dispatch(debugPrepareFinaleReunionPreview())
      store.dispatch(beginWeekendReunionDeparture())
      store.dispatch(finishWeekendReunionDeparture())
      store.dispatch(debugEndFinaleReunionPreview())
    })

    expect(store.getState().game.weekendInterlude).toMatchObject({
      stage: 'tribunal_invitation',
      reunionDeparted: true,
    })
    expect(store.getState().game.weekendInterlude?.reunionPreview).toBeUndefined()
    expect(store.getState().game.players.map((player) => player.status)).toEqual(originalStatuses)
    expect(
      screen.getByRole('heading', { name: 'The eliminated players have left.' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'The eliminated are back.' })
    ).not.toBeInTheDocument()
    expect(container.querySelector('.weekend-interlude__reunion-departure')).not.toBeNull()
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
