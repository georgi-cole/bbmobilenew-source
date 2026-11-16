import { useEffect, useId, useRef, useState } from 'react'
import type { AppearanceLook } from './catalog'
import { APPEARANCE_LOOK_PRICE_EYEROS } from './lookAccess'
import './LookMarket.css'

export type LookMarketOption = 'vip' | 'eyeros'
export type LookPurchaseResult = 'purchased' | 'owned' | 'insufficient' | 'unavailable'

export function LookAccessIcon({ kind }: { kind: 'vip' | 'eyeros' | 'check' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      {kind === 'vip' ? (
        <>
          <path d="m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7Z" />
          <path d="M6 16h12" />
        </>
      ) : kind === 'eyeros' ? (
        <>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M5.5 12s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4Z" />
          <circle cx="12" cy="12" r="1.7" />
        </>
      ) : (
        <path d="m5 12 4.5 4.5L19 7" />
      )}
    </svg>
  )
}

export function LookAccessBadges({
  isFree,
  isVip,
  isOwned,
  onOpen,
}: {
  isFree: boolean
  isVip: boolean
  isOwned: boolean
  onOpen: (option: LookMarketOption) => void
}) {
  if (isFree || isVip || isOwned) {
    return (
      <span className="look-access__available">
        <LookAccessIcon kind={isVip && !isFree ? 'vip' : 'check'} />
        {isFree ? 'Free look' : isVip ? 'Included with VIP' : 'Permanently unlocked'}
      </span>
    )
  }
  return (
    <div className="look-access" role="group" aria-label="Ways to unlock this look">
      <button
        type="button"
        className="look-access__badge look-access__badge--vip"
        aria-label="Open VIP market for all looks"
        onClick={() => onOpen('vip')}
      >
        <LookAccessIcon kind="vip" />
        <span>VIP</span>
      </button>
      <span className="look-access__or">or</span>
      <button
        type="button"
        className="look-access__badge look-access__badge--eyeros"
        aria-label="Open look market for 30,000 Eyeros"
        onClick={() => onOpen('eyeros')}
      >
        <LookAccessIcon kind="eyeros" />
        <span>{APPEARANCE_LOOK_PRICE_EYEROS.toLocaleString('en-US')}</span>
        <span className="look-access__currency">Eyeros</span>
      </button>
    </div>
  )
}

export function LookMarket({
  look,
  portraitUrl,
  balance,
  isAvailable,
  canSpend,
  initialOption,
  onClose,
  onPurchase,
  onVip,
  vipLabel = 'Explore VIP',
}: {
  look: AppearanceLook
  portraitUrl: string
  balance: number
  isAvailable: boolean
  canSpend: boolean
  initialOption: LookMarketOption
  onClose: () => void
  onPurchase: () => LookPurchaseResult
  onVip: () => void
  vipLabel?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()
  const descriptionId = useId()
  const [option, setOption] = useState(initialOption)
  const [result, setResult] = useState<LookPurchaseResult | null>(null)
  const purchaseLock = useRef(false)
  const price = APPEARANCE_LOOK_PRICE_EYEROS
  const affordable = Number.isFinite(balance) && balance >= price
  const unlocked = isAvailable || result === 'purchased' || result === 'owned'

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    if (!dialog) return
    // Native dialog supplies focus containment, Escape and background inertness.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      if (typeof dialog.close === 'function') dialog.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  function buy() {
    if (purchaseLock.current || unlocked || !canSpend || !affordable) return
    purchaseLock.current = true
    try {
      setResult(onPurchase())
    } finally {
      purchaseLock.current = false
    }
  }

  return (
    <dialog
      className="look-market"
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault()
        closeRef.current()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="look-market__body">
        <header className="look-market__header">
          <span className="look-market__eyebrow">The Big Eye · Look market</span>
          <button type="button" className="look-market__close" onClick={onClose} aria-label="Close market">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="look-market__identity">
          <img src={portraitUrl} alt="" className="look-market__portrait" />
          <div>
            <p className="look-market__kicker">Your next look</p>
            <h2 id={titleId}>{look.label}</h2>
            <p id={descriptionId}>
              {unlocked ? 'Ready for your next chapter.' : 'One look. Two ways to make it yours.'}
            </p>
          </div>
        </div>
        {unlocked ? (
          <div className="look-market__success" role="status">
            <span className="look-market__success-icon"><LookAccessIcon kind="check" /></span>
            <h3>{result === 'purchased' ? 'This look is yours.' : 'Already unlocked.'}</h3>
            <p>No repeat payments. Keep it for future seasons.</p>
            <button type="button" className="look-market__primary" onClick={onClose}>
              Back to changing room
            </button>
          </div>
        ) : (
          <>
            <div className="look-market__options" role="group" aria-label="Unlock method">
              <button
                type="button"
                className="look-market__option look-market__option--vip"
                aria-pressed={option === 'vip'}
                onClick={() => { setOption('vip'); setResult(null) }}
              >
                <LookAccessIcon kind="vip" />
                <strong>VIP</strong>
                <small>Every look</small>
              </button>
              <button
                type="button"
                className="look-market__option"
                aria-pressed={option === 'eyeros'}
                onClick={() => { setOption('eyeros'); setResult(null) }}
              >
                <LookAccessIcon kind="eyeros" />
                <strong>{price.toLocaleString('en-US')} Eyeros</strong>
                <small>This look · forever</small>
              </button>
            </div>
            <div className="look-market__detail" aria-live="polite">
              {option === 'vip' ? (
                <>
                  <h3>The entire wardrobe. Yours.</h3>
                  <p>All changing-room looks are included with VIP. Already own it? Restore your purchase in the Store.</p>
                  <button type="button" className="look-market__primary" onClick={onVip}>
                    <LookAccessIcon kind="vip" />{vipLabel}<span aria-hidden="true">↗</span>
                  </button>
                  <small className="look-market__note">The Store confirms the price before you pay.</small>
                </>
              ) : (
                <>
                  <div className="look-market__balance">
                    <span>Your wallet</span>
                    <strong><LookAccessIcon kind="eyeros" />{balance.toLocaleString('en-US')} Eyeros</strong>
                  </div>
                  {!canSpend ? (
                    <p className="look-market__hint">Create your profile with a free look first, then return here to spend your earned Eyeros.</p>
                  ) : !affordable || result === 'insufficient' ? (
                    <p className="look-market__hint">You need {Math.max(0, price - balance).toLocaleString('en-US')} more Eyeros. Earn them by playing seasons, or unlock every look with VIP.</p>
                  ) : (
                    <p className="look-market__after">After unlocking: {(balance - price).toLocaleString('en-US')} Eyeros</p>
                  )}
                  {result === 'unavailable' && <p role="alert">Your profile changed. Close the market and try again.</p>}
                  <button
                    type="button"
                    className="look-market__primary"
                    disabled={!canSpend || !affordable}
                    onClick={buy}
                  >
                    <LookAccessIcon kind="eyeros" />Unlock for {price.toLocaleString('en-US')} Eyeros
                  </button>
                  <small className="look-market__note">Permanent on this profile. No gameplay advantage.</small>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
