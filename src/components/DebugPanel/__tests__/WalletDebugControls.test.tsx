import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'
import profilesReducer, { createProfile } from '../../../store/profilesSlice'
import WalletDebugControls from '../WalletDebugControls'

describe('WalletDebugControls', () => {
  it('grants a custom amount to the active QA profile', async () => {
    const user = userEvent.setup()
    const profiles = profilesReducer(undefined, createProfile({ name: 'QA', avatar: '🧪' }))
    const store = configureStore({
      reducer: { profiles: profilesReducer },
      preloadedState: { profiles },
    })

    render(
      <Provider store={store}>
        <WalletDebugControls />
      </Provider>
    )

    await user.clear(screen.getByRole('spinbutton', { name: 'Grant amount' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Grant amount' }), '750000')
    await user.click(screen.getByRole('button', { name: 'Grant' }))

    expect(store.getState().profiles.profiles[0]?.eyeoleans).toBe(750_000)
    expect(screen.getByText('750,000')).toBeInTheDocument()
  })

  it('offers no grant when there is no active profile', () => {
    const store = configureStore({ reducer: { profiles: profilesReducer } })
    render(
      <Provider store={store}>
        <WalletDebugControls />
      </Provider>
    )

    expect(screen.getByRole('button', { name: 'Grant' })).toBeDisabled()
    expect(screen.getByText('Select a non-guest profile to load its wallet.')).toBeInTheDocument()
  })
})
