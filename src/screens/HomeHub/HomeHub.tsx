import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, type NavigateFunction } from 'react-router'
import { useAppSelector, useAppDispatch } from '../../store/hooks'
import { hydrateGame } from '../../store/gameSlice'
import { hydrateFinale } from '../../store/finaleSlice'
import { hydrateSocial } from '../../social/socialSlice'
import { hydratePublicOpinion } from '../../publicOpinion/publicOpinionSlice'
import { hydrateChallenge } from '../../store/challengeSlice'
import {
  selectActiveProfileId,
  selectCurrentProfile,
  selectIsGuest,
} from '../../store/profilesSlice'
import { loadSavedRunProfile, type SavedSeasonSnapshot } from '../../store/saveStatePersistence'
import { isSurvivorRunTerminal } from '../../modes/survivorRun'
import {
  canOfferSurpriseMe,
  getActiveFiniteSeason,
  getEligibleSeasonRulesets,
  getPlayableLastRun,
  pickSurpriseRuleset,
  rulesetLabel,
  type SeasonRuleset,
} from '../../modes/seasonRulesets'
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate'
import useBackgroundTheme from '../../hooks/useBackgroundTheme'
import KolequantSplash from '../../components/KolequantSplash/KolequantSplash'
import RouteLoadingScreen from '../../components/RouteLoadingScreen/RouteLoadingScreen'
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import SurvivorRulesModal from '../../components/ConfirmExitModal/SurvivorRulesModal'
import { SoundManager } from '../../services/sound/SoundManager'
import { beginGameplayAudioExit } from '../../services/sound/audioRouteOwnership'
import { trackProductEvent } from '../../services/liveOps/productTelemetry'
import { getAnalyticsGameMode } from '../../services/backend/analyticsGameMode'
import { startCreditsSoundtrackFromGesture } from '../../cinematic/audio/creditsSoundtrack'
import GameButton, { type GameButtonVariant } from '../../components/GameButton/GameButton'
import HousematesBioCinematic from '../../components/HousematesBioCinematic/HousematesBioCinematic'
import StoreProductIcon from '../../components/StoreProductModal/StoreProductIcon'
import { MYSTERY_WILDCARD_BIOS } from '../../components/HousematesBioCinematic/housematesBioData'
import useHomeHubAssets from '../../hooks/useHomeHubAssets'
import useIntroHubBackground from '../../hooks/useIntroHubBackground'
import { preloadImage } from '../../utils/preload'
import { getHolidayTheme } from '../../utils/backgroundTheme'
import { shouldShowWeatherPermissionRationale } from '../../services/locationAccess'
import {
  hasShownHomeHubSplashThisSession,
  markHomeHubSplashSeenForGame,
} from './homeHubSplashSession'
import { hasSeenSurvivorRules, markSurvivorRulesSeen } from './survivorRulesSeen'
import {
  selectRemoteIntroHubBg,
  selectRemoteIntroHubOverlay,
} from '../../remoteConfig/remoteConfigSlice'
import { buildAchievementSummary } from '../../store/achievementSummary'
import {
  selectHasCupidArrowAccess,
  selectHasSurvivalModeAccess,
  selectHasVoxPopuliAccess,
} from '../../store/vipSlice'
import { selectDebugExpansionUnlocks } from '../../store/uiSlice'
import './HomeHub.css'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

type HomeHubIconName =
  | 'play'
  | 'rules'
  | 'profile'
  | 'hall_of_fame'
  | 'market'
  | 'credits'
  | 'campaign'
  | 'survival'
  | 'housemates'
  | 'back'

function HomeHubButtonIcon({ name }: { name: HomeHubIconName }) {
  return (
    <img
      className="home-hub__button-icon"
      src={`${BASE}/assets/intro_hub_icons/${name}.svg`}
      alt=""
      draggable={false}
    />
  )
}

const HUB_BUTTONS = [
  { to: '/game', label: 'Play', icon: 'play', variant: 'primary_large' },
  { to: '/rules', label: 'Rules', icon: 'rules', variant: 'secondary_medium' },
  { to: '/profile', label: 'Profile', icon: 'profile', variant: 'secondary_medium' },
  { to: '/housemates', label: 'Hubmates', icon: 'housemates', variant: 'secondary_wide' },
  { to: '/store', label: 'Market', icon: 'market', variant: 'secondary_wide' },
  { to: '/credits', label: 'Credits', icon: 'credits', variant: 'secondary_small' },
] as const satisfies ReadonlyArray<{
  to: string
  label: string
  icon?: HomeHubIconName
  variant: GameButtonVariant
}>

type SurvivorPrompt = 'resume-or-new' | 'ended' | 'confirm-new' | null
type ExpansionSelection = 'cupidArrow' | 'voxPopuli'

interface HubAssetState {
  ready: boolean
  progress: number
  status: string
}

interface HomeHubBackgroundState {
  currentUrl: string | null
  previousUrl: string | null
  currentVisible: boolean
  ready: boolean
}

interface PlaySelectionButton {
  key: string
  label: string
  icon: ReactNode
  badge?: ReactNode
  className?: string
  variant: GameButtonVariant
  onClick: () => void
}

interface HomeHubAssetLayerProps {
  splashDone: boolean
  backgroundReady: boolean
  showWeatherPermissionRationale: boolean
  holidayTheme: ReturnType<typeof getHolidayTheme>
  playSelectionOpen: boolean
  playSelectionButtons: PlaySelectionButton[]
  onPlay: () => void
  onOpenHousemates: () => void
  onNavigate: NavigateFunction
  onAssetStateChange: (state: HubAssetState) => void
}

function HomeHubAssetLayer({
  splashDone,
  backgroundReady,
  showWeatherPermissionRationale,
  holidayTheme,
  playSelectionOpen,
  playSelectionButtons,
  onPlay,
  onOpenHousemates,
  onNavigate,
  onAssetStateChange,
}: HomeHubAssetLayerProps) {
  const {
    ready: homeHubReady,
    progress: homeHubLoadProgress,
    status: homeHubLoadStatus,
  } = useHomeHubAssets(null, splashDone)
  const assetReady = backgroundReady && homeHubReady
  const status = backgroundReady ? homeHubLoadStatus : 'Choosing the right house exterior...'
  const progress = backgroundReady ? homeHubLoadProgress : Math.min(20, homeHubLoadProgress)

  useEffect(() => {
    onAssetStateChange({
      ready: assetReady,
      progress,
      status,
    })
  }, [assetReady, onAssetStateChange, progress, status])

  return (
    <>
      <div className="homehub-content home-hub">
        <div className="home-hub__hero" aria-hidden="true" />
        {splashDone && assetReady && showWeatherPermissionRationale && (
          <p className="home-hub__weather-permission-note" role="status" aria-live="polite">
            Allow approximate location to match the Home Hub to your local weather. Coordinates go
            to Open-Meteo only to fetch weather for the background.
          </p>
        )}
        {splashDone && assetReady && (
          <nav
            className="home-hub__buttons"
            aria-label={playSelectionOpen ? 'Play menu' : 'Main menu'}
          >
            {playSelectionOpen ? (
              playSelectionButtons.map(
                ({ key, label, icon, badge, className, variant, onClick }) => (
                  <GameButton
                    key={key}
                    label={label}
                    icon={icon}
                    badge={badge}
                    className={className}
                    variant={variant}
                    onClick={onClick}
                  />
                )
              )
            ) : (
              <>
                {HUB_BUTTONS.map(({ to, label, icon, variant }) => (
                  <GameButton
                    key={to}
                    label={label}
                    icon={icon ? <HomeHubButtonIcon name={icon} /> : undefined}
                    variant={variant}
                    holidayTheme={to === '/game' ? holidayTheme : null}
                    onClick={
                      to === '/game'
                        ? onPlay
                        : to === '/housemates'
                          ? onOpenHousemates
                          : to === '/credits'
                            ? () => {
                                SoundManager.unlockFromGesture()
                                void startCreditsSoundtrackFromGesture().catch(() => {
                                  // The muted video still starts immediately if a browser rejects
                                  // soundtrack playback during route navigation.
                                })
                                onNavigate(to)
                              }
                            : to === '/store'
                              ? () => onNavigate(to, { state: { returnTo: '/' } })
                              : () =>
                                  onNavigate(
                                    to,
                                    to === '/profile' ? { state: { from: '/' } } : undefined
                                  )
                    }
                  />
                ))}
              </>
            )}
          </nav>
        )}
      </div>
    </>
  )
}

export default function HomeHub() {
  const location = useLocation()
  const routeState = location.state as {
    autoStartGame?: boolean
  } | null
  const autoStartGame = routeState?.autoStartGame === true
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const gameId = useAppSelector((state) => state.game.gameId)
  const season = useAppSelector((state) => state.game.season)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const twinShockRevealed = useAppSelector((state) => state.game.twinShockConsumed === true)
  const bellaInCurrentCast = useAppSelector((state) =>
    state.game.players.some((player) => player.id === 'bella')
  )
  const introHubPlayer = useAppSelector(
    (state) => state.game.players.find((player) => player.isUser) ?? null
  )
  const seasonArchives = useAppSelector((state) => state.game.seasonArchives ?? [])
  const ownsCupidArrow = useAppSelector(selectHasCupidArrowAccess)
  const ownsSurvivalMode = useAppSelector(selectHasSurvivalModeAccess)
  const ownsVoxPopuli = useAppSelector(selectHasVoxPopuliAccess)
  const debugExpansionUnlocks = useAppSelector(selectDebugExpansionUnlocks)
  const cupidArrowAvailable = ownsCupidArrow || debugExpansionUnlocks.cupidArrow
  const voxPopuliAvailable = ownsVoxPopuli || debugExpansionUnlocks.voxPopuli
  const eligibleSeasonRulesets = useMemo(
    () =>
      getEligibleSeasonRulesets({
        cupidArrow: cupidArrowAvailable,
        voxPopuli: voxPopuliAvailable,
      }),
    [cupidArrowAvailable, voxPopuliAvailable]
  )
  const dayCount = week
  const activeProfileId = useAppSelector(selectActiveProfileId)
  const currentProfile = useAppSelector(selectCurrentProfile)
  const isGuest = useAppSelector(selectIsGuest)
  const { url: bgUrl, requestWeatherLocation } = useBackgroundTheme()
  const playButtonHolidayTheme = getHolidayTheme(new Date())
  const remoteBgUrl = useAppSelector(selectRemoteIntroHubBg)
  const remoteOverlayOpacity = useAppSelector(selectRemoteIntroHubOverlay)
  const { url: introHubBgUrl } = useIntroHubBackground(remoteBgUrl, bgUrl)
  const achievementSummary = useMemo(
    () =>
      buildAchievementSummary({
        userPlayer: introHubPlayer,
        seasonArchives,
        day: dayCount,
        phase,
      }),
    [dayCount, introHubPlayer, phase, seasonArchives]
  )
  const effectiveBgUrl = introHubBgUrl ?? remoteBgUrl ?? bgUrl
  const [backgroundLayers, setBackgroundLayers] = useState<HomeHubBackgroundState>({
    currentUrl: null,
    previousUrl: null,
    currentVisible: false,
    ready: false,
  })
  const displayedBackgroundUrl = useRef<string | null>(null)
  const clearPreviousBackgroundTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!effectiveBgUrl) return

    let cancelled = false
    let revealTimer: number | undefined

    void preloadImage(effectiveBgUrl).then((result) => {
      if (cancelled || result.status !== 'loaded') return

      const previousUrl = displayedBackgroundUrl.current
      if (previousUrl === effectiveBgUrl) return

      displayedBackgroundUrl.current = effectiveBgUrl
      setBackgroundLayers({
        currentUrl: effectiveBgUrl,
        previousUrl,
        currentVisible: previousUrl == null,
        ready: true,
      })

      if (previousUrl) {
        if (clearPreviousBackgroundTimer.current != null) {
          window.clearTimeout(clearPreviousBackgroundTimer.current)
        }
        revealTimer = window.setTimeout(() => {
          if (displayedBackgroundUrl.current !== effectiveBgUrl) return
          setBackgroundLayers((current) => ({ ...current, currentVisible: true }))
        }, 16)
        clearPreviousBackgroundTimer.current = window.setTimeout(() => {
          if (displayedBackgroundUrl.current !== effectiveBgUrl) return
          setBackgroundLayers((current) => ({ ...current, previousUrl: null }))
          clearPreviousBackgroundTimer.current = undefined
        }, 440)
      }
    })

    return () => {
      cancelled = true
      if (revealTimer != null) window.clearTimeout(revealTimer)
    }
  }, [effectiveBgUrl])

  useEffect(
    () => () => {
      if (clearPreviousBackgroundTimer.current != null) {
        window.clearTimeout(clearPreviousBackgroundTimer.current)
      }
    },
    []
  )
  const [isInitialAppSplash] = useState(() => !hasShownHomeHubSplashThisSession())
  const [splashExitRequested, setSplashExitRequested] = useState(!isInitialAppSplash)
  const [hubAssetState, setHubAssetState] = useState<HubAssetState>({
    ready: false,
    progress: 0,
    status: 'Opening the house doors.',
  })
  const splashDone = splashExitRequested && hubAssetState.ready
  const [showWeatherPermissionRationale, setShowWeatherPermissionRationale] = useState(false)
  const preloading = autoStartGame
  const shouldRestorePlayMenu = new URLSearchParams(location.search).get('menu') === 'play'
  const [playSelectionOpen, setPlaySelectionOpen] = useState(shouldRestorePlayMenu)
  const [housematesBioOpen, setHousematesBioOpen] = useState(false)
  const [newsOpen, setNewsOpen] = useState(false)
  const [survivorPrompt, setSurvivorPrompt] = useState<SurvivorPrompt>(null)
  const [survivorRulesOpen, setSurvivorRulesOpen] = useState(false)
  const survivorRulesDismissed = hasSeenSurvivorRules(activeProfileId)
  const gameRoute = '/game'

  useEffect(() => {
    if (!splashDone || !shouldShowWeatherPermissionRationale()) return undefined

    let cancelled = false
    const rationaleTimer = window.setTimeout(() => {
      if (!cancelled) setShowWeatherPermissionRationale(true)
    }, 0)
    const requestTimer = window.setTimeout(() => {
      if (cancelled) return
      void requestWeatherLocation().finally(() => {
        if (!cancelled) setShowWeatherPermissionRationale(false)
      })
    }, 650)

    return () => {
      cancelled = true
      window.clearTimeout(rationaleTimer)
      window.clearTimeout(requestTimer)
    }
  }, [requestWeatherLocation, splashDone])

  const savedRuns = useMemo(
    () => (!isGuest && activeProfileId ? loadSavedRunProfile(activeProfileId) : null),
    [activeProfileId, isGuest]
  )
  const activeSeason = useMemo(() => getActiveFiniteSeason(savedRuns), [savedRuns])
  const activeSeasonSnapshot = activeSeason?.snapshot ?? null
  const bellaUnlocked =
    currentProfile?.bellaProgress?.unlocked === true ||
    seasonArchives.some((archive) => archive.bellaCast === true) ||
    (Boolean(activeSeasonSnapshot) && bellaInCurrentCast)
  const survivorSnapshot = savedRuns?.runs.survival ?? null
  const lastSnapshot = useMemo(() => getPlayableLastRun(savedRuns), [savedRuns])
  const hasEndedSurvivorRecord =
    !survivorSnapshot && (savedRuns?.stats.maxSurvivorDaysSurvived ?? 0) > 0

  useEffect(() => {
    const gameWindow = window as Window & { game?: Record<string, unknown> }
    gameWindow.game = gameWindow.game ?? {}
    Object.assign(gameWindow.game, {
      season,
      day: dayCount,
      week,
      phase,
      players: introHubPlayer ? [introHubPlayer] : [],
      seasonArchives,
      achievementSummary,
      twinShockConsumed: twinShockRevealed,
      bellaUnlocked,
      mysteryWildcards: MYSTERY_WILDCARD_BIOS,
      assetBase: import.meta.env.BASE_URL || '/',
    })
  }, [
    achievementSummary,
    dayCount,
    season,
    week,
    phase,
    introHubPlayer,
    seasonArchives,
    twinShockRevealed,
    bellaUnlocked,
  ])

  useEffect(() => {
    if (!autoStartGame) return
    navigate('/', { replace: true })
  }, [autoStartGame, navigate])

  useEffect(() => {
    if (!splashDone) return undefined
    const container = document.getElementById('intro-hub')
    if (!container) return undefined

    let boundNewsButton: HTMLButtonElement | null = null
    const handleNewsClick = () => setNewsOpen(true)

    const repurposeAchievementChip = (): boolean => {
      const existingNews = container.querySelector<HTMLButtonElement>('[data-hub-id="news"]')
      if (existingNews) {
        existingNews.addEventListener('click', handleNewsClick)
        boundNewsButton = existingNews
        return true
      }

      const achievementsButton = container.querySelector<HTMLButtonElement>(
        '[data-hub-id="achievements"]'
      )
      if (!achievementsButton) return false

      const newsButton = achievementsButton.cloneNode(true) as HTMLButtonElement
      newsButton.dataset.hubId = 'news'
      newsButton.setAttribute('aria-label', 'News')
      newsButton.setAttribute('title', 'News')
      const icon = newsButton.querySelector<HTMLElement>('.hub-chip__icon')
      icon?.classList.remove('hub-chip__icon--achievements')
      icon?.classList.add('hub-chip__icon--news')
      newsButton.addEventListener('click', handleNewsClick)
      achievementsButton.replaceWith(newsButton)
      boundNewsButton = newsButton
      return true
    }

    if (repurposeAchievementChip()) {
      return () => boundNewsButton?.removeEventListener('click', handleNewsClick)
    }

    const observer = new MutationObserver(() => {
      if (repurposeAchievementChip()) observer.disconnect()
    })
    observer.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      boundNewsButton?.removeEventListener('click', handleNewsClick)
    }
  }, [splashDone])

  useEffect(() => {
    if (!splashDone) return undefined
    const container = document.getElementById('intro-hub')
    if (!container) return undefined

    let replacement: HTMLButtonElement | null = null
    const replaceStoreUtility = (): boolean => {
      const current = container.querySelector<HTMLButtonElement>(
        '[data-hub-id="store"], [data-hub-id="leaderboard"]'
      )
      if (!current || current === replacement) return Boolean(replacement)

      const chip = current.cloneNode(true) as HTMLButtonElement
      chip.dataset.hubId = 'leaderboard'
      chip.setAttribute('aria-label', 'Hall of Fame')
      chip.setAttribute('title', 'Hall of Fame')
      const icon = chip.querySelector<HTMLElement>('.hub-chip__icon')
      if (icon) {
        icon.className = icon.className
          .split(/\s+/)
          .filter((className) => className && !className.startsWith('hub-chip__icon--'))
          .join(' ')
        icon.classList.add('hub-chip__icon--hall_of_fame')
        icon.style.backgroundImage = `url("${BASE}/assets/side_utilities_button/hall_of_fame_v2.svg")`
      }
      chip.addEventListener('click', () => navigate('/leaderboard'))
      current.replaceWith(chip)
      replacement = chip
      return true
    }

    if (replaceStoreUtility()) return undefined
    const observer = new MutationObserver(() => {
      if (replaceStoreUtility()) observer.disconnect()
    })
    observer.observe(container, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [navigate, splashDone])

  function hydrateSnapshot(snapshot: SavedSeasonSnapshot) {
    if (isSurvivorRunTerminal(snapshot.game)) {
      setSurvivorPrompt('ended')
      setPlaySelectionOpen(true)
      return
    }

    if (!isGuest && activeProfileId)
      trackProductEvent(
        'game_mode_selected',
        getAnalyticsGameMode(snapshot.game.mode, snapshot.game.expansionMode),
        activeProfileId
      )
    beginGameplayAudioExit()
    withRunAutosaveSuspended(() => {
      dispatch(hydrateGame(snapshot.game))
      dispatch(hydrateFinale(snapshot.finale))
      dispatch(hydrateSocial(snapshot.social))
      if (snapshot.publicOpinion) dispatch(hydratePublicOpinion(snapshot.publicOpinion))
      if (snapshot.challenge) dispatch(hydrateChallenge(snapshot.challenge))
    })
    navigate(gameRoute)
  }

  function startSeasonRun(ruleset: SeasonRuleset) {
    SoundManager.unlockFromGesture()

    if (ruleset === 'cupidArrow' && !cupidArrowAvailable) {
      openStoreFromPlayMenu()
      return
    }
    if (ruleset === 'voxPopuli' && !voxPopuliAvailable) {
      openStoreFromPlayMenu()
      return
    }
    if (activeSeasonSnapshot) {
      hydrateSnapshot(activeSeasonSnapshot)
      return
    }

    navigate(`/new-season?mode=${ruleset}`)
  }

  function openExpansion(expansion: ExpansionSelection, unlocked: boolean) {
    SoundManager.unlockFromGesture()
    if (!unlocked) {
      openStoreFromPlayMenu()
      return
    }
    startSeasonRun(expansion)
  }

  function startSurpriseSeason() {
    const ruleset = pickSurpriseRuleset(eligibleSeasonRulesets)
    if (!ruleset) return
    startSeasonRun(ruleset)
  }

  function openStoreFromPlayMenu() {
    navigate('/store', { state: { returnTo: '/?menu=play' } })
  }

  function resumeActiveSeason() {
    SoundManager.unlockFromGesture()
    if (!activeSeasonSnapshot) return
    hydrateSnapshot(activeSeasonSnapshot)
  }

  function startSurvivorRun() {
    setSurvivorPrompt(null)
    setPlaySelectionOpen(false)
    navigate('/new-season?mode=survival')
  }

  function requestSurvivorRunStart() {
    if (!survivorRulesDismissed) {
      setSurvivorRulesOpen(true)
      return
    }
    startSurvivorRun()
  }

  function handleSurvivorRulesContinue(dontShowAgain: boolean) {
    if (dontShowAgain) {
      markSurvivorRulesSeen(activeProfileId)
    }
    setSurvivorRulesOpen(false)
    startSurvivorRun()
  }

  function resumeSurvivorRun() {
    if (!survivorSnapshot) {
      setSurvivorPrompt('ended')
      return
    }
    if (!isGuest && activeProfileId)
      trackProductEvent(
        'game_mode_selected',
        getAnalyticsGameMode(survivorSnapshot.game.mode, survivorSnapshot.game.expansionMode),
        activeProfileId
      )
    setSurvivorPrompt(null)
    hydrateSnapshot(survivorSnapshot)
  }

  function openSurvivorMode() {
    SoundManager.unlockFromGesture()
    if (survivorSnapshot) {
      setSurvivorPrompt('resume-or-new')
      return
    }
    if (hasEndedSurvivorRecord) {
      setSurvivorPrompt('ended')
      return
    }
    requestSurvivorRunStart()
  }

  function continueLastRun() {
    SoundManager.unlockFromGesture()
    if (lastSnapshot?.profileId === activeProfileId) {
      try {
        hydrateSnapshot(lastSnapshot)
        return
      } catch {
        setPlaySelectionOpen(true)
      }
    }
  }

  const playSelectionButtons: PlaySelectionButton[] = []
  if (lastSnapshot) {
    playSelectionButtons.push({
      key: 'continue-last',
      label: 'Continue Last',
      icon: <HomeHubButtonIcon name="play" />,
      variant: 'primary_large',
      onClick: continueLastRun,
    })
  }

  if (activeSeason) {
    const activeRunId = activeSeasonSnapshot?.game.runId ?? activeSeasonSnapshot?.game.gameId
    const lastRunId = lastSnapshot?.game.runId ?? lastSnapshot?.game.gameId
    if (!lastSnapshot || activeRunId !== lastRunId) {
      playSelectionButtons.push({
        key: 'active-season',
        label: rulesetLabel(activeSeason.ruleset),
        icon: <HomeHubButtonIcon name="campaign" />,
        variant: 'secondary_wide',
        onClick: resumeActiveSeason,
      })
    }
  } else {
    playSelectionButtons.push(
      {
        key: 'classic',
        label: 'Classic',
        icon: <HomeHubButtonIcon name="campaign" />,
        variant: 'secondary_wide',
        onClick: () => startSeasonRun('classic'),
      },
      {
        key: 'vox-populi',
        label: 'Vox Populi',
        icon: <StoreProductIcon name="voxPopuli" className="home-hub__expansion-icon" />,
        badge: voxPopuliAvailable ? undefined : <StoreProductIcon name="vip" />,
        variant: 'secondary_wide',
        className: 'home-hub__mode-button home-hub__mode-button--vox',
        onClick: () => openExpansion('voxPopuli', voxPopuliAvailable),
      },
      {
        key: 'cupid-arrow',
        label: "Cupid's Arrow",
        icon: <StoreProductIcon name="cupidArrow" className="home-hub__expansion-icon" />,
        badge: cupidArrowAvailable ? undefined : <StoreProductIcon name="vip" />,
        variant: 'secondary_wide',
        className: 'home-hub__mode-button home-hub__mode-button--cupid',
        onClick: () => openExpansion('cupidArrow', cupidArrowAvailable),
      }
    )

    if (canOfferSurpriseMe(eligibleSeasonRulesets)) {
      playSelectionButtons.push({
        key: 'surprise-me',
        label: 'Surprise Me',
        icon: <HomeHubButtonIcon name="campaign" />,
        variant: 'secondary_wide',
        className: 'home-hub__mode-button',
        onClick: startSurpriseSeason,
      })
    }
  }

  playSelectionButtons.push(
    {
      key: 'survival',
      label: 'Surveyeval',
      icon: <HomeHubButtonIcon name="survival" />,
      badge: ownsSurvivalMode ? undefined : <StoreProductIcon name="vip" />,
      variant: 'secondary_wide',
      className: 'home-hub__mode-button home-hub__mode-button--surveyeval',
      onClick: () => {
        SoundManager.unlockFromGesture()
        if (!ownsSurvivalMode) {
          openStoreFromPlayMenu()
          return
        }
        openSurvivorMode()
      },
    },
    {
      key: 'back',
      label: 'Back',
      icon: <HomeHubButtonIcon name="back" />,
      variant: 'secondary_medium',
      onClick: () => setPlaySelectionOpen(false),
    }
  )

  const handlePlay = () => {
    SoundManager.unlockFromGesture()
    setPlaySelectionOpen(true)
  }

  const handleHubAssetStateChange = useCallback((nextState: HubAssetState) => {
    setHubAssetState((current) => {
      if (
        current.ready === nextState.ready &&
        current.progress === nextState.progress &&
        current.status === nextState.status
      ) {
        return current
      }
      return nextState
    })
  }, [])

  const handleSplashFinish = useCallback(() => {
    setSplashExitRequested(true)
  }, [])

  useEffect(() => {
    if (!hubAssetState.ready) return
    // Make a best-effort start as soon as Intro Hub loading reaches 100%.
    // Native builds and permissive browser sessions start immediately; if a
    // browser rejects autoplay, SoundManager retains its first-gesture retry.
    SoundManager.unlockOnUserGesture()
  }, [hubAssetState.ready])

  useEffect(() => {
    if (!splashDone) return
    markHomeHubSplashSeenForGame(gameId)
  }, [gameId, splashDone])

  return (
    <>
      {!splashDone &&
        (isInitialAppSplash ? (
          <KolequantSplash
            duration={5000}
            ready={hubAssetState.ready}
            progress={hubAssetState.progress}
            status={hubAssetState.status}
            onFinish={handleSplashFinish}
          />
        ) : (
          <RouteLoadingScreen />
        ))}

      {preloading && <AssetPreloaderOverlay destination={gameRoute} />}

      {housematesBioOpen && (
        <HousematesBioCinematic onComplete={() => setHousematesBioOpen(false)} />
      )}

      <ConfirmExitModal
        open={newsOpen}
        title="News"
        description="No new updates right now. New features, modes, and major game changes will appear here."
        confirmLabel="Close"
        showCancel={false}
        onConfirm={() => setNewsOpen(false)}
        onCancel={() => setNewsOpen(false)}
      />

      <ConfirmExitModal
        open={survivorPrompt === 'resume-or-new'}
        title="Surveyeval Mode"
        description="Resume your saved run or start over?"
        confirmLabel="Resume"
        secondaryLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={resumeSurvivorRun}
        onSecondary={() => setSurvivorPrompt('confirm-new')}
        onCancel={() => setSurvivorPrompt(null)}
      />

      <ConfirmExitModal
        open={survivorPrompt === 'ended'}
        title="Surveyeval Mode"
        description="Your previous Surveyeval run has ended."
        confirmLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={requestSurvivorRunStart}
        onCancel={() => {
          setSurvivorPrompt(null)
          setPlaySelectionOpen(false)
        }}
      />

      <ConfirmExitModal
        open={survivorPrompt === 'confirm-new'}
        title="Start new Surveyeval run?"
        description="This will replace your saved Surveyeval run only. Your active season will not be affected."
        confirmLabel="Start New"
        cancelLabel="Cancel"
        onConfirm={requestSurvivorRunStart}
        onCancel={() => setSurvivorPrompt('resume-or-new')}
      />

      {survivorRulesOpen && (
        <SurvivorRulesModal
          open={survivorRulesOpen}
          onContinue={handleSurvivorRulesContinue}
          onCancel={() => setSurvivorRulesOpen(false)}
        />
      )}

      <div className="homehub-shell">
        <div className="homehub-frame">
          {backgroundLayers.previousUrl && (
            <div
              className={`homehub-intro-bg homehub-intro-bg--previous${backgroundLayers.currentVisible ? ' homehub-intro-bg--fading' : ''}`}
              style={{ backgroundImage: `url("${backgroundLayers.previousUrl}")` }}
              aria-hidden="true"
            />
          )}
          {backgroundLayers.currentUrl && (
            <div
              className={`homehub-intro-bg homehub-intro-bg--active${backgroundLayers.currentVisible ? ' homehub-intro-bg--visible' : ''}`}
              style={{ backgroundImage: `url("${backgroundLayers.currentUrl}")` }}
              aria-hidden="true"
            />
          )}

          {remoteOverlayOpacity != null && remoteOverlayOpacity > 0 && (
            <div
              className="homehub-remote-overlay"
              style={{ opacity: remoteOverlayOpacity }}
              aria-hidden="true"
            />
          )}

          <HomeHubAssetLayer
            splashDone={splashDone}
            backgroundReady={backgroundLayers.ready}
            showWeatherPermissionRationale={showWeatherPermissionRationale}
            holidayTheme={playButtonHolidayTheme}
            playSelectionOpen={playSelectionOpen}
            playSelectionButtons={playSelectionButtons}
            onPlay={handlePlay}
            onOpenHousemates={() => {
              SoundManager.unlockFromGesture()
              setHousematesBioOpen(true)
            }}
            onNavigate={navigate}
            onAssetStateChange={handleHubAssetStateChange}
          />

          <div id="intro-hub" />
        </div>
      </div>
    </>
  )
}
