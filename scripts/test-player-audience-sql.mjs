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
const CONNECTED = '10000000-0000-0000-0000-000000000008'
const SWITCH_OLD = '10000000-0000-0000-0000-000000000009'
const SWITCH_NEW = '10000000-0000-0000-0000-000000000010'
const VERIFIED_GUEST = '10000000-0000-0000-0000-000000000011'
let eventNumber = 0

async function asUser(id, callback, role = 'authenticated') {
  assert.ok(['authenticated', 'anon'].includes(role))
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  try {
    return await callback()
  } finally {
    await db.exec('reset role')
  }
}

async function denied(callback) {
  await assert.rejects(callback, (error) => error.code === '42501')
}

async function preferences(owner, news = false, tester = false) {
  const result = await db.query(
    `insert into public.player_contact_preferences (owner_id, news_opt_in, tester_opt_in)
     values ($1, $2, $3)
     on conflict (owner_id) do update set
       owner_id = excluded.owner_id,
       news_opt_in = excluded.news_opt_in,
       tester_opt_in = excluded.tester_opt_in
     returning *`,
    [owner, news, tester]
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
  // Minimal Supabase Auth contract in a fresh in-memory PostgreSQL instance.
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
    [ADMIN, 'admin@example.invalid', true, false],
    [PLAYER, 'player@example.invalid', true, false],
    [OTHER, 'other@example.invalid', true, false],
    [ANONYMOUS, null, false, true],
    [UNVERIFIED, 'pending@example.invalid', false, false],
    [ANALYTICS, null, false, true],
    [SECOND_ANALYTICS, null, false, true],
    [CONNECTED, 'connected@example.invalid', true, false],
    [SWITCH_OLD, 'old-account@example.invalid', true, false],
    [SWITCH_NEW, 'new-account@example.invalid', true, false],
    [VERIFIED_GUEST, 'verified-guest@example.invalid', true, false],
  ]) {
    await db.query(
      `insert into auth.users (id, email, email_confirmed_at, is_anonymous)
       values ($1, $2, case when $3 then now() else null end, $4)`,
      [id, email, verified, anonymous]
    )
  }

  await denied(() => asUser(ANONYMOUS, () => preferences(ANONYMOUS)))
  await denied(() => asUser(UNVERIFIED, () => preferences(UNVERIFIED)))
  await denied(() => asUser(PLAYER, () => preferences(OTHER)))
  await denied(() => asUser(PLAYER, () => db.query('select public.get_player_audience()')))
  await denied(() => asUser(ADMIN, () => db.query('select public.get_player_audience()'), 'anon'))
  await db.query(
    `update auth.users set raw_user_meta_data = '{"player_analytics_admin":true}' where id = $1`,
    [PLAYER]
  )
  await denied(() => asUser(PLAYER, () => db.query('select public.get_player_audience()')))

  const defaults = await asUser(PLAYER, () => preferences(PLAYER))
  await asUser(CONNECTED, () => preferences(CONNECTED))
  assert.equal(defaults.news_opt_in, false)
  assert.equal(defaults.tester_opt_in, false)
  assert.equal(defaults.news_opted_in_at, null)
  const subscribed = await asUser(PLAYER, () => preferences(PLAYER, true, true))
  assert.ok(subscribed.news_opted_in_at)
  assert.ok(subscribed.tester_opted_in_at)
  assert.equal(subscribed.consent_version, '2026-11-01')
  const repeated = await asUser(PLAYER, () => preferences(PLAYER, true, true))
  assert.equal(String(repeated.news_opted_in_at), String(subscribed.news_opted_in_at))
  const withdrawn = await asUser(PLAYER, () => preferences(PLAYER, false, true))
  assert.ok(withdrawn.news_opted_out_at)
  assert.equal(String(withdrawn.news_opted_in_at), String(subscribed.news_opted_in_at))
  assert.equal(withdrawn.tester_opted_out_at, null)
  await denied(() =>
    asUser(PLAYER, () =>
      db.query(`update public.player_contact_preferences set consent_version = 'forged'`)
    )
  )
  await denied(() =>
    asUser(PLAYER, () =>
      db.query(`update public.player_contact_preferences set news_opted_in_at = '2099-01-01'`)
    )
  )
  await denied(() =>
    asUser(PLAYER, () =>
      db.query(`update public.player_contact_preferences set owner_id = $1`, [OTHER])
    )
  )
  const hidden = await asUser(OTHER, () =>
    db.query('select * from public.player_contact_preferences')
  )
  assert.equal(hidden.rows.length, 0)
  const outsideUpdate = await asUser(OTHER, () =>
    db.query('update public.player_contact_preferences set tester_opt_in = false returning *')
  )
  assert.equal(outsideUpdate.rows.length, 0)

  await db.query(
    `update auth.users set raw_app_meta_data = '{"player_analytics_admin":true}' where id = $1`,
    [ADMIN]
  )
  await db.query(`update auth.users set email = ' ' where id = $1`, [ADMIN])
  await denied(() => audience())
  await db.query(`update auth.users set email = 'admin@example.invalid' where id = $1`, [ADMIN])
  await asUser(SWITCH_OLD, () => preferences(SWITCH_OLD, true, false))
  await asUser(SWITCH_NEW, () => preferences(SWITCH_NEW, false, true))
  await profile(PLAYER, 'returning')
  await profile(OTHER, 'inactive')
  await profile(OTHER, 'finished')
  await profile(OTHER, 'legacy-abandoned')
  await profile(OTHER, 'qa-only')
  await profile(OTHER, 'untracked', 2)
  await profile(PLAYER, 'ambiguous')
  await profile(OTHER, 'ambiguous')
  await profile(SWITCH_OLD, 'switched-profile')
  await profile(SWITCH_NEW, 'switched-profile')
  await profile(CONNECTED, 'account-qa-only')
  const classic1 = { game_mode: 'classic', season_index: 1 }
  const classic2 = { game_mode: 'classic', season_index: 2 }
  const runA = { ...classic1, game_id: '50000000-0000-0000-0000-000000000001' }
  const runB = { ...classic1, game_id: '50000000-0000-0000-0000-000000000002' }
  await event('returning', 'season_started', 28, runA)
  await event('returning', 'season_started', 28, runA)
  await event('returning', 'season_completed', 25, runA)
  await event('returning', 'season_completed', 25, runA)
  // Fresh/guest runs can reuse season index 1; their stable game IDs stay distinct.
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
  await event('switched-profile', 'season_started', 20, runA)
  await event('switched-profile', 'tribunal_action', 18, runA)
  await event('qa-only', 'season_started', 1, { ...classic1, app_environment: 'qa' })
  await event('qa-only', 'tribunal_action', 1, { app_environment: 'development' })
  await event('account-qa-only', 'session_started', 1, { app_environment: 'qa' })
  await event('legacy-profile', 'season_started', 20, { ...classic1, app_environment: null })
  await event(null, 'session_started', 2)
  await event(null, 'session_active', 1)
  await event(null, 'session_started', 1, {}, SECOND_ANALYTICS)

  const result = await audience()
  const row = (id) => result.players.find((player) => player.id === id)
  assert.equal(result.totalPlayers, 17)
  assert.equal(result.truncated, false)
  assert.equal(result.players.length, result.totalPlayers)
  assert.ok(result.coverageStart)
  assert.equal(row('profile:returning').seasonsStarted, 2)
  assert.equal(row('profile:returning').seasonsCompleted, 1)
  assert.equal(row('profile:returning').email, 'player@example.invalid')
  assert.deepEqual(row('profile:returning').groups, [
    'returning',
    'completed',
    'tribunal',
    'tester',
  ])
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
  assert.equal(row(`account:${CONNECTED}`).email, 'connected@example.invalid')
  assert.equal(row(`account:${CONNECTED}`).isGuest, false)
  assert.equal(row('profile:account-qa-only'), undefined)
  assert.equal(row('profile:switched-profile').email, null)
  assert.ok(row('profile:switched-profile').groups.includes('tribunal'))
  assert.equal(row(`account:${SWITCH_OLD}`).email, 'old-account@example.invalid')
  assert.equal(row(`account:${SWITCH_OLD}`).newsOptIn, true)
  assert.equal(row(`account:${SWITCH_NEW}`).email, 'new-account@example.invalid')
  assert.equal(row(`account:${SWITCH_NEW}`).testerOptIn, true)
  assert.equal(row(`account:${SWITCH_NEW}`).seasonsStarted, 0)
  assert.ok(!row(`account:${SWITCH_NEW}`).groups.includes('tribunal'))
  assert.equal(row(`account:${VERIFIED_GUEST}`).email, 'verified-guest@example.invalid')
  assert.equal(row(`account:${VERIFIED_GUEST}`).verifiedEmail, true)
  assert.equal(row(`account:${VERIFIED_GUEST}`).isGuest, false)
  assert.equal(row(`account:${VERIFIED_GUEST}`).profileId, null)
  assert.equal(row(`account:${VERIFIED_GUEST}`).newsOptIn, false)
  assert.equal(row(`account:${VERIFIED_GUEST}`).testerOptIn, false)
  assert.equal(row(`account:${VERIFIED_GUEST}`).seasonsStarted, 0)
  assert.ok(row(`account:${VERIFIED_GUEST}`).firstSeenAt)
  assert.ok(row(`account:${VERIFIED_GUEST}`).lastActiveAt)
  const unsavedPreferences = await db.query(
    'select * from public.player_contact_preferences where owner_id = $1',
    [VERIFIED_GUEST]
  )
  assert.equal(unsavedPreferences.rows.length, 0)
  assert.ok(row('profile:untracked').groups.includes('new'))
  assert.equal(row('profile:ambiguous').email, null)
  assert.equal(row('profile:ambiguous').verifiedEmail, false)
  assert.equal(result.players.filter((player) => player.isGuest).length, 2)
  for (const guest of result.players.filter((player) => player.isGuest)) {
    assert.equal(guest.profileId, null)
    assert.equal(guest.email, null)
    assert.equal(guest.newsOptIn, false)
    assert.equal(guest.testerOptIn, false)
  }

  // Full totals/group totals must not silently become the 500 displayed records.
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
  assert.equal(capped.groupCounts.tester, result.groupCounts.tester)
  assert.equal(capped.groupCounts.returning, 2)
  assert.equal(capped.groupCounts.tribunal, 2)

  // A previously granted token must not outlive a live administrator revocation.
  await db.query(`update auth.users set raw_app_meta_data = '{}' where id = $1`, [ADMIN])
  await denied(() => audience())
  console.log(
    'Player audience SQL: migration, RLS, verified consent, live admin authorization, cohort deduplication, guest separation, and 500-row cap passed.'
  )
} finally {
  await db.close()
}
