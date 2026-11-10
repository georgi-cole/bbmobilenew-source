import { configureStore } from '@reduxjs/toolkit'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, { hydrateGame } from '../store/gameSlice'
import profilesReducer from '../store/profilesSlice'
import finaleReducer from '../store/finaleSlice'
import socialReducer from '../social/socialSlice'
import publicOpinionReducer from '../publicOpinion/publicOpinionSlice'
import challengeReducer from '../store/challengeSlice'
import type { AppDispatch, RootState } from '../store/store'
import {
  flushDurablePersistence,
  initializeDurablePersistence,
  setDurableItem,
} from '../store/durablePersistence'
import {
  createSavedSeasonSnapshot,
  getSavedRun,
  saveRunSnapshot,
  savedRunSlotKeyForProfile,
} from '../store/saveStatePersistence'
import {
  finalizeSurvivalRunCredit,
  releaseSurvivalRunCredit,
  reserveSurvivalRunCredit,
} from '../vip/survivalRunPurchaseService'
import {
  finalizeSurvivalRunCredit as finalizeCredit,
  getSurvivalRunBalance,
  hasSurvivalRunRedemption,
  recordSurvivalRunPurchase,
  releaseSurvivalRunCredit as releaseCredit,
  reserveSurvivalRunCredit as reserveCredit,
  SURVIVAL_RUN_LEDGER_KEY,
} from '../vip/survivalRunStorage'
import { createSurvivorRun } from './survivorRun'
import { getSurvivalRecoveryKey } from './survivalRecovery'
import { recoverSurvivalRunWithCredit } from './survivalRecoveryActions'

vi.mock('../vip/survivalRunPurchaseService', () => ({
  reserveSurvivalRunCredit: vi.fn(),
  releaseSurvivalRunCredit: vi.fn(),
  finalizeSurvivalRunCredit: vi.fn(),
}))

const records = new Map<string, string>()
let failNextWrite = false
let pauseNextWrite: Promise<void> | null = null
let onWriteStarted: (() => void) | null = null
let profileNumber = 0

beforeAll(async () => {
  await initializeDurablePersistence({
    kind: 'indexeddb',
    loadAll: async () => new Map(records),
    apply: async (mutations) => {
      if (failNextWrite) {
        failNextWrite = false
        throw new Error('Storage unavailable')
      }
      const pause = pauseNextWrite
      pauseNextWrite = null
      onWriteStarted?.()
      onWriteStarted = null
      if (pause) await pause
      for (const { key, value } of mutations) {
        if (value === null) records.delete(key)
        else records.set(key, value)
      }
    },
  })
})

beforeEach(async () => {
  failNextWrite = false
  pauseNextWrite = null
  onWriteStarted = null
  vi.mocked(reserveSurvivalRunCredit).mockReset().mockImplementation(reserveCredit)
  vi.mocked(releaseSurvivalRunCredit).mockReset().mockImplementation(releaseCredit)
  vi.mocked(finalizeSurvivalRunCredit).mockReset().mockImplementation(finalizeCredit)
  setDurableItem(
    SURVIVAL_RUN_LEDGER_KEY,
    JSON.stringify({ version: 1, purchases: {}, redemptions: {} })
  )
  await flushDurablePersistence()
})

function makeStore(guest = false) {
  const game = createSurvivorRun()
  game.status = 'failed'
  game.phase = 'eviction_results'
  game.week = 4
  game.players.find((player) => player.isUser)!.status = 'evicted'
  if (game.modeSpecific?.kind === 'survival') {
    game.modeSpecific.currentDay = 4
    game.modeSpecific.adContinueCount = 7
  }
  const profileId = `paid-recovery-profile-${++profileNumber}`
  const store = configureStore({
    reducer: {
      game: gameReducer,
      profiles: profilesReducer,
      finale: finaleReducer,
      social: socialReducer,
      publicOpinion: publicOpinionReducer,
      challenge: challengeReducer,
    },
    preloadedState: {
      game,
      profiles: {
        profiles: [],
        activeProfileId: guest ? null : profileId,
        isGuest: guest,
      },
    },
  })
  const key = getSurvivalRecoveryKey(store.getState().game)!
  return {
    store,
    profileId,
    key,
    recover: (recoveryKey = key) =>
      recoverSurvivalRunWithCredit(recoveryKey)(
        store.dispatch as AppDispatch,
        store.getState as () => RootState
      ),
  }
}

async function addCredits(units = 1) {
  await recordSurvivalRunPurchase({
    platform: 'ios',
    transactionId: 'confirmed-transaction',
    units,
  })
}

describe('paid Survival recovery delivery', () => {
  it('saves the continued run and spends one credit after all seven ad recoveries', async () => {
    const { store, key, profileId, recover } = makeStore()
    await addCredits()

    expect(await recover()).toBe(true)
    expect(store.getState().game).toMatchObject({
      status: 'active',
      phase: 'week_start',
      modeSpecific: { adContinueCount: 7, paidContinueCount: 1 },
    })
    expect(getSavedRun(profileId, 'survival')?.game).toMatchObject({
      status: 'active',
      modeSpecific: { paidContinueCount: 1 },
    })
    expect(getSurvivalRunBalance()).toBe(0)
    expect(hasSurvivalRunRedemption(key)).toBe(true)
    expect(finalizeSurvivalRunCredit).toHaveBeenCalledWith(key)
  })

  it('does not revive or create a save without a purchased credit', async () => {
    const { store, profileId, recover } = makeStore()
    expect(await recover()).toBe(false)
    expect(store.getState().game.status).toBe('failed')
    expect(getSavedRun(profileId, 'survival')).toBeNull()
    expect(getSurvivalRunBalance()).toBe(0)
  })

  it('coalesces repeated taps into one debit and one recovery', async () => {
    const { store, recover } = makeStore()
    await addCredits(2)
    const first = recover()
    const second = recover()
    expect(second).toBe(first)
    expect(await first).toBe(true)
    expect(getSurvivalRunBalance()).toBe(1)
    expect(reserveSurvivalRunCredit).toHaveBeenCalledTimes(1)
    expect(store.getState().game.modeSpecific).toMatchObject({ paidContinueCount: 1 })
  })

  it('keeps both the credit and failed run when the durable commit fails', async () => {
    const { store, profileId, recover } = makeStore()
    await addCredits()
    failNextWrite = true
    await expect(recover()).rejects.toThrow('could not be saved')
    expect(store.getState().game.status).toBe('failed')
    expect(getSurvivalRunBalance()).toBe(1)
    expect(getSavedRun(profileId, 'survival')).toBeNull()

    expect(await recover()).toBe(true)
    expect(getSurvivalRunBalance()).toBe(0)
    expect(getSavedRun(profileId, 'survival')?.game.status).toBe('active')
  })

  it('ignores a recovery requested for a different elimination', async () => {
    const { store, recover } = makeStore()
    await addCredits()
    expect(await recover('old-run:old-elimination')).toBe(false)
    expect(store.getState().game.status).toBe('failed')
    expect(getSurvivalRunBalance()).toBe(1)
    expect(reserveSurvivalRunCredit).not.toHaveBeenCalled()
  })

  it('returns an uncommitted credit when the run changes during persistence', async () => {
    const { store, profileId, recover } = makeStore()
    await addCredits()
    let resumeWrite!: () => void
    pauseNextWrite = new Promise<void>((resolve) => {
      resumeWrite = resolve
    })
    const writing = new Promise<void>((resolve) => {
      onWriteStarted = resolve
    })
    const recovering = recover()
    await writing
    const nextRun = createSurvivorRun()
    store.dispatch(hydrateGame(nextRun))
    resumeWrite()

    expect(await recovering).toBe(false)
    expect(store.getState().game.runId).toBe(nextRun.runId)
    expect(getSurvivalRunBalance()).toBe(1)
    expect(getSavedRun(profileId, 'survival')).toBeNull()
  })

  it('keeps the paid save when a delayed terminal autosave runs during its commit', async () => {
    const { store, profileId, recover } = makeStore()
    const terminalSnapshot = createSavedSeasonSnapshot(profileId, store.getState())
    await addCredits()
    let resumeWrite!: () => void
    pauseNextWrite = new Promise<void>((resolve) => {
      resumeWrite = resolve
    })
    const writing = new Promise<void>((resolve) => {
      onWriteStarted = resolve
    })
    const recovering = recover()
    await writing
    expect(saveRunSnapshot(profileId, terminalSnapshot)).toBe(true)
    resumeWrite()

    expect(await recovering).toBe(true)
    expect(store.getState().game.status).toBe('active')
    const committed = JSON.parse(records.get(savedRunSlotKeyForProfile(profileId, 'survival'))!)
    expect(committed.game).toMatchObject({
      status: 'active',
      modeSpecific: { paidContinueCount: 1 },
    })
    expect(getSurvivalRunBalance()).toBe(0)
  })

  it('continues a guest run without silently creating a profile save', async () => {
    const { store, profileId, recover } = makeStore(true)
    await addCredits()
    expect(await recover()).toBe(true)
    expect(store.getState().game.status).toBe('active')
    expect(getSavedRun(profileId, 'survival')).toBeNull()
    expect(getSurvivalRunBalance()).toBe(0)
  })

  it('keeps a delivered recovery when its final bookkeeping write fails', async () => {
    const { store, key, profileId, recover } = makeStore()
    await addCredits()
    vi.mocked(finalizeSurvivalRunCredit).mockRejectedValueOnce(new Error('Write interrupted'))
    expect(await recover()).toBe(true)
    expect(store.getState().game.status).toBe('active')
    expect(getSavedRun(profileId, 'survival')?.game.status).toBe('active')
    expect(hasSurvivalRunRedemption(key)).toBe(true)
    expect(getSurvivalRunBalance()).toBe(0)
    expect(releaseSurvivalRunCredit).not.toHaveBeenCalled()
  })
})
