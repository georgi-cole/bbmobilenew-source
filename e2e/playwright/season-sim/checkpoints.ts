import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'

import { readDurableItem } from '../support/test'
import type { RootState } from '../../../src/store/store'
import type { SeasonSimulationMode, SimulationSeeds } from './types'

const CHECKPOINT_VERSION = 1
const DURABLE_DB = 'big-eye-persistence'
const DURABLE_STORE = 'kv'
const SETUP_ROUTE = '**/__season_checkpoint__'

interface StoredCheckpoint {
  version: number
  mode: SeasonSimulationMode
  day: number
  phase: string
  gameId?: string
  runId: string | null
  humanStatus?: string
  seeds: SimulationSeeds
  actorRandomState: number
  origin: 'visible-journey' | 'qa-accelerated-setup'
  localStorage: Array<{ name: string; value: string }>
  durableItems: Array<{ key: string; value: string }>
}

function gameDay(state: RootState): number {
  return state.game.modeSpecific?.kind === 'survival'
    ? state.game.modeSpecific.currentDay
    : state.game.week
}

function slotForMode(mode: SeasonSimulationMode): string {
  return mode === 'survival' ? 'survival' : mode
}

function savedSlotKey(state: RootState, mode: SeasonSimulationMode): string {
  const profileId = state.profiles.activeProfileId
  if (!profileId) throw new Error('Cannot capture a checkpoint without an active profile.')
  return `bbmobilenew:savedRunSlot:${encodeURIComponent(profileId)}:${slotForMode(mode)}`
}

export function checkpointPath(
  directory: string,
  mode: SeasonSimulationMode,
  label: string
): string {
  return path.resolve(directory, `${mode}-${label}.json`)
}

/** Capture the app's actual saved-run records after autosave, not a Redux test fixture. */
export async function captureSeasonCheckpoint(
  page: Page,
  filePath: string,
  state: RootState,
  mode: SeasonSimulationMode,
  seeds: SimulationSeeds,
  actorRandomState: number,
  origin: StoredCheckpoint['origin']
): Promise<void> {
  const slotKey = savedSlotKey(state, mode)
  await expect
    .poll(
      async () => {
        const raw = await readDurableItem(page, slotKey)
        if (!raw) return null
        const saved = JSON.parse(raw) as { game?: RootState['game'] }
        if (saved.game?.runId !== state.game.runId) return null
        return `${saved.game.week}:${saved.game.phase}`
      },
      { timeout: 15_000, message: 'the durable save should contain this checkpoint phase' }
    )
    .toBe(`${state.game.week}:${state.game.phase}`)

  const storage = await page.evaluate(
    async ({ dbName, storeName }) => {
      const localItems = Array.from({ length: localStorage.length }, (_, index) => {
        const name = localStorage.key(index) ?? ''
        return { name, value: localStorage.getItem(name) ?? '' }
      }).filter(({ name }) => name.length > 0)
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        const durableItems = await new Promise<Array<{ key: string; value: string }>>(
          (resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly')
            const request = transaction.objectStore(storeName).getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          }
        )
        return { localStorage: localItems, durableItems }
      } finally {
        db.close()
      }
    },
    { dbName: DURABLE_DB, storeName: DURABLE_STORE }
  )

  const checkpoint: StoredCheckpoint = {
    version: CHECKPOINT_VERSION,
    mode,
    day: gameDay(state),
    phase: state.game.phase,
    gameId: state.game.gameId,
    runId: state.game.runId ?? null,
    humanStatus: state.game.players.find((player) => player.isUser)?.status ?? 'missing',
    seeds,
    actorRandomState,
    origin,
    ...storage,
  }
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(checkpoint), 'utf8')
}

export async function restoreSeasonCheckpoint(
  page: Page,
  filePath: string,
  expectedMode: SeasonSimulationMode,
  expectedSeeds: SimulationSeeds
): Promise<
  Pick<
    StoredCheckpoint,
    'mode' | 'day' | 'phase' | 'gameId' | 'runId' | 'humanStatus' | 'actorRandomState' | 'origin'
  >
> {
  const checkpoint = JSON.parse(await readFile(filePath, 'utf8')) as StoredCheckpoint
  if (
    checkpoint.version !== CHECKPOINT_VERSION ||
    checkpoint.mode !== expectedMode ||
    checkpoint.seeds.roster !== expectedSeeds.roster ||
    checkpoint.seeds.season !== expectedSeeds.season ||
    checkpoint.seeds.actor !== expectedSeeds.actor
  ) {
    throw new Error(`Checkpoint ${filePath} does not match this mode and seed set.`)
  }
  await page.route(SETUP_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Checkpoint</title>',
    })
  )
  try {
    await page.goto('./__season_checkpoint__')
    await page.evaluate(
      async ({ dbName, storeName, localItems, durableItems }) => {
        localStorage.clear()
        for (const { name, value } of localItems) localStorage.setItem(name, value)
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(dbName, 1)
          request.onupgradeneeded = () =>
            request.result.createObjectStore(storeName, { keyPath: 'key' })
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        try {
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite')
            const store = transaction.objectStore(storeName)
            store.clear()
            for (const item of durableItems) store.put(item)
            transaction.oncomplete = () => resolve()
            transaction.onerror = () => reject(transaction.error)
            transaction.onabort = () => reject(transaction.error)
          })
        } finally {
          db.close()
        }
      },
      {
        dbName: DURABLE_DB,
        storeName: DURABLE_STORE,
        localItems: checkpoint.localStorage,
        durableItems: checkpoint.durableItems,
      }
    )
  } finally {
    await page.unroute(SETUP_ROUTE)
  }
  return checkpoint
}

export function assertRestoredCheckpoint(
  state: RootState,
  checkpoint: Pick<StoredCheckpoint, 'mode' | 'day' | 'phase' | 'gameId' | 'runId' | 'humanStatus'>
): void {
  const mode = state.game.mode === 'survival' ? 'survival' : (state.game.expansionMode ?? 'classic')
  expect(mode).toBe(checkpoint.mode)
  expect(gameDay(state)).toBe(checkpoint.day)
  expect(state.game.phase).toBe(checkpoint.phase)
  if (checkpoint.gameId) expect(state.game.gameId).toBe(checkpoint.gameId)
  expect(state.game.runId ?? null).toBe(checkpoint.runId)
  if (checkpoint.humanStatus) {
    expect(state.game.players.find((player) => player.isUser)?.status ?? 'missing').toBe(
      checkpoint.humanStatus
    )
  }
}
