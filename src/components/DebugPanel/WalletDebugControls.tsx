import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { debugGrantEyeoleans, selectEyeoleanBalance } from '../../store/profilesSlice'

let grantSequence = 0

function createGrantId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  return randomId ?? `${Date.now()}-${grantSequence++}`
}

export default function WalletDebugControls() {
  const dispatch = useAppDispatch()
  const balance = useAppSelector(selectEyeoleanBalance)
  const hasProfile = useAppSelector((state) => Boolean(state.profiles?.activeProfileId))
  const [amount, setAmount] = useState('100000')
  const parsedAmount = Number(amount)
  const validAmount = Number.isSafeInteger(parsedAmount) && parsedAmount > 0

  function grant(value: number) {
    if (!hasProfile || !Number.isSafeInteger(value) || value <= 0) return
    dispatch(debugGrantEyeoleans({ grantId: createGrantId(), amount: value }))
  }

  return (
    <section className="dbg-section" id="dbg-wallet">
      <h3 className="dbg-section__title">QA Wallet Loader</h3>
      <p className="dbg-help">
        Testing only. Adds Eyeoleans to the active profile and records a wallet transaction.
      </p>
      <dl className="dbg-grid">
        <dt>Balance</dt>
        <dd>{balance.toLocaleString()}</dd>
      </dl>
      <div className="dbg-row">
        <label className="dbg-label" htmlFor="qa-eyeolean-amount">
          Grant amount
        </label>
        <input
          id="qa-eyeolean-amount"
          className="dbg-select"
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <button
          type="button"
          className="dbg-btn"
          disabled={!hasProfile || !validAmount}
          onClick={() => grant(parsedAmount)}
        >
          Grant
        </button>
      </div>
      <div className="dbg-row">
        <button
          type="button"
          className="dbg-btn dbg-btn--wide"
          disabled={!hasProfile}
          onClick={() => grant(100_000)}
        >
          +100,000
        </button>
        <button
          type="button"
          className="dbg-btn dbg-btn--wide"
          disabled={!hasProfile}
          onClick={() => grant(1_000_000)}
        >
          +1,000,000
        </button>
      </div>
      {!hasProfile && <p className="dbg-help">Select a non-guest profile to load its wallet.</p>}
    </section>
  )
}
