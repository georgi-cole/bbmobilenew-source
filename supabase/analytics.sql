-- Run one query at a time in the Supabase SQL Editor.

-- 1. Profiles and the currently selected character appearance.
select
  snapshot #>> '{profile,name}' as profile_name,
  snapshot #>> '{profile,appearanceSelection,lookId}' as selected_look,
  snapshot #>> '{profile,avatar}' as avatar,
  updated_at
from public.player_profiles
order by updated_at desc;

-- 2. Full timeline for linked profiles, including the game day and action type.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  coalesce(
    e.properties ->> 'character_id',
    p.snapshot #>> '{profile,appearanceSelection,lookId}'
  ) as character_id,
  coalesce(
    e.properties ->> 'character_label',
    case
      when p.snapshot #>> '{profile,appearanceSelection,lookId}' ~ '^pc-[0-9]{3}$'
        then 'Look ' || ((substring(p.snapshot #>> '{profile,appearanceSelection,lookId}' from 4))::integer)::text
      when p.snapshot #>> '{profile,appearanceSelection,kind}' = 'legacy'
        then 'Legacy look'
      else null
    end
  ) as character_label,
  e.name as event,
  e.occurred_at,
  case e.properties ->> 'app_environment'
    when 'qa' then 'QA'
    when 'development' then 'Development'
    when 'production' then 'Production'
    else coalesce(e.properties ->> 'app_environment', 'Unknown')
  end as app_environment,
  e.properties ->> 'game_mode' as game_mode,
  e.properties ->> 'game_mode_label' as game_mode_label,
  e.properties ->> 'screen_id' as screen,
  e.properties ->> 'day' as game_day,
  e.properties ->> 'phase' as game_phase,
  e.properties ->> 'game_key' as minigame,
  e.properties ->> 'action_id' as social_action,
  e.properties ->> 'exit_reason' as exit_reason,
  e.properties ->> 'device_type' as device_type,
  e.properties ->> 'device_family' as device_family,
  e.properties ->> 'device_model' as device_model,
  e.properties ->> 'operating_system' as operating_system,
  e.properties ->> 'browser' as browser
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.profile_id is not null
order by e.occurred_at desc;

-- 3. Menu and marketplace visits and visible time (seconds).
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'app_environment' as app_environment,
  e.properties ->> 'screen_group' as area,
  e.properties ->> 'screen_id' as screen,
  count(*) filter (where e.name = 'screen_view') as visits,
  coalesce(sum((e.properties ->> 'duration_seconds')::numeric)
    filter (where e.name = 'screen_time'), 0) as visible_seconds
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('screen_view', 'screen_time')
group by profile_name, app_environment, area, screen
order by visible_seconds desc, visits desc;

-- 4. Social module opens, time spent inside it, and player actions.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'app_environment' as app_environment,
  e.properties ->> 'game_mode' as game_mode,
  e.properties ->> 'game_mode_label' as game_mode_label,
  count(*) filter (where e.name = 'social_module_opened') as opens,
  coalesce(sum((e.properties ->> 'duration_seconds')::numeric)
    filter (where e.name = 'social_module_time'), 0) as visible_seconds,
  count(*) filter (where e.name = 'social_action') as player_actions
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('social_module_opened', 'social_module_time', 'social_action')
group by profile_name, app_environment, game_mode, game_mode_label
order by visible_seconds desc;

-- 5. Social actions and major gameplay decisions each profile used.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'app_environment' as app_environment,
  e.properties ->> 'game_mode' as game_mode,
  e.properties ->> 'game_mode_label' as game_mode_label,
  e.name as action_area,
  e.properties ->> 'action_id' as action,
  count(*) as times_used
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('social_action', 'game_action')
group by profile_name, app_environment, game_mode, game_mode_label, action_area, action
order by profile_name, game_mode, action_area, times_used desc;

-- 6. Every finished minigame, including duration, placement, and result.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'app_environment' as app_environment,
  e.occurred_at,
  e.properties ->> 'game_key' as minigame,
  e.properties ->> 'source' as minigame_type,
  e.properties ->> 'game_mode' as game_mode,
  e.properties ->> 'game_mode_label' as game_mode_label,
  e.properties ->> 'day' as game_day,
  (e.properties ->> 'duration_seconds')::numeric as duration_seconds,
  (e.properties ->> 'placement')::integer as placement,
  (e.properties ->> 'participant_count')::integer as participant_count,
  (e.properties ->> 'won')::boolean as won,
  (e.properties ->> 'last_place')::boolean as last_place,
  (e.properties ->> 'partial')::boolean as partial
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name = 'minigame_completed'
order by e.occurred_at desc;

-- 7. Minigame starts, completions, and exits by game.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'app_environment' as app_environment,
  e.properties ->> 'game_mode' as game_mode,
  e.properties ->> 'game_mode_label' as game_mode_label,
  e.properties ->> 'game_key' as minigame,
  e.properties ->> 'source' as minigame_type,
  count(*) filter (where e.name = 'minigame_started') as starts,
  count(*) filter (where e.name = 'minigame_completed') as completions,
  count(*) filter (where e.name = 'minigame_exited') as exits,
  round(avg((e.properties ->> 'duration_seconds')::numeric)
    filter (where e.name in ('minigame_completed', 'minigame_exited')), 1) as average_play_seconds
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('minigame_started', 'minigame_completed', 'minigame_exited')
group by profile_name, app_environment, game_mode, game_mode_label, minigame, minigame_type
order by profile_name, game_mode, starts desc;

-- 8. When a profile was eliminated or self-evicted, and their final season place.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'app_environment' as app_environment,
  e.name as event,
  e.occurred_at,
  e.properties ->> 'game_mode' as game_mode,
  e.properties ->> 'game_mode_label' as game_mode_label,
  e.properties ->> 'day' as game_day,
  e.properties ->> 'phase' as game_phase,
  e.properties ->> 'elimination_type' as elimination_type,
  (e.properties ->> 'placement')::integer as placement,
  (e.properties ->> 'total_players')::integer as total_players,
  (e.properties ->> 'days_alive')::integer as days_alive
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('player_eliminated', 'self_eviction', 'season_completed')
order by e.occurred_at desc;

-- 9. Marketplace shelf, product interest, and purchase outcomes (no prices collected).
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'app_environment' as app_environment,
  e.name as event,
  coalesce(e.properties ->> 'shelf_id', e.properties ->> 'product_key',
    e.properties ->> 'item_key') as marketplace_item,
  count(*) as times
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in (
  'store_shelf_selected', 'store_product_selected', 'store_purchase_started',
  'store_purchase_completed', 'store_purchase_failed', 'eyeolean_purchase_completed'
)
group by profile_name, app_environment, event, marketplace_item
order by profile_name, times desc;

-- 10. Seasons started and furthest numbered game day reached by mode.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'app_environment' as app_environment,
  e.properties ->> 'game_mode' as game_mode,
  e.properties ->> 'game_mode_label' as game_mode_label,
  count(*) filter (where e.name = 'season_started') as seasons_started,
  max((e.properties ->> 'day')::integer)
    filter (where e.name = 'season_day_reached') as furthest_day
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('season_started', 'season_day_reached')
group by profile_name, app_environment, game_mode, game_mode_label
order by seasons_started desc, furthest_day desc;

-- 11. One readable row for each session start, including the profile, character, and device.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  p.snapshot #>> '{profile,appearanceSelection,lookId}' as character_id,
  coalesce(
    case
      when p.snapshot #>> '{profile,appearanceSelection,lookId}' ~ '^pc-[0-9]{3}$'
        then 'Look ' || ((substring(p.snapshot #>> '{profile,appearanceSelection,lookId}' from 4))::integer)::text
      when p.snapshot #>> '{profile,appearanceSelection,kind}' = 'legacy'
        then 'Legacy look'
      else null
    end,
    'Unknown look'
  ) as character_label,
  selected_mode.properties ->> 'game_mode' as game_mode,
  selected_mode.properties ->> 'game_mode_label' as game_mode_label,
  e.occurred_at as session_started_at_utc,
  e.occurred_at at time zone 'Europe/London' as session_started_at_uk,
  case e.properties ->> 'app_environment'
    when 'qa' then 'QA'
    when 'development' then 'Development'
    when 'production' then 'Production'
    else coalesce(e.properties ->> 'app_environment', 'Unknown')
  end as app_environment,
  e.properties ->> 'device_type' as device_type,
  e.properties ->> 'device_family' as device_family,
  e.properties ->> 'device_model' as device_model,
  e.properties ->> 'operating_system' as operating_system,
  e.properties ->> 'browser' as browser
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
left join lateral (
  select mode_event.properties
  from public.player_events mode_event
  where mode_event.owner_id = e.owner_id
    and mode_event.profile_id = e.profile_id
    and mode_event.session_id = e.session_id
    and mode_event.name = 'game_mode_selected'
    and mode_event.occurred_at >= e.occurred_at
  order by mode_event.occurred_at asc
  limit 1
) selected_mode on true
where e.name = 'session_started'
order by e.occurred_at desc;

-- 12. Compare how many events each profile created in the QA, production, and local builds.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  case e.properties ->> 'app_environment'
    when 'qa' then 'QA'
    when 'development' then 'Development'
    when 'production' then 'Production'
    else coalesce(e.properties ->> 'app_environment', 'Unknown')
  end as app_environment,
  count(*) as event_count,
  min(e.occurred_at) as first_event_at_utc,
  max(e.occurred_at) as latest_event_at_utc
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
group by profile_name, app_environment
order by latest_event_at_utc desc;
