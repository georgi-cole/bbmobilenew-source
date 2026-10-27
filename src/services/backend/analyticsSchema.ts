import type { ProductEvent } from '../liveOps/productTelemetry'

const EVENT_FIELDS: Record<string, readonly string[]> = {
  session_started: ['platform', 'app_version'],
  session_active: ['active_seconds'],
  screen_view: ['screen_id', 'screen_group'],
  screen_time: ['screen_id', 'screen_group', 'duration_seconds'],
  game_phase_view: ['phase', 'week'],
  experiment_exposure: ['experiment', 'variant'],
  final3_appeal_shown: ['game_mode'],
  final3_appeal_selected: ['game_mode', 'appeal'],
  final3_spectator_started: ['minigame_id', 'variant', 'presentation', 'placement'],
  final3_spectator_completed: ['winner_known'],
  profile_created: [],
  profile_selected: [],
  character_selected: ['character_id'],
  season_started: ['game_mode', 'week', 'day', 'phase', 'season_index'],
  season_day_reached: ['game_mode', 'day', 'phase'],
  player_eliminated: [
    'game_mode',
    'week',
    'day',
    'phase',
    'placement',
    'player_status',
    'elimination_type',
  ],
  self_eviction: ['game_mode', 'week', 'day', 'phase', 'placement'],
  season_completed: [
    'game_mode',
    'week',
    'day',
    'season_index',
    'placement',
    'total_players',
    'days_alive',
    'made_jury',
    'was_evicted',
  ],
  season_abandoned: ['game_mode', 'week', 'day'],
  minigame_started: ['game_key', 'game_mode', 'week', 'day', 'phase', 'source', 'minigame_id'],
  minigame_completed: [
    'game_key',
    'game_mode',
    'week',
    'day',
    'phase',
    'source',
    'minigame_id',
    'partial',
    'won',
    'score',
    'duration_seconds',
    'placement',
    'participant_count',
    'last_place',
  ],
  minigame_exited: [
    'game_key',
    'game_mode',
    'week',
    'day',
    'phase',
    'source',
    'minigame_id',
    'partial',
    'duration_seconds',
    'exit_reason',
    'won',
    'score',
    'placement',
    'participant_count',
    'last_place',
  ],
  social_module_opened: ['game_mode', 'week', 'day', 'phase', 'module_session_id'],
  social_module_time: [
    'game_mode',
    'week',
    'day',
    'phase',
    'module_session_id',
    'duration_seconds',
  ],
  social_module_closed: ['game_mode', 'week', 'day', 'phase', 'module_session_id', 'close_reason'],
  social_action: ['action_id', 'game_mode', 'phase', 'week', 'day'],
  game_action: ['action_id', 'game_mode', 'phase', 'week', 'day'],
  store_shelf_selected: ['shelf_id'],
  store_product_selected: ['product_key'],
  store_purchase_started: ['product_key'],
  store_purchase_completed: ['product_key'],
  store_purchase_failed: ['product_key'],
  eyeolean_purchase_completed: ['item_key', 'game_mode', 'week', 'day'],
}

export function sanitizeAnalyticsEvent(event: ProductEvent): ProductEvent | null {
  const allowed = EVENT_FIELDS[event.name]
  if (!allowed) return null
  const properties: ProductEvent['properties'] = {}
  for (const key of allowed) {
    const value = event.properties[key]
    if (typeof value === 'number' && Number.isFinite(value)) properties[key] = value
    else if (typeof value === 'boolean') properties[key] = value
    else if (typeof value === 'string' && /^[a-zA-Z0-9_./#-]{1,80}$/.test(value))
      properties[key] = value
  }
  return { ...event, properties }
}
