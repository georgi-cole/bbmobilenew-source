import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import PlayerAccount from './PlayerAccount'
import type { AccountProfileSyncStatus } from '../../services/backend/playerAccountProfiles'

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), retry: vi.fn() }))
let syncStatus: AccountProfileSyncStatus = 'synced'
let signedIn = true
const initialProfiles = ['Deni', 'Sara', 'Kiki'].map((name) => ({
  id: name,
  name,
  playerAccountId: 'account',
}))
let profiles = initialProfiles
let activeProfileId: string | null = null
let isGuest = false

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ state: null }),
}))
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      profiles: { profiles, activeProfileId, isGuest },
      game: { status: 'idle', week: 1, phase: 'season_start' },
    }),
}))
vi.mock('../../safety/usePlayerSafety', () => ({ usePlayerSafety: () => null }))
vi.mock('../../services/backend/config', () => ({
  isPlayerSignInConfigured: () => true,
  isPlayerSignInPreview: () => false,
}))
vi.mock('../../services/backend/playerSignIn', () => ({
  observePlayerAccount: async (listener: (account: unknown) => void) => {
    listener(signedIn ? { id: 'account', email: 'player@example.test' } : null)
    return () => undefined
  },
  playerSignInError: () => '',
  deletePlayerAccount: vi.fn(),
  requestPlayerEmailCode: vi.fn(),
  signOutPlayer: vi.fn(),
  startPlayerOAuth: vi.fn(),
  verifyPlayerEmailCode: vi.fn(),
}))
vi.mock('../../services/backend/playerAccountProfiles', () => ({
  getAccountProfileSyncStatus: () => syncStatus,
  subscribeAccountProfileSync: () => () => undefined,
  retryAccountProfileSync: mocks.retry,
}))

beforeEach(() => {
  syncStatus = 'synced'
  signedIn = true
  profiles = initialProfiles
  activeProfileId = null
  isGuest = false
  vi.clearAllMocks()
})

it('keeps names on the manager and offers one clear route back to account management', async () => {
  activeProfileId = initialProfiles[0].id
  render(<PlayerAccount />)
  expect(await screen.findByRole('heading', { name: 'Your account' })).toBeDefined()
  expect(screen.queryByText('Deni')).toBeNull()
  expect(screen.queryByText('Sara')).toBeNull()
  expect(screen.queryByRole('button', { name: /create.*profile/i })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Manage profiles' }))
  expect(mocks.navigate).toHaveBeenCalledWith('/profile-picker', {
    state: { from: '/profile/account', manageOnly: true },
  })
})

it.each([false, true])(
  'offers restored profiles when there is no active profile (guest: %s)',
  async (guest) => {
    profiles = initialProfiles.slice(0, 2)
    activeProfileId = null
    isGuest = guest
    render(<PlayerAccount />)
    const choose = await screen.findByRole('button', { name: 'Choose Profile' })
    expect(choose).toHaveClass('game-button--primary')
    expect(screen.getByRole('button', { name: 'Create another profile' })).toHaveClass(
      'game-button--secondary'
    )
    fireEvent.click(choose)
    expect(mocks.navigate).toHaveBeenCalledWith('/profile-picker', {
      state: { from: '/profile/account', manageOnly: true },
    })
  }
)

it('explains capacity without pretending there is a connection error', async () => {
  syncStatus = 'limit'
  render(<PlayerAccount />)
  expect(await screen.findByText(/Delete a profile from the list to make room/)).toBeDefined()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText(/Checking this account/)).toBeNull()
})

it('offers an immediate retry for a real sync failure', async () => {
  syncStatus = 'error'
  render(<PlayerAccount />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry sync' }))
  expect(mocks.retry).toHaveBeenCalledOnce()
})

it('opens local profiles directly when choosing to play without signing in', async () => {
  signedIn = false
  render(<PlayerAccount />)
  fireEvent.click(await screen.findByRole('button', { name: 'Play without signing in' }))
  expect(mocks.navigate).toHaveBeenCalledWith('/profile-picker', { state: { from: '/' } })
  fireEvent.click(screen.getByRole('button', { name: 'Back to home' }))
  expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true })
})

it('starts in the Changing Room when playing without an account or an existing profile', async () => {
  signedIn = false
  profiles = []
  render(<PlayerAccount />)
  fireEvent.click(await screen.findByRole('button', { name: 'Play without signing in' }))
  expect(mocks.navigate).toHaveBeenCalledWith('/profile/dressing-room', {
    state: { from: '/', createProfile: true, adoptGuestRun: false },
  })
})

it('automatically uses the only local profile instead of asking the player to choose', async () => {
  signedIn = false
  profiles = initialProfiles.slice(0, 1)
  render(<PlayerAccount />)
  fireEvent.click(await screen.findByRole('button', { name: 'Play without signing in' }))
  expect(mocks.navigate).toHaveBeenCalledWith('/profile-picker', {
    state: { from: '/', autoSelectSingle: true },
  })
})
