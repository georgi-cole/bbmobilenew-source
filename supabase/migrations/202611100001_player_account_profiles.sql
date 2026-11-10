-- Account-owned profile cards sync across devices. Game runs and purchases remain
-- in their existing device/native stores and are not made authoritative here.

create table public.player_account_profiles (
  account_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (length(profile_id) between 1 and 120),
  snapshot jsonb not null check (coalesce((
    jsonb_typeof(snapshot) = 'object'
    and snapshot ->> 'schemaVersion' = '1'
    and jsonb_typeof(snapshot -> 'profile') = 'object'
    and snapshot #>> '{profile,id}' = profile_id
    and octet_length(snapshot::text) <= 262144
  ), false)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  profile_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (account_id, profile_id)
);

alter table public.player_account_profiles enable row level security;
revoke all on public.player_account_profiles from public, anon, authenticated;
grant select on public.player_account_profiles to authenticated;
create policy player_account_profiles_read_own
  on public.player_account_profiles for select to authenticated
  using ((select auth.uid()) = account_id);

comment on table public.player_account_profiles is
  'Private account-owned profile details. Game saves, purchase balances, and entitlements remain device-local and are never accepted from this snapshot.';

create function public.save_player_account_profile(
  p_profile_id text,
  p_snapshot jsonb,
  p_profile_updated_at timestamptz
)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := (select auth.uid());
  saved_at timestamptz;
  existing_profile_updated_at timestamptz;
  existing_deleted_at timestamptz;
  profile_exists boolean;
begin
  if owner is null or not exists (
    select 1 from auth.users u
    where u.id = owner and not coalesce(u.is_anonymous, true)
      and u.email_confirmed_at is not null
  ) then
    raise exception 'A verified player account is required.' using errcode = '42501';
  end if;
  if p_profile_id is null or length(p_profile_id) not between 1 and 120
    or p_snapshot is null or jsonb_typeof(p_snapshot) is distinct from 'object'
    or p_snapshot ->> 'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_snapshot -> 'profile') is distinct from 'object'
    or p_snapshot #>> '{profile,id}' is distinct from p_profile_id
    or octet_length(p_snapshot::text) > 262144
    or p_profile_updated_at is null
    or p_profile_updated_at > now() + interval '1 day' then
    raise exception 'Invalid profile data.' using errcode = '22023';
  end if;

  -- Serialize account profile creation so simultaneous devices cannot exceed 3.
  perform pg_advisory_xact_lock(hashtextextended('player-account-profiles:' || owner::text, 0));
  select p.profile_updated_at, p.deleted_at
    into existing_profile_updated_at, existing_deleted_at
    from public.player_account_profiles p
    where p.account_id = owner and p.profile_id = p_profile_id for update;
  profile_exists := found;
  if (not profile_exists or existing_deleted_at is not null) and (
    select count(*) from public.player_account_profiles p
    where p.account_id = owner and p.deleted_at is null
  ) >= 3 then
    raise exception 'This account already has the maximum of 3 profiles.' using errcode = '23514';
  end if;
  if profile_exists and existing_deleted_at is null
    and existing_profile_updated_at > p_profile_updated_at then
    raise exception 'A newer profile version is already synced.' using errcode = '40001';
  end if;

  insert into public.player_account_profiles (
    account_id, profile_id, snapshot, profile_updated_at, deleted_at
  ) values (
    owner, p_profile_id, p_snapshot, p_profile_updated_at, null
  )
  on conflict (account_id, profile_id) do update set
    snapshot = excluded.snapshot,
    profile_updated_at = excluded.profile_updated_at,
    deleted_at = null,
    updated_at = now()
  returning updated_at into saved_at;
  return saved_at;
end;
$$;
revoke all on function public.save_player_account_profile(text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_player_account_profile(text, jsonb, timestamptz)
  to authenticated;

create function public.delete_player_account_profile(p_profile_id text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := (select auth.uid());
begin
  if owner is null or not exists (
    select 1 from auth.users u
    where u.id = owner and not coalesce(u.is_anonymous, true)
      and u.email_confirmed_at is not null
  ) then
    raise exception 'A verified player account is required.' using errcode = '42501';
  end if;
  if p_profile_id is null or length(p_profile_id) not between 1 and 120 then
    raise exception 'Invalid profile.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('player-account-profiles:' || owner::text, 0));
  update public.player_account_profiles p set deleted_at = now(), updated_at = now()
    where p.account_id = owner and p.profile_id = p_profile_id and p.deleted_at is null;
  return found;
end;
$$;
revoke all on function public.delete_player_account_profile(text) from public, anon, authenticated;
grant execute on function public.delete_player_account_profile(text) to authenticated;
