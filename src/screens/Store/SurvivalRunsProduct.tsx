import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import StoreProductIcon from '../../components/StoreProductModal/StoreProductIcon'
import { SURVIVAL_RUN_PRODUCT } from '../../vip/vipConfig'
import { useSurvivalRuns } from '../../vip/useSurvivalRuns'
import { ADULT_STORE_PURCHASE_REQUIRED_MESSAGE } from '../../safety/playerSafety'

/** Consumable credits stay separate from permanent and VIP ownership. */
export default function SurvivalRunsProduct() {
  const navigate = useNavigate()
  const id = useId()
  const survivalRuns = useSurvivalRuns()
  const purchaseLockRef = useRef(false)
  const [notice, setNotice] = useState<string | null>(null)
  const canBuy =
    survivalRuns.billingAvailable &&
    Boolean(survivalRuns.product?.price) &&
    !survivalRuns.loading &&
    !survivalRuns.purchasing

  async function buyCredit() {
    if (purchaseLockRef.current || !canBuy) return
    purchaseLockRef.current = true
    setNotice(null)
    survivalRuns.clearError()
    try {
      if (await survivalRuns.purchase()) {
        setNotice('1 Survival run added to your balance.')
      }
    } finally {
      purchaseLockRef.current = false
    }
  }

  return (
    <section className="vip-store__survival-runs" aria-labelledby={`${id}-title`}>
      <div className="vip-store__survival-runs-heading">
        <span className="vip-store__product-icon" aria-hidden="true">
          <StoreProductIcon name="survivalRuns" />
        </span>
        <div>
          <p className="vip-store__eyebrow">Keep going</p>
          <h3 id={`${id}-title`}>{SURVIVAL_RUN_PRODUCT.title}</h3>
        </div>
        <span
          className="vip-store__survival-runs-balance"
          aria-label={`${survivalRuns.balance} Survival runs available`}
        >
          {survivalRuns.balance} available
        </span>
      </div>
      <p className="vip-store__survival-runs-description">
        Continue the same Surveyeval run after elimination, without watching an ad—even after all
        seven ad chances are used.
      </p>
      <div className="vip-store__survival-runs-purchase">
        <span>
          <strong>{survivalRuns.product?.price || 'Price unavailable'}</strong>
          <small>1 recovery · buy as often as you like</small>
        </span>
        <span className="vip-store__power-action">
          <button
            type="button"
            disabled={!canBuy}
            onClick={() => void buyCredit()}
            aria-label={
              survivalRuns.purchasing ? 'Confirming Survival run purchase' : 'Buy 1 Survival run'
            }
          >
            {survivalRuns.purchasing
              ? 'Confirming…'
              : survivalRuns.loading
                ? 'Loading…'
                : canBuy
                  ? 'Buy'
                  : 'Unavailable'}
          </button>
        </span>
      </div>
      <p className="vip-store__survival-runs-note">{SURVIVAL_RUN_PRODUCT.legalNote}</p>
      {(notice || survivalRuns.error) && (
        <div
          className={
            survivalRuns.error ? 'vip-store__notice vip-store__notice--error' : 'vip-store__notice'
          }
          role={survivalRuns.error ? 'alert' : 'status'}
        >
          <span>{survivalRuns.error || notice}</span>
          {survivalRuns.error === ADULT_STORE_PURCHASE_REQUIRED_MESSAGE && (
            <button
              type="button"
              className="vip-store__survival-runs-help"
              onClick={() => navigate('/player-privacy', { state: { fromSettings: true } })}
            >
              Open age &amp; privacy settings
            </button>
          )}
        </div>
      )}
    </section>
  )
}
