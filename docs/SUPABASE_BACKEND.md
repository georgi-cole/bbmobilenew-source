# Supabase accounts, profile backup, and player groups

The app keeps its existing local profiles and game saves. When Supabase is configured, it automatically sends a limited profile backup and coarse gameplay analytics. Playing as a guest and creating a local profile do not require an email address.

## What is stored

The profile copy contains the local profile ID, display name, emoji avatar, selected appearance ID, creation date, achievements, and Bella unlock progress. **Photos, biographies, wallets, purchases, season archives, and saved games remain on the device.** Connecting an email does not turn this limited backup into cross-device game-save restoration.

There are two persistent Supabase sessions:

- `profile_backup` owns the profile copies. Its anonymous Auth user can be upgraded to an email account without replacing its user ID.
- `analytics` remains a separate anonymous installation identity. Events contain the local profile ID when one exists, allowing administrative analysis alongside the corresponding backup.

The backup account can own several local profiles. An account email and its contact preferences therefore apply to the account, not independently to each local profile. The email is stored in **Supabase Auth only**; it is not copied into the Redux profile, profile snapshots, analytics properties, or gameplay logs.

The `player_contact_preferences` table contains two independent choices, `news_opt_in` and `tester_opt_in`, both false by default. Neither is required for email connection or play. Only the owner of a currently verified, non-anonymous email account can write preferences. The database stamps consent version `2026-11-01`, creation/update time, and the most recent opt-in and opt-out timestamps. Re-saving an unchanged choice preserves its original choice timestamp. Application credentials cannot supply or overwrite those audit fields.

Deleting a local profile requests removal of its backup under the **current backup account** and its linked events under the **current installation's analytics identity**. After an explicit account switch, backup copies owned by an earlier account may remain; local profile deletion does not claim to remove those copies. A shared account and its contact preferences are not implicitly deleted when one of its profiles is removed. Account-level access or deletion requests should be handled through support and trusted administration; deleting the Auth user cascades its preference and owned backup rows.

## Analytics and audience coverage

Analytics records profile and appearance selection; screen visits and visible time; game mode, phase, and numbered game days; minigame starts, duration, placement, completion, and exits; Social module activity and action categories; selected gameplay decisions; elimination and final placement; marketplace actions and purchase outcomes; and session time. No purchase prices, chat text, biography, names in event properties, or other free-form content are sent. Eyeolean spending is not treated as verified monetary revenue.

Guest activity uses a null `profile_id` under the existing anonymous analytics owner. It is grouped by that installation identity. When a guest creates a local profile, subsequent events use that profile ID. Earlier guest events are not retroactively assigned to the profile, and guest sessions are not merged with the email account.

Some legacy events also have no profile ID. Those cannot reliably be distinguished from guest records, so the audience labels the combined category **Guest / unlinked**. Guest and Tribunal measurement starts with the relevant instrumentation; historical absence is not evidence that no guest played or no eliminated player continued.

`public.get_player_audience()` returns observed **player records**, not a count of distinct people. One person may have several local profiles, and a guest record and a subsequently created profile can both be counted. A verified email can appear against several profiles owned by the same account. The report never treats an email address as the identity key.

The report includes production events and unlabeled legacy events, while excluding events explicitly marked `qa` or `development`. The application uses the same `production` environment value for released web and mobile builds. Known QA-only profiles are excluded; a profile backup with no events yet is included because it has no reliable build attribution. If one local profile ID occurs under multiple backup owners, the report suppresses its email and contact flags to avoid assigning an ambiguous identity to a contact address. A verified account with no unambiguous included profile appears as a separate connected-account record, even if it has never saved contact preferences. This includes verified guests who leave both choices off, accounts with no profile, and accounts whose profiles are all ambiguous or excluded. Missing preferences mean both choices are off; existing choices remain visible without attributing disputed gameplay to an email.

Groups are calculated at read time and may overlap:

| Group ID    | Rule                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new`       | First observed within the last seven days.                                                                                                                                      |
| `returning` | At least two distinct observed season starts, deduplicated by stable game ID, with legacy game mode and season index as fallback.                                               |
| `completed` | At least one observed season completion, deduplicated by stable game ID, with legacy game mode and season index as fallback.                                                    |
| `inactive`  | The latest observed started season is unfinished and there has been no observed activity for more than 14 days. A later completion or abandonment suppresses this label.        |
| `tribunal`  | At least one explicit `tribunal_action`, emitted after a successful Tribunal vote or explicit continuation as a Tribunal member. A heartbeat after elimination is insufficient. |
| `tester`    | The verified account has explicitly enabled tester contact.                                                                                                                     |

The UUID `game_id` is the preferred run key because guest seasons and fresh resets can reuse a season index. Events without a valid game ID fall back to game mode plus season index. Legacy starts without either identifier are not counted as distinct seasons. An older abandonment/completion event without an index can still close the latest same-mode season when it occurs after its start. A terminal event can also bridge a legacy start and the new game-ID instrumentation when the mode/index matches and at least one side lacks a game ID. Different known game IDs never close each other's seasons solely because their season indexes match. The dashboard is an observational product report; it is not authoritative for game results, entitlements, or purchases.

### Audience RPC contract

The no-argument `get_player_audience` RPC returns:

```ts
type PlayerAudienceReport = {
  generatedAt: string
  coverageStart: string | null
  totalPlayers: number
  truncated: boolean
  groupCounts: {
    new: number
    returning: number
    completed: number
    inactive: number
    tribunal: number
    tester: number
  }
  players: Array<{
    id: string
    profileId: string | null
    displayName: string
    isGuest: boolean
    verifiedEmail: boolean
    email: string | null
    newsOptIn: boolean
    testerOptIn: boolean
    firstSeenAt: string
    lastActiveAt: string
    seasonsStarted: number
    seasonsCompleted: number
    groups: string[]
  }>
}
```

At most 500 recent rows are returned. `totalPlayers` and `groupCounts` are computed over the complete eligible audience, and `truncated` indicates that the list is incomplete. `coverageStart` is the earliest included observation, not the date every event type was introduced. Profile-only records use their first server backup and latest backup update when no gameplay activity is available. Account-only records use Auth creation/confirmation for their first observation and the latest Auth or preference record timestamp for `lastActiveAt`; this is an account-record update, not evidence of gameplay. No preferences row is required to include a verified account.

## Deployment setup

1. Keep **Authentication → Sign In / Providers → Anonymous Sign-Ins** enabled. Enable the Email provider, email confirmation, and **Allow manual linking** for anonymous-to-email account upgrades.
2. Apply only the missing migrations, in order:
   - `202610270001_profiles_and_analytics.sql`
   - `202610270002_profile_linked_analytics.sql`
   - `202610270003_game_mode_analytics.sql`
   - `202611010001_player_accounts_and_cohorts.sql`
3. Configure a production SMTP sender and sender identity in Supabase. The bundled development email service is not a production delivery service. Set appropriate Auth email rate limits and verify delivery before enabling the UI for players.
4. In **Authentication → Email Templates → Change Email Address**, include `{{ .Token }}` as a plainly visible confirmation code. The app requests the new address with `updateUser({ email })` and confirms it using `verifyOtp({ email, token, type: 'email_change' })`.
5. In the **Magic Link** email template, also include `{{ .Token }}` for passwordless account sign-in using `signInWithOtp` and `verifyOtp` with type `email`. These templates must contain the code; a link-only template does not support the in-app code flow. Retain the appropriate Supabase site/redirect allowlist for any links also present in those templates.
6. Supply the existing backend build settings from `.env.supabase.example`: `VITE_SUPABASE_ENABLED=true`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Existing backups and compatible analytics continue with these settings alone.
7. In a test build/project, enable `VITE_PLAYER_ACCOUNTS_ENABLED=true` and test linking an anonymous backup account, confirming that its Auth user ID remains unchanged and the local active season/profile is preserved. Test expired/wrong codes, delivery errors, and both contact choices independently.
8. Only after the target database migration, SMTP delivery, and code templates have been verified, set `VITE_PLAYER_ACCOUNTS_ENABLED=true` for the production build. This rollout flag defaults to false; the new account flow and migration-dependent Tribunal upload must not be enabled against the old schema.

Only a publishable key belongs in the app. A `service_role` JWT or `sb_secret_` key must never be used in a `VITE_` setting. Email addresses and privileged administrator access must not be placed in frontend environment variables.

These are deployment instructions, not migration or configuration changes automatically applied by this PR.

### Grant administrator access

Opening special settings or setting a local debug flag does not grant access to the audience. The RPC checks the **current Auth user record** for a confirmed, non-anonymous account and the server-controlled boolean `app_metadata.player_analytics_admin`. It does not trust `user_metadata` or a stale token's copy of the claim. Ordinary accounts cannot read other users' preference rows or invoke the audience query successfully.

After identifying the administrator's verified Auth UUID, a trusted project operator can grant access in the Supabase SQL Editor:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"player_analytics_admin": true}'::jsonb
where id = 'REPLACE_WITH_VERIFIED_ADMIN_UUID'::uuid;
```

To revoke it immediately for subsequent queries:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  - 'player_analytics_admin'
where id = 'REPLACE_WITH_VERIFIED_ADMIN_UUID'::uuid;
```

The SQL Editor and `supabase/analytics.sql` remain available for deeper trusted analysis. The app does not send newsletters or tester invitations; it records the player's preferences. Any future sending integration must check the current verified email and relevant current opt-in immediately before delivery.

## Local SQL regression check

`scripts/test-player-audience-sql.mjs` executes all four migrations in an isolated in-memory PostgreSQL engine with a minimal Supabase Auth fixture. It checks anonymous/unverified denial, owner-only RLS, independent consent and server timestamps, live administrator revocation, duplicate season events, completion/abandonment handling, guest separation, verified accounts without profiles or saved preferences, ambiguous IDs, QA exclusion, and the 500-row limit with full totals.

The optional PGlite engine can be installed outside the repository; it is not an app dependency:

```bash
npm install --prefix /tmp/the-big-eye-sql-check --no-save --package-lock=false @electric-sql/pglite@0.5.14
PLAYER_AUDIENCE_PGLITE_MODULE=/tmp/the-big-eye-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-player-audience-sql.mjs
```

No production database, production data, or Auth delivery service is used by this regression check. It does not replace a staged end-to-end email-delivery test against the deployment's Supabase settings.
