import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import socialReducer, { closeSocialPanel } from '../../../social/socialSlice'
import { useAppDispatch, useAppSelector } from '../../../store/hooks'
import ConfessionalAllianceConsultation from '../ConfessionalAllianceConsultation'

vi.mock('../../../components/SocialPanelV2/SocialPanelV2', () => ({
  default: function SocialPanel() {
    const open = useAppSelector((state) => state.social.panelOpen)
    const dispatch = useAppDispatch()
    return open ? (
      <div role="dialog" aria-label="Social Phase">
        <button onClick={() => dispatch(closeSocialPanel())}>Close Social</button>
      </div>
    ) : null
  },
}))
afterEach(cleanup)

describe('Social access from the backup decision', () => {
  it('opens Social without paying or changing the pending nominee, then returns to the decision', () => {
    const game = { dramaSocialMode: true, replacementNeeded: true, nomineeIds: ['outside'] }
    const social = { ...socialReducer(undefined, { type: '@@test' }), energyBank: { human: 10 } }
    const store = configureStore({
      reducer: {
        game: () => game,
        settings: () => ({ gameUX: { dramaMode: true } }),
        social: socialReducer,
      },
      preloadedState: { social },
    })
    render(
      <Provider store={store}>
        <ConfessionalAllianceConsultation />
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Social before you decide' }))
    expect(screen.getByRole('dialog', { name: 'Social Phase' })).toBeVisible()
    expect(store.getState().game).toBe(game)
    expect(store.getState().social.energyBank.human).toBe(10)
    fireEvent.click(screen.getByRole('button', { name: 'Close Social' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(store.getState().game.replacementNeeded).toBe(true)
    expect(screen.getByRole('button', { name: 'Open Social before you decide' })).toBeVisible()
  })
})
