import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SurvivalRunsProduct from './SurvivalRunsProduct'

const purchase = vi.hoisted(() => vi.fn())
const creditState = vi.hoisted(() => ({
  balance: 0,
  billingAvailable: true,
  error: null as string | null,
}))

vi.mock('../../vip/useSurvivalRuns', () => ({
  useSurvivalRuns: () => ({
    balance: creditState.balance,
    product: creditState.billingAvailable ? { price: '€0.99' } : null,
    billingAvailable: creditState.billingAvailable,
    loading: false,
    purchasing: false,
    error: creditState.error,
    clearError: () => {
      creditState.error = null
    },
    purchase,
  }),
}))

describe('Survival runs store product', () => {
  beforeEach(() => {
    creditState.balance = 0
    creditState.billingAvailable = true
    creditState.error = null
    purchase.mockReset().mockImplementation(async () => {
      creditState.balance += 1
      return true
    })
  })

  it('sells repeatable recovery credits and never changes into permanent ownership', async () => {
    render(<SurvivalRunsProduct />)

    expect(screen.getByRole('heading', { name: 'Survival runs' })).toBeVisible()
    expect(screen.getByText('€0.99')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Buy 1 Survival run' }))
    await waitFor(() => expect(screen.getByLabelText('1 Survival runs available')).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: 'Buy 1 Survival run' }))
    await waitFor(() => expect(screen.getByLabelText('2 Survival runs available')).toBeVisible())

    expect(purchase).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Buy 1 Survival run' })).toBeEnabled()
    expect(screen.queryByText('Owned', { exact: true })).toBeNull()
    expect(screen.queryByText('Included with VIP', { exact: true })).toBeNull()
  })

  it('requires real native pricing before enabling a purchase', () => {
    creditState.billingAvailable = false
    render(<SurvivalRunsProduct />)

    expect(screen.getByText('Price unavailable')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buy 1 Survival run' })).toBeDisabled()
    expect(purchase).not.toHaveBeenCalled()
  })

  it('prevents repeated taps from buying multiple credits concurrently', async () => {
    let finish: (purchased: boolean) => void = () => undefined
    purchase.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
    )
    render(<SurvivalRunsProduct />)

    const buy = screen.getByRole('button', { name: 'Buy 1 Survival run' })
    fireEvent.click(buy)
    fireEvent.click(buy)
    expect(purchase).toHaveBeenCalledOnce()
    finish(true)
    expect(await screen.findByRole('status')).toHaveTextContent('1 Survival run added')
  })
})
