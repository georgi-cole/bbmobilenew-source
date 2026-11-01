import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import PlayerAudiencePanel from './PlayerAudiencePanel'
import {
  AudienceAccessError,
  loadPlayerAudience,
  type PlayerAudience,
} from '../../services/backend/audienceService'

const auth = vi.hoisted(() => ({ listener: null as null | (() => void) }))
vi.mock('../../services/backend/supabaseTransport', () => ({
  getBackendClient: vi.fn(),
  subscribeBackendAuth: (_purpose: string, listener: () => void) => {
    auth.listener = listener
    return () => {
      if (auth.listener === listener) auth.listener = null
    }
  },
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
  groupCounts: { new: 75, returning: 230, completed: 140, inactive: 31, tribunal: 95, tester: 17 },
  players: [
    {
      id: 'profile-one',
      profileId: 'profile-one',
      displayName: 'Aria',
      isGuest: false,
      verifiedEmail: true,
      email: 'aria@example.test',
      newsOptIn: false,
      testerOptIn: true,
      lastActiveAt: '2026-11-01T10:00:00Z',
      firstSeenAt: '2026-10-01T12:00:00Z',
      seasonsStarted: 3,
      seasonsCompleted: 2,
      groups: ['returning', 'completed', 'tribunal', 'tester'],
    },
    {
      id: 'guest-one',
      profileId: null,
      displayName: 'Guest / unlinked player',
      isGuest: true,
      verifiedEmail: false,
      email: null,
      newsOptIn: false,
      testerOptIn: false,
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
})

function show() {
  return render(
    <MemoryRouter>
      <PlayerAudiencePanel />
    </MemoryRouter>
  )
}

describe('player audience panel', () => {
  it('shows full totals separately from loaded records and filters overlapping groups', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Player records' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'All 502' })).toBeInTheDocument()
    expect(screen.getByText(/Showing the 500 most recently active records/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Testers 17' }))
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

  it('hides records when authorization fails and offers account access', async () => {
    vi.mocked(loadPlayerAudience).mockRejectedValue(
      new AudienceAccessError('access', 'Admin access required.')
    )
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent('Admin access required.')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account & email' })).toHaveAttribute(
      'href',
      '/account'
    )
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
})
