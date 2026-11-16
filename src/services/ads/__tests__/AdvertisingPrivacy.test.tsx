import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdvertisingPrivacy from '../AdvertisingPrivacy'
import { canUseAdultServices } from '../../../safety/playerSafety'
import { installSafetyFixture } from '../../../safety/__tests__/safetyFixture'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { createMemoryRouter, Link, MemoryRouter, RouterProvider } from 'react-router'
import Settings from '../../../screens/Settings/Settings'
import settingsReducer from '../../../store/settingsSlice'
import gameReducer from '../../../store/gameSlice'
import profilesReducer from '../../../store/profilesSlice'
import vipReducer from '../../../store/vipSlice'

function renderPrivacy() {
  return render(
    <MemoryRouter initialEntries={['/player-privacy']}>
      <AdvertisingPrivacy />
    </MemoryRouter>
  )
}

const privacy = vi.hoisted(() => ({ open: vi.fn(), check: vi.fn() }))
vi.mock('../admobBridge', () => ({
  checkAdMobAvailability: privacy.check,
  hasAdMobPrivacyOptions: () => true,
  openAdMobPrivacyOptions: privacy.open,
}))
describe('advertising privacy controls', () => {
  beforeEach(() => {
    installSafetyFixture()
    vi.clearAllMocks()
    privacy.open.mockResolvedValue(undefined)
    privacy.check.mockResolvedValue(null)
  })
  afterEach(cleanup)

  it('includes ads for an adult without a separate local opt-in and keeps Google choices accessible', () => {
    renderPrivacy()
    expect(canUseAdultServices()).toBe(false)
    fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '28' } })
    fireEvent.click(screen.getByText('Continue'))
    expect(canUseAdultServices()).toBe(true)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(/Standard play includes automatic ad breaks/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Advertising privacy choices'))
    expect(privacy.open).toHaveBeenCalledOnce()
  })

  it('does not enable advertising or Google requests for a minor', () => {
    renderPrivacy()
    fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Continue'))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('Advertising privacy choices')).toBeNull()
    expect(canUseAdultServices()).toBe(false)
    expect(privacy.open).not.toHaveBeenCalled()
    expect(screen.queryByText('Check advertising setup')).toBeNull()
  })

  it('lets an adult check Google setup without enabling a local ad switch or watching an ad', async () => {
    renderPrivacy()
    fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '28' } })
    fireEvent.click(screen.getByText('Continue'))
    expect(screen.queryByRole('checkbox')).toBeNull()
    privacy.check.mockResolvedValueOnce('Advertising permission is not ready. Please try again.')
    fireEvent.click(screen.getByText('Check advertising setup'))
    expect(privacy.check).toHaveBeenCalledOnce()
    expect(
      await screen.findByText('Advertising permission is not ready. Please try again.')
    ).toBeInTheDocument()
  })

  it('returns a retry setup visit directly to the paused competition', async () => {
    const router = createMemoryRouter(
      [
        { path: '/game', element: <h1>Competition checkpoint</h1> },
        { path: '/player-privacy', element: <AdvertisingPrivacy /> },
      ],
      {
        initialEntries: [{ pathname: '/player-privacy', state: { returnTo: '/game' } }],
      }
    )
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to competition' }))
    expect(
      await screen.findByRole('heading', { name: 'Competition checkpoint' })
    ).toBeInTheDocument()
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('returns through Settings to the original screen without a privacy loop', async () => {
    const store = configureStore({
      reducer: {
        settings: settingsReducer,
        game: gameReducer,
        profiles: profilesReducer,
        vip: vipReducer,
      },
    })
    const router = createMemoryRouter([
      { path: '/', element: <Link to="/settings">Open settings</Link> },
      { path: '/settings', element: <Settings /> },
      { path: '/player-privacy', element: <AdvertisingPrivacy /> },
    ])
    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    )
    fireEvent.click(screen.getByRole('link', { name: 'Open settings' }))
    fireEvent.click(await screen.findByRole('button', { name: /Advertising privacy/ }))
    expect(await screen.findByRole('heading', { name: 'Advertising privacy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('target', '_blank')
    fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }))
    fireEvent.click(await screen.findByRole('button', { name: /go back/i }))
    expect(await screen.findByRole('link', { name: 'Open settings' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('can return to settings when opened directly', async () => {
    const router = createMemoryRouter(
      [
        { path: '/settings', element: <h1>Settings destination</h1> },
        { path: '/player-privacy', element: <AdvertisingPrivacy /> },
      ],
      { initialEntries: ['/player-privacy'] }
    )
    render(<RouterProvider router={router} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings destination' })).toBeInTheDocument()
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
