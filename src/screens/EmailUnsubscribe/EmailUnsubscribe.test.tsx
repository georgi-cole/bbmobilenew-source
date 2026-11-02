import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unsubscribeProfileContact } from '../../services/backend/profileContact'
import EmailUnsubscribe from './EmailUnsubscribe'

vi.mock('../../services/backend/profileContact', () => ({ unsubscribeProfileContact: vi.fn() }))
const token = '11111111-1111-4111-8111-111111111111'
const renderPage = (query = `?token=${token}`) =>
  render(
    <MemoryRouter initialEntries={[`/unsubscribe${query}`]}>
      <EmailUnsubscribe />
    </MemoryRouter>
  )
beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('email unsubscribe', () => {
  it('requires a deliberate click, so mail-link previews do not unsubscribe the player', async () => {
    vi.mocked(unsubscribeProfileContact).mockResolvedValue(true)
    renderPage()
    expect(unsubscribeProfileContact).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    await screen.findByRole('heading', { name: "You're unsubscribed" })
    expect(unsubscribeProfileContact).toHaveBeenCalledWith(token)
    expect(screen.getByRole('status')).toHaveTextContent('profiles and game progress are unchanged')
  })

  it('keeps failures retryable and never shows a success for an unknown token', async () => {
    vi.mocked(unsubscribeProfileContact).mockResolvedValue(false)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no longer valid'))
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled()
  })

  it('explains a missing link without creating an account', () => {
    renderPage('')
    expect(screen.getByRole('alert')).toHaveTextContent('from your email')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(unsubscribeProfileContact).not.toHaveBeenCalled()
  })
})
