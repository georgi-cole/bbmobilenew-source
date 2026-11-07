import { useState, type FormEvent } from 'react'
import { ageBandForAge, canPlayWithSafety, declarePlayerAge } from './playerSafety'
import './PlayerSafetyScreen.css'

export default function PlayerAgeDialog({
  onContinue,
  onCancel,
}: {
  onContinue: (age: number) => void
  onCancel: () => void
}) {
  const [age, setAge] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!declarePlayerAge(age) || !canPlayWithSafety()) return
    onContinue(Number(age))
  }
  return (
    <div
      className="player-safety player-safety__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-age-title"
    >
      <form
        className="player-safety__card"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
            return
          }
          if (event.key !== 'Tab') return
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled)'),
          ]
          const first = controls[0]
          const last = controls.at(-1)
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
      >
        <h2 id="entry-age-title">Who is playing?</h2>
        <p>Enter the actual player’s age to choose their privacy settings.</p>
        <label htmlFor="entry-player-age">Player age</label>
        <input
          id="entry-player-age"
          type="number"
          inputMode="numeric"
          min="0"
          max="120"
          step="1"
          required
          autoComplete="off"
          value={age}
          onChange={(event) => setAge(event.target.value)}
          autoFocus
        />
        <button type="submit" disabled={!age.trim() || ageBandForAge(age) === null}>
          Continue
        </button>
        <button type="button" className="player-safety__secondary" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </div>
  )
}
