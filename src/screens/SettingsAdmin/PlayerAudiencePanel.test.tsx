import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import PlayerAudiencePanel from './PlayerAudiencePanel'
import {
  AudienceAccessError,
  loadPlayerAudience,
  type PlayerAudience,
} from '../../services/backend/audienceService'
import { signInAudienceAdmin, signOutAudienceAdmin } from '../../services/backend/audienceAdminAuth'

const auth = vi.hoisted(() => ({ listener: null as null | (() => void), purpose: '' }))
vi.mock('../../services/backend/supabaseTransport', () => ({
  getBackendClient: vi.fn(),
  subscribeBackendAuth: (purpose: string, listener: () => void) => {
    auth.purpose = purpose
    auth.listener = listener
    return () => {
      if (auth.listener === listener) auth.listener = null
    }
  },
}))
vi.mock('../../services/backend/audienceAdminAuth', () => ({
  signInAudienceAdmin: vi.fn(),
  signOutAudienceAdmin: vi.fn(),
}))

vi.mock('../../services/backend/audienceService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/backend/audienceService')>()),
  loadPlayerAudience: vi.fn(),
}))

const audience: PlayerAudience = {
  generatedAt: '2026-11-01T12:00:00Z',
  coverageStart: '2026-10-01T12:00:00Z',
  totalPlayers: 502,
  truncated: true,
  groupCounts: {
    new: 75,
    returning: 230,
    completed: 140,
    inactive: 31,
    tribunal: 95,
    subscribed: 17,
  },
  players: [
    {
      id: 'profile-one',
      profileId: 'profile-one',
      displayName: 'Aria',
      isGuest: false,
      verifiedEmail: false,
      email: 'aria@example.test',
      updatesOptIn: true,
      lastActiveAt: '2026-11-01T10:00:00Z',
      firstSeenAt: '2026-10-01T12:00:00Z',
      seasonsStarted: 3,
      seasonsCompleted: 2,
      groups: ['returning', 'completed', 'tribunal', 'subscribed'],
    },
    {
      id: 'guest-one',
      profileId: null,
      displayName: 'Guest / unlinked player',
      isGuest: true,
      verifiedEmail: false,
      email: null,
      updatesOptIn: false,
      lastActiveAt: '2026-10-31T10:00:00Z',
      firstSeenAt: '2026-10-31T10:00:00Z',
      seasonsStarted: 1,
      seasonsCompleted: 0,
      groups: ['new'],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadPlayerAudience).mockResolvedValue(audience)
  vi.mocked(signInAudienceAdmin).mockResolvedValue(undefined)
  vi.mocked(signOutAudienceAdmin).mockResolvedValue(undefined)
})

function show() {
  return render(<PlayerAudiencePanel />)
}

describe('player audience panel', () => {
  it('shows full totals separately from loaded records and filters overlapping groups', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Player records' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'All 502' })).toBeInTheDocument()
    expect(screen.getByText(/Showing the 500 most recently active records/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Subscribers 17' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByRole('heading', { name: 'Aria' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Guest / unlinked player' })
    ).not.toBeInTheDocument()
  })

  it('can inspect guest records independently from profiles', async () => {
    show()
    await screen.findByRole('heading', { name: 'Aria' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'guests' },
    })
    expect(screen.queryByRole('heading', { name: 'Aria' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Guest / unlinked player' })).toBeInTheDocument()
  })

  it('hides records when authorization fails and offers administrator-only password access', async () => {
    vi.mocked(loadPlayerAudience).mockRejectedValue(
      new AudienceAccessError('access', 'Admin access required.')
    )
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent('Admin access required.')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Administrator email' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(auth.purpose).toBe('audience_admin')
  })

  it('clears previously visible contact details before a failed refresh', async () => {
    show()
    await screen.findByText('aria@example.test')
    vi.mocked(loadPlayerAudience).mockRejectedValue(
      new AudienceAccessError('access', 'Access revoked.')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.queryByText('aria@example.test')).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Access revoked.')
  })

  it('removes contact information when the authenticated account changes', async () => {
    show()
    await screen.findByText('aria@example.test')
    vi.mocked(loadPlayerAudience).mockRejectedValue(
      new AudienceAccessError('access', 'Sign in again.')
    )
    act(() => auth.listener?.())
    expect(screen.queryByText('aria@example.test')).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in again.')
  })

  it('labels supplied emails as unverified and subscription as permission rather than tester enrollment', async () => {
    show()
    await screen.findByText('aria@example.test')
    expect(screen.getByText('Unverified email')).toBeInTheDocument()
    expect(screen.getByText('News & invitations allowed')).toBeInTheDocument()
    expect(screen.queryByText('Verified account')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Testers/ })).not.toBeInTheDocument()
  })

  it('shows a denied administrator login inline and clears the password', async () => {
    vi.mocked(loadPlayerAudience).mockRejectedValue(
      new AudienceAccessError('access', 'Admin access required.')
    )
    vi.mocked(signInAudienceAdmin).mockRejectedValue(new Error('Email or password is incorrect.'))
    show()
    await screen.findByLabelText('Administrator email')
    fireEvent.change(screen.getByLabelText('Administrator email'), {
      target: { value: 'admin@example.test' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as administrator' }))
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('reloads protected audience data after an approved administrator signs in', async () => {
    vi.mocked(loadPlayerAudience).mockRejectedValueOnce(
      new AudienceAccessError('access', 'Admin access required.')
    )
    show()
    await screen.findByLabelText('Administrator email')
    fireEvent.change(screen.getByLabelText('Administrator email'), {
      target: { value: 'admin@example.test' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as administrator' }))
    await screen.findByRole('list', { name: 'Player records' })
    expect(signInAudienceAdmin).toHaveBeenCalledWith('admin@example.test', 'password')
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('clears contact details immediately when the administrator signs out', async () => {
    show()
    await screen.findByText('aria@example.test')
    vi.mocked(loadPlayerAudience).mockRejectedValue(
      new AudienceAccessError('access', 'Admin access required.')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign out admin' }))
    expect(screen.queryByText('aria@example.test')).not.toBeInTheDocument()
    await screen.findByLabelText('Administrator email')
    expect(signOutAudienceAdmin).toHaveBeenCalledOnce()
  })
})
