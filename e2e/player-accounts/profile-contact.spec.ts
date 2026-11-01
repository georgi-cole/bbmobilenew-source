import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test, type Page, type TestInfo } from '@playwright/test'
import type { PlayerAudience } from '../../src/services/backend/audienceService'
import type { ProfileContact } from '../../src/services/backend/profileContact'
import { openProfileCreationForm } from '../playwright/support/profile'
import {
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  readDurableItem,
} from '../playwright/support/test'

// Real app routes, fictional records and an entirely intercepted Supabase URL.
// No journey sends email or reads/writes a production project.
const BACKEND_URL = 'https://account-preview.supabase.co'
const APP_URL = 'http://127.0.0.1:4183/bbmobilenew/'
const PROFILE_ID = 'demo-maya'
const OWNER_ID = 'b28a73c9-d01f-48f4-a014-d629b9a11e84'
const ANALYTICS_OWNER_ID = '8ec7de1a-36e3-41fd-990e-c7c129b11cb2'
const ADMIN_ID = 'c4611110-1686-4fb4-8ae8-f7a4d9ed8492'
const CONTACT_REVISION = '732ce7bc-24b4-4057-b99e-ff0a5787590b'
const EMAIL_CHOICE = 'Send me The Big Eye news and playtest invitations.'
const browserErrors = new WeakMap<Page, string[]>()
const expectedHttpErrors = new WeakMap<Page, Set<string>>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  const expectedErrors = new Set<string>()
  browserErrors.set(page, errors)
  expectedHttpErrors.set(page, expectedErrors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (expectedErrors.has(message.location().url) && /\b(400|403|500)\b/.test(message.text()))
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
    window.addEventListener('unhandledrejection', (event) => {
      console.error(String(event.reason))
    })
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

function demoUser(id: string, admin = false) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: admin ? 'admin@example.com' : '',
    email_confirmed_at: admin ? '2026-11-01T08:00:00.000Z' : undefined,
    created_at: '2026-10-27T08:00:00.000Z',
    updated_at: '2026-11-01T08:00:00.000Z',
    is_anonymous: !admin,
    app_metadata: { provider: admin ? 'email' : 'anonymous', player_analytics_admin: admin },
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
  totalPlayers: 4,
  truncated: false,
  groupCounts: { new: 1, returning: 2, completed: 2, inactive: 1, tribunal: 1, subscribed: 2 },
  players: [
    {
      id: 'demo-maya',
      profileId: 'demo-maya',
      displayName: 'Maya · demo',
      isGuest: false,
      verifiedEmail: false,
      email: 'maya@example.com',
      updatesOptIn: true,
      firstSeenAt: '2026-10-27T08:00:00Z',
      lastActiveAt: '2026-11-01T08:20:00Z',
      seasonsStarted: 4,
      seasonsCompleted: 3,
      groups: ['returning', 'completed', 'tribunal', 'subscribed'],
    },
    {
      id: 'demo-leo',
      profileId: 'demo-leo',
      displayName: 'Leo · demo',
      isGuest: false,
      verifiedEmail: false,
      email: 'leo@example.com',
      updatesOptIn: true,
      firstSeenAt: '2026-10-27T08:00:00Z',
      lastActiveAt: '2026-11-01T07:30:00Z',
      seasonsStarted: 3,
      seasonsCompleted: 2,
      groups: ['returning', 'completed', 'subscribed'],
    },
    {
      id: 'demo-guest',
      profileId: null,
      displayName: 'Guest · demo',
      isGuest: true,
      verifiedEmail: false,
      email: null,
      updatesOptIn: false,
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
      updatesOptIn: false,
      firstSeenAt: '2026-10-01T08:00:00Z',
      lastActiveAt: '2026-10-15T07:30:00Z',
      seasonsStarted: 1,
      seasonsCompleted: 0,
      groups: ['inactive'],
    },
  ],
}

type FixtureOptions = {
  emptyProfiles?: boolean
  guest?: boolean
  contact?: ProfileContact
  readFailure?: boolean
  saveFailure?: boolean
  adminSession?: boolean
  denyAudience?: boolean
}

async function installContactFixture(page: Page, options: FixtureOptions = {}) {
  const contacts = new Map<string, ProfileContact>()
  if (options.contact) contacts.set(PROFILE_ID, options.contact)
  let revision = 0
  let approvedAdmin = options.adminSession === true
  const requests = {
    contacts: [] as {
      p_profile_id: string
      p_email: string
      p_updates_opt_in: boolean
      p_expected_revision: string | null
    }[],
    contactReads: [] as string[],
    backups: [] as Record<string, unknown>[],
    events: [] as Record<string, unknown>[],
    auth: [] as string[],
    unsubscribe: [] as string[],
    unexpected: [] as string[],
    audience: 0,
  }
  await page.addInitScript(
    ({ backupSession, analyticsSession, adminSession, emptyProfiles, guest, profileId }) => {
      window.name = 'phone-preview:profile-email-review'
      if (localStorage.getItem('bb:profile-email-demo')) return
      localStorage.setItem('bb:profile-email-demo', '1')
      localStorage.setItem('bbmobilenew:supabase:profile_backup:v1', JSON.stringify(backupSession))
      localStorage.setItem('bbmobilenew:supabase:analytics:v1', JSON.stringify(analyticsSession))
      if (adminSession)
        localStorage.setItem('bbmobilenew:supabase:audience_admin:v1', JSON.stringify(adminSession))
      localStorage.setItem(
        'bbmobilenew:profiles:v1',
        JSON.stringify({
          profiles: emptyProfiles
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
          activeProfileId: emptyProfiles ? null : profileId,
          isGuest: guest,
        })
      )
      localStorage.setItem(`bbmobilenew_season_tutorial_v1:${profileId}`, 'done')
      localStorage.setItem('bbmobilenew_season_tutorial_v1:guest', 'done')
    },
    {
      backupSession: demoSession(demoUser(OWNER_ID)),
      analyticsSession: demoSession(demoUser(ANALYTICS_OWNER_ID)),
      adminSession: options.adminSession ? demoSession(demoUser(ADMIN_ID, true)) : null,
      emptyProfiles: options.emptyProfiles === true,
      guest: options.guest === true,
      profileId: PROFILE_ID,
    }
  )
  await page.route(`${BACKEND_URL}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
    const json = (value: unknown, status = 200) => {
      if (status >= 400) expectedHttpErrors.get(page)?.add(request.url())
      return route.fulfill({ status, headers, body: JSON.stringify(value) })
    }
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path.startsWith('/auth/')) requests.auth.push(`${method} ${path}`)
    if (path === '/auth/v1/user' && method === 'GET') return json(demoUser(ADMIN_ID, true))
    if (
      path === '/auth/v1/token' &&
      new URL(request.url()).searchParams.get('grant_type') === 'password'
    ) {
      const body = request.postDataJSON() as { email: string; password: string }
      expect(body.email).toBe('admin@example.com')
      expect(body.password).toBe('demo-password-for-route-mock')
      approvedAdmin = true
      return json(demoSession(demoUser(ADMIN_ID, true)))
    }
    if (path === '/auth/v1/logout') {
      approvedAdmin = false
      return route.fulfill({ status: 204, headers })
    }
    if (path === '/auth/v1/signup') return json(demoSession(demoUser(OWNER_ID)))
    if (path === '/rest/v1/player_profiles') {
      if (method === 'POST')
        requests.backups.push(request.postDataJSON() as Record<string, unknown>)
      return route.fulfill({ status: 204, headers })
    }
    if (path === '/rest/v1/player_events') {
      requests.events.push(request.postDataJSON() as Record<string, unknown>)
      return route.fulfill({ status: 204, headers })
    }
    if (path === '/rest/v1/rpc/get_player_profile_contact') {
      const { p_profile_id: profileId } = request.postDataJSON() as { p_profile_id: string }
      requests.contactReads.push(profileId)
      if (options.readFailure) return json({ code: 'XX000', message: 'Demo offline read' }, 500)
      return json(contacts.get(profileId) ?? null)
    }
    if (path === '/rest/v1/rpc/save_player_profile_contact') {
      const body = request.postDataJSON() as (typeof requests.contacts)[number]
      requests.contacts.push(body)
      if (options.saveFailure) return json({ code: 'XX000', message: 'Demo offline save' }, 500)
      const current = contacts.get(body.p_profile_id)
      if ((current?.revision ?? null) !== body.p_expected_revision)
        return json({ code: '40001', message: 'Demo stale revision' }, 400)
      const contact = {
        email: body.p_email,
        updatesOptIn: body.p_updates_opt_in,
        revision: `732ce7bc-24b4-4057-b99e-${String(++revision).padStart(12, '0')}`,
      }
      contacts.set(body.p_profile_id, contact)
      return json(contact)
    }
    if (path === '/rest/v1/rpc/get_player_audience') {
      requests.audience += 1
      if (!approvedAdmin || options.denyAudience)
        return json({ code: '42501', message: 'Demo server access denied' }, 403)
      return json(DEMO_AUDIENCE)
    }
    if (path === '/rest/v1/rpc/unsubscribe_player_contact') {
      const { p_token: token } = request.postDataJSON() as { p_token: string }
      requests.unsubscribe.push(token)
      return json(true)
    }
    requests.unexpected.push(`${method} ${path}`)
    return json({ message: 'Unexpected test request' }, 500)
  })
  return requests
}

async function capture(page: Page, name: string, testInfo: TestInfo) {
  await page.evaluate(() => document.fonts.ready)
  const directory = resolve('test-results/profile-email')
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, `${name}-${testInfo.project.name}.png`)
  await page.screenshot({ path, animations: 'disabled' })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}

async function noHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    mainWidth: document.querySelector('.app-shell__main')?.clientWidth ?? 0,
    mainScrollWidth: document.querySelector('.app-shell__main')?.scrollWidth ?? 0,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)
  expect(dimensions.mainScrollWidth).toBeLessThanOrEqual(dimensions.mainWidth)
}

async function fillRequiredDetails(page: Page, name = 'Maya') {
  await page.getByRole('textbox', { name: 'Display Name', exact: true }).fill(name)
  await page.getByRole('spinbutton', { name: 'Age', exact: true }).fill('28')
  await page.getByRole('textbox', { name: 'Location', exact: true }).fill('Sofia')
  await page
    .getByRole('combobox', { name: 'Sex (Reality storylines)', exact: true })
    .selectOption('Female')
}

async function openNewProfile(page: Page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({ timeout: 60000 })
  await dismissPermissionPromptIfPresent(page)
  await openProfileCreationForm(page)
  await fillRequiredDetails(page)
}

async function startSeason(page: Page) {
  const menu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(menu).toBeVisible({ timeout: 60000 })
  await dismissPermissionPromptIfPresent(page)
  await menu.getByRole('button', { name: 'Play', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Play menu' })
    .getByRole('button', { name: 'Classic', exact: true })
    .click()
  await expect.poll(async () => (await readAppState(page)).game.status).toBe('active')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: 60000,
  })
  await expect
    .poll(async () => Boolean((await readAppState(page)).game.gameId), { timeout: 30000 })
    .toBe(true)
}

test('optional email starts empty and unchecked inside the real profile creation form @mobile', async ({
  page,
}, testInfo) => {
  const requests = await installContactFixture(page, { emptyProfiles: true, guest: true })
  await openNewProfile(page)
  await expect(page.getByLabel('Email (optional)', { exact: true })).toHaveValue('')
  await expect(page.getByRole('checkbox', { name: EMAIL_CHOICE })).not.toBeChecked()
  expect(requests.contacts).toHaveLength(0)
  expect(requests.contactReads).toHaveLength(0)
  await page.locator('.app-shell__main').evaluate((element) => {
    element.scrollTop = 0
  })
  await capture(page, '01-create-profile-optional-email-mobile', testInfo)
  await noHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  expect((await readAppState(page)).profiles.profiles).toHaveLength(1)
  expect(requests.contacts).toHaveLength(0)
  expect(requests.auth).not.toContain('POST /auth/v1/otp')
  expect(requests.auth).not.toContain('PUT /auth/v1/user')
  expect(requests.unexpected).toEqual([])
})

test('guest season is adopted with an explicit email choice and no authentication flow @mobile', async ({
  page,
}, testInfo) => {
  const requests = await installContactFixture(page, { emptyProfiles: true, guest: true })
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await startSeason(page)
  const before = await readAppState(page)
  await page.evaluate(() => {
    window.location.hash = '/profile'
  })
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await page.getByRole('button', { name: 'Choose this look', exact: true }).click()
  const reveal = page.getByRole('dialog', { name: /^Look \d+$/ })
  await expect(reveal).toBeVisible()
  const skip = reveal.getByRole('button', { name: 'Skip reveal', exact: true })
  if (await skip.isVisible()) await skip.click()
  await reveal.getByRole('button', { name: 'Continue', exact: true }).click()
  await fillRequiredDetails(page)
  await page.getByLabel('Email (optional)', { exact: true }).fill('maya@example.com')
  const choice = page.getByRole('checkbox', { name: EMAIL_CHOICE })
  await expect(choice).not.toBeChecked()
  await choice.check()
  expect(requests.contacts).toHaveLength(0)
  await page.locator('.app-shell__main').evaluate((element) => {
    element.scrollTop = 0
  })
  await capture(page, '02-create-profile-email-choice-mobile', testInfo)
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  const after = await readAppState(page)
  const createdId = after.profiles.activeProfileId
  expect(requests.contacts).toEqual([
    {
      p_profile_id: createdId,
      p_email: 'maya@example.com',
      p_updates_opt_in: true,
      p_expected_revision: null,
    },
  ])
  expect(after.profiles.isGuest).toBe(false)
  expect(after.game.runId).toBe(before.game.runId)
  expect(after.game.gameId).toBe(before.game.gameId)
  expect(after.game.phase).toBe(before.game.phase)
  expect(after.game.players).toEqual(before.game.players)
  expect(after.game.seasonContestant).toEqual(before.game.seasonContestant)
  expect(JSON.stringify(after)).not.toContain('maya@example.com')
  expect(await page.evaluate(() => localStorage.getItem('bbmobilenew:profiles:v1'))).not.toContain(
    'maya@example.com'
  )
  expect(JSON.stringify(requests.events)).not.toContain('maya@example.com')
  expect(JSON.stringify(requests.backups)).not.toContain('maya@example.com')
  // At the opening Classic phase, autosave has no meaningful progress yet. This
  // case proves adoption keeps the live run; the next journey checks a real durable save.
  expect(requests.auth).not.toContain('POST /auth/v1/otp')
  expect(requests.auth).not.toContain('POST /auth/v1/verify')
  expect(requests.auth).not.toContain('PUT /auth/v1/user')
  expect(requests.unexpected).toEqual([])
})

test('editing the saved email choice preserves the local profile and durable season @mobile', async ({
  page,
}, testInfo) => {
  const requests = await installContactFixture(page, {
    contact: { email: 'maya@example.com', updatesOptIn: true, revision: CONTACT_REVISION },
  })
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await startSeason(page)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^home$/i })
    .click()
  const saveDialog = page.getByRole('dialog', { name: 'Save and return home?' })
  await saveDialog.getByRole('button', { name: 'Save & Home' }).click()
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
  const key = `bbmobilenew:savedRunSlot:${PROFILE_ID}:classic`
  await expect.poll(() => readDurableItem(page, key)).not.toBeNull()
  const savedBefore = await readDurableItem(page, key)
  const before = await readAppState(page)
  await page.evaluate(() => {
    window.location.hash = '/profile-edit'
  })
  await expect(page.getByLabel('Email (optional)', { exact: true })).toHaveValue('maya@example.com')
  await expect(page.getByRole('checkbox', { name: EMAIL_CHOICE })).toBeChecked()
  await capture(page, '03-edit-profile-email-mobile', testInfo)
  await page.getByRole('checkbox', { name: EMAIL_CHOICE }).uncheck()
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  expect(requests.contacts).toEqual([
    {
      p_profile_id: PROFILE_ID,
      p_email: 'maya@example.com',
      p_updates_opt_in: false,
      p_expected_revision: CONTACT_REVISION,
    },
  ])
  const after = await readAppState(page)
  expect(after.profiles).toEqual(before.profiles)
  expect(after.game.seasonContestant).toEqual(before.game.seasonContestant)
  expect(await readDurableItem(page, key)).toBe(savedBefore)
  expect(await readDurableItem(page, key)).not.toContain('maya@example.com')
  expect(JSON.stringify(after)).not.toContain('maya@example.com')
  expect(requests.unexpected).toEqual([])
})

test('invalid and failed optional email can be cleared to save on a narrow phone @mobile', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const requests = await installContactFixture(page, {
    emptyProfiles: true,
    guest: true,
    saveFailure: true,
  })
  await openNewProfile(page)
  const email = page.getByLabel('Email (optional)', { exact: true })
  await email.fill('invalid-address')
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter a valid email address or leave it blank.')
  expect(requests.contacts).toHaveLength(0)
  await noHorizontalOverflow(page)
  await page
    .locator('.profile-email')
    .evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await capture(page, '04-email-validation-narrow-mobile', testInfo)
  await email.fill('maya@example.com')
  await page.getByRole('checkbox', { name: EMAIL_CHOICE }).check()
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Check your connection')
  expect((await readAppState(page)).profiles.profiles).toHaveLength(0)
  await email.fill('')
  await expect(page.getByRole('checkbox', { name: EMAIL_CHOICE })).not.toBeChecked()
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  expect(requests.contacts).toHaveLength(1)
  expect(requests.unexpected).toEqual([])
})

test('an unavailable contact read does not prevent ordinary profile editing @mobile', async ({
  page,
}, testInfo) => {
  const requests = await installContactFixture(page, { readFailure: true })
  await page.goto(`${APP_URL}#/profile-edit`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert')).toContainText('could not be loaded')
  await expect(page.getByLabel('Email (optional)', { exact: true })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Display Name', exact: true }).fill('Maya offline')
  await capture(page, '05-edit-profile-email-unavailable-mobile', testInfo)
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  expect((await readAppState(page)).profiles.profiles[0].name).toBe('Maya offline')
  expect(requests.contacts).toHaveLength(0)
})

test('administrator signs in separately and sees subscribed profiles and activity groups', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 1000 })
  const requests = await installContactFixture(page)
  await page.goto(`${APP_URL}#/settingsatiste`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: /Players/ }).click()
  await page.getByLabel('Administrator email').fill('admin@example.com')
  await page.getByLabel('Password', { exact: true }).fill('demo-password-for-route-mock')
  await page.getByRole('button', { name: 'Sign in as administrator' }).click()
  const records = page.getByRole('list', { name: 'Player records' })
  await expect(records.getByRole('listitem')).toHaveCount(4)
  await capture(page, '06-player-audience-desktop', testInfo)
  await page.getByRole('button', { name: 'Subscribers 2', exact: true }).click()
  await expect(records.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: 'All 4', exact: true }).click()
  await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('guests')
  await expect(records.getByRole('listitem')).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('all')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: /Players/ }).scrollIntoViewIfNeeded()
  await page.locator('.settings-content').evaluate((element) => {
    element.scrollTop = 0
  })
  await capture(page, '07-player-audience-mobile', testInfo)
  await noHorizontalOverflow(page)
  const backupOwner = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('bbmobilenew:supabase:profile_backup:v1') ?? '{}').user?.id
  )
  expect(backupOwner).toBe(OWNER_ID)
  await page.getByRole('button', { name: 'Sign out admin' }).click()
  await expect(page.getByLabel('Administrator email')).toBeVisible()
  expect(requests.unexpected).toEqual([])
})

test('a local administrator flag cannot bypass server audience authorization @mobile', async ({
  page,
}, testInfo) => {
  const requests = await installContactFixture(page, { adminSession: true, denyAudience: true })
  await page.goto(`${APP_URL}#/settingsatiste`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: /Players/ }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'This account does not have player audience access.'
  )
  await expect(page.getByRole('list', { name: 'Player records' })).toHaveCount(0)
  await capture(page, '08-player-audience-access-mobile', testInfo)
  expect(requests.audience).toBeGreaterThan(0)
})

test('unsubscribe is an explicit action and leaves local profiles intact @mobile', async ({
  page,
}, testInfo) => {
  const requests = await installContactFixture(page)
  await page.goto(`${APP_URL}#/unsubscribe?token=${CONTACT_REVISION}`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByRole('button', { name: 'Unsubscribe', exact: true })).toBeVisible()
  const before = (await readAppState(page)).profiles
  expect(requests.unsubscribe).toEqual([])
  await page.getByRole('button', { name: 'Unsubscribe', exact: true }).click()
  await expect(page.getByRole('heading', { name: "You're unsubscribed" })).toBeVisible()
  await capture(page, '09-unsubscribed-mobile', testInfo)
  expect(requests.unsubscribe).toEqual([CONTACT_REVISION])
  expect((await readAppState(page)).profiles).toEqual(before)
})
