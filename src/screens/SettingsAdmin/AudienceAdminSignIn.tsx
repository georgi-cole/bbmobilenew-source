import { useState, type FormEvent } from 'react'
import { signInAudienceAdmin } from '../../services/backend/audienceAdminAuth'

export default function AudienceAdminSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await signInAudienceAdmin(email, password)
      onSignedIn()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Administrator sign-in failed. Try again.')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <form className="player-audience__admin-sign-in" onSubmit={(event) => void signIn(event)}>
      <fieldset disabled={busy}>
        <legend>Administrator sign-in</legend>
        <p>Use an existing administrator account approved for player audience access.</p>
        <label htmlFor="audience-admin-email">Administrator email</label>
        <input
          id="audience-admin-email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          required
        />
        <label htmlFor="audience-admin-password">Password</label>
        <input
          id="audience-admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && (
          <p className="player-audience__admin-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="game-button" disabled={!email.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in as administrator'}
        </button>
      </fieldset>
    </form>
  )
}
