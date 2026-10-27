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
  p.snapshot #>> '{profile,appearanceSelection,lookId}' as selected_look,
  e.name as event,
  e.occurred_at,
  e.properties ->> 'screen_id' as screen,
  e.properties ->> 'game_mode' as game_mode,
  e.properties ->> 'day' as game_day,
  e.properties ->> 'phase' as game_phase,
  e.properties ->> 'game_key' as minigame,
  e.properties ->> 'action_id' as social_action,
  e.properties ->> 'exit_reason' as exit_reason
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.profile_id is not null
order by e.occurred_at desc;

-- 3. Menu and marketplace visits and visible time (seconds).
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'screen_group' as area,
  e.properties ->> 'screen_id' as screen,
  count(*) filter (where e.name = 'screen_view') as visits,
  coalesce(sum((e.properties ->> 'duration_seconds')::numeric)
    filter (where e.name = 'screen_time'), 0) as visible_seconds
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('screen_view', 'screen_time')
group by profile_name, area, screen
order by visible_seconds desc, visits desc;

-- 4. Social module opens, time spent inside it, and player actions.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  count(*) filter (where e.name = 'social_module_opened') as opens,
  coalesce(sum((e.properties ->> 'duration_seconds')::numeric)
    filter (where e.name = 'social_module_time'), 0) as visible_seconds,
  count(*) filter (where e.name = 'social_action') as player_actions
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('social_module_opened', 'social_module_time', 'social_action')
group by profile_name
order by visible_seconds desc;

-- 5. Social actions and major gameplay decisions each profile used.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.name as action_area,
  e.properties ->> 'action_id' as action,
  count(*) as times_used
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('social_action', 'game_action')
group by profile_name, action_area, action
order by profile_name, action_area, times_used desc;

-- 6. Every finished minigame, including duration, placement, and result.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.occurred_at,
  e.properties ->> 'game_key' as minigame,
  e.properties ->> 'source' as minigame_type,
  e.properties ->> 'game_mode' as game_mode,
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
group by profile_name, minigame, minigame_type
order by profile_name, starts desc;

-- 8. When a profile was eliminated or self-evicted, and their final season place.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.name as event,
  e.occurred_at,
  e.properties ->> 'game_mode' as game_mode,
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
group by profile_name, event, marketplace_item
order by profile_name, times desc;

-- 10. Seasons started and furthest numbered game day reached by mode.
select
  p.snapshot #>> '{profile,name}' as profile_name,
  e.properties ->> 'game_mode' as game_mode,
  count(*) filter (where e.name = 'season_started') as seasons_started,
  max((e.properties ->> 'day')::integer)
    filter (where e.name = 'season_day_reached') as furthest_day
from public.player_events e
left join public.player_profiles p on p.profile_id = e.profile_id
where e.name in ('season_started', 'season_day_reached')
group by profile_name, game_mode
order by seasons_started desc, furthest_day desc;
