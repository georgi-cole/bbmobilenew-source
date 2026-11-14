import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useStore } from 'react-redux'
import { hasPresentationEventClaim } from '../../broadcasting/fauxTvPresentation'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  endFinaleReunionDebugPreview,
  finishWeekendDebugPreview,
} from '../../features/weekend/weekendDebugPreview'
import {
  advance,
  advanceWeekendSeasonFact,
  advanceWeekendDay,
  beginWeekendTribunalGlimpse,
  beginFinaleReunionSocial,
  beginWeekendReunionDeparture,
  finishWeekendReunionDeparture,
  skipWeekendTribunalStream,
  openWeekendTribunalStream,
  beginWeekendDayTransition,
  completeWeekendInterlude,
  continueHubSays,
  continueWeekendFeature,
  submitHubSaysVote,
  hydrateGame,
  continueSurvivorAfterAd,
  revealSurvivorReplacement,
  setHasSeenConfessionalSpotlight,
  claimPresentationEvent,
  resetGame,
} from '../../store/gameSlice'
import {
  openIncomingInbox,
  openSocialPanel,
  selectEnergyBank,
  selectPendingIncomingInteractionCount,
  selectUnreadIncomingNoticeCount,
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
import {
  getConfessionalDecisionKey,
  selectActiveConfessionalDecision,
} from '../../store/confessionalDecisionSelectors'
import {
  getBlockedSocialModuleAnnouncementMessage,
  getIncomingSocialModuleAvailability,
  getSocialModuleAvailability,
  isWeekendSocialAvailable,
  logBlockedSocialModuleOpen,
  type SocialModuleAvailability,
} from '../../social/socialModuleAvailability'
import { selectActiveProfileId, selectIsGuest } from '../../store/profilesSlice'
import { isGuestSaveReminderEvent } from '../../store/guestSaveReminder'
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
import { getSurvivalRecoveryKey } from '../../modes/survivalRecovery'
import { recoverSurvivalRunWithCredit } from '../../modes/survivalRecoveryActions'
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate'
import {
  hasSurvivalRunRedemption,
  releaseSurvivalRunCredit,
} from '../../vip/survivalRunPurchaseService'
import ConfirmExitModal from '../ConfirmExitModal/ConfirmExitModal'
import SurvivalRecoveryDialog from '../SurvivalRecoveryDialog/SurvivalRecoveryDialog'
import GameControlDock from '../GameControlDock/GameControlDock'
import { openBugReportFromGame } from '../../utils/openBugReport'
import ConfessionalSpotlightOverlay from './ConfessionalSpotlightOverlay'
import { resolveBalancedDockBottom } from './floatingActionBarLayout'
import { resolvePublicMeterDestination } from './publicMeterNavigation'
import type { RootState } from '../../store/store'

const CONFESSIONAL_FLASH_DURATION_MS = 1800
const SURVIVOR_DISABLED_MESSAGE_MS = 5000
const FINALE_REUNION_DEPARTURE_WAVE_MS = 1700

async function releaseReservedSurvivalRecovery(game: RootState['game']): Promise<void> {
  const key = getSurvivalRecoveryKey(game)
  if (!key) return
  let hasReservation = false
  try {
    hasReservation = hasSurvivalRunRedemption(key)
  } catch {
    // A corrupt wallet disables billing, but must not trap normal exit navigation.
    return
  }
  if (hasReservation) await releaseSurvivalRunCredit(key)
}

function isSameEndedSurvivalRun(current: RootState['game'], expected: RootState['game']): boolean {
  return (
    current.gameId === expected.gameId &&
    isSurvivorRunTerminal(current) &&
    getSurvivorCurrentDay(current) === getSurvivorCurrentDay(expected) &&
    getSurvivalRecoveryKey(current) === getSurvivalRecoveryKey(expected)
  )
}

type FloatingActionBarProps = {
  tribunalDecisionPending?: boolean
  /** Called when the player activates Public Meter while public mode is disabled. */
  onPublicMeterBlocked?: () => void
  /** Called when the player activates a blocked social module. */
  onSocialModuleBlocked?: (availability: SocialModuleAvailability) => void
  /** Keep the shared Play control above a finale scene and route only that control. */
  finaleOverlayActive?: boolean
  /** Route the shared Play control to a faux-TV story beat while leaving dock navigation enabled. */
  finaleInlinePlayActive?: boolean
  /** Direct progression for Final Three setup. Bypasses unrelated global Play consumers. */
  onFinalePlay?: () => void
  finalePlayAvailable?: boolean
  /** Show the shared dock above spectator broadcasts that wait for Play input. */
  finaleDockOnTop?: boolean
  /** The human ballot is committed and Play should reveal the Democracia tally. */
  democraciaVoteRecorded?: boolean
  /** Continue from the currently displayed Democracia result card. */
  onDemocraciaResultsDone?: () => void
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
  tribunalDecisionPending = false,
  onPublicMeterBlocked,
  onSocialModuleBlocked,
  finaleOverlayActive = false,
  finaleInlinePlayActive = false,
  onFinalePlay,
  finalePlayAvailable = false,
  finaleDockOnTop = false,
  democraciaVoteRecorded = false,
  onDemocraciaResultsDone,
}: FloatingActionBarProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const reduxStore = useStore<RootState>()
  const canAdvance = useAppSelector(selectAdvanceEnabled)
  const isWaiting = useAppSelector(selectIsWaitingForInput)
  const pendingCount = useAppSelector(selectPendingIncomingInteractionCount)
  const unreadNoticeCount = useAppSelector(selectUnreadIncomingNoticeCount)
  const pendingAllianceDecisionCount = useAppSelector((state) => {
    const humanId = state.game.players.find((player) => player.isUser)?.id
    if (!humanId) return 0
    return Object.values(state.social.reality.allianceManagement?.requests ?? {}).filter(
      (request) =>
        isPendingAllianceRequest(request) &&
        allianceRequestDecisionActors(request).includes(humanId)
    ).length
  })
  const incomingBadgeCount = pendingCount + unreadNoticeCount + pendingAllianceDecisionCount
  const confessionalAlertCount = useAppSelector(selectConfessionalAlertCount)
  const canUseSocialModules = useAppSelector(selectHumanCanUseSocialModules)
  const canUseIncomingSocialModule = useAppSelector(selectHumanCanUseIncomingSocialModule)
  const activeConfessionalDecision = useAppSelector(selectActiveConfessionalDecision)
  const activeProfileId = useAppSelector(selectActiveProfileId)
  const isGuest = useAppSelector(selectIsGuest)
  const game = useAppSelector((s) => s.game)
  const guestSaveInviteActive = Boolean(
    isGuest &&
    game.week === 1 &&
    game.phase === 'loh_comp_announcement' &&
    game.tvFeed.some(
      (event) => isGuestSaveReminderEvent(event) && event.meta?.broadcastConsumed !== true
    )
  )
  const weekend = game.weekendInterlude
  const reunionDepartureInProgress = weekend?.reunionDepartureActive === true
  const hasReunionGuests =
    weekend?.debug && weekend.reunionPreview
      ? weekend.reunionPreview.guestIds.length > 0
      : game.players.some((player) => player.status === 'evicted' || player.status === 'jury')
  const isWeekendTribunalInvitation =
    weekend?.stage === 'tribunal_invitation' || weekend?.stage === 'tribunal_glimpse'
  const weekendReunionAnnouncementActive = Boolean(
    weekend?.active &&
    weekend.finaleWeekend &&
    !weekend.debug &&
    weekend.weekendDay === 2 &&
    isWeekendTribunalInvitation &&
    weekend.reunionDeparted !== true &&
    weekend.tribunalGlimpse?.opened !== true
  )
  const weekendTribunalStreamAvailable = Boolean(
    weekend?.active &&
    weekend.finaleWeekend &&
    (isWeekendTribunalInvitation ||
      weekend.stage === 'finale_sequester_announcement' ||
      weekend.stage === 'finale_battle_ready') &&
    weekend.tribunalGlimpse &&
    !weekend.tribunalGlimpse.opened
  )
  const canPersistActiveRun = !isGuest && Boolean(activeProfileId) && weekend?.debug !== true
  const weekendSocialActive =
    weekend?.active === true && !reunionDepartureInProgress && isWeekendSocialAvailable(weekend)
  const weekendSocialSpotlightKey = weekendSocialActive
    ? `${game.gameId ?? game.season}:${weekend.weekendNumber ?? weekend.afterDay}:${weekend.afterDay}`
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
    // Mission Safety may stage an AI save without advancing the reducer phase.
    // Re-arm Play for the next press so that the staged save can be committed.
    game.missionPowers?.safetyIntent?.id ?? 'no-staged-safety',
    game.specialVeto?.vipUseStage ?? 0,
    game.voxPopuli?.finalThreePacingSeen?.join(',') ?? 'no-final-three-pacing',
    isWaiting ? 'waiting-for-input' : 'ready',
    weekend?.active ? `${weekend.afterDay}:${weekend.stage}:${weekend.weekendDay}` : 'no-weekend',
  ].join(':')
  const advancedProgressRef = useRef<string | null>(null)
  const reunionDepartureIntentRef = useRef<'farewell' | 'preview' | 'preview-end' | null>(null)
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
  const socialModulesUnavailable = reunionDepartureInProgress || !canUseSocialModules
  const incomingSocialModuleUnavailable = reunionDepartureInProgress || !canUseIncomingSocialModule
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
  const activeConfessionalDecisionKey = getConfessionalDecisionKey(activeConfessionalDecision, game)

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

    const claim = { gameId: game.gameId, runId: key, eventId: `weekend-energy:${key}` }
    const grant = weekend?.wallet.energy ?? 0
    if (
      hasPresentationEventClaim(reduxStore.getState().game.presentationEventClaims, claim) ||
      grant < 30
    ) {
      const frame = window.requestAnimationFrame(() => {
        setCompletedWeekendSocialSpotlightKey(key)
        setWeekendSocialBadgeFill(null)
        setShowWeekendSocialSpotlight(false)
      })
      return () => window.cancelAnimationFrame(frame)
    }
    const startedAt = performance.now()
    let frameId = 0
    let previousCount = -1
    const animateBadge = (now: number) => {
      if (previousCount === -1) {
        dispatch(claimPresentationEvent(claim))
        setShowWeekendSocialSpotlight(true)
      }
      const progress = Math.min((now - startedAt) / 1200, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      if (reduxStore.getState().game.weekendInterlude?.wallet.energy !== grant) {
        setCompletedWeekendSocialSpotlightKey(key)
        setWeekendSocialBadgeFill(null)
        setShowWeekendSocialSpotlight(false)
        return
      }
      const count = Math.round(easedProgress * grant)
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
    dispatch,
    game.gameId,
    reduxStore,
    weekend?.wallet.energy,
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
  // A visible finale gate owns Play even if a stale weekend or required
  // confessional decision still exists. Those routes cannot disable this action.
  const primaryDisabled =
    finaleOverlayActive || finaleInlinePlayActive
      ? !finalePlayAvailable
      : weekend?.active
        ? !weekendPlayReady || reunionDepartureInProgress
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
          ? weekendPlayReady && !reunionDepartureInProgress
          : hasPendingConfessionalDecision
            ? !confessionalPromptActivated
            : survivorReplacementPending || (canAdvance && !isWaiting)
  const confessionalPersistentFlash = hasPendingConfessionalDecision && confessionalPromptActivated

  useEffect(() => {
    if (secretMissionRewardPendingKey === null) {
      previousSecretMissionRewardPendingKeyRef.current = null
      const hideTimer = window.setTimeout(() => setShowSecretMissionRewardSpotlight(false), 0)
      return () => window.clearTimeout(hideTimer)
    }
    if (previousSecretMissionRewardPendingKeyRef.current === secretMissionRewardPendingKey) return
    previousSecretMissionRewardPendingKeyRef.current = secretMissionRewardPendingKey
    const claim = {
      gameId: game.gameId,
      runId: secretMissionRewardPendingKey,
      eventId: `mission-reward:${secretMissionRewardPendingKey}`,
    }
    if (hasPresentationEventClaim(reduxStore.getState().game.presentationEventClaims, claim)) return
    dispatch(claimPresentationEvent(claim))
    startTransition(() => setShowSecretMissionRewardSpotlight(true))
  }, [dispatch, game.gameId, reduxStore, secretMissionRewardPendingKey])

  const completeConfessionalSpotlight = useCallback(() => {
    setShowConfessionalSpotlight(false)
    if (!hasSeenConfessionalSpotlight) {
      dispatch(setHasSeenConfessionalSpotlight(true))
    }
  }, [dispatch, hasSeenConfessionalSpotlight])

  const handleChatClick = useCallback(() => {
    if (reunionDepartureInProgress) return
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
    reunionDepartureInProgress,
    showSurvivorBlockedMessage,
    socialModuleAvailability,
  ])

  const handleIncomingRequestsClick = useCallback(() => {
    if (reunionDepartureInProgress) return
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
    reunionDepartureInProgress,
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
    // The finale opening and Part 3 setup use an explicit, guarded callback.
    // They must not depend on a globally broadcast Play event, which a pending
    // Confessional or old TV presentation can intercept before the finale.
    if (finaleInlinePlayActive) {
      if (onFinalePlay) onFinalePlay()
      else dispatchPlayPressedEvent()
      return
    }
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
      if (weekend.stage === 'finale_reunion' && weekend.debug) {
        if (reunionDepartureInProgress) return
        if (hasReunionGuests) {
          reunionDepartureIntentRef.current = 'preview-end'
          dispatch(beginWeekendReunionDeparture())
          return
        }
        dispatch(endFinaleReunionDebugPreview())
        return
      }
      if (isWeekendTribunalInvitation) {
        if (weekend.debug) {
          dispatch(finishWeekendDebugPreview())
        } else {
          dispatch(beginFinaleReunionSocial())
        }
        return
      }
      if (weekend.stage === 'finale_reunion_social') {
        dispatch(beginWeekendTribunalGlimpse())
        return
      }
      if (weekend.stage === 'finale_sequester_announcement') {
        dispatch(skipWeekendTribunalStream())
        return
      }
      if (weekend.stage === 'finale_battle_ready') {
        if (weekend.debug) {
          dispatch(finishWeekendDebugPreview())
          return
        }
        if (reunionDepartureInProgress) return
        if (hasReunionGuests && !weekend.reunionDeparted) {
          reunionDepartureIntentRef.current = 'farewell'
          dispatch(beginWeekendReunionDeparture())
          return
        }
        // The farewell is now a separate Play beat. This hands off to the
        // existing Final 3 opening, whose own Play gate begins competition.
        dispatch(completeWeekendInterlude())
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
      if (weekend.finaleWeekend) {
        dispatch(beginWeekendTribunalGlimpse())
      } else if (weekend.debug) {
        dispatch(finishWeekendDebugPreview())
      } else {
        dispatch(completeWeekendInterlude())
        dispatch(advance())
      }
      return
    }
    if (survivorTerminalActive) return
    if (democraciaVoteRecorded) {
      dispatch(advance())
      return
    }
    if (game.democracia?.resultDisplay) {
      onDemocraciaResultsDone?.()
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
        dispatch(setHasSeenConfessionalSpotlight(true))
        dispatch(
          claimPresentationEvent({
            gameId: game.gameId,
            runId: 'tutorial',
            eventId: 'confessional-tutorial',
          })
        )
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
    democraciaVoteRecorded,
    game.democracia?.resultDisplay,
    game.gameId,
    hasReunionGuests,
    finaleInlinePlayActive,
    finaleOverlayActive,
    hasPendingConfessionalDecision,
    hasSeenConfessionalSpotlight,
    onDemocraciaResultsDone,
    onFinalePlay,
    survivorReplacementPending,
    survivorTerminalActive,
    voxPopuliActive,
    voxTransitionOwnsPlay,
    weekend,
    isWeekendTribunalInvitation,
    hubSaysBeat,
    reunionDepartureInProgress,
  ])

  const handleToolClick = useCallback(() => {
    if (isSurvivorMode) {
      showSurvivorBlockedMessage(
        'The confessional is now being used as a storage room for the robotic players parts. Access is denied.'
      )
      return
    }
    if (weekendTribunalStreamAvailable) {
      if (weekend?.reunionDepartureActive) return
      dispatch(openWeekendTribunalStream())
      navigate('/diary-room?stream=finale-tribunal', {
        state: {
          returnTo: `${location.pathname}${location.search}${location.hash}`,
        },
      })
      return
    }
    if (showConfessionalSpotlight) {
      completeConfessionalSpotlight()
    }
    setShowSecretMissionRewardSpotlight(false)
    setTriggeredConfessionalDecisionKey(null)
    navigate('/diary-room')
  }, [
    completeConfessionalSpotlight,
    showConfessionalSpotlight,
    dispatch,
    isSurvivorMode,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    weekend?.reunionDepartureActive,
    weekendTribunalStreamAvailable,
    showSurvivorBlockedMessage,
  ])

  useEffect(() => {
    if (!reunionDepartureInProgress) return undefined
    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const timer = window.setTimeout(
      () => {
        const intent = reunionDepartureIntentRef.current
        reunionDepartureIntentRef.current = null
        dispatch(finishWeekendReunionDeparture())
        if (intent === 'preview') {
          dispatch(finishWeekendDebugPreview())
        } else if (intent === 'preview-end') {
          dispatch(endFinaleReunionDebugPreview())
        }
      },
      prefersReducedMotion ? 0 : FINALE_REUNION_DEPARTURE_WAVE_MS
    )
    return () => window.clearTimeout(timer)
  }, [dispatch, reunionDepartureInProgress])

  const handlePublicMeterClick = useCallback(() => {
    if (game.publicModeEnabled !== true) {
      onPublicMeterBlocked?.()
      return
    }
    navigate(resolvePublicMeterDestination(true, publicRequestCount))
  }, [game.publicModeEnabled, navigate, onPublicMeterBlocked, publicRequestCount])

  const handleStartNewSurvivor = useCallback(async () => {
    const endedGame = reduxStore.getState().game
    if (!isSurvivorRunTerminal(endedGame)) return
    await releaseReservedSurvivalRecovery(endedGame)
    const currentGame = reduxStore.getState().game
    if (!isSameEndedSurvivalRun(currentGame, endedGame)) return
    if (!isGuest && activeProfileId) {
      clearSavedRun(activeProfileId, 'survival')
      if (!(await flushSavePersistence())) {
        throw new Error('The ended run could not be cleared. Please try starting a new run again.')
      }
    }
    if (!isSameEndedSurvivalRun(reduxStore.getState().game, endedGame)) return
    dispatch({ type: 'challenge/setPendingChallenge', payload: null })
    dispatch(hydrateGame(createSurvivorRun()))
    navigate('/game', { replace: true })
  }, [activeProfileId, dispatch, isGuest, navigate, reduxStore])

  const handleExitEndedSurvivor = useCallback(async () => {
    const currentGame = reduxStore.getState().game
    if (!isSurvivorRunTerminal(currentGame)) return
    await releaseReservedSurvivalRecovery(currentGame)
    if (!isSameEndedSurvivalRun(reduxStore.getState().game, currentGame)) return
    if (!isGuest && activeProfileId) {
      clearSavedRun(activeProfileId, 'survival')
      clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId))
      if (!(await flushSavePersistence())) {
        throw new Error('The ended run could not be cleared. Please try Return Home again.')
      }
    }
    if (!isSameEndedSurvivalRun(reduxStore.getState().game, currentGame)) return
    setHomeConfirmOpen(false)
    withRunAutosaveSuspended(() => {
      dispatch({ type: 'challenge/setPendingChallenge', payload: null })
      dispatch(resetGame())
    })
    navigate('/', { replace: true })
  }, [activeProfileId, dispatch, isGuest, navigate, reduxStore])

  const handleSurvivorAdRecovery = useCallback(
    (recoveryKey: string): boolean => {
      const before = reduxStore.getState().game
      if (getSurvivalRecoveryKey(before) !== recoveryKey) return false
      dispatch(continueSurvivorAfterAd({ recoveryKey }))
      const after = reduxStore.getState().game
      return after.gameId === before.gameId && !isSurvivorRunTerminal(after)
    },
    [dispatch, reduxStore]
  )

  const handleSurvivorPaidRecovery = useCallback(
    (recoveryKey: string) => dispatch(recoverSurvivalRunWithCredit(recoveryKey)),
    [dispatch]
  )

  const handleReturnHome = useCallback(() => {
    if (isSurvivorRunTerminal(reduxStore.getState().game)) {
      void handleExitEndedSurvivor().catch((cause: unknown) => {
        showSurvivorBlockedMessage(cause instanceof Error ? cause.message : 'Please try again.')
      })
      return
    }
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
  }, [
    dispatch,
    handleExitEndedSurvivor,
    navigate,
    reduxStore,
    showSurvivorBlockedMessage,
    weekend?.debug,
  ])

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
      navigate(routes[destination], {
        state:
          destination === 'profile' && guestSaveInviteActive
            ? { from: '/game', guestSaveInvite: true }
            : undefined,
      })
    },
    [game.phase, game.season, game.week, guestSaveInviteActive, navigate, voxPopuliActive]
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
      // hidden rectangle must not become the dock's lower boundary. Let CSS
      // retain ownership of the measured safe inset as well as the dock gap.
      if (navRect.height <= 0) {
        if (dock.style.bottom) dock.style.removeProperty('bottom')
        return
      }
      const bottomOffset = resolveBalancedDockBottom({
        gameBottom: gameRect.bottom,
        lowerBoundary,
        contentBottom: contentRect.bottom,
        dockHeight: dockRect.height,
        minimumGap,
      })
      const bottom = `${Math.round(bottomOffset)}px`
      if (dock.style.bottom !== bottom) dock.style.bottom = bottom
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
      dock.style.removeProperty('bottom')
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
        open={homeConfirmOpen && !survivorTerminalActive}
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
      {survivorTerminalActive && (
        <SurvivalRecoveryDialog
          key={game.gameId}
          description={survivorEndDescription}
          recoveryKey={getSurvivalRecoveryKey(game)}
          adRecoveriesUsed={
            game.modeSpecific?.kind === 'survival' ? (game.modeSpecific.adContinueCount ?? 0) : 0
          }
          onAdRecovery={handleSurvivorAdRecovery}
          onPaidRecovery={handleSurvivorPaidRecovery}
          onStartNew={handleStartNewSurvivor}
          onReturnHome={handleExitEndedSurvivor}
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
        guestSaveInviteActive={guestSaveInviteActive}
        disabled={survivorTerminalActive || finaleOverlayActive || reunionDepartureInProgress}
        navigationDisabled={weekendReunionAnnouncementActive}
        primaryDisabled={primaryDisabled || tribunalDecisionPending}
        elevatedDuringOverlay={finaleDockOnTop || weekendReunionAnnouncementActive}
        primaryLabel={
          tribunalDecisionPending
            ? 'Choose Agree or Exit in the Faux TV'
            : finaleOverlayActive
              ? 'Play finale scene'
              : game.democracia?.resultDisplay
                ? 'Continue'
                : democraciaVoteRecorded
                  ? 'Reveal results'
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
                                  : weekend.stage === 'finale_reunion'
                                    ? reunionDepartureInProgress
                                      ? 'The eliminated players are leaving…'
                                      : 'End visit'
                                    : weekend.stage === 'finale_reunion_social'
                                      ? 'Announce the Sequester Footage'
                                      : weekend.stage === 'finale_sequester_announcement'
                                        ? 'Continue'
                                        : isWeekendTribunalInvitation ||
                                            weekend.stage === 'finale_battle_ready'
                                          ? weekend.debug
                                            ? 'Finish preview'
                                            : reunionDepartureInProgress
                                              ? 'The eliminated players are leaving…'
                                              : weekend.stage === 'finale_battle_ready'
                                                ? weekend.reunionDeparted
                                                  ? 'Begin the Final Power Battle'
                                                  : 'Send the guests home'
                                                : 'Let them in'
                                          : weekend.weekendDay === 1
                                            ? 'Finish the day'
                                            : weekend.finaleWeekend
                                              ? 'Meet the Tribunal'
                                              : weekend.debug
                                                ? 'Finish preview'
                                                : `Start Day ${weekend.afterDay + 1}`
                    : 'Advance to next phase'
        }
        socialDisabled={socialModulesUnavailable}
        incomingRequestsDisabled={incomingSocialModuleUnavailable}
        publicMeterDisabled={game.publicModeEnabled !== true}
        confessionalDisabled={
          isSurvivorMode || reunionDepartureInProgress || weekend?.stage === 'finale_reunion_social'
        }
        chatBadgeCount={
          !socialModulesUnavailable
            ? weekendSocialActive
              ? weekendSocialSpotlightKey &&
                completedWeekendSocialSpotlightKey !== weekendSocialSpotlightKey
                ? weekendSocialBadgeFill?.key === weekendSocialSpotlightKey
                  ? Math.min(weekend?.wallet.energy ?? 0, weekendSocialBadgeFill.count)
                  : weekend?.wallet.energy
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
          !incomingSocialModuleUnavailable && incomingBadgeCount > 0
            ? incomingBadgeCount
            : undefined
        }
        publicMeterBadgeCount={
          game.publicModeEnabled === true && publicRequestCount > 0 ? publicRequestCount : undefined
        }
        primaryPulse={primaryPulse && !tribunalDecisionPending}
        confessionalBadgeCount={
          !isSurvivorMode && confessionalAlertCount > 0 ? confessionalAlertCount : undefined
        }
        confessionalFlash={isConfessionalFlashing}
        confessionalFlashTick={confessionalFlashTick}
        confessionalPersistentFlash={confessionalPersistentFlash}
        confessionalSpecialStream={weekendTribunalStreamAvailable}
        confessionalIconRef={confessionalIconRef}
        socialIconRef={socialIconRef}
      />
      <ConfessionalSpotlightOverlay
        active={showWeekendSocialSpotlight}
        targetRef={socialIconRef}
        onComplete={completeWeekendSocialSpotlight}
      />
      <ConfessionalSpotlightOverlay
        active={showConfessionalSpotlight || showSecretMissionRewardSpotlight}
        targetRef={confessionalIconRef}
        onComplete={() => {
          setShowSecretMissionRewardSpotlight(false)
          if (showConfessionalSpotlight) completeConfessionalSpotlight()
        }}
      />
    </>
  )
}
