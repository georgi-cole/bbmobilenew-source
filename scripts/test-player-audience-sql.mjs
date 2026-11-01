import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Optional external test engine; no production dependency or database is used.
const modulePath = process.env.PLAYER_AUDIENCE_PGLITE_MODULE
const { PGlite } = await import(
  modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite'
)
const db = new PGlite()
const ADMIN = '10000000-0000-0000-0000-000000000001'
const PLAYER = '10000000-0000-0000-0000-000000000002'
const OTHER = '10000000-0000-0000-0000-000000000003'
const ANONYMOUS = '10000000-0000-0000-0000-000000000004'
const UNVERIFIED = '10000000-0000-0000-0000-000000000005'
const ANALYTICS = '10000000-0000-0000-0000-000000000006'
const SECOND_ANALYTICS = '10000000-0000-0000-0000-000000000007'
const UNKNOWN_UUID = '99999999-0000-0000-0000-000000000099'
let eventNumber = 0

async function asUser(id, callback, role = 'authenticated') {
  assert.ok(['authenticated', 'anon', 'service_role'].includes(role))
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  try {
    return await callback()
  } finally {
    await db.exec('reset role')
  }
}

async function rejectsCode(callback, code) {
  await assert.rejects(callback, (error) => error.code === code)
}

async function getContact(profileId) {
  const result = await db.query('select public.get_player_profile_contact($1) as result', [
    profileId,
  ])
  return result.rows[0].result
}

async function saveContact(profileId, email, updatesOptIn = false, expectedRevision = null) {
  const result = await db.query(
    'select public.save_player_profile_contact($1, $2, $3, $4) as result',
    [profileId, email, updatesOptIn, expectedRevision]
  )
  return result.rows[0].result
}

async function unsubscribe(token) {
  const result = await db.query('select public.unsubscribe_player_contact($1) as result', [token])
  return result.rows[0].result
}

async function contactRecord(owner, profileId) {
  const result = await db.query(
    'select * from public.player_profile_contacts where owner_id = $1 and profile_id = $2',
    [owner, profileId]
  )
  return result.rows[0]
}

async function profile(owner, id, daysAgo = 30) {
  await db.query(
    `insert into public.player_profiles (owner_id, profile_id, snapshot, created_at, updated_at)
     values ($1, $2, $3, now() - $4 * interval '1 day', now() - $4 * interval '1 day')`,
    [owner, id, JSON.stringify({ schemaVersion: 1, profile: { id, name: id } }), daysAgo]
  )
}

async function event(profileId, name, daysAgo, properties = {}, owner = ANALYTICS) {
  eventNumber += 1
  const eventId = `30000000-0000-0000-0000-${String(eventNumber).padStart(12, '0')}`
  await db.query(
    `insert into public.player_events
       (owner_id, event_id, profile_id, name, occurred_at, session_id, properties)
     values ($1, $2, $3, $4, now() - $5 * interval '1 day', 'test-session', $6)`,
    [
      owner,
      eventId,
      profileId,
      name,
      daysAgo,
      JSON.stringify({ app_environment: 'production', ...properties }),
    ]
  )
}

async function audience() {
  return asUser(ADMIN, async () => {
    const response = await db.query('select public.get_player_audience() as result')
    return response.rows[0].result
  })
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      is_anonymous boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      raw_app_meta_data jsonb not null default '{}',
      raw_user_meta_data jsonb not null default '{}'
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `)
  for (const migration of [
    '202610270001_profiles_and_analytics.sql',
    '202610270002_profile_linked_analytics.sql',
    '202610270003_game_mode_analytics.sql',
    '202611010001_player_accounts_and_cohorts.sql',
  ]) {
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8')
    )
  }
  for (const [id, email, verified, anonymous] of [
    [ADMIN, 'admin-auth@example.invalid', true, false],
    [PLAYER, 'player-auth@example.invalid', true, false],
    [OTHER, 'other-auth@example.invalid', true, false],
    [ANONYMOUS, null, false, true],
    [UNVERIFIED, 'pending-auth@example.invalid', false, false],
    [ANALYTICS, null, false, true],
    [SECOND_ANALYTICS, null, false, true],
  ]) {
    await db.query(
      `insert into auth.users (id, email, email_confirmed_at, is_anonymous)
       values ($1, $2, case when $3 then now() else null end, $4)`,
      [id, email, verified, anonymous]
    )
  }

  for (const [owner, id] of [
    [ANONYMOUS, 'contact-main'],
    [ANONYMOUS, 'contact-sibling'],
    [OTHER, 'contact-other'],
    [OTHER, 'contact-unrelated'],
    [UNVERIFIED, 'contact-unverified'],
    [PLAYER, 'contact-empty'],
  ])
    await profile(owner, id)

  assert.equal(await asUser(ANONYMOUS, () => getContact('contact-main')), null)
  assert.equal(await asUser(OTHER, () => getContact('contact-main')), null)
  assert.equal(await asUser(ANONYMOUS, () => getContact('not-backed-up-yet')), null)
  await rejectsCode(
    () => asUser(OTHER, () => saveContact('contact-main', 'stolen@example.com')),
    '42501'
  )
  await rejectsCode(
    () => asUser(ANONYMOUS, () => saveContact('missing-profile', 'x@example.com')),
    '42501'
  )
  await rejectsCode(() => asUser('', () => getContact('contact-main')), '42501')
  await rejectsCode(() => asUser(ANONYMOUS, () => getContact('contact-main'), 'anon'), '42501')
  await rejectsCode(
    () => asUser(ANONYMOUS, () => saveContact('contact-main', 'x@example.com'), 'anon'),
    '42501'
  )

  let main = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', ' \tGuest.One+Game@Example.COM\r\n')
  )
  assert.equal(main.email, 'guest.one+game@example.com')
  assert.equal(main.updatesOptIn, false)
  assert.deepEqual(Object.keys(main).sort(), ['email', 'revision', 'updatesOptIn'])
  assert.match(main.revision, /^[0-9a-f-]{36}$/)
  assert.deepEqual(await asUser(ANONYMOUS, () => getContact('contact-main')), main)
  const initial = await contactRecord(ANONYMOUS, 'contact-main')
  assert.equal(initial.updates_opted_in_at, null)
  assert.equal(initial.updates_opted_out_at, null)
  assert.equal(initial.consent_version, '2026-11-01')
  const unchangedAuth = (
    await db.query('select email, is_anonymous from auth.users where id = $1', [ANONYMOUS])
  ).rows[0]
  assert.deepEqual(unchangedAuth, { email: null, is_anonymous: true })
  await rejectsCode(
    () => asUser(ANONYMOUS, () => saveContact('contact-main', main.email, true)),
    '40001'
  )
  await rejectsCode(
    () => asUser(ANONYMOUS, () => saveContact('contact-main', main.email, true, UNKNOWN_UUID)),
    '40001'
  )
  await rejectsCode(
    () => asUser(PLAYER, () => saveContact('contact-empty', '', false, UNKNOWN_UUID)),
    '40001'
  )
  for (const invalidEmail of [
    'broken',
    'a@@b.com',
    'x@y..com',
    'hello\nthere@example.com',
    `${'x'.repeat(250)}@example.com`,
  ]) {
    await rejectsCode(
      () =>
        asUser(ANONYMOUS, () => saveContact('contact-main', invalidEmail, false, main.revision)),
      '22023'
    )
  }
  await rejectsCode(() => asUser(ANONYMOUS, () => saveContact('', 'x@example.com')), '22023')

  for (const query of [
    'select * from public.player_profile_contacts',
    'select unsubscribe_token from public.player_profile_contacts',
    "update public.player_profile_contacts set consent_version = 'forged'",
    'delete from public.player_profile_contacts',
  ])
    await rejectsCode(() => asUser(ANONYMOUS, () => db.query(query)), '42501')
  await rejectsCode(
    () =>
      asUser(ANONYMOUS, () =>
        db.query(
          'insert into public.player_profile_contacts (owner_id, profile_id, email) values ($1, $2, $3)',
          [ANONYMOUS, 'contact-sibling', 'injected@example.com']
        )
      ),
    '42501'
  )
  const senderToken = await asUser(
    '',
    () => contactRecord(ANONYMOUS, 'contact-main'),
    'service_role'
  )
  assert.equal(senderToken.unsubscribe_token, initial.unsubscribe_token)
  const notVerified = await asUser(UNVERIFIED, () =>
    saveContact('contact-unverified', 'voluntary@example.com')
  )
  assert.equal(notVerified.updatesOptIn, false)
  const empty = await asUser(PLAYER, () => saveContact('contact-empty', '   ', true))
  assert.equal(empty.email, '')
  assert.equal(empty.updatesOptIn, false)

  main = await asUser(ANONYMOUS, () => saveContact('contact-main', main.email, true, main.revision))
  const subscribed = await contactRecord(ANONYMOUS, 'contact-main')
  assert.ok(subscribed.updates_opted_in_at)
  assert.equal(subscribed.updates_opted_out_at, null)
  const identical = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', ` ${main.email.toUpperCase()} `, true, main.revision)
  )
  assert.deepEqual(identical, main)
  assert.deepEqual(await contactRecord(ANONYMOUS, 'contact-main'), subscribed)
  main = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', main.email, false, main.revision)
  )
  const withdrawn = await contactRecord(ANONYMOUS, 'contact-main')
  assert.ok(withdrawn.updates_opted_out_at)
  assert.equal(String(withdrawn.updates_opted_in_at), String(subscribed.updates_opted_in_at))
  assert.equal(withdrawn.unsubscribe_token, subscribed.unsubscribe_token)
  main = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', 'new-address@example.com', false, main.revision)
  )
  const changedAddress = await contactRecord(ANONYMOUS, 'contact-main')
  assert.equal(changedAddress.updates_opted_in_at, null)
  assert.equal(changedAddress.updates_opted_out_at, null)
  assert.equal(changedAddress.last_unsubscribed_at, null)
  assert.notEqual(changedAddress.unsubscribe_token, withdrawn.unsubscribe_token)
  main = await asUser(ANONYMOUS, () => saveContact('contact-main', main.email, true, main.revision))
  const beforeClear = main
  main = await asUser(ANONYMOUS, () => saveContact('contact-main', '', true, main.revision))
  assert.equal(main.email, '')
  assert.equal(main.updatesOptIn, false)
  const cleared = await contactRecord(ANONYMOUS, 'contact-main')
  assert.equal(cleared.email, null)
  assert.equal(cleared.updates_opted_in_at, null)
  assert.equal(cleared.updates_opted_out_at, null)
  await rejectsCode(
    () =>
      asUser(ANONYMOUS, () =>
        saveContact('contact-main', beforeClear.email, true, beforeClear.revision)
      ),
    '40001'
  )

  main = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', ' Shared@Example.com ', true, main.revision)
  )
  const sibling = await asUser(ANONYMOUS, () =>
    saveContact('contact-sibling', 'shared@example.com', false)
  )
  const other = await asUser(OTHER, () => saveContact('contact-other', 'SHARED@EXAMPLE.COM', true))
  const unrelated = await asUser(OTHER, () =>
    saveContact('contact-unrelated', 'separate@example.com', true)
  )
  const token = (await contactRecord(ANONYMOUS, 'contact-main')).unsubscribe_token
  assert.equal(await asUser('', () => unsubscribe(UNKNOWN_UUID), 'anon'), false)
  assert.equal(await asUser('', () => unsubscribe(null), 'anon'), false)
  assert.equal(await asUser('', () => unsubscribe(token), 'anon'), true)
  const unsubscribed = new Map()
  for (const [owner, id, previous] of [
    [ANONYMOUS, 'contact-main', main],
    [ANONYMOUS, 'contact-sibling', sibling],
    [OTHER, 'contact-other', other],
  ]) {
    const record = await contactRecord(owner, id)
    assert.equal(record.updates_opt_in, false)
    assert.notEqual(record.revision, previous.revision)
    assert.ok(record.updates_opted_out_at)
    assert.ok(record.last_unsubscribed_at)
    unsubscribed.set(id, record)
  }
  assert.equal(unsubscribed.get('contact-main').unsubscribe_token, token)
  assert.equal((await contactRecord(OTHER, 'contact-unrelated')).revision, unrelated.revision)
  assert.equal((await contactRecord(OTHER, 'contact-unrelated')).updates_opt_in, true)
  assert.equal(await asUser('', () => unsubscribe(token), 'anon'), true)
  for (const [owner, id] of [
    [ANONYMOUS, 'contact-main'],
    [ANONYMOUS, 'contact-sibling'],
    [OTHER, 'contact-other'],
  ]) {
    assert.deepEqual(await contactRecord(owner, id), unsubscribed.get(id))
  }
  await rejectsCode(
    () => asUser(ANONYMOUS, () => saveContact('contact-main', main.email, true, main.revision)),
    '40001'
  )
  await rejectsCode(
    () => asUser(OTHER, () => saveContact('contact-other', other.email, true, other.revision)),
    '40001'
  )
  main = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', main.email, true, unsubscribed.get('contact-main').revision)
  )
  assert.equal((await contactRecord(OTHER, 'contact-other')).updates_opt_in, false)
  assert.equal(await asUser('', () => unsubscribe(token), 'anon'), true)
  assert.equal((await contactRecord(ANONYMOUS, 'contact-main')).updates_opt_in, false)

  // A typed, unverified address is not authority to change another profile's consent.
  const otherLatest = await asUser(OTHER, () => getContact('contact-other'))
  await asUser(OTHER, () => saveContact('contact-other', other.email, true, otherLatest.revision))
  const mainLatest = await asUser(ANONYMOUS, () => getContact('contact-main'))
  main = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', main.email, true, mainLatest.revision)
  )
  main = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', main.email, false, main.revision)
  )
  assert.equal((await contactRecord(OTHER, 'contact-other')).updates_opt_in, true)
  main = await asUser(ANONYMOUS, () =>
    saveContact('contact-main', 'different@example.com', false, main.revision)
  )
  assert.equal(await asUser('', () => unsubscribe(token), 'anon'), false)
  main = await asUser(ANONYMOUS, () => saveContact('contact-main', '', false, main.revision))
  assert.equal((await contactRecord(ANONYMOUS, 'contact-main')).email, null)
  await db.exec("delete from public.player_profiles where profile_id like 'contact-%'")
  assert.equal(
    (await db.query('select count(*)::integer as count from public.player_profile_contacts'))
      .rows[0].count,
    0
  )

  // Admin access remains independent of unverified contact input.
  await rejectsCode(
    () => asUser(PLAYER, () => db.query('select public.get_player_audience()')),
    '42501'
  )
  await rejectsCode(
    () => asUser(ADMIN, () => db.query('select public.get_player_audience()'), 'anon'),
    '42501'
  )
  await db.query(
    `update auth.users set raw_user_meta_data = '{"player_analytics_admin":true}' where id = $1`,
    [PLAYER]
  )
  await rejectsCode(
    () => asUser(PLAYER, () => db.query('select public.get_player_audience()')),
    '42501'
  )
  await db.query(
    `update auth.users set raw_app_meta_data = '{"player_analytics_admin":true}' where id = $1`,
    [ADMIN]
  )
  await db.query(`update auth.users set email = ' ' where id = $1`, [ADMIN])
  await rejectsCode(() => audience(), '42501')
  await db.query(`update auth.users set email = 'admin-auth@example.invalid' where id = $1`, [
    ADMIN,
  ])

  await profile(ANONYMOUS, 'returning')
  await profile(OTHER, 'inactive')
  await profile(OTHER, 'finished')
  await profile(OTHER, 'legacy-abandoned')
  await profile(OTHER, 'qa-only')
  await profile(OTHER, 'untracked', 2)
  await profile(ANONYMOUS, 'ambiguous')
  await profile(OTHER, 'ambiguous')
  await asUser(ANONYMOUS, () => saveContact('returning', 'game-updates@example.com', true))
  await asUser(ANONYMOUS, () => saveContact('ambiguous', 'first-contact@example.com', true))
  await asUser(OTHER, () => saveContact('ambiguous', 'second-contact@example.com', true))
  await asUser(OTHER, () => saveContact('qa-only', 'qa-contact@example.com', true))
  const classic1 = { game_mode: 'classic', season_index: 1 }
  const classic2 = { game_mode: 'classic', season_index: 2 }
  const runA = { ...classic1, game_id: '50000000-0000-0000-0000-000000000001' }
  const runB = { ...classic1, game_id: '50000000-0000-0000-0000-000000000002' }
  await event('returning', 'season_started', 28, runA)
  await event('returning', 'season_started', 28, runA)
  await event('returning', 'season_completed', 25, runA)
  await event('returning', 'season_completed', 25, runA)
  await event('returning', 'season_started', 20, runB)
  await event('returning', 'tribunal_action', 1, { action_id: 'jury_vote_cast', ...classic2 })
  await event('inactive', 'season_started', 20, runA)
  await event('inactive', 'player_eliminated', 19, runA)
  await event('inactive', 'session_active', 18, { active_seconds: 60 })
  await event('inactive', 'season_completed', 17, runB)
  await event('finished', 'season_started', 28, classic1)
  await event('finished', 'season_started', 22, classic2)
  await event('finished', 'season_completed', 18, classic2)
  await event('legacy-abandoned', 'season_started', 20, classic1)
  await event('legacy-abandoned', 'season_abandoned', 19, { game_mode: 'classic' })
  await event('legacy-upgraded', 'season_started', 25, classic1)
  await event('legacy-upgraded', 'season_completed', 18, runA)
  await event('modern-upgraded', 'season_started', 25, runA)
  await event('modern-upgraded', 'season_completed', 18, classic1)
  await event('qa-only', 'season_started', 1, { ...classic1, app_environment: 'qa' })
  await event('qa-only', 'tribunal_action', 1, { app_environment: 'development' })
  await event('legacy-profile', 'season_started', 20, { ...classic1, app_environment: null })
  await event(null, 'session_started', 2)
  await event(null, 'session_active', 1)
  await event(null, 'session_started', 1, {}, SECOND_ANALYTICS)

  const result = await audience()
  const row = (id) => result.players.find((player) => player.id === id)
  assert.equal(result.totalPlayers, 11)
  assert.equal(result.truncated, false)
  assert.equal(result.players.length, result.totalPlayers)
  assert.ok(result.coverageStart)
  assert.equal(row('profile:returning').seasonsStarted, 2)
  assert.equal(row('profile:returning').seasonsCompleted, 1)
  assert.equal(row('profile:returning').email, 'game-updates@example.com')
  assert.equal(row('profile:returning').verifiedEmail, false)
  assert.equal(row('profile:returning').updatesOptIn, true)
  assert.deepEqual(row('profile:returning').groups, [
    'returning',
    'completed',
    'tribunal',
    'subscribed',
  ])
  assert.equal(result.groupCounts.subscribed, 1)
  assert.equal(Object.hasOwn(result.groupCounts, 'tester'), false)
  assert.equal(
    result.players.some((player) => player.id.startsWith('account:')),
    false
  )
  assert.ok(result.players.every((player) => player.verifiedEmail === false))
  assert.ok(
    result.players.every(
      (player) => !Object.hasOwn(player, 'newsOptIn') && !Object.hasOwn(player, 'testerOptIn')
    )
  )
  assert.ok(row('profile:inactive').groups.includes('inactive'))
  assert.ok(!row('profile:inactive').groups.includes('tribunal'))
  assert.ok(!row('profile:finished').groups.includes('inactive'))
  assert.ok(!row('profile:legacy-abandoned').groups.includes('inactive'))
  assert.ok(!row('profile:legacy-upgraded').groups.includes('inactive'))
  assert.ok(!row('profile:modern-upgraded').groups.includes('inactive'))
  assert.equal(row('profile:legacy-upgraded').seasonsStarted, 1)
  assert.equal(row('profile:legacy-upgraded').seasonsCompleted, 1)
  assert.equal(row('profile:modern-upgraded').seasonsStarted, 1)
  assert.equal(row('profile:modern-upgraded').seasonsCompleted, 1)
  assert.equal(row('profile:qa-only'), undefined)
  assert.ok(row('profile:legacy-profile'))
  assert.ok(row('profile:untracked').groups.includes('new'))
  assert.equal(row('profile:ambiguous').email, null)
  assert.equal(row('profile:ambiguous').updatesOptIn, false)
  assert.equal(result.players.filter((player) => player.isGuest).length, 2)
  for (const guest of result.players.filter((player) => player.isGuest)) {
    assert.equal(guest.profileId, null)
    assert.equal(guest.email, null)
    assert.equal(guest.updatesOptIn, false)
  }
  assert.ok(!JSON.stringify(result).includes('unsubscribe_token'))

  await db.exec(`
    insert into auth.users (id, is_anonymous)
    select ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, true
    from generate_series(1, 510) n;
    insert into public.player_events
      (owner_id, event_id, name, occurred_at, session_id, properties)
    select ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
      ('40000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
      'session_started', now(), 'cap-test', '{"app_environment":"production"}'::jsonb
    from generate_series(1, 510) n;
  `)
  const capped = await audience()
  assert.equal(capped.totalPlayers, result.totalPlayers + 510)
  assert.equal(capped.players.length, 500)
  assert.equal(capped.truncated, true)
  assert.equal(capped.groupCounts.new, result.groupCounts.new + 510)
  assert.equal(capped.groupCounts.subscribed, result.groupCounts.subscribed)
  assert.equal(capped.groupCounts.returning, 2)
  assert.equal(capped.groupCounts.tribunal, 1)
  await db.query(`update auth.users set raw_app_meta_data = '{}' where id = $1`, [ADMIN])
  await rejectsCode(() => audience(), '42501')
  console.log(
    'Profile contacts SQL: owner RPC access, unverified email, consent audit, revision conflicts, shared-address token unsubscribe, cascade deletion, admin authorization, cohort deduplication, and full totals passed.'
  )
} finally {
  await db.close()
}
