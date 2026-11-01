-- Apply after 202610270003_game_mode_analytics.sql.
-- Email addresses stay in auth.users; application tables contain preferences only.
begin;

create table public.player_contact_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  news_opt_in boolean not null default false,
  tester_opt_in boolean not null default false,
  news_opted_in_at timestamptz,
  news_opted_out_at timestamptz,
  tester_opted_in_at timestamptz,
  tester_opted_out_at timestamptz,
  consent_version text not null default '2026-11-01',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.player_account_is_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and not coalesce(u.is_anonymous, true)
      and u.email_confirmed_at is not null
      and nullif(trim(u.email), '') is not null
  );
$$;
revoke all on function public.player_account_is_verified() from public, anon;
grant execute on function public.player_account_is_verified() to authenticated;

create function public.stamp_player_contact_preferences() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.news_opted_in_at := case when new.news_opt_in then now() else null end;
    new.news_opted_out_at := null;
    new.tester_opted_in_at := case when new.tester_opt_in then now() else null end;
    new.tester_opted_out_at := null;
  else
    new.created_at := old.created_at;
    new.news_opted_in_at := case
      when new.news_opt_in and not old.news_opt_in then now()
      else old.news_opted_in_at end;
    new.news_opted_out_at := case
      when not new.news_opt_in and old.news_opt_in then now()
      else old.news_opted_out_at end;
    new.tester_opted_in_at := case
      when new.tester_opt_in and not old.tester_opt_in then now()
      else old.tester_opted_in_at end;
    new.tester_opted_out_at := case
      when not new.tester_opt_in and old.tester_opt_in then now()
      else old.tester_opted_out_at end;
  end if;
  new.updated_at := now();
  new.consent_version := '2026-11-01';
  return new;
end;
$$;
create trigger player_contact_preferences_stamped
before insert or update on public.player_contact_preferences
for each row execute function public.stamp_player_contact_preferences();
revoke all on function public.stamp_player_contact_preferences() from public, anon, authenticated;

alter table public.player_contact_preferences enable row level security;
revoke all on public.player_contact_preferences from public, anon, authenticated;
grant select, delete on public.player_contact_preferences to authenticated;
-- PostgREST upsert updates every supplied column, including the unchanged owner_id.
grant insert (owner_id, news_opt_in, tester_opt_in),
  update (owner_id, news_opt_in, tester_opt_in)
  on public.player_contact_preferences to authenticated;
grant all on public.player_contact_preferences to service_role;

create policy contact_preferences_read_own on public.player_contact_preferences
for select to authenticated using ((select auth.uid()) = owner_id);
create policy contact_preferences_create_verified_own on public.player_contact_preferences
for insert to authenticated with check (
  (select auth.uid()) = owner_id and (select public.player_account_is_verified())
);
create policy contact_preferences_update_verified_own on public.player_contact_preferences
for update to authenticated
using ((select auth.uid()) = owner_id and (select public.player_account_is_verified()))
with check ((select auth.uid()) = owner_id and (select public.player_account_is_verified()));
create policy contact_preferences_delete_own on public.player_contact_preferences
for delete to authenticated using ((select auth.uid()) = owner_id);

comment on table public.player_contact_preferences is
  'Optional account-level news/tester consent. Email remains in Auth. One backup account may own several local profiles; neither checkbox is required to play or connect an account.';

alter table public.player_events drop constraint if exists player_events_name_check;
alter table public.player_events add constraint player_events_name_check check (name in (
  'screen_view', 'screen_time', 'game_phase_view', 'experiment_exposure',
  'final3_appeal_shown', 'final3_appeal_selected', 'final3_spectator_started',
  'final3_spectator_completed', 'session_started', 'session_active', 'game_mode_selected',
  'profile_created', 'profile_selected', 'character_selected',
  'season_started', 'season_day_reached', 'player_eliminated', 'self_eviction',
  'season_completed', 'season_abandoned', 'tribunal_action', 'minigame_started',
  'minigame_completed', 'minigame_exited', 'social_module_opened', 'social_module_time',
  'social_module_closed', 'social_action', 'game_action', 'store_shelf_selected',
  'store_product_selected', 'store_purchase_started', 'store_purchase_completed',
  'store_purchase_failed', 'eyeolean_purchase_completed'
));

create function public.get_player_audience() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  -- Check the live Auth record, not an old JWT or editable user_metadata.
  if not exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and not coalesce(u.is_anonymous, true)
      and u.email_confirmed_at is not null
      and nullif(trim(u.email), '') is not null
      and u.raw_app_meta_data -> 'player_analytics_admin' = 'true'::jsonb
  ) then
    raise exception 'Player audience access requires an authorized administrator.'
      using errcode = '42501';
  end if;

  with observed_events as materialized (
    select
      e.*,
      case when e.profile_id is null then 'guest:' || e.owner_id::text
        else 'profile:' || e.profile_id end as subject_id,
      least(e.occurred_at, now()) as activity_at,
      coalesce(nullif(e.properties ->> 'game_mode', ''), 'unknown') as game_mode,
      case when e.properties ->> 'game_id' ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then 'run:' || lower(e.properties ->> 'game_id') end as game_key,
      case when e.properties ->> 'season_index' ~ '^[0-9]{1,10}$' then
        coalesce(nullif(e.properties ->> 'game_mode', ''), 'unknown') || ':' ||
        (e.properties ->> 'season_index')
      end as legacy_season_key
    from public.player_events e
    -- Web/mobile releases both use production. Older events may lack the label.
    where coalesce(e.properties ->> 'app_environment', 'production')
      not in ('qa', 'development')
      and (e.profile_id is null or length(e.profile_id) between 1 and 120)
  ), eligible_events as materialized (
    select e.*, coalesce(e.game_key, e.legacy_season_key) as season_key
    from observed_events e
  ), profile_candidates as (
    select p.*, count(*) over (partition by p.profile_id) as owner_count
    from public.player_profiles p
    where not exists (select 1 from public.player_events e where e.profile_id = p.profile_id)
      or exists (select 1 from eligible_events e where e.profile_id = p.profile_id)
  ), profiles as (
    -- Existing analytics uses the local profile ID. Never attach a contact address
    -- to an ambiguous ID that exists under more than one backup owner.
    select distinct on (p.profile_id) p.*
    from profile_candidates p
    order by p.profile_id, p.updated_at desc, p.owner_id
  ), event_activity as (
    select
      e.subject_id,
      e.profile_id,
      min(e.activity_at) as first_seen_at,
      max(e.activity_at) as last_active_at,
      bool_or(e.name = 'tribunal_action') as tribunal_engaged
    from eligible_events e
    group by e.subject_id, e.profile_id
  ), seasons as (
    select
      e.subject_id,
      e.season_key,
      coalesce(max(nullif(e.game_mode, 'unknown')), 'unknown') as game_mode,
      max(e.game_key) as game_key,
      max(e.legacy_season_key) as legacy_season_key,
      min(e.activity_at) filter (where e.name = 'season_started') as started_at,
      bool_or(e.name = 'season_completed') as completed,
      bool_or(e.name = 'season_abandoned') as abandoned
    from eligible_events e
    where e.season_key is not null
      and e.name in ('season_started', 'season_completed', 'season_abandoned')
    group by e.subject_id, e.season_key
  ), season_totals as (
    select
      s.subject_id,
      count(*) filter (where s.started_at is not null) as seasons_started,
      count(*) filter (where s.completed) as seasons_completed
    from seasons s
    group by s.subject_id
  ), latest_seasons as (
    select distinct on (s.subject_id) s.*
    from seasons s
    where s.started_at is not null
    order by s.subject_id, s.started_at desc, s.season_key
  ), subjects as (
    select
      coalesce(a.subject_id, 'profile:' || p.profile_id) as id,
      coalesce(a.profile_id, p.profile_id) as profile_id,
      case when a.profile_id is null and p.profile_id is null then 'Guest / unlinked player'
        else left(coalesce(nullif(p.snapshot #>> '{profile,name}', ''), 'Player profile'), 120) end
        as display_name,
      a.profile_id is null and p.profile_id is null as is_guest,
      case when p.owner_count = 1 then p.owner_id end as contact_owner_id,
      least(a.first_seen_at, p.created_at) as first_seen_at,
      coalesce(a.last_active_at, p.updated_at) as last_active_at,
      coalesce(a.tribunal_engaged, false) as tribunal_engaged
    from event_activity a
    full join profiles p on p.profile_id = a.profile_id
    union all
    -- Verified guests may never save preferences when both choices stay off.
    -- Keep their account visible, as well as accounts after switching or with
    -- excluded-only profiles, without assigning ambiguous gameplay to an email.
    select
      'account:' || u.id::text, null, 'Connected account', false,
      u.id,
      least(u.created_at, u.email_confirmed_at, c.created_at),
      greatest(u.created_at, u.updated_at, u.email_confirmed_at, c.updated_at),
      false
    from auth.users u
    left join public.player_contact_preferences c on c.owner_id = u.id
    where not coalesce(u.is_anonymous, true) and u.email_confirmed_at is not null
      and nullif(trim(u.email), '') is not null
      and not exists (
        select 1 from profiles p where p.owner_id = u.id and p.owner_count = 1
      )
  ), audience as (
    select
      s.*,
      coalesce(not u.is_anonymous and u.email_confirmed_at is not null
        and nullif(trim(u.email), '') is not null, false) as verified_email,
      case when not coalesce(u.is_anonymous, true) and u.email_confirmed_at is not null
        then nullif(trim(u.email), '') end as email,
      coalesce(not u.is_anonymous and u.email_confirmed_at is not null
        and nullif(trim(u.email), '') is not null and c.news_opt_in, false) as news_opt_in,
      coalesce(not u.is_anonymous and u.email_confirmed_at is not null
        and nullif(trim(u.email), '') is not null and c.tester_opt_in, false) as tester_opt_in,
      coalesce(t.seasons_started, 0) as seasons_started,
      coalesce(t.seasons_completed, 0) as seasons_completed,
      l.started_at is not null and not l.completed and not l.abandoned
        and not exists (
          -- Bridge upgrades in either direction when one side lacks a run ID.
          -- Two known different game IDs must never close each other's season,
          -- even if guest/fresh-reset season indexes are both 1.
          select 1 from eligible_events e
          where e.subject_id = s.id and e.game_mode = l.game_mode
            and e.name in ('season_completed', 'season_abandoned')
            and e.activity_at >= l.started_at
            and (
              (e.season_key is null)
              or (
                e.legacy_season_key = l.legacy_season_key
                and (e.game_key is null or l.game_key is null)
              )
            )
        ) as unfinished_season
    from subjects s
    left join auth.users u on u.id = s.contact_owner_id
    left join public.player_contact_preferences c on c.owner_id = s.contact_owner_id
    left join season_totals t on t.subject_id = s.id
    left join latest_seasons l on l.subject_id = s.id
  ), grouped as (
    select a.*, array_remove(array[
      case when a.first_seen_at >= now() - interval '7 days' then 'new' end,
      case when a.seasons_started >= 2 then 'returning' end,
      case when a.seasons_completed >= 1 then 'completed' end,
      case when a.unfinished_season and a.last_active_at < now() - interval '14 days'
        then 'inactive' end,
      case when a.tribunal_engaged then 'tribunal' end,
      case when a.tester_opt_in then 'tester' end
    ]::text[], null) as groups
    from audience a
  ), summary as (
    select
      count(*) as total_players,
      min(g.first_seen_at) as coverage_start,
      jsonb_build_object(
        'new', count(*) filter (where 'new' = any(g.groups)),
        'returning', count(*) filter (where 'returning' = any(g.groups)),
        'completed', count(*) filter (where 'completed' = any(g.groups)),
        'inactive', count(*) filter (where 'inactive' = any(g.groups)),
        'tribunal', count(*) filter (where 'tribunal' = any(g.groups)),
        'tester', count(*) filter (where 'tester' = any(g.groups))
      ) as group_counts
    from grouped g
  ), recent as (
    select * from grouped order by last_active_at desc, id limit 500
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'coverageStart', summary.coverage_start,
    'totalPlayers', summary.total_players,
    'truncated', summary.total_players > 500,
    'groupCounts', summary.group_counts,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'profileId', r.profile_id,
        'displayName', r.display_name,
        'isGuest', r.is_guest,
        'verifiedEmail', r.verified_email,
        'email', r.email,
        'newsOptIn', r.news_opt_in,
        'testerOptIn', r.tester_opt_in,
        'firstSeenAt', r.first_seen_at,
        'lastActiveAt', r.last_active_at,
        'seasonsStarted', r.seasons_started,
        'seasonsCompleted', r.seasons_completed,
        'groups', r.groups
      ) order by r.last_active_at desc, r.id) from recent r
    ), '[]'::jsonb)
  ) into result from summary;
  return result;
end;
$$;

revoke all on function public.get_player_audience() from public, anon, authenticated;
grant execute on function public.get_player_audience() to authenticated;
comment on function public.get_player_audience() is
  'Admin-only read of observed player records and explicit contact consent. Excludes QA/development events; includes unlabeled legacy events. At most 500 recent rows, with full totals. Guest installations, local profiles, and account-only records are not deduplicated people.';

commit;
