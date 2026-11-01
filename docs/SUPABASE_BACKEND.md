# Supabase profile contacts, backups, and player groups

Creating or editing a profile offers an **optional email address** and one initially unchecked choice: **“Send me The Big Eye news and playtest invitations.”** Leaving both empty/off is fully supported. Entering an address does not opt the player in. There is no player email login, OTP, mailbox verification, or SMTP setup required by this feature.

The address is an **unverified contact**, not an Auth identity, account-recovery credential, or evidence that the player owns the mailbox. The checkbox permits game updates and playtest invitations; it does not enroll someone as a tester.

## Storage and ownership

Local profiles and saves keep their existing behavior. The limited Supabase profile backup contains profile ID, display name, emoji avatar, selected appearance, creation date, achievements, and Bella progress. Photos, biography, wallet, purchases, season archives, and saved games remain on the device. Adding a contact email does not enable cross-device save recovery.

| Supabase session | Purpose                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `profile_backup` | Anonymous installation identity owning profile backups and their private contact rows.   |
| `analytics`      | Separate anonymous installation identity for coarse gameplay events.                     |
| `audience_admin` | Explicit sign-in by a pre-provisioned administrator, isolated from both player sessions. |

`public.player_profile_contacts` is keyed by `(owner_id, profile_id)` and references the same composite key in `player_profiles` with cascading deletion. Two profiles can have different emails and choices even when they share an installation. Contact data is held in the open form and its private backend row; it is not placed in Redux profiles, saved seasons, backup snapshots, analytics, or Auth user metadata/email.

Only an explicit profile-form save writes contact details. Automatic profile backup does not resend contacts or consent. Clearing the email stores `NULL` and disables updates; the API represents the cleared address as an empty string. Changing the normalized address resets its previous consent timestamps and rotates its unsubscribe token. Email addresses are trimmed and lowercased, validated, and limited to 254 characters.

Deleting the current owner's server profile backup cascades to its contact row. The existing deletion flow also removes that profile's events under the current installation's analytics identity. An offline/failed deletion is not a claim that remote data has already been removed. Deleting a local profile does not remove copies owned by an inaccessible earlier installation.

## Private contact API

Application roles have no direct table read or write grants. The trusted `service_role` can select contact rows for future mail delivery, including their hidden unsubscribe tokens. All player access uses security-definer functions with a fixed search path and explicit `auth.uid()` ownership checks. An authenticated anonymous Supabase session is sufficient; verification of its Auth email is not required.

| RPC                                                                                                                | Result and behavior                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_player_profile_contact(p_profile_id text)`                                                                    | Returns `{ email, updatesOptIn, revision }` for the current owner, or `null` when no owned contact exists. A foreign-owned or not-yet-backed-up profile also returns `null`, never another owner's data. |
| `save_player_profile_contact(p_profile_id text, p_email text, p_updates_opt_in boolean, p_expected_revision uuid)` | Returns the same object. Requires an existing profile backup owned by the current session. The client ensures that backup exists before saving the contact.                                              |
| `unsubscribe_player_contact(p_token uuid)`                                                                         | Returns a boolean. Callable by `anon` and `authenticated`, without account creation. No address, profile ID, or other contact data is returned.                                                          |

`revision` is a server-generated UUID. Pass `null` only when creating a contact; subsequent writes must supply the last read revision. A stale write raises SQLSTATE `40001` and must be reconciled by reloading the saved contact before another explicit save. This prevents an open form from silently restoring consent after an unsubscribe. Invalid input uses `22023`; missing authentication or an unauthorized save uses `42501`.

The database maintains `created_at`, `updated_at`, `updates_opted_in_at`, `updates_opted_out_at`, `last_unsubscribed_at`, and consent version `2026-11-01`. An unchanged save preserves the revision and timestamps. Clients cannot supply audit fields or unsubscribe tokens. Saves serialize per profile and acquire shared email locks before row locks; unsubscribe uses the same email lock before updating matching rows.

## Unsubscribe and future sending

Every contact row has a random, unique UUID unsubscribe token. A future trusted sender can obtain it through its server-side table access and include a link of this form:

```text
https://GAME_BASE/#/unsubscribe?token=UUID
```

Use the game's actual deployed base URL, including its subpath. The page requires a deliberate **Unsubscribe** button press; opening a link or mail preview does not change consent. It works without a profile or login. Collection can be turned off with `VITE_PLAYER_ACCOUNTS_ENABLED=false` while existing unsubscribe links continue to work, provided the base Supabase configuration remains available.

A valid token turns updates off for **all contact rows with that normalized email address** and changes their revisions, including rows that were already unchecked. Repeated use is idempotent while the address remains unsubscribed. Tokens are retained on opt-out; a changed address rotates its token, and deleting its profile removes the contact row. After an explicit new opt-in, a still-valid link can revoke consent again.

Editing a profile's checkbox changes **only that owned profile**. Knowing or typing an unverified address does not authorize one player to change another player's choices. The email-link token supplies the separate authority for address-wide unsubscribe.

This feature records contacts and choices; it does not send campaigns. A future sender must read current consent immediately before sending, skip empty addresses, deduplicate normalized addresses, and include the appropriate token link. The 500-row audience preview is not a mailing export. Treat supplied addresses as unverified and handle invalid or unwanted recipients through the delivery system; do not use them as proof of identity or for restoring an account.

## Audience report

`public.get_player_audience()` returns observed player records, not unique people. A person can have several profiles; an earlier guest record and a subsequent profile remain separate. Guest events have a null profile ID and are grouped by their anonymous analytics owner. Legacy events without profile IDs share the **Guest / unlinked** category. Earlier guest history is not reassigned to a newly created profile.

The report includes production events and unlabeled legacy events, excluding explicit `qa` and `development` events. Released web/mobile builds both use `production`. Known QA-only profiles are excluded. Backups with no events yet remain included because they have no reliable build attribution. If a local profile ID appears under multiple backup owners, its contact fields are suppressed to avoid attaching ambiguous gameplay to an address. There are no Auth-only account records.

| Group ID     | Rule                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `new`        | First observed within seven days.                                                                                   |
| `returning`  | At least two distinct observed season starts.                                                                       |
| `completed`  | At least one observed season completion.                                                                            |
| `inactive`   | Latest observed started season unfinished, with no observed activity for more than 14 days.                         |
| `tribunal`   | An explicit successful Tribunal vote or continuation action; a post-elimination heartbeat is insufficient.          |
| `subscribed` | The unambiguously linked profile permits game news and playtest invitations. This does not imply tester enrollment. |

Season deduplication prefers the valid UUID `game_id`, since guest/fresh-reset runs can reuse season index 1. Older events fall back to game mode plus season index. Terminal events can bridge old/new instrumentation when mode/index matches and one side lacks a game ID; two known different game IDs cannot close each other's seasons. Legacy terminal events with neither identifier can close the latest same-mode season when they occur after its start. Starts without either usable identifier are not counted as distinct seasons.

The RPC returns `generatedAt`, nullable `coverageStart`, `totalPlayers`, `truncated`, `groupCounts`, and `players`. At most 500 recent rows are returned; totals and group counts cover the complete eligible result. Each row includes `id`, nullable `profileId`, `displayName`, `isGuest`, `verifiedEmail: false`, nullable `email`, `updatesOptIn`, observation timestamps, season counts, and group IDs. No contact revision, audit fields, or unsubscribe token is returned. Contact addresses are labeled unverified even if the owner's separate Auth user happens to have a verified email.

Groups can overlap. `coverageStart` is the earliest included observation, not the rollout date of every event type. Profiles without events use their backup timestamps; absent older guest/Tribunal events are not evidence of no activity. Gameplay events and reports are observational, not authoritative purchase records or game results. Eyeolean spending is not verified monetary revenue.

## Setup and rollout

1. Keep Supabase **Anonymous Sign-Ins** enabled for the existing backup/analytics identities.
2. Apply only missing migrations, in order: `202610270001_profiles_and_analytics.sql`, `202610270002_profile_linked_analytics.sql`, `202610270003_game_mode_analytics.sql`, then `202611010001_player_accounts_and_cohorts.sql`.
3. Provide `VITE_SUPABASE_ENABLED=true`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` as described in `.env.supabase.example`. Existing backups and compatible analytics use these settings.
4. After the migration is applied and checked, set `VITE_PLAYER_ACCOUNTS_ENABLED=true` for the desired build. It defaults to false and gates the optional contact UI, audience access, and migration-dependent Tribunal upload. The deployment workflow forwards the variable to production and QA builds.
5. To use the audience panel, separately provision a confirmed, non-anonymous administrator Auth user with an email/password and the server-controlled grant below. Enable password/email authentication for that administrative login. No player email provider flow, OTP template, or production SMTP setup is introduced by contact collection.

Only publishable credentials belong in frontend variables. Never put `service_role` credentials, `sb_secret_` keys, administrator passwords, or unsubscribe tokens in `VITE_` variables. This PR supplies code/migrations and does not apply production SQL, create administrators, or change production settings.

### Administrator authorization

Special-settings visibility or a local debug flag does not authorize contact access. The panel uses the isolated `audience_admin` session and an existing administrator email/password; there is no administrator signup flow. Its login/logout cannot replace the player's backup identity.

The RPC independently checks the live Auth user record for a confirmed, non-anonymous account, a nonempty email, and the JSON boolean `raw_app_meta_data.player_analytics_admin`. Editable `user_metadata` and stale JWT copies cannot grant access.

Grant a known verified administrator UUID through trusted project administration:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"player_analytics_admin": true}'::jsonb
where id = 'REPLACE_WITH_VERIFIED_ADMIN_UUID'::uuid;
```

Revoke access for subsequent queries:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  - 'player_analytics_admin'
where id = 'REPLACE_WITH_VERIFIED_ADMIN_UUID'::uuid;
```

The existing `supabase/analytics.sql` queries remain available for trusted deeper analysis.

## Verification

The executable SQL regression runs all migrations against fresh in-memory PostgreSQL with an Auth fixture. It checks anonymous-owner access, foreign-owner isolation, no Auth mutation, consent timestamps, stale revisions, token secrecy, same-address unsubscribe and idempotence, explicit re-opt-in, cascading deletion, live administrator authorization, unverified report labels, season deduplication, and full totals beyond the 500-row cap.

The optional PGlite engine is installed outside the repository and is not an app dependency:

```bash
npm install --prefix /tmp/the-big-eye-sql-check --no-save --package-lock=false @electric-sql/pglite@0.5.14
PLAYER_AUDIENCE_PGLITE_MODULE=/tmp/the-big-eye-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-player-audience-sql.mjs
```

Run the browser journeys/screenshots and the repository gate with:

```bash
npx playwright test --config playwright.accounts.config.ts
npm run check:pr
```

The Playwright configuration starts an isolated local app; Supabase requests use test route handlers, without production data or outgoing email. No application dependency changes are required by this feature.
