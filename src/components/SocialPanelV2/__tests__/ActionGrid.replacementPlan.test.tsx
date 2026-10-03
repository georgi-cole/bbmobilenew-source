import { configureStore } from '@reduxjs/toolkit'
import { act, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nProvider'
import gameReducer, { hydrateGame } from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import socialReducer from '../../../social/socialSlice'
import ActionGrid from '../ActionGrid'

describe('replacement-plan action', () => {
  it('stays available after Safety is used and changes to final-block intel after the backup is named', () => {
    const store = configureStore({
      reducer: { game: gameReducer, settings: settingsReducer, social: socialReducer },
    })
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        phase: 'pos_ceremony_results',
        players: [
          { id: 'human', name: 'Human', status: 'active', isUser: true },
          { id: 'loh', name: 'Leader', status: 'loh' },
          { id: 'nominee', name: 'Nominee', status: 'nominated' },
        ] as never,
        lohId: 'loh',
        posWinnerId: 'nominee',
        nomineeIds: ['nominee'],
        povSavedId: 'saved',
        aiReplacementStep: 1,
      })
    )

    render(
      <Provider store={store}>
        <I18nProvider>
          <ActionGrid
            actorId="human"
            selectedTargetIds={new Set(['loh'])}
            currentPhase="pos_ceremony_results"
          />
        </I18nProvider>
      </Provider>
    )

    expect(screen.getByText('Ask Replacement Plan')).toBeInTheDocument()
    act(() => {
      store.dispatch(
        hydrateGame({ ...store.getState().game, aiReplacementStep: 0, replacementNeeded: false })
      )
    })
    expect(screen.getByText('Ask Who Goes Now')).toBeInTheDocument()
  })
})
