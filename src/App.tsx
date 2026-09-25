/**
 * App.tsx — root component.
 *
 * Wraps the entire app in:
 *   <Provider store>  – Redux store provider
 *   <I18nProvider>     – resolved language, messages, and locale formatting
 *   <RouterProvider>  – React Router v6 browser router
 *
 * To add global providers (auth, theme, etc.) wrap them here.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router/dom'
import { store } from './store/store'
import { router } from './routes'
import { SoundManager } from './services/sound/SoundManager'
import AudioStateSync from './services/sound/AudioStateSync'
import RouteLoopAudioSync from './services/sound/RouteLoopAudioSync'
import { getAudioRouteHash, subscribeToAudioRoute } from './services/sound/audioRouteLocation'
import AudioGate from './components/AudioGate/AudioGate'
import { loadRemoteConfig } from './remoteConfig/remoteConfigSlice'
import { refreshSeasonDirectorPlan } from './store/gameSlice'
import { installGameDiagnostics } from './services/diagnostics/gameDiagnostics'
import LiveOpsController from './components/LiveOpsController/LiveOpsController'
import VipEntitlementSync from './components/VipEntitlementSync/VipEntitlementSync'
import DepressionShockController from './components/DepressionShockController/DepressionShockController'
import WeatherController from './weather/WeatherController'
import WeatherBulletinOverlay from './weather/WeatherBulletinOverlay'
import WeatherRosterReveal from './weather/WeatherRosterReveal'
import SeasonStartOnboardingController from './onboarding/SeasonStartOnboardingController'
import FauxTvProgrammingController from './broadcasting/FauxTvProgrammingController'
import { I18nProvider } from './i18n'
import './styles/gameCopyPolish.css'
import './styles/performanceOverrides.css'
import './styles/majorityRulesFinalDuel.css'

const IS_PUBLIC_QA_BUILD = import.meta.env.VITE_VIP_DEV_ENTITLEMENT === 'true'

if (import.meta.env.DEV) {
  console.log(
    '[router] bundle:',
    import.meta.url,
    '| pathname:',
    window.location.pathname,
    '| hash:',
    window.location.hash
  )
}

export default function App() {
  // The router commits in-app navigation with history.pushState, which does
  // not fire `hashchange`. Subscribe to the router itself so audio always sees
  // the same location as the rendered screen.
  const hash = useSyncExternalStore(
    (notify) => subscribeToAudioRoute(router, notify),
    () => getAudioRouteHash(router.state.location),
    () => '#/'
  )

  useEffect(() => {
    if (!IS_PUBLIC_QA_BUILD) return undefined
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow, noarchive'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  useEffect(() => {
    installGameDiagnostics()
    void SoundManager.init()
    const refreshRemoteConfig = async () => {
      await store.dispatch(loadRemoteConfig())
      // A fresh install creates the initial Season 1 state before the async
      // live-config request returns. Attach the Director only while that season
      // is still untouched; active/saved seasons keep their original snapshot.
      store.dispatch(refreshSeasonDirectorPlan())
    }
    void refreshRemoteConfig()
    const refreshId = window.setInterval(
      () => {
        void refreshRemoteConfig()
      },
      5 * 60 * 1000
    )
    return () => window.clearInterval(refreshId)
  }, [])

  return (
    <Provider store={store}>
      <I18nProvider>
        {IS_PUBLIC_QA_BUILD && (
          <div className="public-qa-banner" role="status">
            QA
          </div>
        )}
        <LiveOpsController />
        <FauxTvProgrammingController />
        <WeatherController />
        <WeatherBulletinOverlay />
        <WeatherRosterReveal />
        <SeasonStartOnboardingController />
        <DepressionShockController />
        <AudioStateSync hash={hash} />
        <RouteLoopAudioSync hash={hash} />
        <VipEntitlementSync />
        <AudioGate />
        <RouterProvider router={router} />
      </I18nProvider>
    </Provider>
  )
}
