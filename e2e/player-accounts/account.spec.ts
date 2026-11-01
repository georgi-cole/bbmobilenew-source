import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test, type Page, type TestInfo } from '@playwright/test'
import type { PlayerAudience } from '../../src/services/backend/audienceService'
import {
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  readDurableItem,
} from '../playwright/support/test'

// This worker serves the real app with an isolated, mocked backend configuration.
// No test talks to a live Supabase project or sends an email.
const BACKEND_URL = 'https://account-preview.supabase.co'
const PROFILE_ID = 'demo-maya'
const OWNER_ID = 'b28a73c9-d01f-48f4-a014-d629b9a11e84'
const ANALYTICS_OWNER_ID = '8ec7de1a-36e3-41fd-990e-c7c129b11cb2'
const OTHER_OWNER_ID = 'c4611110-1686-4fb4-8ae8-f7a4d9ed8492'
const appUrl = 'http://127.0.0.1:4183/bbmobilenew/'
const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // The denied-access test intentionally receives an HTTP 403 from its mock RPC.
    if (
      message.text().includes('403') &&
      message.location().url.includes('/rpc/get_player_audience')
    )
      return
    errors.push(message.text())
  })
  await page.addInitScript(() => {
    Object.defineProperty(window, '__E2E__', { value: true })
    Object.defineProperty(window, '__bbE2ENewSeason', {
      value: Object.freeze({ rosterSeed: 0x4f1bbcdc, seasonSeed: 0x6d2b79f5 }),
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: () => Promise.resolve() })
    const createElement = document.createElement.bind(document)
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = createElement(tagName, options)
      if (tagName.toLowerCase() === 'audio')
        Object.defineProperty(element, 'src', {
          configurable: true,
          get: () => '',
          set: () => undefined,
        })
      return element
    }) as typeof document.createElement
  })
  await page.route('**/api/live-config', (route) => route.fulfill({ json: {} }))
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/css' })
  )
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'font/woff2' })
  )
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), 'Unexpected browser errors').toEqual([])
})

function demoUser(verified: boolean, admin = false, id = OWNER_ID) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: verified ? 'maya@example.com' : '',
    email_confirmed_at: verified ? '2026-11-01T08:00:00.000Z' : undefined,
    created_at: '2026-10-27T08:00:00.000Z',
    updated_at: '2026-11-01T08:00:00.000Z',
    is_anonymous: !verified,
    app_metadata: { provider: verified ? 'email' : 'anonymous', player_analytics_admin: admin },
    user_metadata: {},
    identities: [],
  }
}

function demoSession(user: ReturnType<typeof demoUser>) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    exp: expiresAt,
    iat: expiresAt - 3600,
    is_anonymous: user.is_anonymous,
  })}.demo-signature`
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: `demo-refresh-${user.id}`,
    user,
  }
}

const DEMO_AUDIENCE: PlayerAudience = {
  generatedAt: '2026-11-01T08:30:00.000Z',
  coverageStart: '2026-10-01T08:00:00.000Z',
  totalPlayers: 6,
  truncated: false,
  groupCounts: { new: 2, returning: 3, completed: 3, inactive: 1, tribunal: 2, tester: 2 },
  players: [
    {
      id: 'demo-maya',
      profileId: 'demo-maya',
      displayName: 'Maya · demo',
      isGuest: false,
      verifiedEmail: true,
      email: 'maya@example.com',
      newsOptIn: false,
      testerOptIn: true,
      firstSeenAt: '2026-10-27T08:00:00Z',
      lastActiveAt: '2026-11-01T08:20:00Z',
      seasonsStarted: 4,
      seasonsCompleted: 3,
      groups: ['returning', 'completed', 'tribunal', 'tester'],
    },
    {
      id: 'demo-leo',
      profileId: 'demo-leo',
      displayName: 'Leo · demo',
      isGuest: false,
      verifiedEmail: true,
      email: 'leo@example.com',
      newsOptIn: true,
      testerOptIn: false,
      firstSeenAt: '2026-10-27T08:00:00Z',
      lastActiveAt: '2026-11-01T07:30:00Z',
      seasonsStarted: 3,
      seasonsCompleted: 2,
      groups: ['returning', 'completed'],
    },
    {
      id: 'demo-guest',
      profileId: null,
      displayName: 'Guest · demo',
      isGuest: true,
      verifiedEmail: false,
      email: null,
      newsOptIn: false,
      testerOptIn: false,
      firstSeenAt: '2026-11-01T07:00:00Z',
      lastActiveAt: '2026-11-01T07:10:00Z',
      seasonsStarted: 1,
      seasonsCompleted: 0,
      groups: ['new'],
    },
    {
      id: 'demo-sara',
      profileId: 'demo-sara',
      displayName: 'Sara · demo',
      isGuest: false,
      verifiedEmail: false,
      email: null,
      newsOptIn: false,
      testerOptIn: false,
      firstSeenAt: '2026-10-01T08:00:00Z',
      lastActiveAt: '2026-10-15T07:30:00Z',
      seasonsStarted: 1,
      seasonsCompleted: 0,
      groups: ['inactive'],
    },
    {
      id: 'demo-noah',
      profileId: 'demo-noah',
      displayName: 'Noah · demo',
      isGuest: false,
      verifiedEmail: true,
      email: 'noah@example.com',
      newsOptIn: false,
      testerOptIn: true,
      firstSeenAt: '2026-10-27T08:00:00Z',
      lastActiveAt: '2026-10-31T07:30:00Z',
      seasonsStarted: 2,
      seasonsCompleted: 1,
      groups: ['returning', 'completed', 'tester'],
    },
    {
      id: 'demo-eva',
      profileId: 'demo-eva',
      displayName: 'Eva · demo',
      isGuest: false,
      verifiedEmail: false,
      email: null,
      newsOptIn: false,
      testerOptIn: false,
      firstSeenAt: '2026-10-30T08:00:00Z',
      lastActiveAt: '2026-10-31T07:30:00Z',
      seasonsStarted: 1,
      seasonsCompleted: 0,
      groups: ['new', 'tribunal'],
    },
  ],
}

async function installAccountFixture(
  page: Page,
  options: { guest?: boolean; verified?: boolean; admin?: boolean; denyAudience?: boolean } = {}
) {
  let user = demoUser(options.verified === true, options.admin === true)
  let preferences = { news_opt_in: false, tester_opt_in: false }
  const requests = {
    sends: [] as { email: string; mode: string }[],
    verifies: [] as { email: string; token: string; type: string }[],
    preferences: [] as Record<string, unknown>[],
    backups: [] as Record<string, unknown>[],
    unexpected: [] as string[],
    audience: 0,
  }
  await page.addInitScript(
    ({ accountSession, analyticsSession, guest, profileId }) => {
      // Use the app's existing preview marker to omit QA controls from screenshots.
      window.name = 'phone-preview:account-review'
      localStorage.setItem('bbmobilenew:supabase:profile_backup:v1', JSON.stringify(accountSession))
      localStorage.setItem('bbmobilenew:supabase:analytics:v1', JSON.stringify(analyticsSession))
      localStorage.setItem(
        'bbmobilenew:profiles:v1',
        JSON.stringify({
          profiles: guest
            ? []
            : [
                {
                  id: profileId,
                  name: 'Maya',
                  avatar: '👤',
                  createdAt: '2026-10-27T08:00:00.000Z',
                  appearanceSelection: { kind: 'catalog', lookId: 'pc-002', revision: 1 },
                  bio: { age: '28', sex: 'Female', location: 'Sofia' },
                  eyeoleans: 12500,
                },
              ],
          activeProfileId: guest ? null : profileId,
          isGuest: guest,
        })
      )
      localStorage.setItem(`bbmobilenew_season_tutorial_v1:${profileId}`, 'done')
    },
    {
      accountSession: demoSession(user),
      analyticsSession: demoSession(demoUser(false, false, ANALYTICS_OWNER_ID)),
      guest: options.guest === true,
      profileId: PROFILE_ID,
    }
  )
  await page.route(`${BACKEND_URL}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(value) })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/auth/v1/user' && method === 'GET') return json(user)
    if (path === '/auth/v1/user' && method === 'PUT') {
      const body = request.postDataJSON() as { email: string }
      requests.sends.push({ email: body.email, mode: 'connect' })
      return json({ ...user, new_email: body.email })
    }
    if (path === '/auth/v1/otp') {
      const body = request.postDataJSON() as { email: string; create_user: boolean }
      expect(body.create_user).toBe(false)
      requests.sends.push({ email: body.email, mode: 'sign_in' })
      return json({})
    }
    if (path === '/auth/v1/verify') {
      const body = request.postDataJSON() as { email: string; token: string; type: string }
      requests.verifies.push(body)
      user = {
        ...demoUser(true, false, body.type === 'email' ? OTHER_OWNER_ID : OWNER_ID),
        email: body.email,
      }
      return json(demoSession(user))
    }
    if (path === '/auth/v1/signup') return json(demoSession(demoUser(false)))
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers })
    if (path === '/rest/v1/player_contact_preferences') {
      if (method === 'GET') return json([preferences])
      if (method === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>
        requests.preferences.push(body)
        preferences = {
          news_opt_in: body.news_opt_in === true,
          tester_opt_in: body.tester_opt_in === true,
        }
        return route.fulfill({ status: 201, headers, body: '' })
      }
    }
    if (path === '/rest/v1/player_profiles') {
      if (method === 'POST')
        requests.backups.push(request.postDataJSON() as Record<string, unknown>)
      return route.fulfill({ status: 204, headers })
    }
    if (path === '/rest/v1/player_events') return route.fulfill({ status: 204, headers })
    if (path === '/rest/v1/rpc/get_player_audience') {
      requests.audience += 1
      if (!options.admin || options.denyAudience)
        return json({ code: '42501', message: 'An approved admin account is required.' }, 403)
      return json(DEMO_AUDIENCE)
    }
    requests.unexpected.push(`${method} ${path}`)
    return json({ message: 'Unexpected test request' }, 500)
  })
  return requests
}

async function capture(page: Page, name: string, testInfo: TestInfo) {
  await page.evaluate(() => document.fonts.ready)
  const directory = resolve('test-results/player-accounts')
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, `${name}-${testInfo.project.name}.png`)
  await page.screenshot({ path, animations: 'disabled' })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    mainWidth: document.querySelector('.app-shell__main')?.clientWidth ?? 0,
    mainScrollWidth: document.querySelector('.app-shell__main')?.scrollWidth ?? 0,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)
  expect(dimensions.mainScrollWidth).toBeLessThanOrEqual(dimensions.mainWidth)
}

test('email connection preserves the current season and saves independent choices @mobile', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 390, height: 844 })
  const requests = await installAccountFixture(page)
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
  const menu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(menu).toBeVisible({ timeout: 60000 })
  await dismissPermissionPromptIfPresent(page)
  await menu.getByRole('button', { name: 'Play', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Play menu' })
    .getByRole('button', { name: 'Classic', exact: true })
    .click()
  await expect.poll(async () => (await readAppState(page)).game.status).toBe('active')
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(navigation).toBeVisible({ timeout: 60000 })
  await navigation.getByRole('button', { name: /^home$/i }).click()
  const saveDialog = page.getByRole('dialog', { name: 'Save and return home?' })
  await expect(saveDialog).toBeVisible()
  await saveDialog.getByRole('button', { name: 'Save & Home' }).click()
  await expect(menu).toBeVisible()
  const savedRunKey = `bbmobilenew:savedRunSlot:${PROFILE_ID}:classic`
  await expect.poll(() => readDurableItem(page, savedRunKey)).not.toBeNull()
  const savedBefore = await readDurableItem(page, savedRunKey)
  const before = await readAppState(page)
  // Start and save through the real game UI, then visit the account entry with
  // the same store and durable storage to check that email linking keeps both.
  await page.evaluate(() => {
    window.location.hash = '/profile-picker'
  })
  await expect(page.getByRole('heading', { name: /Profiles/ })).toBeVisible()
  await capture(page, '01-manage-profiles-mobile', testInfo)
  await page.getByRole('button', { name: /Account & email/ }).click()
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
  expect(requests.sends).toHaveLength(0)
  await capture(page, '02-connect-email-mobile', testInfo)
  await page.getByLabel('Email address', { exact: true }).fill('maya@example.com')
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  await expect(page.getByLabel('Verification code', { exact: true })).toBeVisible()
  expect(requests.sends).toEqual([{ email: 'maya@example.com', mode: 'connect' }])
  await capture(page, '03-verification-code-mobile', testInfo)
  await page.getByLabel('Verification code', { exact: true }).fill('12345678')
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your email is connected' })).toBeVisible()
  expect(requests.verifies[0]).toMatchObject({ type: 'email_change', token: '12345678' })
  const news = page.getByRole('checkbox', { name: /Game news/ })
  const testers = page.getByRole('checkbox', { name: /Playtest invitations/ })
  await expect(news).not.toBeChecked()
  await expect(testers).not.toBeChecked()
  await testers.check()
  await page.getByRole('button', { name: 'Save email choices' }).click()
  await expect(page.getByText('Your email choices have been saved.')).toBeVisible()
  expect(requests.preferences).toEqual([
    { owner_id: OWNER_ID, news_opt_in: false, tester_opt_in: true },
  ])
  await page.locator('.player-account__preferences').scrollIntoViewIfNeeded()
  await capture(page, '04-verified-email-choices-mobile', testInfo)
  const after = await readAppState(page)
  expect(after.profiles).toEqual(before.profiles)
  expect(after.game.runId).toBe(before.game.runId)
  expect(after.game.gameId).toBe(before.game.gameId)
  expect(after.game.seasonContestant).toEqual(before.game.seasonContestant)
  expect(await readDurableItem(page, savedRunKey)).toBe(savedBefore)
  expect(requests.unexpected).toEqual([])
  await expectNoHorizontalOverflow(page)
})

test('a guest can open optional account settings without creating a profile @mobile', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const requests = await installAccountFixture(page, { guest: true })
  await page.goto(`${appUrl}#/profile-picker`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Account & email/ }).click()
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
  const state = await readAppState(page)
  expect(state.profiles.isGuest).toBe(true)
  expect(state.profiles.profiles).toEqual([])
  expect(requests.sends).toHaveLength(0)
  await capture(page, '05-guest-email-entry-mobile', testInfo)
})

test('existing-account sign-in is explicit and retains local profiles on a narrow phone @mobile', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const requests = await installAccountFixture(page)
  await page.goto(`${appUrl}#/account`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Already connected? Sign in' }).click()
  await expect(
    page.getByText(/Signing in connects this device's existing local profiles/)
  ).toBeVisible()
  const before = await readAppState(page)
  expect(requests.sends).toHaveLength(0)
  await page.getByLabel('Email address', { exact: true }).fill('maya@example.com')
  await expectNoHorizontalOverflow(page)
  await capture(page, '06-sign-in-narrow-mobile', testInfo)
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await page.getByLabel('Verification code', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your email is connected' })).toBeVisible()
  expect(requests.sends).toEqual([{ email: 'maya@example.com', mode: 'sign_in' }])
  expect(requests.verifies[0]).toMatchObject({ type: 'email' })
  expect((await readAppState(page)).profiles).toEqual(before.profiles)
  await expectNoHorizontalOverflow(page)
  await expect
    .poll(() => requests.backups.some((entry) => entry.owner_id === OTHER_OWNER_ID))
    .toBe(true)
  expect(requests.unexpected).toEqual([])
})

test('approved admin sees overlapping groups with demo player records', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 1000 })
  const requests = await installAccountFixture(page, { verified: true, admin: true })
  await page.goto(`${appUrl}#/settingsatiste`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: /Players/ }).click()
  const records = page.getByRole('list', { name: 'Player records' })
  await expect(records.getByRole('listitem')).toHaveCount(6)
  await capture(page, '07-player-audience-desktop', testInfo)
  await page.getByRole('button', { name: 'Testers 2', exact: true }).click()
  await expect(records.getByRole('listitem')).toHaveCount(2)
  await expect(records.getByText('Maya · demo', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'All 6', exact: true }).click()
  await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('guests')
  await expect(records.getByRole('listitem')).toHaveCount(1)
  await expect(records.getByText('Guest · demo', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('all')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.settings-content').evaluate((element) => {
    element.scrollTop = 0
  })
  await capture(page, '08-player-audience-mobile', testInfo)
  await expectNoHorizontalOverflow(page)
  expect(requests.audience).toBeGreaterThan(0)
  expect(requests.unexpected).toEqual([])
})

test('server denial cannot be bypassed by an admin flag in the local session', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const requests = await installAccountFixture(page, {
    verified: true,
    admin: true,
    denyAudience: true,
  })
  await page.goto(`${appUrl}#/settingsatiste`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: /Players/ }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'This account does not have player audience access.'
  )
  await expect(page.getByRole('list', { name: 'Player records' })).toHaveCount(0)
  await capture(page, '09-player-audience-access-mobile', testInfo)
  expect(requests.audience).toBeGreaterThan(0)
})
