import { useEffect, useId, useRef, useState } from 'react'
import { SURVIVAL_AD_RECOVERY_LIMIT } from '../../modes/survivalRecovery'
import { useRewardedAd } from '../../services/ads/useRewardedAd'
import { hasSurvivalRunRedemption } from '../../vip/survivalRunPurchaseService'
import { useSurvivalRuns } from '../../vip/useSurvivalRuns'
import '../ConfirmExitModal/ConfirmExitModal.css'
import './SurvivalRecoveryDialog.css'

interface SurvivalRecoveryDialogProps {
  description: string
  recoveryKey: string | null
  adRecoveriesUsed: number
  onAdRecovery: (recoveryKey: string) => boolean
  onPaidRecovery: (recoveryKey: string) => Promise<boolean>
  onStartNew: () => void | Promise<void>
  onReturnHome: () => void | Promise<void>
}

type RecoveryAction = 'ad' | 'paid' | 'new-run' | 'home'

/** One terminal dialog owns every recovery and exit action. */
export default function SurvivalRecoveryDialog({
  description,
  recoveryKey,
  adRecoveriesUsed,
  onAdRecovery,
  onPaidRecovery,
  onStartNew,
  onReturnHome,
}: SurvivalRecoveryDialogProps) {
  const id = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const actionLockRef = useRef(false)
  const [activeAction, setActiveAction] = useState<RecoveryAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rewardedAd = useRewardedAd()
  const survivalRuns = useSurvivalRuns()
  const adsRemaining = Math.max(0, SURVIVAL_AD_RECOVERY_LIMIT - adRecoveriesUsed)
  let reservedRecovery = false
  let ledgerError: string | null = null
  try {
    reservedRecovery = recoveryKey !== null && hasSurvivalRunRedemption(recoveryKey)
  } catch (cause) {
    ledgerError = cause instanceof Error ? cause.message : 'Your Survival runs are unavailable.'
  }
  const hasRecoveryCredit = ledgerError === null && (survivalRuns.balance > 0 || reservedRecovery)
  const canPurchase =
    ledgerError === null &&
    survivalRuns.billingAvailable &&
    Boolean(survivalRuns.product?.price) &&
    !survivalRuns.loading
  const busy = activeAction !== null || rewardedAd.pending || survivalRuns.purchasing

  useEffect(() => {
    mountedRef.current = true
    const previousFocus = document.activeElement
    cardRef.current?.focus({ preventScroll: true })
    return () => {
      mountedRef.current = false
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  async function runAction(action: RecoveryAction, perform: () => void | Promise<void>) {
    if (actionLockRef.current || busy) return
    actionLockRef.current = true
    setActiveAction(action)
    setError(null)
    survivalRuns.clearError()
    try {
      await perform()
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error ? cause.message : 'Please try again. Your run is still here.'
        )
      }
    } finally {
      actionLockRef.current = false
      if (mountedRef.current) setActiveAction(null)
    }
  }

  async function watchAd() {
    if (!recoveryKey || adsRemaining === 0) return
    await runAction('ad', async () => {
      const earned = await rewardedAd.request('survival_continue')
      if (!mountedRef.current) return
      if (!earned) {
        setError('The ad was not completed or is unavailable. Your ad chance has not been used.')
        return
      }
      if (!onAdRecovery(recoveryKey)) {
        setError('This run has changed. No additional ad chance was used.')
      }
    })
  }

  async function handlePaidRecovery() {
    if (!recoveryKey || (!hasRecoveryCredit && !canPurchase)) return
    await runAction('paid', async () => {
      if (!hasRecoveryCredit && !(await survivalRuns.purchase())) return
      // A completed purchase stays in the balance if the player has left this run.
      if (!mountedRef.current) return
      if (!(await onPaidRecovery(recoveryKey)) && mountedRef.current) {
        setError('This run cannot be continued right now. Your Survival run is still available.')
      }
    })
  }

  return (
    <div
      className="confirm-modal__backdrop survival-recovery__backdrop"
      role="dialog"
      aria-modal="true"
      aria-busy={busy || undefined}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
    >
      <div
        ref={cardRef}
        className="confirm-modal__card survival-recovery__card"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            void runAction('home', onReturnHome)
          }
          if (event.key !== 'Tab') return
          const buttons =
            cardRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
          if (!buttons?.length) {
            event.preventDefault()
            return
          }
          const first = buttons[0]
          const last = buttons[buttons.length - 1]
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === cardRef.current)
          ) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <p className="survival-recovery__eyebrow">Surveyeval</p>
        <h2 id={`${id}-title`} className="confirm-modal__title">
          Surveyeval run ended
        </h2>
        <p id={`${id}-description`} className="confirm-modal__desc">
          {description}
        </p>

        {recoveryKey && (
          <div className="survival-recovery__options">
            <div className="survival-recovery__balance" aria-label="Recovery options">
              <span>
                <strong>
                  {adsRemaining}/{SURVIVAL_AD_RECOVERY_LIMIT}
                </strong>{' '}
                ad chances left
              </span>
              <span>
                <strong>{survivalRuns.balance}</strong> Survival runs
              </span>
            </div>

            {adsRemaining > 0 ? (
              <button
                type="button"
                className="confirm-modal__btn game-button game-button--primary"
                disabled={busy}
                onClick={() => void watchAd()}
              >
                {activeAction === 'ad' ? 'Waiting for ad…' : 'Watch ad · Continue run'}
              </button>
            ) : (
              <p className="survival-recovery__hint">
                All {SURVIVAL_AD_RECOVERY_LIMIT} ad chances have been used. A Survival run lets you
                continue.
              </p>
            )}

            <button
              type="button"
              className="confirm-modal__btn game-button game-button--ghost survival-recovery__paid"
              disabled={busy || (!hasRecoveryCredit && !canPurchase)}
              onClick={() => void handlePaidRecovery()}
            >
              {activeAction === 'paid'
                ? survivalRuns.purchasing
                  ? 'Confirming purchase…'
                  : 'Continuing run…'
                : hasRecoveryCredit
                  ? 'Use 1 Survival run'
                  : canPurchase
                    ? `Buy & continue · ${survivalRuns.product!.price}`
                    : survivalRuns.loading
                      ? 'Loading store…'
                      : 'Survival runs unavailable'}
            </button>
            <p className="survival-recovery__hint">
              One Survival run gives you one recovery without an ad. Buy more whenever you need
              them.
            </p>
            {!hasRecoveryCredit && (
              <p className="survival-recovery__hint">
                Unused recoveries stay on this device. They cannot be restored after reinstalling or
                changing devices.
              </p>
            )}
          </div>
        )}

        {(error || ledgerError || survivalRuns.error) && (
          <p className="survival-recovery__error" role="alert">
            {error || ledgerError || survivalRuns.error}
          </p>
        )}

        <div className="survival-recovery__exit-actions">
          <button
            type="button"
            className="game-button game-button--ghost"
            disabled={busy}
            onClick={() => void runAction('new-run', onStartNew)}
          >
            Start New Surveyeval
          </button>
          <button
            type="button"
            className="game-button game-button--ghost"
            disabled={busy}
            onClick={() => void runAction('home', onReturnHome)}
          >
            Return Home
          </button>
        </div>
      </div>
    </div>
  )
}
