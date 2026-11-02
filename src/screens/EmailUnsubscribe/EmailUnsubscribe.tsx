import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { unsubscribeProfileContact } from '../../services/backend/profileContact'
import './EmailUnsubscribe.css'

export default function EmailUnsubscribe() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  return <UnsubscribeForm key={token} token={token} />
}

function UnsubscribeForm({ token }: { token: string }) {
  const [status, setStatus] = useState<'ready' | 'saving' | 'done'>('ready')
  const [error, setError] = useState<string | null>(null)

  async function unsubscribe() {
    if (status !== 'ready') return
    setStatus('saving')
    setError(null)
    try {
      if (!(await unsubscribeProfileContact(token))) {
        setError('This link is no longer valid. Use the link in your latest email.')
        setStatus('ready')
        return
      }
      setStatus('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.')
      setStatus('ready')
    }
  }

  return (
    <main className="email-unsubscribe">
      <p className="email-unsubscribe__brand">THE BIG EYE</p>
      <h1>{status === 'done' ? "You're unsubscribed" : 'Email preferences'}</h1>
      {status === 'done' ? (
        <p role="status">
          Game news and playtest invitations have been turned off for this email address. Your
          profiles and game progress are unchanged.
        </p>
      ) : (
        <>
          <p>Stop receiving The Big Eye news and playtest invitations at this email address.</p>
          {token ? (
            <button
              type="button"
              className="game-button"
              disabled={status === 'saving'}
              onClick={() => void unsubscribe()}
            >
              {status === 'saving' ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
          ) : (
            <p role="alert">Open the unsubscribe link from your email to update your preference.</p>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
      <Link className="email-unsubscribe__home" to="/">
        Back to The Big Eye
      </Link>
    </main>
  )
}
