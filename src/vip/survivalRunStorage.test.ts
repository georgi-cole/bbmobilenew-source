import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DurableStorageBackend } from '../store/durablePersistence'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

async function setup() {
  const rows = new Map<string, string>()
  const batches: Array<Array<{ key: string; value: string | null }>> = []
  const persistence = await import('../store/durablePersistence')
  const apply = vi.fn<DurableStorageBackend['apply']>(async (mutations) => {
    batches.push(mutations)
    for (const { key, value } of mutations) {
      if (value === null) rows.delete(key)
      else rows.set(key, value)
    }
  })
  await persistence.initializeDurablePersistence({
    kind: 'sqlite',
    loadAll: async () => rows,
    apply,
  })
  const ledger = await import('./survivalRunStorage')
  await ledger.recordSurvivalRunPurchase({ platform: 'ios', transactionId: 'paid', units: 2 })
  return { ledger, persistence, rows, apply, batches }
}

describe('durable Survival credit reservations', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('serializes concurrent spending and retries one elimination without charging twice', async () => {
    const { ledger } = await setup()
    const results = await Promise.all([
      ledger.reserveSurvivalRunCredit('death-a'),
      ledger.reserveSurvivalRunCredit('death-a'),
      ledger.reserveSurvivalRunCredit('death-b'),
      ledger.reserveSurvivalRunCredit('death-c'),
    ])
    expect(results).toEqual([true, true, true, false])
    expect(ledger.getSurvivalRunBalance()).toBe(0)
    expect(ledger.hasSurvivalRunRedemption('death-a')).toBe(true)
  })

  it('refunds a cancelled reservation but never refunds a delivered recovery', async () => {
    const { ledger } = await setup()
    await ledger.reserveSurvivalRunCredit('cancelled')
    await ledger.releaseSurvivalRunCredit('cancelled')
    expect(ledger.getSurvivalRunBalance()).toBe(2)
    await ledger.reserveSurvivalRunCredit('delivered')
    await ledger.finalizeSurvivalRunCredit('delivered')
    await ledger.releaseSurvivalRunCredit('delivered')
    expect(ledger.getSurvivalRunBalance()).toBe(1)
  })

  it('commits the resumed snapshot and credit debit in the same durable transaction', async () => {
    const { ledger, persistence, batches } = await setup()
    await ledger.reserveSurvivalRunCredit('same-commit', () =>
      persistence.setDurableItem('resumed-run', '{"day":4,"alive":true}')
    )
    expect(batches.at(-1)?.map(({ key }) => key)).toEqual([
      'resumed-run',
      ledger.SURVIVAL_RUN_LEDGER_KEY,
    ])
    expect(ledger.getSurvivalRunBalance()).toBe(1)
  })

  it('does not spend for a stale delivery and rolls back both records if durable commit fails', async () => {
    const { ledger, persistence, apply, rows } = await setup()
    expect(await ledger.reserveSurvivalRunCredit('stale', () => false)).toBe(false)
    expect(ledger.getSurvivalRunBalance()).toBe(2)
    apply.mockRejectedValueOnce(new Error('Disk unavailable'))
    await expect(
      ledger.reserveSurvivalRunCredit('failed', () =>
        persistence.setDurableItem('resumed-run', 'data')
      )
    ).rejects.toThrow('could not be saved')
    expect(ledger.getSurvivalRunBalance()).toBe(2)
    expect(ledger.hasSurvivalRunRedemption('failed')).toBe(false)
    expect(rows.has('resumed-run')).toBe(false)
  })

  it('refuses to erase a corrupt paid ledger', async () => {
    const { ledger, persistence, rows } = await setup()
    persistence.setDurableItem(ledger.SURVIVAL_RUN_LEDGER_KEY, '{broken')
    await persistence.flushDurablePersistence()
    await expect(ledger.prepareSurvivalRunLedger()).rejects.toThrow('could not be read')
    expect(rows.get(ledger.SURVIVAL_RUN_LEDGER_KEY)).toBe('{broken')
  })
})
