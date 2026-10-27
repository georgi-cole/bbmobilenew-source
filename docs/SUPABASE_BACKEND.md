# Supabase profile backup and gameplay analytics

The app keeps its existing local profile storage and automatically backs up saved profiles and gameplay analytics when Supabase is configured for this build. The app uses two separate anonymous Supabase identities for backup and analytics.

The profile copy contains the profile ID, display name, emoji avatar, selected appearance ID, achievements, and Bella unlock progress. It does not copy profile photos, biography, wallet, purchase-like state, season archives, or saved games. This first version does not restore a profile onto another device: anonymous identities are tied to this browser or app installation.

Analytics records profile and appearance selection; app screen visits and visible time; game mode, phase, and each numbered game day reached; minigame starts, duration, placement, completion, and exits; Social module opens, visible time, and action categories; player decisions such as nominations and votes; elimination and final placement; marketplace shelf, product selection, and purchase outcomes; and session duration. It does not record purchase prices. Each analytics row includes the local profile ID so its activity can be joined to the profile backup and seen alongside that profile's display name and selected appearance. Analytics uses a separate installation-level anonymous ID and does not send biography, conversation text, player names, or free-form content. Deleting a profile removes its backup and linked analytics rows from this installation. Other analytics rows remain until removed by the project owner or in response to a deletion request.

## Setup

1. In Supabase, enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**.
2. Run `supabase/migrations/202610270001_profiles_and_analytics.sql` once in the Supabase SQL Editor. If you already ran it, do not run it again. Instead run the upgrade `supabase/migrations/202610270002_profile_linked_analytics.sql` once to add profile-linked analytics and the new tracking events.
3. Add `VITE_SUPABASE_ENABLED=true`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` to `.env.local`.
4. Restart the local app. Saved profiles and gameplay analytics sync automatically.
5. Use the separate queries in `supabase/analytics.sql` in the SQL Editor to view screen time, Social usage, minigame outcomes and exits, gameplay decisions, elimination timing, and marketplace activity.

Only the publishable key belongs in the app. Never put a `service_role` or `sb_secret_` key into a `VITE_` setting. The database migration enables row-level security and restricts each anonymous session to its own rows.

The anonymous auth sessions are stored by this installation. Clearing browser data or using a different device creates different identities; account sign-in and cross-device recovery are not included yet. Previously sent analytics rows from before the upgrade migration have no profile ID and cannot be joined to profiles; new events are linked.
