begin;

alter table public.player_events
  drop constraint if exists player_events_name_check;

alter table public.player_events
  add constraint player_events_name_check check (name = any (array[
    'screen_view'::text,
    'screen_time'::text,
    'game_phase_view'::text,
    'experiment_exposure'::text,
    'final3_appeal_shown'::text,
    'final3_appeal_selected'::text,
    'final3_spectator_started'::text,
    'final3_spectator_completed'::text,
    'session_started'::text,
    'session_active'::text,
    'game_mode_selected'::text,
    'profile_created'::text,
    'profile_selected'::text,
    'character_selected'::text,
    'season_started'::text,
    'season_day_reached'::text,
    'player_eliminated'::text,
    'self_eviction'::text,
    'season_completed'::text,
    'season_abandoned'::text,
    'tribunal_action'::text,
    'minigame_started'::text,
    'minigame_completed'::text,
    'minigame_exited'::text,
    'social_module_opened'::text,
    'social_module_time'::text,
    'social_module_closed'::text,
    'social_action'::text,
    'game_action'::text,
    'store_shelf_selected'::text,
    'store_product_selected'::text,
    'store_purchase_started'::text,
    'store_purchase_completed'::text,
    'store_purchase_failed'::text,
    'eyeolean_purchase_completed'::text,
    'install_attribution'::text
  ]));

comment on column public.player_events.properties is
  'Allowlisted pseudonymous event details. Install attribution stores source/campaign labels and click-id presence only; raw gclid/gbraid values and location are not stored.';

commit;
