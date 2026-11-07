import type { ProductEvent } from '../liveOps/productTelemetry'

const EVENT_FIELDS: Record<string, readonly string[]> = {
  screen_view: ['route'],
  game_phase_view: ['phase', 'week'],
  experiment_exposure: ['experiment', 'variant'],
  final3_appeal_shown: ['game_mode'],
  final3_appeal_selected: ['game_mode', 'appeal'],
  final3_spectator_started: [],
  final3_spectator_completed: ['winner_known'],
  session_started: ['platform', 'app_version'],
  session_active: ['active_seconds'],
  profile_created: [],
  profile_selected: [],
  season_started: ['game_mode'],
  season_completed: ['game_mode', 'week'],
  season_abandoned: ['game_mode', 'week'],
  minigame_started: ['game_key', 'game_mode', 'week'],
  minigame_completed: ['game_key', 'partial', 'won', 'score'],
  social_action: ['action_id', 'phase', 'week'],
}

const ROUTES = new Set([
  '/',
  '/game',
  '/settings',
  '/profile',
  '/profiles',
  '/profile-picker',
  '/profile/edit',
  '/profile-edit',
  '/create-player',
  '/houseguests',
  '/leaderboard',
  '/credits',
  '/week',
  '/game-over',
  '/self-evicted',
  '/rules',
  '/public-meter',
  '/store',
  '/diary-room',
  '/player-privacy',
  '/parental-consent',
  '/vox-populi-rules',
  '/quick-tap-seasons',
  '/quick-tap-experiment',
  '/legal',
  '/minigame-lab',
  '/cinematic',
])

export function sanitizeAnalyticsEvent(event: ProductEvent): ProductEvent | null {
  if (!Object.hasOwn(EVENT_FIELDS, event.name)) return null
  const properties: ProductEvent['properties'] = {}
  for (const key of EVENT_FIELDS[event.name]) {
    const value = event.properties[key]
    if (typeof value === 'number' && Number.isFinite(value)) properties[key] = value
    if (typeof value === 'boolean') properties[key] = value
    if (typeof value === 'string' && /^[a-zA-Z0-9_./#-]{1,80}$/.test(value)) properties[key] = value
  }
  if (event.name === 'screen_view') {
    const route = String(event.properties.route ?? '')
      .replace(/^#/, '')
      .split(/[?#]/)[0]
    properties.route = ROUTES.has(route) ? route : '/other'
  }
  return { ...event, properties }
}
