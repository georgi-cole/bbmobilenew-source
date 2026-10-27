import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import profilesReducer, { createProfile, type ProfilesState } from '../../store/profilesSlice'
import Profile from './Profile'

const mockNavigate = vi.fn()
let mockProfiles: ProfilesState
let mockLocation: { pathname: string; state: { from: string; fromLookReveal?: boolean } }

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}))
vi.mock('../../store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      profiles: mockProfiles,
      game: { week: 1, phase: 'season_start', status: 'idle', players: [], tvFeed: [] },
    }),
}))
vi.mock('../../components/ui/GameBackButton/GameBackButton', () => ({
  default: () => <button type="button">Back</button>,
}))

describe('Profile return entrance', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockLocation = { pathname: '/profile', state: { from: '/' } }
    mockProfiles = profilesReducer(
      undefined,
      createProfile({
        name: 'Larisa',
        avatar: '👤',
        appearanceSelection: { kind: 'catalog', lookId: 'pc-001', revision: 1 },
      })
    )
  })

  it('consumes the reveal marker while preserving the entrance through the route replacement', () => {
    mockLocation.state.fromLookReveal = true
    const { container, rerender } = render(<Profile />)
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/' },
      preventScrollReset: true,
    })
    expect(container.firstChild).toHaveClass('profile-screen--look-return')
    mockLocation = { pathname: '/profile', state: { from: '/' } }
    rerender(<Profile />)
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(container.firstChild).toHaveClass('profile-screen--look-return')
  })

  it('leaves ordinary profile visits static', () => {
    const { container } = render(<Profile />)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(container.firstChild).not.toHaveClass('profile-screen--look-return')
  })
})
