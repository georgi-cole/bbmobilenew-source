import { trackProductEvent } from '../liveOps/productTelemetry'
import { setAnalyticsRouteScreen } from './gameplayAnalyticsMiddleware'

type AnalyticsRouteSource = {
  getPathname: () => string
  getProfileId: () => string | null
  subscribeRoute: (listener: () => void) => () => void
  subscribeProfile: (listener: () => void) => () => void
}

const GAME_SCREENS = new Set([
  'game',
  'week',
  'houseguests',
  'create-player',
  'game-over',
  'self-evicted',
  'diary-room',
  'confessional',
  'leaderboard',
  'public-meter',
])

function screenGroup(screenId: string): string {
  if (screenId === 'store') return 'marketplace'
  if (GAME_SCREENS.has(screenId)) return 'gameplay'
  if (screenId.includes('profile') || screenId === 'dressing-room') return 'profiles'
  if (screenId === 'settings') return 'settings'
  if (screenId === 'legal' || screenId === 'rules' || screenId === 'credits') return 'information'
  if (screenId === 'home' || screenId === 'not-found') return 'home'
  return 'menu'
}

function resolveScreenId(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean).at(-1) ?? 'home'
  return /^[a-z0-9-]{1,60}$/i.test(segment) ? segment.toLowerCase() : 'other'
}

/** Track visits and visible time on static app screens, linked to the selected profile. */
export function setupRouteAnalytics(source: AnalyticsRouteSource): () => void {
  let screenId = resolveScreenId(source.getPathname())
  let profileId = source.getProfileId()
  let visibleSince = document.visibilityState === 'visible' ? Date.now() : null
  let visibleMilliseconds = 0

  const flushVisibleTime = () => {
    if (visibleSince != null) {
      visibleMilliseconds += Math.max(0, Date.now() - visibleSince)
      visibleSince = null
    }
    const durationSeconds = Math.floor(visibleMilliseconds / 1000)
    if (profileId && durationSeconds > 0)
      trackProductEvent(
        'screen_time',
        {
          screen_id: screenId,
          screen_group: screenGroup(screenId),
          duration_seconds: durationSeconds,
        },
        profileId
      )
    visibleMilliseconds = 0
  }

  const startVisibleTime = () => {
    if (document.visibilityState === 'visible' && visibleSince == null) visibleSince = Date.now()
  }

  const emitScreenView = () => {
    setAnalyticsRouteScreen(screenId)
    if (profileId)
      trackProductEvent(
        'screen_view',
        { screen_id: screenId, screen_group: screenGroup(screenId) },
        profileId
      )
    startVisibleTime()
  }

  const reconcile = () => {
    const nextScreenId = resolveScreenId(source.getPathname())
    const nextProfileId = source.getProfileId()
    if (nextScreenId === screenId && nextProfileId === profileId) return
    flushVisibleTime()
    screenId = nextScreenId
    profileId = nextProfileId
    emitScreenView()
  }

  emitScreenView()
  const unsubscribeRoute = source.subscribeRoute(reconcile)
  const unsubscribeProfile = source.subscribeProfile(reconcile)
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flushVisibleTime()
    else startVisibleTime()
  }
  const onPageHide = () => flushVisibleTime()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)

  return () => {
    flushVisibleTime()
    unsubscribeRoute()
    unsubscribeProfile()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
  }
}
