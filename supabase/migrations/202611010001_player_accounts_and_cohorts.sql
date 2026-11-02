-- Apply after 202610270003_game_mode_analytics.sql.
-- Optional profile contacts are unverified addresses, separate from Auth identity.
-- The migration runner owns the transaction and migration-history write.

create table public.player_profile_contacts (
  owner_id uuid not null,
  profile_id text not null,
  email text check (
    email is null or (
      email = lower(btrim(email, E' \t\n\r\f'))
      and length(email) between 3 and 254
      and email ~ '^[^[:space:][:cntrl:]@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    )
  ),
  updates_opt_in boolean not null default false check (not updates_opt_in or email is not null),
  updates_opted_in_at timestamptz,
  updates_opted_out_at timestamptz,
  consent_version text not null default '2026-11-01',
  revision uuid not null default gen_random_uuid(),
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  last_unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, profile_id),
  foreign key (owner_id, profile_id)
    references public.player_profiles (owner_id, profile_id) on delete cascade
);
create index player_profile_contacts_email_idx on public.player_profile_contacts (email)
where email is not null;

alter table public.player_profile_contacts enable row level security;
revoke all on public.player_profile_contacts from public, anon, authenticated;
-- Only trusted mail delivery can read unsubscribe tokens; players use scoped RPCs.
grant select on public.player_profile_contacts to service_role;

comment on table public.player_profile_contacts is
  'Optional unverified profile contact, with one consent for game news and playtest invitations. Not Auth identity, proof of address ownership, or enrollment as a tester. Application roles have no direct table access.';

create function public.get_player_profile_contact(p_profile_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := (select auth.uid());
  result jsonb;
begin
  if p_profile_id is null or length(p_profile_id) not between 1 and 120 then
    raise exception 'A valid profile is required.' using errcode = '22023';
  end if;
  if owner is null then
    raise exception 'This profile is not available to the current session.' using errcode = '42501';
  end if;
  -- A local profile may not have reached automatic backup yet. Missing or
  -- foreign-owned contacts both return null; the owner predicate never changes.
  select jsonb_build_object(
    'email', coalesce(c.email, ''),
    'updatesOptIn', c.updates_opt_in,
    'revision', c.revision
  ) into result
  from public.player_profile_contacts c
  where c.owner_id = owner and c.profile_id = p_profile_id;
  return result;
end;
$$;
revoke all on function public.get_player_profile_contact(text) from public, anon, authenticated;
grant execute on function public.get_player_profile_contact(text) to authenticated;

create function public.save_player_profile_contact(
  p_profile_id text,
  p_email text,
  p_updates_opt_in boolean,
  p_expected_revision uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := (select auth.uid());
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''), E' \t\n\r\f')), '');
  requested_opt_in boolean;
  existing public.player_profile_contacts%rowtype;
  saved public.player_profile_contacts%rowtype;
  lock_email text;
begin
  if p_profile_id is null or length(p_profile_id) not between 1 and 120 then
    raise exception 'A valid profile is required.' using errcode = '22023';
  end if;
  if normalized_email is not null and (
    length(normalized_email) > 254 or normalized_email !~
      '^[^[:space:][:cntrl:]@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ) then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  -- Clearing the address also removes consent, including a stale checked checkbox.
  requested_opt_in := coalesce(p_updates_opt_in, false) and normalized_email is not null;
  if owner is null then
    raise exception 'This profile is not available to the current session.' using errcode = '42501';
  end if;
  perform 1 from public.player_profiles p
  where p.owner_id = owner and p.profile_id = p_profile_id for key share;
  if not found then
    raise exception 'This profile is not available to the current session.' using errcode = '42501';
  end if;

  -- Serialize creation/saves for a profile, then take email locks in sorted order.
  -- Unsubscribe takes the same email lock before row locks, so it cannot race an
  -- insert/change into that address or leave a stale editor with a valid revision.
  perform pg_advisory_xact_lock(hashtextextended('profile-contact:' || owner::text || ':' || p_profile_id, 0));
  select * into existing from public.player_profile_contacts c
  where c.owner_id = owner and c.profile_id = p_profile_id;
  for lock_email in
    select distinct address from unnest(array[existing.email, normalized_email]) as e(address)
    where address is not null order by address
  loop
    perform pg_advisory_xact_lock(hashtextextended('profile-contact-email:' || lock_email, 0));
  end loop;
  select * into existing from public.player_profile_contacts c
  where c.owner_id = owner and c.profile_id = p_profile_id for update;

  if found then
    if p_expected_revision is null or p_expected_revision <> existing.revision then
      raise exception 'Contact details changed. Reload them before saving.' using errcode = '40001';
    end if;
    if existing.email is not distinct from normalized_email
      and existing.updates_opt_in = requested_opt_in then
      saved := existing;
    else
      update public.player_profile_contacts c set
        email = normalized_email,
        updates_opt_in = requested_opt_in,
        updates_opted_in_at = case
          when c.email is distinct from normalized_email
            then case when requested_opt_in then now() else null end
          when requested_opt_in and not c.updates_opt_in then now()
          else c.updates_opted_in_at end,
        updates_opted_out_at = case
          when c.email is distinct from normalized_email then null
          when not requested_opt_in and c.updates_opt_in then now()
          else c.updates_opted_out_at end,
        last_unsubscribed_at = case
          when c.email is distinct from normalized_email then null
          else c.last_unsubscribed_at end,
        unsubscribe_token = case
          when c.email is distinct from normalized_email then gen_random_uuid()
          else c.unsubscribe_token end,
        consent_version = '2026-11-01',
        revision = gen_random_uuid(),
        updated_at = now()
      where c.owner_id = owner and c.profile_id = p_profile_id
      returning * into saved;
    end if;
  else
    if p_expected_revision is not null then
      raise exception 'Contact details changed. Reload them before saving.' using errcode = '40001';
    end if;
    insert into public.player_profile_contacts (
      owner_id, profile_id, email, updates_opt_in, updates_opted_in_at
    ) values (
      owner, p_profile_id, normalized_email, requested_opt_in,
      case when requested_opt_in then now() else null end
    ) returning * into saved;
  end if;
  return jsonb_build_object(
    'email', coalesce(saved.email, ''),
    'updatesOptIn', saved.updates_opt_in,
    'revision', saved.revision
  );
end;
$$;
revoke all on function public.save_player_profile_contact(text, text, boolean, uuid)
from public, anon, authenticated;
grant execute on function public.save_player_profile_contact(text, text, boolean, uuid)
to authenticated;

create function public.unsubscribe_player_contact(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  target_email text;
begin
  select c.email into target_email from public.player_profile_contacts c
  where c.unsubscribe_token = p_token;
  if not found then return false; end if;
  if target_email is null then return true; end if;

  perform pg_advisory_xact_lock(hashtextextended('profile-contact-email:' || target_email, 0));
  -- An address edit rotates the token; recheck after acquiring the shared lock.
  perform 1 from public.player_profile_contacts c
  where c.unsubscribe_token = p_token and c.email = target_email;
  if not found then return false; end if;
  perform c.owner_id from public.player_profile_contacts c
  where c.email = target_email order by c.owner_id, c.profile_id for update;

  if exists (
    select 1 from public.player_profile_contacts c
    where c.email = target_email and (c.updates_opt_in or c.last_unsubscribed_at is null)
  ) then
    -- Invalidate every matching row, including already-unchecked forms. The hidden
    -- timestamp makes repeated use idempotent unless a new row/consent appeared.
    update public.player_profile_contacts c set
      updates_opt_in = false,
      updates_opted_out_at = now(),
      last_unsubscribed_at = now(),
      revision = gen_random_uuid(),
      updated_at = now()
    where c.email = target_email;
  end if;
  return true;
end;
$$;
revoke all on function public.unsubscribe_player_contact(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_player_contact(uuid) to anon, authenticated;

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
  ), audience as (
    select
      s.*,
      false as verified_email,
      c.email,
      coalesce(c.updates_opt_in, false) as updates_opt_in,
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
    left join public.player_profile_contacts c
      on c.owner_id = s.contact_owner_id and c.profile_id = s.profile_id
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
      case when a.updates_opt_in then 'subscribed' end
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
        'subscribed', count(*) filter (where 'subscribed' = any(g.groups))
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
        'updatesOptIn', r.updates_opt_in,
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
  'Admin-only read of observed player records and explicit contact consent. Excludes QA/development events; includes unlabeled legacy events. At most 500 recent rows, with full totals. Guest installations and local profiles are not deduplicated people. Contact emails are unverified; subscription means game updates and playtest invitations, not tester enrollment.';
