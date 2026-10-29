import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdvertisingPrivacy from '../AdvertisingPrivacy'
import { canUseOptionalFeature } from '../../../safety/playerSafety'
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

const privacy = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('../admobBridge', () => ({
  hasAdMobPrivacyOptions: () => true,
  openAdMobPrivacyOptions: privacy.open,
}))
describe('advertising privacy controls', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    privacy.open.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it('requires an adult declaration and explicit opt-in, and keeps Google choices accessible after opt-out', () => {
    renderPrivacy()
    expect(canUseOptionalFeature('ads')).toBe(false)
    fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '28' } })
    fireEvent.click(screen.getByText('Continue'))
    const toggle = screen.getByRole('checkbox')
    expect(canUseOptionalFeature('ads')).toBe(false)
    fireEvent.click(toggle)
    expect(canUseOptionalFeature('ads')).toBe(true)
    fireEvent.click(toggle)
    expect(canUseOptionalFeature('ads')).toBe(false)
    fireEvent.click(screen.getByText('Advertising privacy choices'))
    expect(privacy.open).toHaveBeenCalledOnce()
  })

  it('does not enable advertising or Google requests for a minor', () => {
    renderPrivacy()
    fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Continue'))
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('Advertising privacy choices')).toBeNull()
    expect(canUseOptionalFeature('ads')).toBe(false)
    expect(privacy.open).not.toHaveBeenCalled()
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
