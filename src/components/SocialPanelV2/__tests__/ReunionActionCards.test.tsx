import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nProvider'
import { SOCIAL_ACTIONS } from '../../../social/socialActions'
import gameReducer, { createInitialGameState, hydrateGame } from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import socialReducer from '../../../social/socialSlice'
import ActionGrid from '../ActionGrid'

describe('reunion action cards', () => {
  it('shows the standard Compliment and Clear the Air cards for an eliminated guest', () => {
    const initialGame = createInitialGameState({ seed: 5423 })
    const guest = initialGame.players.find((player) => !player.isUser)!
    const store = configureStore({
      reducer: { game: gameReducer, settings: settingsReducer, social: socialReducer },
    })
    store.dispatch(
      hydrateGame({
        ...initialGame,
        phase: 'social_2',
        players: initialGame.players.map((player) =>
          player.id === guest.id ? { ...player, status: 'evicted' as const } : player
        ),
      })
    )

    const onActionClick = vi.fn()
    const supplementalActions = ['compliment', 'apologize'].flatMap((id) => {
      const action = SOCIAL_ACTIONS.find((candidate) => candidate.id === id)
      return action ? [{ action, costs: { energy: 0, influence: 0, info: 0 } }] : []
    })

    render(
      <Provider store={store}>
        <I18nProvider>
          <ActionGrid
            actorId={store.getState().game.players.find((player) => player.isUser)!.id}
            actorEnergy={0}
            actorInfluence={0}
            actorInfo={0}
            selectedTargetIds={new Set([guest.id])}
            primaryTargetStatus="evicted"
            categoryFilter="connect"
            currentPhase="social_2"
            hiddenActionIds={new Set(SOCIAL_ACTIONS.map((action) => action.id))}
            supplementalActions={supplementalActions}
            onActionClick={onActionClick}
          />
        </I18nProvider>
      </Provider>
    )

    const compliment = screen.getByRole('button', { name: /Compliment/i })
    const clearAir = screen.getByRole('button', { name: /Clear the Air/i })
    expect(screen.getAllByRole('button', { name: /Compliment/i })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Clear the Air/i })).toHaveLength(1)
    expect(compliment).toHaveAttribute('data-action-id', 'compliment')
    expect(clearAir).toHaveAttribute('data-action-id', 'apologize')
    expect(within(compliment).getByLabelText('Energy cost: 0')).toBeInTheDocument()

    fireEvent.click(clearAir)
    expect(onActionClick).toHaveBeenCalledWith('apologize')
  })
})
