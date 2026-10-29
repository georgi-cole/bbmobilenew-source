-- Run once in the Supabase SQL Editor, or deploy with `supabase db push`.
begin;

create table public.player_profiles (
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (length(profile_id) between 1 and 120),
  snapshot jsonb not null check (coalesce((
    jsonb_typeof(snapshot) = 'object'
    and snapshot ->> 'schemaVersion' = '1'
    and jsonb_typeof(snapshot -> 'profile') = 'object'
    and snapshot #>> '{profile,id}' = profile_id
    and octet_length(snapshot::text) <= 2097152
  ), false)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, profile_id)
);

create function public.touch_player_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := coalesce(old.created_at, now());
  new.updated_at := now();
  return new;
end;
$$;
create trigger player_profiles_updated before update on public.player_profiles
for each row execute function public.touch_player_profile();
revoke all on function public.touch_player_profile() from public, anon, authenticated;

create table public.player_events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  profile_id text,
  name text not null check (name in (
    'screen_view', 'screen_time', 'game_phase_view', 'experiment_exposure',
    'final3_appeal_shown', 'final3_appeal_selected', 'final3_spectator_started',
    'final3_spectator_completed', 'session_started', 'session_active',
    'profile_created', 'profile_selected', 'character_selected',
    'season_started', 'season_day_reached', 'season_completed', 'season_abandoned',
    'player_eliminated', 'self_eviction', 'minigame_started', 'minigame_completed',
    'minigame_exited', 'social_module_opened', 'social_module_time', 'social_module_closed',
    'social_action', 'game_action', 'store_shelf_selected', 'store_product_selected',
    'store_purchase_started', 'store_purchase_completed', 'store_purchase_failed',
    'eyeolean_purchase_completed'
  )),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  session_id text not null check (length(session_id) between 1 and 128),
  properties jsonb not null default '{}'::jsonb check (
    jsonb_typeof(properties) = 'object' and octet_length(properties::text) <= 2048
  ),
  primary key (owner_id, event_id)
);
create index player_events_time_idx on public.player_events (received_at);
create index player_events_name_time_idx on public.player_events (name, received_at);
create index player_events_profile_time_idx on public.player_events (profile_id, received_at);

alter table public.player_profiles enable row level security;
alter table public.player_events enable row level security;

revoke all on public.player_profiles, public.player_events from anon, authenticated;
grant select, insert, update, delete on public.player_profiles to authenticated;
grant select, insert, delete on public.player_events to authenticated;
grant all on public.player_profiles, public.player_events to service_role;

create policy profiles_read_own on public.player_profiles for select to authenticated
using ((select auth.uid()) = owner_id);
create policy profiles_create_own on public.player_profiles for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy profiles_update_own on public.player_profiles for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy profiles_delete_own on public.player_profiles for delete to authenticated
using ((select auth.uid()) = owner_id);
create policy events_read_own on public.player_events for select to authenticated
using ((select auth.uid()) = owner_id);
create policy events_insert_own on public.player_events for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy events_delete_own on public.player_events for delete to authenticated
using ((select auth.uid()) = owner_id);

comment on table public.player_profiles is
  'Opt-in private client backup. Not authoritative for purchases, wallet, or entitlements.';
comment on table public.player_events is
  'Automatic pseudonymous client analytics linked to an installation-local profile ID. Not authoritative game results or revenue.';

commit;
