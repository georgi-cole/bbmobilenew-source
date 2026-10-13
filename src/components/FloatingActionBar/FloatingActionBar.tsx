import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from 'react-redux'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { finishWeekendDebugPreview } from '../../features/weekend/weekendDebugPreview'
import {
  advance,
  advanceWeekendSeasonFact,
  advanceWeekendDay,
  beginWeekendDayTransition,
  completeWeekendInterlude,
  continueHubSays,
  continueWeekendFeature,
  submitHubSaysVote,
  continueSurvivorAfterAd,
  hydrateGame,
  revealSurvivorReplacement,
  setHasSeenConfessionalSpotlight,
  resetGame,
} from '../../store/gameSlice'
import {
  openIncomingInbox,
  openSocialPanel,
  selectEnergyBank,
  selectPendingIncomingInteractionCount,
} from '../../social/socialSlice'
import {
  allianceRequestDecisionActors,
  isPendingAllianceRequest,
} from '../../social/reality/allianceManagement'
import { selectAllDirections } from '../../publicOpinion'
import {
  selectAdvanceEnabled,
  selectIsWaitingForInput,
  selectConfessionalAlertCount,
  selectHumanCanUseSocialModules,
  selectHumanCanUseIncomingSocialModule,
} from '../../store/selectors'
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import {
  getBlockedSocialModuleAnnouncementMessage,
  getIncomingSocialModuleAvailability,
  getSocialModuleAvailability,
  logBlockedSocialModuleOpen,
  type SocialModuleAvailability,
} from '../../social/socialModuleAvailability'
import { selectActiveProfileId, selectIsGuest } from '../../store/profilesSlice'
import {
  clearSavedRun,
  clearSeasonSnapshot,
  createSavedSeasonSnapshot,
  flushSavePersistence,
  getSavedRunSlot,
  loadSavedRunProfile,
  retrySavePersistenceWrites,
  savedStateKeyForProfile,
  saveRunSnapshot,
} from '../../store/saveStatePersistence'
import {
  createSurvivorRun,
  getSurvivorCurrentDay,
  isSurvivorRunTerminal,
} from '../../modes/survivorRun'
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal'
import AdPrompt from '../AdPrompt/AdPrompt'
import GameControlDock from '../GameControlDock/GameControlDock'
import { openBugReportFromGame } from '../../utils/openBugReport'
import ConfessionalSpotlightOverlay from './ConfessionalSpotlightOverlay'
import { resolveBalancedDockBottom } from './floatingActionBarLayout'
import { resolvePublicMeterDestination } from './publicMeterNavigation'
import type { RootState } from '../../store/store'

const CONFESSIONAL_FLASH_DURATION_MS = 1800
const SURVIVOR_DISABLED_MESSAGE_MS = 5000

type FloatingActionBarProps = {
  /** Called when the player activates Public Meter while public mode is disabled. */
  onPublicMeterBlocked?: () => void
  /** Called when the player activates a blocked social module. */
  onSocialModuleBlocked?: (availability: SocialModuleAvailability) => void
  /** Keep the shared Play control above a finale scene and route only that control. */
  finaleOverlayActive?: boolean
  /** Route the shared Play control to a faux-TV story beat while leaving dock navigation enabled. */
  finaleInlinePlayActive?: boolean
  finalePlayAvailable?: boolean
  /** Show the shared dock above spectator broadcasts that wait for Play input. */
  finaleDockOnTop?: boolean
}

/**
 * FloatingActionBar — BitLife-style mobile FAB for the Game screen.
 *
 * Layout:
 *   [Social] [Actions]  ●Play●  [Public Meter] [Diary Room]
 *
 * - Center button dispatches advance(); pulses when actionable; disabled when
 *   waiting for human input (replacement nominee, Final 4 POS vote, Final 3 LOH eviction).
 * - Left side: Social module + incoming social actions.
 * - Right side: Public Meter hook + Diary Room shortcut.
 */
export default function FloatingActionBar({
  onPublicMeterBlocked,
  onSocialModuleBlocked,
  finaleOverlayActive = false,
  finaleInlinePlayActive = false,
  finalePlayAvailable = false,
  finaleDockOnTop = false,
}: FloatingActionBarProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const reduxStore = useStore<RootState>()
  const canAdvance = useAppSelector(selectAdvanceEnabled)
  const isWaiting = useAppSelector(selectIsWaitingForInput)
  const pendingCount = useAppSelector(selectPendingIncomingInteractionCount)
  const pendingAllianceDecisionCount = useAppSelector((state) => {
    const humanId = state.game.players.find((player) => player.isUser)?.id
    if (!humanId) return 0
    return Object.values(state.social.reality.allianceManagement?.requests ?? {}).filter(
      (request) =>
        isPendingAllianceRequest(request) &&
        allianceRequestDecisionActors(request).includes(humanId)
    ).length
  })
  const confessionalAlertCount = useAppSelector(selectConfessionalAlertCount)
  const canUseSocialModules = useAppSelector(selectHumanCanUseSocialModules)
  const canUseIncomingSocialModule = useAppSelector(selectHumanCanUseIncomingSocialModule)
  const activeConfessionalDecision = useAppSelector(selectActiveConfessionalDecision)
  const activeProfileId = useAppSelector(selectActiveProfileId)
  const isGuest = useAppSelector(selectIsGuest)
  const game = useAppSelector((s) => s.game)
  const weekend = game.weekendInterlude
  const canPersistActiveRun = !isGuest && Boolean(activeProfileId) && weekend?.debug !== true
  const weekendSocialActive = weekend?.active === true && weekend.stage === 'social'
  const weekendSocialSpotlightKey = weekendSocialActive
    ? `${game.gameId ?? game.season}:${weekend.afterDay}`
    : null
  const hubSaysBeat = weekend?.hubSays?.beat ?? 'question'
  const weekendPlayReady =
    !weekend?.active ||
    weekend.stage !== 'hub_says' ||
    hubSaysBeat === 'result' ||
    Boolean(weekend.hubSays?.selectedPlayerId)
  const currentRunSlot = getSavedRunSlot(game)
  const players = useAppSelector((s) => s.game.players)
  const energyBank = useAppSelector(selectEnergyBank)
  const directions = useAppSelector(selectAllDirections)
  const advanceProgressKey = [
    game.phase,
    game.aiReplacementStep ?? 0,
    game.aiReplacementWaiting ? 'waiting-for-replacement-render' : 'replacement-ready',
    game.specialVeto?.vipUseStage ?? 0,
    game.voxPopuli?.finalThreePacingSeen?.join(',') ?? 'no-final-three-pacing',
    isWaiting ? 'waiting-for-input' : 'ready',
    weekend?.active ? `${weekend.afterDay}:${weekend.stage}:${weekend.weekendDay}` : 'no-weekend',
  ].join(':')
  const advancedProgressRef = useRef<string | null>(null)
  useEffect(() => {
    advancedProgressRef.current = null
  }, [advanceProgressKey])
  const isSurvivorMode = game.mode === 'survival'
  const survivorReplacementPending =
    isSurvivorMode &&
    game.modeSpecific?.kind === 'survival' &&
    Boolean(game.modeSpecific.replacementPending)
  const survivorReplacementTransitionActive =
    isSurvivorMode &&
    game.modeSpecific?.kind === 'survival' &&
    Boolean(game.modeSpecific.replacementTransition)
  const survivorTerminalActive = isSurvivorRunTerminal(game)
  const battleBackAnnouncementActive =
    game.battleBack?.active === true && game.battleBack.competitionActive !== true
  const voxPopuliActive = game.voxPopuli?.status === 'active'
  const voxTransitionOwnsPlay =
    game.voxPopuli?.awaitingPublicVote === true || game.voxPopuli?.finaleStage === 'ready'

  const humanPlayer = players.find((p) => p.isUser)
  const humanEnergy = humanPlayer ? (energyBank?.[humanPlayer.id] ?? 0) : null
  const publicRequestCount = useMemo(
    () =>
      humanPlayer
        ? directions.filter(
            (direction) => direction.playerId === humanPlayer.id && direction.status === 'active'
          ).length
        : 0,
    [directions, humanPlayer]
  )
  const socialModuleAvailability = useMemo(() => getSocialModuleAvailability(game), [game])
  const incomingSocialModuleAvailability = useMemo(
    () => getIncomingSocialModuleAvailability(game),
    [game]
  )
  const socialModulesUnavailable = !canUseSocialModules || (weekend?.active && !weekendSocialActive)
  const incomingSocialModuleUnavailable =
    !canUseIncomingSocialModule || (weekend?.active && !weekendSocialActive)
  const survivorDay = getSurvivorCurrentDay(game)
  const bestSurvivorRecord = useMemo(
    () =>
      !isGuest && activeProfileId
        ? loadSavedRunProfile(activeProfileId).stats.maxSurvivorDaysSurvived
        : 0,
    [activeProfileId, isGuest]
  )
  const survivorEndDescription =
    bestSurvivorRecord > survivorDay
      ? `You were eliminated on Day ${survivorDay}. Best survival record: ${bestSurvivorRecord} days.`
      : `You were eliminated on Day ${survivorDay}.`

  // Flash the social button whenever the human player's energy changes.
  const [isFlashing, setIsFlashing] = useState(false)
  const [blockedAnnouncement, setBlockedAnnouncement] = useState<{
    id: number
    message: string
  } | null>(null)
  const [showSurvivorAdContinue, setShowSurvivorAdContinue] = useState(false)
  const [homeConfirmOpen, setHomeConfirmOpen] = useState(false)
  const prevEnergyRef = useRef(humanEnergy)
  useEffect(() => {
    if (humanEnergy === null || humanEnergy === prevEnergyRef.current) {
      prevEnergyRef.current = humanEnergy
      return
    }
    prevEnergyRef.current = humanEnergy
    // Defer to avoid synchronous setState inside an effect body.
    const flashOn = setTimeout(() => setIsFlashing(true), 0)
    const flashOff = setTimeout(() => setIsFlashing(false), 600)
    return () => {
      clearTimeout(flashOn)
      clearTimeout(flashOff)
    }
  }, [humanEnergy])

  useEffect(() => {
    if (!blockedAnnouncement) return undefined
    const timeout = window.setTimeout(() => {
      setBlockedAnnouncement((current) => (current?.id === blockedAnnouncement.id ? null : current))
    }, SURVIVOR_DISABLED_MESSAGE_MS)
    return () => window.clearTimeout(timeout)
  }, [blockedAnnouncement])

  const showSurvivorBlockedMessage = useCallback((message: string | null) => {
    if (!message) return
    setBlockedAnnouncement({ id: Date.now(), message })
  }, [])

  const [isConfessionalFlashing, setIsConfessionalFlashing] = useState(false)
  const [confessionalFlashTick, setConfessionalFlashTick] = useState(0)
  const [triggeredConfessionalDecisionKey, setTriggeredConfessionalDecisionKey] = useState<
    string | null
  >(null)
  const [showConfessionalSpotlight, setShowConfessionalSpotlight] = useState(false)
  const [showSecretMissionRewardSpotlight, setShowSecretMissionRewardSpotlight] = useState(false)
  const [showWeekendSocialSpotlight, setShowWeekendSocialSpotlight] = useState(false)
  const [weekendSocialBadgeFill, setWeekendSocialBadgeFill] = useState<{
    key: string
    count: number
  } | null>(null)
  const confessionalIconRef = useRef<HTMLImageElement | null>(null)
  const socialIconRef = useRef<HTMLButtonElement | null>(null)
  const [completedWeekendSocialSpotlightKey, setCompletedWeekendSocialSpotlightKey] = useState<
    string | null
  >(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const prevConfessionalCountRef = useRef(confessionalAlertCount)
  const hasPendingConfessionalDecision = !isSurvivorMode && activeConfessionalDecision !== null
  const secretMissionRewardPendingKey =
    !isSurvivorMode && game.secretMission?.status === 'rewardPending'
      ? `${game.secretMission.templateId}:${game.secretMission.triggeredDay}:${game.secretMission.missionNumber ?? ''}`
      : null
  const previousSecretMissionRewardPendingKeyRef = useRef<string | null>(null)
  const hasSeenConfessionalSpotlight = game.hasSeenConfessionalSpotlight === true
  const activeConfessionalDecisionKey = activeConfessionalDecision
    ? `${activeConfessionalDecision.type}:${activeConfessionalDecision.week}:${activeConfessionalDecision.phase}`
    : null

  useEffect(() => {
    const key = weekendSocialSpotlightKey
    if (key === null) {
      const resetCompleted =
        weekend?.active &&
        weekend.weekendDay === 1 &&
        ['intro', 'instructions', 'hub_says', 'party', 'season_so_far'].includes(weekend.stage)
      const resetFrame = window.requestAnimationFrame(() => {
        setWeekendSocialBadgeFill(null)
        setShowWeekendSocialSpotlight(false)
        if (resetCompleted) setCompletedWeekendSocialSpotlightKey(null)
      })
      return () => window.cancelAnimationFrame(resetFrame)
    }
    if (completedWeekendSocialSpotlightKey === key) return undefined

    const startedAt = performance.now()
    let frameId = 0
    let previousCount = -1
    const animateBadge = (now: number) => {
      if (previousCount === -1) setShowWeekendSocialSpotlight(true)
      const progress = Math.min((now - startedAt) / 1200, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      const count = Math.round(easedProgress * 30)
      if (count !== previousCount) {
        previousCount = count
        setWeekendSocialBadgeFill({ key, count })
      }
      if (progress < 1) {
        frameId = window.requestAnimationFrame(animateBadge)
      } else {
        setCompletedWeekendSocialSpotlightKey(key)
        setWeekendSocialBadgeFill(null)
      }
    }
    frameId = window.requestAnimationFrame(animateBadge)

    return () => window.cancelAnimationFrame(frameId)
  }, [
    weekend?.active,
    weekend?.weekendDay,
    weekend?.stage,
    weekendSocialSpotlightKey,
    completedWeekendSocialSpotlightKey,
  ])

  const completeWeekendSocialSpotlight = useCallback(() => {
    setShowWeekendSocialSpotlight(false)
  }, [])
  useEffect(() => {
    if (confessionalAlertCount <= prevConfessionalCountRef.current) {
      prevConfessionalCountRef.current = confessionalAlertCount
      return
    }

    prevConfessionalCountRef.current = confessionalAlertCount
    const flashOn = setTimeout(() => {
      setConfessionalFlashTick((tick) => tick + 1)
      setIsConfessionalFlashing(true)
    }, 0)
    const flashOff = setTimeout(
      () => setIsConfessionalFlashing(false),
      CONFESSIONAL_FLASH_DURATION_MS
    )
    return () => {
      clearTimeout(flashOn)
      clearTimeout(flashOff)
    }
  }, [confessionalAlertCount])
  const confessionalPromptActivated =
    activeConfessionalDecisionKey !== null &&
    triggeredConfessionalDecisionKey === activeConfessionalDecisionKey
  const primaryDisabled = weekend?.active
    ? !weekendPlayReady
    : finaleOverlayActive
      ? !finalePlayAvailable
      : finaleInlinePlayActive
        ? !finalePlayAvailable
        : survivorTerminalActive ||
          survivorReplacementTransitionActive ||
          (survivorReplacementPending
            ? false
            : hasPendingConfessionalDecision
              ? confessionalPromptActivated
              : isWaiting)
  const primaryPulse = finaleOverlayActive
    ? finalePlayAvailable
    : finaleInlinePlayActive
      ? finalePlayAvailable
      : survivorTerminalActive
        ? false
        : weekend?.active
          ? weekendPlayReady
          : hasPendingConfessionalDecision
            ? !confessionalPromptActivated
            : survivorReplacementPending || (canAdvance && !isWaiting)
  const confessionalPersistentFlash = hasPendingConfessionalDecision && confessionalPromptActivated
  const confessionalSpotlightEligible =
    hasPendingConfessionalDecision && confessionalPromptActivated && !hasSeenConfessionalSpotlight

  useEffect(() => {
    if (secretMissionRewardPendingKey === null) {
      previousSecretMissionRewardPendingKeyRef.current = null
      const hideTimer = window.setTimeout(() => setShowSecretMissionRewardSpotlight(false), 0)
      return () => window.clearTimeout(hideTimer)
    }
    if (previousSecretMissionRewardPendingKeyRef.current === secretMissionRewardPendingKey) return
    previousSecretMissionRewardPendingKeyRef.current = secretMissionRewardPendingKey
    const showTimer = window.setTimeout(() => setShowSecretMissionRewardSpotlight(true), 0)
    return () => window.clearTimeout(showTimer)
  }, [secretMissionRewardPendingKey])

  const completeConfessionalSpotlight = useCallback(() => {
    setShowConfessionalSpotlight(false)
    if (!hasSeenConfessionalSpotlight) {
      dispatch(setHasSeenConfessionalSpotlight(true))
    }
  }, [dispatch, hasSeenConfessionalSpotlight])

  const handleChatClick = useCallback(() => {
    if (!canUseSocialModules) {
      logBlockedSocialModuleOpen(
        'Outgoing social module',
        socialModuleAvailability,
        'FloatingActionBar chat button'
      )
      if (isSurvivorMode) {
        showSurvivorBlockedMessage(
          getBlockedSocialModuleAnnouncementMessage(socialModuleAvailability)
        )
        return
      }
      onSocialModuleBlocked?.(socialModuleAvailability)
      return
    }
    dispatch(openSocialPanel())
  }, [
    canUseSocialModules,
    dispatch,
    isSurvivorMode,
    onSocialModuleBlocked,
    showSurvivorBlockedMessage,
    socialModuleAvailability,
  ])

  const handleIncomingRequestsClick = useCallback(() => {
    if (!canUseIncomingSocialModule) {
      logBlockedSocialModuleOpen(
        'Incoming social module',
        incomingSocialModuleAvailability,
        'FloatingActionBar incoming requests button'
      )
      if (isSurvivorMode) {
        showSurvivorBlockedMessage(
          getBlockedSocialModuleAnnouncementMessage(incomingSocialModuleAvailability)
        )
        return
      }
      onSocialModuleBlocked?.(incomingSocialModuleAvailability)
      return
    }
    dispatch(openIncomingInbox())
  }, [
    canUseIncomingSocialModule,
    dispatch,
    incomingSocialModuleAvailability,
    isSurvivorMode,
    onSocialModuleBlocked,
    showSurvivorBlockedMessage,
  ])

  const dispatchPlayPressedEvent = useCallback((): boolean => {
    try {
      return window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    } catch (error) {
      console.warn('Failed to dispatch ui:playPressed event.', error)
      return true
    }
  }, [])

  const handlePrimaryActionClick = useCallback(() => {
    setBlockedAnnouncement(null)
    if (weekend?.active) {
      if (weekend.stage === 'hub_says') {
        if (hubSaysBeat !== 'result') {
          const questionId = weekend.hubSays?.questionIds[weekend.hubSays.currentQuestionIndex]
          const targetId = weekend.hubSays?.selectedPlayerId
          if (questionId && targetId) dispatch(submitHubSaysVote({ questionId, targetId }))
          return
        }
        dispatch(continueHubSays())
        return
      }
      if (weekend.stage === 'party') {
        dispatch(continueWeekendFeature())
        return
      }
      if (weekend.stage === 'season_so_far') {
        dispatch(advanceWeekendSeasonFact())
        return
      }
      if (weekend.stage === 'day_transition') {
        dispatch(advanceWeekendDay())
        return
      }
      if (
        weekend.stage === 'intro' ||
        weekend.stage === 'instructions' ||
        weekend.stage === 'day_two_intro'
      ) {
        dispatch(continueWeekendFeature())
        return
      }
      if (weekend.weekendDay === 1) {
        dispatch(beginWeekendDayTransition())
        return
      }
      if (weekend.debug) {
        dispatch(finishWeekendDebugPreview())
      } else {
        dispatch(completeWeekendInterlude())
        dispatch(advance())
      }
      return
    }
    if (survivorTerminalActive) return
    if (finaleInlinePlayActive) {
      dispatchPlayPressedEvent()
      return
    }
    if (survivorReplacementPending) {
      dispatch(revealSurvivorReplacement())
      return
    }
    if (finaleOverlayActive) {
      dispatchPlayPressedEvent()
      return
    }
    if (hasPendingConfessionalDecision) {
      setTriggeredConfessionalDecisionKey(activeConfessionalDecisionKey)
      setConfessionalFlashTick((tick) => tick + 1)
      if (!hasSeenConfessionalSpotlight) {
        setShowConfessionalSpotlight(true)
      }
      dispatchPlayPressedEvent()
      return
    }

    // Some presentation state machines use the global Play signal to perform
    // their own authoritative transition. They must get the press without an
    // additional generic advance() in the same event turn, even if an older
    // listener forgot to call preventDefault().
    if (battleBackAnnouncementActive || voxTransitionOwnsPlay) {
      dispatchPlayPressedEvent()
      return
    }

    if (advancedProgressRef.current === advanceProgressKey) {
      // Vox Populi can intentionally queue several manual broadcast cards
      // within one reducer phase. Repeated Play presses reveal those cards
      // without repeating the underlying phase transition.
      if (voxPopuliActive) {
        dispatchPlayPressedEvent()
      }
      return
    }
    // Faux TV gets first refusal on Play. A persistent major/critical card can
    // consume the press so its queued story beat is actually seen before the
    // reducer is allowed to generate the next phase behind it.
    if (!dispatchPlayPressedEvent()) return
    advancedProgressRef.current = advanceProgressKey
    dispatch(advance())
  }, [
    activeConfessionalDecisionKey,
    advanceProgressKey,
    battleBackAnnouncementActive,
    dispatch,
    dispatchPlayPressedEvent,
    finaleInlinePlayActive,
    finaleOverlayActive,
    hasPendingConfessionalDecision,
    hasSeenConfessionalSpotlight,
    survivorReplacementPending,
    survivorTerminalActive,
    voxPopuliActive,
    voxTransitionOwnsPlay,
    weekend,
    hubSaysBeat,
  ])

  const handleToolClick = useCallback(() => {
    if (isSurvivorMode) {
      showSurvivorBlockedMessage(
        'The confessional is now being used as a storage room for the robotic players parts. Access is denied.'
      )
      return
    }
    if (confessionalSpotlightEligible) {
      completeConfessionalSpotlight()
    }
    setShowSecretMissionRewardSpotlight(false)
    setTriggeredConfessionalDecisionKey(null)
    navigate('/diary-room')
  }, [
    completeConfessionalSpotlight,
    confessionalSpotlightEligible,
    isSurvivorMode,
    navigate,
    showSurvivorBlockedMessage,
  ])

  const handlePublicMeterClick = useCallback(() => {
    if (game.publicModeEnabled !== true) {
      onPublicMeterBlocked?.()
      return
    }
    navigate(resolvePublicMeterDestination(true, publicRequestCount))
  }, [game.publicModeEnabled, navigate, onPublicMeterBlocked, publicRequestCount])

  const handleStartNewSurvivor = useCallback(() => {
    if (!isGuest && activeProfileId) {
      clearSavedRun(activeProfileId, 'survival')
    }
    dispatch({ type: 'challenge/setPendingChallenge', payload: null })
    dispatch(hydrateGame(createSurvivorRun()))
    navigate('/game', { replace: true })
  }, [activeProfileId, dispatch, isGuest, navigate])

  const handleReturnHome = useCallback(() => {
    if (weekend?.debug) {
      dispatch(finishWeekendDebugPreview())
      navigate('/')
      return
    }
    const legacyHomeButton = document.querySelector<HTMLButtonElement>(
      '.nav-bar button[aria-label="Home"]'
    )
    if (legacyHomeButton) {
      legacyHomeButton.click()
      return
    }
    setHomeConfirmOpen(true)
  }, [dispatch, navigate, weekend?.debug])

  const returnHomeWithoutSaving = useCallback(() => {
    setHomeConfirmOpen(false)
    dispatch({ type: 'challenge/setPendingChallenge', payload: null })
    dispatch(resetGame())
    navigate('/')
  }, [dispatch, navigate])

  const saveSeasonAndReturnHome = useCallback(async () => {
    if (weekend?.debug) {
      dispatch(finishWeekendDebugPreview())
      navigate('/')
      return
    }
    if (!canPersistActiveRun || !activeProfileId) {
      returnHomeWithoutSaving()
      return
    }

    retrySavePersistenceWrites()
    const currentState = reduxStore.getState()
    const accepted = saveRunSnapshot(
      activeProfileId,
      createSavedSeasonSnapshot(activeProfileId, currentState)
    )
    if (!accepted || !(await flushSavePersistence())) return
    returnHomeWithoutSaving()
  }, [
    activeProfileId,
    canPersistActiveRun,
    dispatch,
    navigate,
    reduxStore,
    returnHomeWithoutSaving,
    weekend?.debug,
  ])

  const abandonSeasonAndReturnHome = useCallback(async () => {
    if (weekend?.debug) {
      dispatch(finishWeekendDebugPreview())
      navigate('/')
      return
    }
    if (canPersistActiveRun && activeProfileId) {
      clearSavedRun(activeProfileId, currentRunSlot)
      clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId))
      if (!(await flushSavePersistence())) return
    }
    returnHomeWithoutSaving()
  }, [
    activeProfileId,
    canPersistActiveRun,
    currentRunSlot,
    dispatch,
    navigate,
    returnHomeWithoutSaving,
    weekend?.debug,
  ])

  const handleMoreClick = useCallback(
    (destination: 'settings' | 'profile' | 'rules' | 'leaderboard' | 'store' | 'feedback') => {
      if (destination === 'feedback') {
        openBugReportFromGame({
          season: game.season,
          week: game.week,
          phase: game.phase,
        })
        return
      }
      const routes = {
        settings: '/settings',
        profile: '/profile',
        rules: voxPopuliActive ? '/vox-populi-rules' : '/rules',
        leaderboard: '/leaderboard',
        store: '/store',
      } as const
      navigate(routes[destination])
    },
    [game.phase, game.season, game.week, navigate, voxPopuliActive]
  )

  // Center the dock in the real rendered space between the content immediately
  // above it and the navbar. The whole houseguest section is the upper boundary
  // because modes may append content after the roster list.
  useEffect(() => {
    const dock = dockRef.current
    const gameScreen = dock?.closest<HTMLElement>('.game-screen')
    if (!dock || !gameScreen) return undefined

    let frameId = 0
    const balanceDock = () => {
      const contentAbove = gameScreen.querySelector<HTMLElement>(
        'section[aria-labelledby="houseguests-heading"]'
      )
      const nav = document.querySelector<HTMLElement>('.nav-bar')
      if (!contentAbove || !nav) return

      const gameRect = gameScreen.getBoundingClientRect()
      const contentRect = contentAbove.getBoundingClientRect()
      const dockRect = dock.getBoundingClientRect()
      const navRect = nav.getBoundingClientRect()
      if (dockRect.height <= 0) return

      const lowerBoundary = Math.min(gameRect.bottom, navRect.top)
      const configuredGap = Number.parseFloat(
        getComputedStyle(gameScreen).getPropertyValue('--game-action-dock-gap')
      )
      const minimumGap = Number.isFinite(configuredGap) ? configuredGap : 8
      // On the game screen the nav is deliberately folded into the dock. Its
      // hidden rectangle must not become the dock's lower boundary.
      if (navRect.height <= 0) {
        dock.style.bottom = `${Math.round(minimumGap)}px`
        return
      }
      const bottomOffset = resolveBalancedDockBottom({
        gameBottom: gameRect.bottom,
        lowerBoundary,
        contentBottom: contentRect.bottom,
        dockHeight: dockRect.height,
        minimumGap,
      })
      dock.style.bottom = `${Math.round(bottomOffset)}px`
    }
    const scheduleBalance = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(balanceDock)
    }

    scheduleBalance()
    window.addEventListener('resize', scheduleBalance)
    window.visualViewport?.addEventListener('resize', scheduleBalance)
    const observed = [
      gameScreen,
      dock,
      gameScreen.querySelector<HTMLElement>('.tv-zone'),
      gameScreen.querySelector<HTMLElement>('section[aria-labelledby="houseguests-heading"]'),
      document.querySelector<HTMLElement>('.nav-bar'),
    ].filter((element): element is HTMLElement => element instanceof HTMLElement)
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleBalance)
    observed.forEach((element) => resizeObserver?.observe(element))

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', scheduleBalance)
      window.visualViewport?.removeEventListener('resize', scheduleBalance)
      resizeObserver?.disconnect()
    }
  }, [])

  return (
    <>
      {blockedAnnouncement && (
        <div className="floating-action-bar__blocked-message" role="status" aria-live="polite">
          {blockedAnnouncement.message}
        </div>
      )}
      <ConfirmExitModal
        open={homeConfirmOpen}
        title={canPersistActiveRun ? 'Save and return home?' : 'Leave this season?'}
        description={
          canPersistActiveRun
            ? 'Save & Home keeps this season available from Continue. Abandon Season permanently removes this in-progress run.'
            : 'Guest seasons cannot be saved. Leaving will discard this run.'
        }
        confirmLabel={canPersistActiveRun ? 'Save & Home' : 'Leave Season'}
        secondaryLabel={canPersistActiveRun ? 'Abandon Season' : undefined}
        cancelLabel="Cancel"
        onConfirm={canPersistActiveRun ? saveSeasonAndReturnHome : returnHomeWithoutSaving}
        onSecondary={canPersistActiveRun ? abandonSeasonAndReturnHome : undefined}
        onCancel={() => setHomeConfirmOpen(false)}
      />
      <ConfirmExitModal
        open={survivorTerminalActive && !showSurvivorAdContinue}
        title="Surveyeval run ended"
        description={survivorEndDescription}
        confirmLabel="Start New Surveyeval"
        cancelLabel="Return Home"
        secondaryLabel={
          game.modeSpecific?.kind === 'survival' && (game.modeSpecific.adContinueCount ?? 0) < 3
            ? 'Watch ad for another chance'
            : undefined
        }
        onConfirm={handleStartNewSurvivor}
        onSecondary={() => setShowSurvivorAdContinue(true)}
        onCancel={handleReturnHome}
      />
      {survivorTerminalActive &&
        (game.modeSpecific?.kind !== 'survival' ||
          (game.modeSpecific.adContinueCount ?? 0) < 3) && (
          <AdPrompt
            title="System recovery available"
            description={`Watch a short ad to reassemble your avatar and return to the run. Recovery ${((game.modeSpecific?.kind === 'survival' ? game.modeSpecific.adContinueCount : 0) ?? 0) + 1} of 3.`}
            icon="⚡"
            watchLabel="Watch ad · Reassemble"
            skipLabel="Not now"
            onWatch={() => {
              setShowSurvivorAdContinue(false)
              window.setTimeout(() => dispatch(continueSurvivorAfterAd()), 450)
            }}
            onSkip={() => setShowSurvivorAdContinue(false)}
            pending={false}
          />
        )}
      <GameControlDock
        dockRef={dockRef}
        onChatClick={handleChatClick}
        onIncomingRequestsClick={handleIncomingRequestsClick}
        onPrimaryActionClick={handlePrimaryActionClick}
        onPublicMeterClick={handlePublicMeterClick}
        onToolClick={handleToolClick}
        onHomeClick={handleReturnHome}
        onMoreClick={handleMoreClick}
        disabled={survivorTerminalActive || finaleOverlayActive}
        primaryDisabled={primaryDisabled}
        elevatedDuringOverlay={finaleDockOnTop}
        primaryLabel={
          finaleOverlayActive
            ? 'Play finale scene'
            : weekend?.active
              ? weekend.stage === 'intro'
                ? 'Continue'
                : weekend.stage === 'instructions'
                  ? 'Let’s go'
                  : weekend.stage === 'day_two_intro'
                    ? 'Continue'
                    : weekend.stage === 'hub_says'
                      ? hubSaysBeat === 'result'
                        ? 'Next question'
                        : weekend.hubSays?.selectedPlayerId
                          ? 'Reveal the answers'
                          : 'Choose a Hubmate'
                      : weekend.stage === 'party'
                        ? 'Continue'
                        : weekend.stage === 'season_so_far'
                          ? 'Next story'
                          : weekend.stage === 'day_transition'
                            ? 'Start Day 2'
                            : weekend.weekendDay === 1
                              ? 'Finish the day'
                              : weekend.debug
                                ? 'Finish preview'
                                : `Start Day ${weekend.afterDay + 1}`
              : 'Advance to next phase'
        }
        socialDisabled={socialModulesUnavailable}
        incomingRequestsDisabled={incomingSocialModuleUnavailable}
        publicMeterDisabled={game.publicModeEnabled !== true}
        confessionalDisabled={isSurvivorMode}
        chatBadgeCount={
          !socialModulesUnavailable
            ? weekendSocialActive
              ? weekendSocialSpotlightKey &&
                completedWeekendSocialSpotlightKey !== weekendSocialSpotlightKey
                ? weekendSocialBadgeFill?.key === weekendSocialSpotlightKey
                  ? weekendSocialBadgeFill.count
                  : 0
                : weekend?.wallet.energy
              : (humanEnergy ?? undefined)
            : undefined
        }
        showChatBadgeZero={
          weekendSocialActive &&
          weekendSocialSpotlightKey !== null &&
          completedWeekendSocialSpotlightKey !== weekendSocialSpotlightKey
        }
        chatFlash={!socialModulesUnavailable && isFlashing}
        incomingRequestsBadgeCount={
          !incomingSocialModuleUnavailable && pendingCount + pendingAllianceDecisionCount > 0
            ? pendingCount + pendingAllianceDecisionCount
            : undefined
        }
        publicMeterBadgeCount={
          game.publicModeEnabled === true && publicRequestCount > 0 ? publicRequestCount : undefined
        }
        primaryPulse={primaryPulse}
        confessionalBadgeCount={
          !isSurvivorMode && confessionalAlertCount > 0 ? confessionalAlertCount : undefined
        }
        confessionalFlash={isConfessionalFlashing}
        confessionalFlashTick={confessionalFlashTick}
        confessionalPersistentFlash={confessionalPersistentFlash}
        confessionalIconRef={confessionalIconRef}
        socialIconRef={socialIconRef}
      />
      <ConfessionalSpotlightOverlay
        active={showWeekendSocialSpotlight}
        targetRef={socialIconRef}
        onComplete={completeWeekendSocialSpotlight}
      />
      <ConfessionalSpotlightOverlay
        active={
          (showConfessionalSpotlight && confessionalSpotlightEligible) ||
          showSecretMissionRewardSpotlight
        }
        targetRef={confessionalIconRef}
        onComplete={() => {
          setShowSecretMissionRewardSpotlight(false)
          if (showConfessionalSpotlight) completeConfessionalSpotlight()
        }}
      />
    </>
  )
}
