-- Apply after 202610270002_profile_linked_analytics.sql.
alter table public.player_events drop constraint if exists player_events_name_check;
alter table public.player_events add constraint player_events_name_check check (name in (
  'screen_view', 'screen_time', 'game_phase_view', 'experiment_exposure',
  'final3_appeal_shown', 'final3_appeal_selected', 'final3_spectator_started',
  'final3_spectator_completed', 'session_started', 'session_active', 'game_mode_selected',
  'profile_created', 'profile_selected', 'character_selected',
  'season_started', 'season_day_reached', 'player_eliminated', 'self_eviction',
  'season_completed', 'season_abandoned', 'minigame_started', 'minigame_completed',
  'minigame_exited', 'social_module_opened', 'social_module_time', 'social_module_closed',
  'social_action', 'game_action', 'store_shelf_selected', 'store_product_selected',
  'store_purchase_started', 'store_purchase_completed', 'store_purchase_failed',
  'eyeolean_purchase_completed'
));
