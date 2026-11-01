import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingAccountEmail,
  getPendingAccountEmail,
  isPlayerAccountConfigured,
  readPlayerAccount,
  requestAccountEmail,
  saveAccountPreferences,
  signOutPlayerAccount,
  subscribePlayerAccount,
  verifyAccountEmail,
  type PlayerAccount,
} from '../../services/backend/playerAccount'
import PlayerAccountScreen from './PlayerAccount'

const navigate = vi.fn()
let accountChanged: () => void

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ state: { profileReturnTo: '/' } }),
}))

vi.mock('../../services/backend/playerAccount', () => ({
  clearPendingAccountEmail: vi.fn(),
  getPendingAccountEmail: vi.fn(),
  isPlayerAccountConfigured: vi.fn(),
  readPlayerAccount: vi.fn(),
  requestAccountEmail: vi.fn(),
  saveAccountPreferences: vi.fn(),
  signOutPlayerAccount: vi.fn(),
  subscribePlayerAccount: vi.fn(),
  verifyAccountEmail: vi.fn(),
}))

const connectedAccount: PlayerAccount = {
  ownerId: 'account-owner',
  email: 'player@example.com',
  verified: true,
  pendingEmail: null,
  newsOptIn: false,
  testerOptIn: false,
  preferencesAvailable: true,
  isAdmin: false,
}

async function showConnectForm() {
  render(<PlayerAccountScreen />)
  await screen.findByLabelText('Email address')
}

describe('Player account email flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isPlayerAccountConfigured).mockReturnValue(true)
    vi.mocked(getPendingAccountEmail).mockReturnValue(null)
    vi.mocked(readPlayerAccount).mockResolvedValue(null)
    vi.mocked(requestAccountEmail).mockResolvedValue(undefined)
    vi.mocked(subscribePlayerAccount).mockImplementation((listener) => {
      accountChanged = listener
      return () => undefined
    })
    vi.mocked(verifyAccountEmail).mockImplementation(async () => {
      const next = { ...connectedAccount }
      vi.mocked(readPlayerAccount).mockResolvedValue(next)
      return next
    })
    vi.mocked(saveAccountPreferences).mockImplementation(async (preferences) => {
      const next = { ...connectedAccount, ...preferences }
      vi.mocked(readPlayerAccount).mockResolvedValue(next)
      return next
    })
    vi.mocked(signOutPlayerAccount).mockImplementation(async () => {
      vi.mocked(readPlayerAccount).mockResolvedValue(null)
    })
  })

  it('keeps local play available when email connection is not configured', () => {
    vi.mocked(isPlayerAccountConfigured).mockReturnValue(false)
    render(<PlayerAccountScreen />)
    expect(screen.getByText(/Email connection is not available in this version yet/)).toBeVisible()
    expect(screen.getByText(/Playing as a guest is always an option/)).toBeVisible()
    expect(screen.queryByLabelText('Email address')).toBeNull()
    expect(readPlayerAccount).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to profiles' })[0])
    expect(navigate).toHaveBeenCalledWith('/profile-picker', {
      replace: true,
      state: { from: '/' },
    })
  })

  it('sends a code only on request and offers consent choices only after verification', async () => {
    await showConnectForm()
    expect(requestAccountEmail).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(/Email connection does not transfer them/)).toBeVisible()

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }))
    const code = await screen.findByLabelText('Verification code')
    expect(requestAccountEmail).toHaveBeenCalledExactlyOnceWith('player@example.com', 'connect')
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.change(code, { target: { value: '12' } })
    expect(screen.getByRole('button', { name: 'Verify email' })).toBeDisabled()
    fireEvent.change(code, { target: { value: '12345678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))
    await screen.findByRole('heading', { name: 'Your email is connected' })
    expect(verifyAccountEmail).toHaveBeenCalledExactlyOnceWith(
      'player@example.com',
      '12345678',
      'connect'
    )
    expect(screen.getByRole('checkbox', { name: /Game news/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Playtest invitations/ })).not.toBeChecked()
    expect(saveAccountPreferences).not.toHaveBeenCalled()
  })

  it('keeps a failed connection in the selected mode rather than silently signing in', async () => {
    vi.mocked(requestAccountEmail).mockRejectedValue(
      new Error('Use Sign in for an existing account.')
    )
    await showConnectForm()
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use Sign in for an existing account.'
    )
    expect(requestAccountEmail).toHaveBeenCalledExactlyOnceWith('player@example.com', 'connect')
    expect(verifyAccountEmail).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Connect your email' })).toBeVisible()
  })

  it('explains local profile linking before the player requests an existing-account sign-in', async () => {
    await showConnectForm()
    fireEvent.click(screen.getByRole('button', { name: 'Already connected? Sign in' }))
    expect(
      screen.getByText(/Signing in connects this device's existing local profiles to that account/)
    ).toBeVisible()
    expect(requestAccountEmail).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }))
    await screen.findByLabelText('Verification code')
    expect(requestAccountEmail).toHaveBeenCalledExactlyOnceWith('player@example.com', 'sign_in')
  })

  it('restores a pending code without sending another email and allows a deliberate replacement', async () => {
    vi.mocked(getPendingAccountEmail).mockReturnValue({
      email: 'pending@example.com',
      mode: 'sign_in',
    })
    render(<PlayerAccountScreen />)
    await screen.findByLabelText('Verification code')
    expect(requestAccountEmail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use another email' }))
    expect(clearPendingAccountEmail).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Email address')).toHaveValue('pending@example.com')
    expect(requestAccountEmail).not.toHaveBeenCalled()
  })

  it('leaves code entry available after an expired code and resends only on a click', async () => {
    vi.mocked(getPendingAccountEmail).mockReturnValue({
      email: 'pending@example.com',
      mode: 'connect',
    })
    vi.mocked(verifyAccountEmail).mockRejectedValue(
      new Error('That code has expired. Request a new code.')
    )
    render(<PlayerAccountScreen />)
    fireEvent.change(await screen.findByLabelText('Verification code'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That code has expired.')
    expect(requestAccountEmail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }))
    await waitFor(() =>
      expect(requestAccountEmail).toHaveBeenCalledExactlyOnceWith('pending@example.com', 'connect')
    )
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toHaveValue(''))
  })

  it('saves the two opt-ins independently and preserves a failed preference edit for retry', async () => {
    vi.mocked(readPlayerAccount).mockResolvedValue({ ...connectedAccount })
    vi.mocked(saveAccountPreferences).mockRejectedValueOnce(new Error('Please try saving again.'))
    render(<PlayerAccountScreen />)
    const news = await screen.findByRole('checkbox', { name: /Game news/ })
    const testers = screen.getByRole('checkbox', { name: /Playtest invitations/ })
    expect(screen.getByRole('button', { name: 'Save email choices' })).toBeDisabled()
    fireEvent.click(testers)
    expect(news).not.toBeChecked()
    expect(saveAccountPreferences).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save email choices' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try saving again.')
    expect(testers).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save email choices' }))
    await screen.findByText('Your email choices have been saved.')
    expect(saveAccountPreferences).toHaveBeenLastCalledWith(
      { newsOptIn: false, testerOptIn: true },
      connectedAccount.ownerId
    )
    expect(screen.getByRole('button', { name: 'Save email choices' })).toBeDisabled()
  })

  it('shows an unavailable preference state without pretending opt-ins have been saved', async () => {
    vi.mocked(readPlayerAccount).mockResolvedValue({
      ...connectedAccount,
      preferencesAvailable: false,
    })
    render(<PlayerAccountScreen />)
    await screen.findByRole('heading', { name: 'Your email is connected' })
    expect(screen.getByText(/email choices are unavailable right now/)).toBeVisible()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(saveAccountPreferences).not.toHaveBeenCalled()
  })

  it('requires a successful account read before offering connection controls and supports retry', async () => {
    vi.mocked(readPlayerAccount)
      .mockRejectedValueOnce(new Error('Could not check your account.'))
      .mockResolvedValueOnce(null)
    render(<PlayerAccountScreen />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check your account.')
    expect(screen.queryByLabelText('Email address')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByLabelText('Email address')
    expect(requestAccountEmail).not.toHaveBeenCalled()
  })

  it('signs out locally without navigating away from or deleting the local profiles', async () => {
    vi.mocked(readPlayerAccount).mockResolvedValue({ ...connectedAccount })
    render(<PlayerAccountScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out on this device' }))
    await screen.findByLabelText('Email address')
    expect(signOutPlayerAccount).toHaveBeenCalledOnce()
    expect(signOutPlayerAccount).toHaveBeenCalledWith(connectedAccount.ownerId)
    expect(
      screen.getByText(/Signed out on this device. Your local profiles are still here/)
    ).toBeVisible()
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('discards a stale read after an auth change in another tab', async () => {
    let finishFirstRead: (account: PlayerAccount) => void = () => undefined
    const staleRead = new Promise<PlayerAccount>((resolve) => {
      finishFirstRead = resolve
    })
    const other = { ...connectedAccount, ownerId: 'other-owner', email: 'other@example.com' }
    vi.mocked(readPlayerAccount).mockReturnValueOnce(staleRead).mockResolvedValue(other)
    render(<PlayerAccountScreen />)
    act(() => accountChanged())
    await screen.findByText('other@example.com')
    await act(async () => {
      finishFirstRead(connectedAccount)
      await staleRead
    })
    expect(screen.queryByText('player@example.com')).toBeNull()
    expect(screen.getByText('other@example.com')).toBeVisible()
  })

  it('binds consent to the displayed owner and ignores an old save result after an account switch', async () => {
    vi.mocked(readPlayerAccount).mockResolvedValue({ ...connectedAccount })
    let finishSave: (account: PlayerAccount) => void = () => undefined
    const save = new Promise<PlayerAccount>((resolve) => {
      finishSave = resolve
    })
    vi.mocked(saveAccountPreferences).mockReturnValueOnce(save)
    render(<PlayerAccountScreen />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Playtest invitations/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save email choices' }))
    expect(saveAccountPreferences).toHaveBeenCalledWith(
      { newsOptIn: false, testerOptIn: true },
      'account-owner'
    )
    const other = {
      ...connectedAccount,
      ownerId: 'other-owner',
      email: 'other@example.com',
      newsOptIn: true,
    }
    vi.mocked(readPlayerAccount).mockResolvedValue(other)
    act(() => accountChanged())
    expect(screen.queryByText('player@example.com')).toBeNull()
    await screen.findByText('other@example.com')
    await act(async () => {
      finishSave({ ...connectedAccount, testerOptIn: true })
      await save
    })
    await screen.findByText('other@example.com')
    expect(screen.getByRole('checkbox', { name: /Game news/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Playtest invitations/ })).not.toBeChecked()
    expect(screen.queryByText('Your email choices have been saved.')).toBeNull()
  })
})
