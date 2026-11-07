# Supabase profile backups and analytics

The integration is prepared locally and starts disabled. No Supabase project or
live database is created by this change.

## Connect a project

1. Create a Supabase project and run
   `supabase/migrations/202610270001_profiles_and_analytics.sql` in its SQL editor
   (or deploy it through your normal Supabase migration workflow).
2. Enable **Anonymous Sign-Ins** in Authentication settings. The app obtains a
   real authenticated identity before accessing either table. Unauthenticated
   requests have no table access; row policies restrict each owner to their rows.
3. Copy `.env.supabase.example` values into `.env.local` for development, or into
   the build environment for Android/iOS/release. Supply the project URL and
   **publishable key**, then set `VITE_SUPABASE_ENABLED=true` and rebuild.
   Never put a service-role or secret key in the app. Legacy public `anon` JWTs
   are also accepted. Missing/invalid configuration leaves the integration inert.
4. As an adult player, open **Settings → Player privacy & family**. Enable
   **Optional online services**, then separately enable **Cloud profile backup**
   for the selected saved profile. Repeat for each profile you want backed up.
   Enable **Optional usage measurement** separately to send analytics.
5. In a test project, run `supabase/tests/owner_isolation.sql` to verify isolation,
   blocked foreign writes, and idempotent event inserts. It rolls back its test data.
   Check `player_profiles` and `player_events` in the Supabase dashboard. Run the
   queries in `supabase/analytics.sql` for actions, screens, activity, and minigames.
   Unknown-age players, teens, and guests do not upload profiles or analytics.

Before turning this on for public players, update the published privacy notice
and store disclosures to identify the project operator, processor, retention,
support/deletion process, and the categories actually collected. The existing
local-only release can continue with `VITE_SUPABASE_ENABLED=false`. Review
Supabase anonymous-auth rate limits and abuse protection for the intended launch.

## Backup scope and recovery

The selected profile is backed up after changes, with a short debounce. This
includes display name, emoji avatar, creation date, achievements, progression,
and Eyeolean wallet/inventory/transaction metadata. It excludes biography fields,
uploaded photos, current season saves, season archives, device preferences, and
native purchase/VIP credentials. The in-app choice describes this scope.

These are **backup copies of client data**. Never grant currency or paid access
from them: purchase verification and authoritative economy/account recovery
require a separate server implementation. Existing local play and purchases
continue to use their current sources of truth. Nothing is automatically restored
or merged from the server in this first version.

Anonymous credentials are persisted on the installation, separately for backups
and analytics so the consent choices stay independent. This prepares server-side
copies without requiring email, passwords, or a new account screen. It does **not**
provide cross-device sign-in/recovery: clearing app/browser storage loses access
to the anonymous identity. Before advertising recoverable cloud saves, add an
account-linking/sign-in flow, tested import/merge rules, and trusted wallet and
purchase handling. See the [Supabase anonymous auth guide](https://supabase.com/docs/guides/auth/auth-anonymous).

Turning backup off stops uploads and retains the existing server copy. **Remove
cloud copy** also disables backup and queues deletion. Deleting a local profile
queues the same deletion automatically. Tombstones survive restart and retry
with adult online permission; an offline removal is not claimed complete before
the server confirms it. If the credentials are lost, the operator must handle
deletion requests through a protected administrative process.

## Analytics and failure handling

The existing `trackProductEvent` API now has an independent Supabase subscriber;
its enablement does not depend on the optional LiveOps telemetry configuration.
Existing external LiveOps collectors keep their existing sampling behavior.

Events cover screens, game phases, profile creation/selection, season starts,
completion/abandonment, minigame starts/results, human social action types, and
visible session time. Only named events and explicitly allowed scalar properties
are sent. Screen paths are normalized; query strings, dynamic paths, names,
biographies, photos, locations, messages, target-player IDs, and arbitrary Redux
payloads are excluded. Analytics use a pseudonymous owner ID and a session ID,
not a cloud profile ID. Counts represent consenting installations/sessions, not
verified unique people. Client events can be spoofed; use them for product insight.

Events are batched in groups of 50. A maximum of 200 events is held in session
storage for up to 24 hours; closing the tab can lose unsent data. Stable event IDs
and an owner/event primary key make network retries idempotent. Profile changes,
guest mode, and analytics withdrawal clear queued analytics; withdrawal aborts
pending requests. Consent is rechecked at each network boundary. No analytics
are replayed from before consent. Withdrawal stops future collection; deleting
previously received analytics is an operator task. Configure retention through a
scheduled database job; the reporting file includes a deletion query example.

Uploads retry on reconnect and once per minute. Cloud errors never interrupt
gameplay. The latest local profile remains the source for a later backup, so a
separate queue of private profile snapshots is unnecessary. Anonymous sign-in,
database requests, RLS policies, duplicate delivery, deletion, and expiry must be
smoke-tested against your project before enabling production builds.

Use [Supabase row-level security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
when extending the schema. Keep reports private; the app never receives an
administrative credential.
