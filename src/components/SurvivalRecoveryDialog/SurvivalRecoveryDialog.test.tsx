import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SurvivalRecoveryDialog from './SurvivalRecoveryDialog'

const purchase = vi.hoisted(() => vi.fn())
const requestAd = vi.hoisted(() => vi.fn())
const creditState = vi.hoisted(() => ({
  balance: 0,
  hasRedemption: false,
  unreadable: false,
  error: null as string | null,
}))

vi.mock('../../vip/useSurvivalRuns', () => ({
  useSurvivalRuns: () => ({
    balance: creditState.balance,
    product: { price: '€0.99' },
    billingAvailable: true,
    loading: false,
    purchasing: false,
    error: creditState.error,
    clearError: () => {
      creditState.error = null
    },
    purchase,
  }),
}))
vi.mock('../../vip/survivalRunPurchaseService', () => ({
  hasSurvivalRunRedemption: () => {
    if (creditState.unreadable) throw new Error('Your Survival runs could not be read.')
    return creditState.hasRedemption
  },
}))
vi.mock('../../services/ads/useRewardedAd', () => ({
  useRewardedAd: () => ({ pending: false, request: requestAd }),
}))

function showDialog(adRecoveriesUsed = 0) {
  const handlers = {
    onAdRecovery: vi.fn(() => true),
    onPaidRecovery: vi.fn(async () => true),
    onStartNew: vi.fn(),
    onReturnHome: vi.fn(),
  }
  const result = render(
    <SurvivalRecoveryDialog
      description="You were eliminated on Day 4."
      recoveryKey="survival-one:4:0:0"
      adRecoveriesUsed={adRecoveriesUsed}
      {...handlers}
    />
  )
  return { ...result, ...handlers }
}

describe('Survival recovery choices', () => {
  beforeEach(() => {
    purchase.mockReset().mockResolvedValue(true)
    requestAd.mockReset().mockResolvedValue(true)
    creditState.balance = 0
    creditState.hasRedemption = false
    creditState.unreadable = false
    creditState.error = null
  })

  it('offers ad and paid recovery together in a single dialog', () => {
    showDialog()

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByText('7/7')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Watch ad · Continue run' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Buy & continue · €0.99' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Return Home' })).toBeEnabled()
  })

  it('keeps paid recovery available after all seven ad chances are used', () => {
    showDialog(7)

    expect(screen.queryByRole('button', { name: 'Watch ad · Continue run' })).toBeNull()
    expect(screen.getByText('0/7')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buy & continue · €0.99' })).toBeEnabled()
  })

  it('keeps the recovery dialog usable when paid-credit storage cannot be read', () => {
    creditState.unreadable = true
    showDialog()

    expect(screen.getByRole('alert')).toHaveTextContent('Your Survival runs could not be read')
    expect(screen.getByRole('button', { name: 'Watch ad · Continue run' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Return Home' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Survival runs unavailable' })).toBeDisabled()
  })

  it('does not recover when the rewarded ad is dismissed or unavailable', async () => {
    requestAd.mockResolvedValue(false)
    const { onAdRecovery } = showDialog(6)

    fireEvent.click(screen.getByRole('button', { name: 'Watch ad · Continue run' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Your ad chance has not been used')
    expect(onAdRecovery).not.toHaveBeenCalled()
    expect(screen.getByText('1/7')).toBeVisible()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('accepts one ad request and passes the original recovery key on success', async () => {
    let finish: (earned: boolean) => void = () => undefined
    requestAd.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
    )
    const { onAdRecovery, onReturnHome } = showDialog()

    const watch = screen.getByRole('button', { name: 'Watch ad · Continue run' })
    fireEvent.click(watch)
    fireEvent.click(watch)
    fireEvent.click(screen.getByRole('button', { name: 'Return Home' }))

    expect(requestAd).toHaveBeenCalledExactlyOnceWith('survival_continue')
    expect(onReturnHome).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Waiting for ad…' })).toBeDisabled()
    await act(async () => finish(true))
    expect(onAdRecovery).toHaveBeenCalledExactlyOnceWith('survival-one:4:0:0')
  })

  it('uses an existing credit without buying or watching an ad', async () => {
    creditState.balance = 2
    const { onPaidRecovery } = showDialog(7)

    fireEvent.click(screen.getByRole('button', { name: 'Use 1 Survival run' }))

    await waitFor(() =>
      expect(onPaidRecovery).toHaveBeenCalledExactlyOnceWith('survival-one:4:0:0')
    )
    expect(purchase).not.toHaveBeenCalled()
    expect(requestAd).not.toHaveBeenCalled()
  })

  it('resumes an already reserved recovery without a second purchase', async () => {
    creditState.hasRedemption = true
    const { onPaidRecovery } = showDialog(7)

    fireEvent.click(screen.getByRole('button', { name: 'Use 1 Survival run' }))

    await waitFor(() => expect(onPaidRecovery).toHaveBeenCalledOnce())
    expect(purchase).not.toHaveBeenCalled()
  })

  it('buys and continues while ad chances remain', async () => {
    const { onPaidRecovery } = showDialog(2)

    fireEvent.click(screen.getByRole('button', { name: 'Buy & continue · €0.99' }))

    await waitFor(() =>
      expect(onPaidRecovery).toHaveBeenCalledExactlyOnceWith('survival-one:4:0:0')
    )
    expect(purchase).toHaveBeenCalledOnce()
    expect(requestAd).not.toHaveBeenCalled()
    expect(screen.getByText('5/7')).toBeVisible()
  })

  it('leaves the run ended and the choices enabled when a purchase is cancelled', async () => {
    purchase.mockImplementation(async () => {
      creditState.error = 'Purchase cancelled.'
      return false
    })
    const { onPaidRecovery } = showDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Buy & continue · €0.99' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Purchase cancelled.')
    expect(onPaidRecovery).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Buy & continue · €0.99' })).toBeEnabled()
  })

  it('reports recovery failure in the same dialog without spending again', async () => {
    creditState.balance = 1
    const { onPaidRecovery } = showDialog()
    onPaidRecovery.mockRejectedValue(new Error('Your recovery could not be saved. Try again.'))

    fireEvent.click(screen.getByRole('button', { name: 'Use 1 Survival run' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Your recovery could not be saved')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Use 1 Survival run' })).toBeEnabled()
    expect(purchase).not.toHaveBeenCalled()
  })

  it('keeps a completed purchase available when its original dialog has unmounted', async () => {
    let finish: (purchased: boolean) => void = () => undefined
    purchase.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
    )
    const { unmount, onPaidRecovery } = showDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Buy & continue · €0.99' }))
    unmount()
    await act(async () => finish(true))

    expect(onPaidRecovery).not.toHaveBeenCalled()
  })
})
