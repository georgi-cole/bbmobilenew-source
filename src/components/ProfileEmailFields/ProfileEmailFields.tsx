import type { ProfileEmailForm } from './useProfileEmailForm'
import './ProfileEmailFields.css'

export default function ProfileEmailFields({
  form,
  idPrefix,
  disabled = false,
}: {
  form: ProfileEmailForm
  idPrefix: string
  disabled?: boolean
}) {
  if (!form.configured) return null
  const unavailable = form.status !== 'ready'
  const inputId = `${idPrefix}-email`
  const hintId = `${idPrefix}-email-hint`
  const errorId = `${idPrefix}-email-error`

  return (
    <div className="profile-email" aria-busy={form.status === 'loading'}>
      <label className="profile-email__label" htmlFor={inputId}>
        Email <span>(optional)</span>
      </label>
      <input
        id={inputId}
        className="profile-email__input"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        placeholder="you@example.com"
        value={form.email}
        onChange={(event) => form.changeEmail(event.target.value)}
        onBlur={form.blurEmail}
        disabled={disabled || unavailable}
        aria-invalid={!form.valid || undefined}
        aria-describedby={`${hintId}${form.error ? ` ${errorId}` : ''}`}
      />
      <label className="profile-email__choice">
        <input
          type="checkbox"
          checked={form.updatesOptIn}
          disabled={disabled || unavailable || !form.email.trim() || !form.valid}
          onChange={(event) => form.changeUpdatesOptIn(event.target.checked)}
        />
        <span>Send me The Big Eye news and playtest invitations.</span>
      </label>
      <p className="profile-email__hint" id={hintId}>
        Unsubscribe anytime.{' '}
        <a href={`${import.meta.env.BASE_URL}#/legal`} target="_blank" rel="noreferrer">
          Privacy policy.
        </a>
      </p>
      {form.status === 'loading' && (
        <p className="profile-email__message" role="status">
          Loading email preferences… You can still save the rest of your profile.
        </p>
      )}
      {form.error && (
        <p className="profile-email__error" id={errorId} role="alert">
          {form.error}
        </p>
      )}
      {form.status === 'error' && (
        <div className="profile-email__retry">
          <span>You can still save the rest of your profile.</span>
          <button type="button" onClick={form.retry} disabled={disabled}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
