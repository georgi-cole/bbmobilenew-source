import { expect, test as base, type ConsoleMessage, type Page } from '@playwright/test'
import type { RootState } from '../../../src/store/store'

type BrowserErrorSource = 'console' | 'page'

export interface BrowserError {
  source: BrowserErrorSource
  message: string
}

export interface BrowserErrorCollector {
  readonly errors: readonly BrowserError[]
}

function optionalSeed(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 0)
  return Number.isFinite(parsed) ? parsed >>> 0 : fallback
}

/**
 * The normal E2E suite retains its historical fixture by default. Season
 * simulations may provide a replay seed through environment variables before
 * Playwright launches the browser, so production game code remains untouched.
 */
export const E2E_NEW_SEASON_FIXTURE = Object.freeze({
  rosterSeed: optionalSeed('SEASON_SIM_ROSTER_SEED', 0x4f1bbcdc),
  seasonSeed: optionalSeed('SEASON_SIM_SEASON_SEED', 0x6d2b79f5),
})

function consoleError(message: ConsoleMessage): BrowserError | null {
  return message.type() === 'error' ? { source: 'console', message: message.text() } : null
}

async function installUnhandledRejectionReporter(page: Page): Promise<void> {
  await page.addInitScript(
    ({ newSeasonFixture, skipUnloadAutosave }) => {
      Object.defineProperty(window, '__E2E__', {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      })

      Object.defineProperty(window, '__bbE2ENewSeason', {
        configurable: false,
        enumerable: false,
        value: Object.freeze(newSeasonFixture),
        writable: false,
      })

      Object.defineProperty(window, '__bbE2ESkipUnloadAutosave', {
        configurable: false,
        enumerable: false,
        value: skipUnloadAutosave,
        writable: false,
      })

      // Browser E2E validates UI state, not media decoding. Keeping play() inert
      // prevents codec/autoplay differences from producing false console failures,
      // especially in WebKit, while audio behavior remains covered by unit tests.
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: () => Promise.resolve(),
        writable: true,
      })
      const createElement = document.createElement.bind(document)
      document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
        const element = createElement(tagName, options)
        if (tagName.toLowerCase() === 'audio') {
          Object.defineProperty(element, 'src', {
            configurable: true,
            get: () => '',
            set: () => undefined,
          })
        }
        return element
      }) as typeof document.createElement

      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason
        const detail =
          reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)
        console.error(`[unhandledrejection] ${detail}`)
      })
    },
    {
      newSeasonFixture: E2E_NEW_SEASON_FIXTURE,
      skipUnloadAutosave: process.env.SEASON_SIM_SKIP_UNLOAD_AUTOSAVE === '1',
    }
  )
}

const E2E_DURABLE_DB_NAME = 'big-eye-persistence'
const E2E_DURABLE_DB_VERSION = 1
const E2E_DURABLE_STORE_NAME = 'kv'

export async function readDurableItem(page: Page, key: string): Promise<string | null> {
  return page.evaluate(
    async ({ dbName, dbVersion, storeName, storageKey }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(request.error ?? new Error('Durable E2E database could not be opened.'))
      })

      try {
        return await new Promise<string | null>((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly')
          const request = transaction.objectStore(storeName).get(storageKey)
          request.onsuccess = () => {
            const row = request.result as { value?: unknown } | undefined
            resolve(typeof row?.value === 'string' ? row.value : null)
          }
          request.onerror = () =>
            reject(request.error ?? new Error('Durable E2E record could not be read.'))
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('Durable E2E read transaction aborted.'))
        })
      } finally {
        db.close()
      }
    },
    {
      dbName: E2E_DURABLE_DB_NAME,
      dbVersion: E2E_DURABLE_DB_VERSION,
      storeName: E2E_DURABLE_STORE_NAME,
      storageKey: key,
    }
  )
}

export async function writeDurableItem(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion, storeName, storageKey, storageValue }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(request.error ?? new Error('Durable E2E database could not be opened.'))
      })

      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite')
          transaction.objectStore(storeName).put({ key: storageKey, value: storageValue })
          transaction.oncomplete = () => resolve()
          transaction.onerror = () =>
            reject(transaction.error ?? new Error('Durable E2E write failed.'))
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('Durable E2E write transaction aborted.'))
        })
      } finally {
        db.close()
      }
    },
    {
      dbName: E2E_DURABLE_DB_NAME,
      dbVersion: E2E_DURABLE_DB_VERSION,
      storeName: E2E_DURABLE_STORE_NAME,
      storageKey: key,
      storageValue: value,
    }
  )
}

export async function removeDurableItem(page: Page, key: string): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion, storeName, storageKey }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(request.error ?? new Error('Durable E2E database could not be opened.'))
      })

      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readwrite')
          transaction.objectStore(storeName).delete(storageKey)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () =>
            reject(transaction.error ?? new Error('Durable E2E delete failed.'))
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('Durable E2E delete transaction aborted.'))
        })
      } finally {
        db.close()
      }
    },
    {
      dbName: E2E_DURABLE_DB_NAME,
      dbVersion: E2E_DURABLE_DB_VERSION,
      storeName: E2E_DURABLE_STORE_NAME,
      storageKey: key,
    }
  )
}

export async function listDurableKeys(page: Page, prefix = ''): Promise<string[]> {
  return page.evaluate(
    async ({ dbName, dbVersion, storeName, keyPrefix }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(request.error ?? new Error('Durable E2E database could not be opened.'))
      })

      try {
        return await new Promise<string[]>((resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly')
          const request = transaction.objectStore(storeName).getAllKeys()
          request.onsuccess = () =>
            resolve(
              request.result
                .filter((key): key is string => typeof key === 'string')
                .filter((key) => key.startsWith(keyPrefix))
            )
          request.onerror = () =>
            reject(request.error ?? new Error('Durable E2E keys could not be read.'))
          transaction.onabort = () =>
            reject(transaction.error ?? new Error('Durable E2E key transaction aborted.'))
        })
      } finally {
        db.close()
      }
    },
    {
      dbName: E2E_DURABLE_DB_NAME,
      dbVersion: E2E_DURABLE_DB_VERSION,
      storeName: E2E_DURABLE_STORE_NAME,
      keyPrefix: prefix,
    }
  )
}

export async function readAppState(page: Page): Promise<RootState> {
  await expect
    .poll(() => page.evaluate(() => window.__bbE2EState != null), {
      message: 'read-only E2E state probe should be installed',
    })
    .toBe(true)

  return page.evaluate(() => {
    const probe = window.__bbE2EState
    if (probe == null) throw new Error('read-only E2E state probe is unavailable')
    return probe.snapshot() as RootState
  })
}

export async function closeDebugPanelIfOpen(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(toggle).toBeVisible({ timeout: 10_000 })

  // This panel is optional. On mobile WebKit, resolving an absent complementary
  // role through the accessibility tree can occasionally stall until the test
  // timeout. A direct DOM locator makes the absence check immediate while the
  // close action still uses the accessible button name when the panel exists.
  const panel = page.locator('aside.dbg-panel[aria-label="Debug Panel"]')
  if ((await panel.count()) === 0) return

  await panel
    .getByRole('button', { name: 'Close Debug Panel' })
    .evaluate((button) => (button as HTMLButtonElement).click())
  await expect(panel).toBeHidden()
}

export async function dismissPermissionPromptIfPresent(page: Page): Promise<void> {
  const permissionPrompt = page.getByRole('dialog', { name: 'Allow location' })
  if (!(await permissionPrompt.isVisible())) return

  await permissionPrompt
    .getByRole('checkbox', { name: 'Remember my choice' })
    .evaluate((checkbox) => (checkbox as HTMLInputElement).click())
  await permissionPrompt
    .getByRole('button', { name: 'Deny' })
    .evaluate((button) => (button as HTMLButtonElement).click())
  await expect(permissionPrompt).toBeHidden()
}

export const test = base.extend<{ browserErrors: BrowserErrorCollector }>({
  browserErrors: [
    async ({ page }, use, testInfo) => {
      const errors: BrowserError[] = []
      const onConsole = (message: ConsoleMessage) => {
        const error = consoleError(message)
        if (error != null) errors.push(error)
      }
      const onPageError = (error: Error) => {
        errors.push({ source: 'page', message: error.message })
      }

      page.on('console', onConsole)
      page.on('pageerror', onPageError)
      await page.route('**/api/live-config', async (route) => {
        await route.fulfill({ body: '{}', contentType: 'application/json', status: 200 })
      })
      await page.route('https://fonts.googleapis.com/**', async (route) => {
        await route.fulfill({ body: '', contentType: 'text/css', status: 200 })
      })
      await page.route('https://fonts.gstatic.com/**', async (route) => {
        await route.fulfill({ body: '', contentType: 'font/woff2', status: 200 })
      })
      await page.route('https://api.dicebear.com/**', async (route) => {
        await route.fulfill({
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#263653"/></svg>',
          contentType: 'image/svg+xml',
          status: 200,
        })
      })
      await installUnhandledRejectionReporter(page)

      await use({ errors })

      page.off('console', onConsole)
      page.off('pageerror', onPageError)

      if (errors.length > 0) {
        await testInfo.attach('unexpected-browser-errors.json', {
          body: JSON.stringify(errors, null, 2),
          contentType: 'application/json',
        })
      }

      expect(
        errors,
        'unexpected browser console errors, page errors, or unhandled rejections'
      ).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
export type { Locator, Page, TestInfo } from '@playwright/test'
