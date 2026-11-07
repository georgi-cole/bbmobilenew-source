// MODULE: src/components/MinigameHost/MinigameHost.tsx
// Full-screen host for minigames (legacy and React-implemented).
//
// Flow:
//   1. Rules modal  (unless skipRules is true)
//   2. 3-second "Get Ready" countdown
//   3. Minigame — either a React component or a legacy bundle
//   4. Results screen → calls onDone(rawValue)
//
// The host also owns one seamless edge utility dock for revisiting rules and
// leaving a competition. Individual minigames must not render their own exit UI.

import {
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { isPlacementRankingGame, type GameRegistryEntry } from '../../minigames/registry'
import { resolvePremiumGameForAccess } from '../../minigames/premiumGameAccess'
import { persistCompetitionCheckpoint, store } from '../../store/store'
import { initializeVip, selectHasPremiumChallengesAccess } from '../../store/vipSlice'
import {
  acknowledgeChallengeEdition,
  beginChallengeAttempt,
  checkpointChallengeResult,
  prepareChallengeRetry,
} from '../../store/challengeSlice'
import {
  createAbandonedChallengeResult,
  recoverCommittedChallengeResult,
} from '../../store/challengeResults'
import { CompetitionResultContext } from '../../minigames/competitionResultContext'
import type { CompetitionResult, ReactMinigameCompletion } from '../../minigames/competitionResult'
export type { ReactMinigameCompletion } from '../../minigames/competitionResult'
import { reconcileQuickTapChallenge } from '../../store/reconcileQuickTapChallenge'
import MinigameRules from '../MinigameRules/MinigameRules'
import MinigameTurnDemo, { TURN_DEMO_KEYS } from '../MinigameTurnDemo/MinigameTurnDemo'
import MinigameUtilityDock from '../MinigameUtilityDock/MinigameUtilityDock'
import LegacyMinigameWrapper from '../../minigames/LegacyMinigameWrapper'
import type { LegacyRawResult } from '../../minigames/LegacyMinigameWrapper'
import { SoundManager } from '../../services/sound/SoundManager'
import {
  MINIGAME_MUSIC_VARIANT_EVENT,
  type MinigameMusicVariantDetail,
} from '../../services/sound/minigameMusicVariant'
import type { MusicMinigameVariant } from '../../services/sound/musicConfig'
import type { CwgoPrizeType } from '../../features/cwgo/cwgoCompetitionSlice'
import type { HoldTheWallPrizeType } from '../../features/holdTheWall/holdTheWallSlice'
import type { BiographyBlitzCompetitionType } from '../../features/biographyBlitz/biography_blitz_logic'
import type { FamousFiguresPrizeType } from '../../features/famousFigures/famousFiguresSlice'
import type { SilentSaboteurPrizeType } from '../../features/silentSaboteur/silentSaboteurSlice'
import { getGame as getCanonicalGame } from '../../minigames/registryBase'
import type { MajorityRulesCompetitionType } from '../../features/majorityRules/majorityRulesSlice'
import type { BlackjackTournamentCompetitionType } from '../../features/blackjackTournament/blackjackTournamentSlice'
import type { RiskWheelCompetitionType } from '../../features/riskWheel/riskWheelSlice'
import type { CodeBreakerPrizeType } from '../CodeBreakerComp/CodeBreakerComp'
import type { TetrisPrizeType } from '../../features/tetris/tetrisSlice'
import type { TiltLabyrinthPrizeType } from '../../features/tiltLabyrinth/tiltLabyrinthSlice'
import type { HouseOfCardsPrizeType } from '../../features/houseOfCards/houseOfCardsSlice'
import type { MemoryColorsCompetitionType } from '../../features/memoryColors/memoryColorsSlice'
import reactComponents, { preloadReactMinigame } from '../../minigames/reactComponents'
import { resetHostedMinigameState } from '../../minigames/resetHostedMinigameState'
import { prepareMinigameAssets } from '../../minigames/prepareMinigameAssets'
import { lazyWithChunkRecovery } from '../../utils/lazyWithChunkRecovery'
import './MinigameHost.css'

const COUNTDOWN_TIMER_KEY = 'minigame:all_3_seconds_timer'

const ClosestWithoutGoingOverComp = lazyWithChunkRecovery(
  () => import('../ClosestWithoutGoingOverComp')
)
const HoldTheWallComp = lazyWithChunkRecovery(() => import('../HoldTheWallComp/HoldTheWallComp'))
const BiographyBlitzComp = lazyWithChunkRecovery(
  () => import('../BiographyBlitzComp/biography_blitz_game')
)
const FamousFiguresComp = lazyWithChunkRecovery(
  () => import('../FamousFiguresComp/FamousFiguresComp')
)
const SilentSaboteurComp = lazyWithChunkRecovery(
  () => import('../SilentSaboteurComp/SilentSaboteurComp')
)
const MajorityRulesComp = lazyWithChunkRecovery(
  () => import('../MajorityRulesComp/MajorityRulesComp')
)
const GlassBridgeComp = lazyWithChunkRecovery(() => import('../GlassBridgeComp/GlassBridgeComp'))
const CrystalPathShatteredGame = lazyWithChunkRecovery(
  () => import('../../minigames/crystalPathShattered/CrystalPathShatteredGame')
)
const BlackjackTournamentComp = lazyWithChunkRecovery(
  () => import('../BlackjackTournamentComp/BlackjackTournamentComp')
)
const RiskWheelComp = lazyWithChunkRecovery(() => import('../RiskWheelComp/RiskWheelComp'))
const WildcardWesternComp = lazyWithChunkRecovery(
  () => import('../WildcardWesternComp/WildcardWesternComp')
)
const CodeBreakerComp = lazyWithChunkRecovery(() => import('../CodeBreakerComp/CodeBreakerComp'))
const TetrisComp = lazyWithChunkRecovery(() => import('../TetrisComp/TetrisComp'))
const TiltLabyrinthComp = lazyWithChunkRecovery(
  () => import('../TiltLabyrinthComp/TiltLabyrinthComp')
)
const HouseOfCardsComp = lazyWithChunkRecovery(() => import('../HouseOfCardsComp/HouseOfCardsComp'))
const MemoryColorsComp = lazyWithChunkRecovery(() => import('../MemoryColorsComp/MemoryColorsComp'))
const TrapAuctionComp = lazyWithChunkRecovery(() => import('../TrapAuction/TrapAuction'))
const ColorMatchComp = lazyWithChunkRecovery(() => import('../ColorMatchComp/ColorMatchComp'))

const SPECIAL_MINIGAME_PRELOADERS: Record<string, () => Promise<void>> = {
  ClosestWithoutGoingOver: () => ClosestWithoutGoingOverComp.preload(),
  HoldTheWall: () => HoldTheWallComp.preload(),
  BiographyBlitz: () => BiographyBlitzComp.preload(),
  FamousFigures: () => FamousFiguresComp.preload(),
  SilentSaboteur: () => SilentSaboteurComp.preload(),
  MajorityRules: () => MajorityRulesComp.preload(),
  GlassBridge: () => GlassBridgeComp.preload(),
  CrystalPathShattered: () => CrystalPathShatteredGame.preload(),
  BlackjackTournament: () => BlackjackTournamentComp.preload(),
  RiskWheel: () => RiskWheelComp.preload(),
  WildcardWestern: () => WildcardWesternComp.preload(),
  CodeBreaker: () => CodeBreakerComp.preload(),
  Tetris: () => TetrisComp.preload(),
  TiltLabyrinth: () => TiltLabyrinthComp.preload(),
  HouseOfCards: () => HouseOfCardsComp.preload(),
  MemoryColors: () => MemoryColorsComp.preload(),
  TrapAuction: () => TrapAuctionComp.preload(),
  ColorMatch: () => ColorMatchComp.preload(),
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MinigameParticipant {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
  /** Pre-computed raw score for AI players; ignored for the human (finalValue is used). */
  precomputedScore: number
  /** Previous personal-record value for this game, using the game's native metric. */
  previousPR: number | null
}

interface Props {
  game: GameRegistryEntry
  /** Options forwarded to the legacy module (e.g. seed, timeLimit). */
  gameOptions?: Record<string, unknown>
  /** Called when the minigame ends (normally or via quit). */
  onDone: (rawValue: number, partial?: boolean, completion?: ReactMinigameCompletion) => void
  /** Publishes the host's actual visual lifecycle to the central music resolver. */
  onPhaseChange?: (phase: HostPhase) => void
  onMusicVariantChange?: (variant: MusicMinigameVariant) => void
  /** When true the rules modal is skipped and countdown starts immediately. */
  skipRules?: boolean
  /** When true the 3-second countdown is skipped (for testing). */
  skipCountdown?: boolean
  /** Development lab override for comparing standard and VIP presentations. */
  premiumPresentationOverride?: boolean
  /** Competition participants shown in hosted leaderboards. */
  participants?: MinigameParticipant[]
  competitionRetry?: {
    enabled: boolean
    pending?: boolean
    onWatch: (onReward: () => void) => void
    onContinueWithoutRetry?: () => void
  }
}

export type HostPhase = 'rules' | 'demo' | 'countdown' | 'playing' | 'results'
type UtilityView = 'menu' | 'rules' | 'exit' | null

const MEDALS = ['🥇', '🥈', '🥉']

function fmtScore(value: number): string {
  return String(Math.round(value))
}

function fmtOrdinal(value: number): string {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  const mod10 = value % 10
  if (mod10 === 1) return `${value}st`
  if (mod10 === 2) return `${value}nd`
  if (mod10 === 3) return `${value}rd`
  return `${value}th`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MinigameHost({
  game,
  gameOptions = {},
  onDone,
  onPhaseChange,
  onMusicVariantChange,
  skipRules = false,
  skipCountdown = false,
  premiumPresentationOverride,
  participants,
  competitionRetry,
}: Props) {
  const sessionId = typeof gameOptions.sessionId === 'string' ? gameOptions.sessionId : game.key
  const competitionHumanId =
    participants?.find((player) => player.isHuman)?.id ??
    store.getState().game.players.find((player) => player.isUser)?.id
  const savedChallenge = useSyncExternalStore(store.subscribe, () => {
    const pending = store.getState().challenge.pending
    return pending?.id === sessionId ? pending : null
  })
  const vipStatus = useSyncExternalStore(store.subscribe, () => store.getState().vip.status)
  const editionCheckPending = savedChallenge?.needsEditionReconciliation === true
  const editionNotice = savedChallenge?.editionChangeNotice
  const [editionCheckTimedOut, setEditionCheckTimedOut] = useState(false)
  useEffect(() => {
    if (!editionCheckPending) return
    const timer = window.setTimeout(() => setEditionCheckTimedOut(true), 20_000)
    return () => window.clearTimeout(timer)
  }, [editionCheckPending, sessionId])
  useEffect(() => {
    if (!editionCheckPending) return
    if (vipStatus === 'idle') void store.dispatch(initializeVip())
    else if (vipStatus === 'ready') store.dispatch(reconcileQuickTapChallenge())
  }, [editionCheckPending, vipStatus])
  const hasPremiumChallengesAccess = useSyncExternalStore(
    store.subscribe,
    () => selectHasPremiumChallengesAccess(store.getState()),
    () => selectHasPremiumChallengesAccess(store.getState())
  )
  const usePremiumPresentation =
    premiumPresentationOverride ??
    (hasPremiumChallengesAccess && game.premiumExperience === 'presentation')
  const quickTapVariantPreviewOverride =
    import.meta.env.DEV && typeof gameOptions.quickTapVariantPreview === 'boolean'
      ? gameOptions.quickTapVariantPreview
        ? ('vip' as const)
        : ('classic' as const)
      : undefined
  const quickTapVipEnabled =
    game.premiumExperience === 'variant' &&
    (quickTapVariantPreviewOverride
      ? quickTapVariantPreviewOverride === 'vip'
      : savedChallenge?.quickTapVariant
        ? savedChallenge.quickTapVariant === 'vip'
        : hasPremiumChallengesAccess)
  const launchedGame = useMemo(() => {
    return resolvePremiumGameForAccess(game, hasPremiumChallengesAccess)
  }, [game, hasPremiumChallengesAccess])
  const reactComponentKey = launchedGame.reactComponentKey
  const preparationKey = `${launchedGame.key}:${quickTapVipEnabled}:${usePremiumPresentation}`
  const [preparedKey, setPreparedKey] = useState<string | null>(null)
  const [preparationFailure, setPreparationFailure] = useState<string | null>(null)
  const [preparationAttempt, setPreparationAttempt] = useState(0)
  const preparationError = preparationFailure === preparationKey
  const ready =
    !editionCheckPending &&
    !editionNotice &&
    (launchedGame.implementation !== 'react' ||
      !reactComponentKey ||
      preparedKey === preparationKey)
  const hasSavedResult = Boolean(savedChallenge?.attempt && 'result' in savedChallenge.attempt)
  useEffect(() => {
    if (hasSavedResult) return
    if (launchedGame.implementation !== 'react' || !reactComponentKey) return
    let cancelled = false
    const preload =
      launchedGame.implementation === 'react' && reactComponentKey
        ? (SPECIAL_MINIGAME_PRELOADERS[reactComponentKey] ??
          (() => preloadReactMinigame(reactComponentKey)))
        : () => Promise.resolve()
    if (reactComponentKey) prepareMinigameAssets(reactComponentKey, usePremiumPresentation)
    const variant =
      reactComponentKey === 'QuickTapRace'
        ? import('../../minigames/quickTapRace/presentations').then((module) =>
            module.preloadQuickTapRace(quickTapVipEnabled)
          )
        : Promise.resolve()
    void Promise.all([preload(), variant])
      .then(() => {
        if (!cancelled) {
          setPreparedKey(preparationKey)
        }
      })
      .catch(() => {
        if (!cancelled) setPreparationFailure(preparationKey)
      })
    return () => {
      cancelled = true
    }
  }, [
    launchedGame.implementation,
    preparationKey,
    preparationAttempt,
    reactComponentKey,
    quickTapVipEnabled,
    usePremiumPresentation,
    skipCountdown,
    hasSavedResult,
  ])

  const initialResult =
    savedChallenge?.attempt && 'result' in savedChallenge.attempt
      ? savedChallenge.attempt.result
      : savedChallenge?.attempt?.status === 'playing'
        ? (recoverCommittedChallengeResult(savedChallenge, store.getState().game) ??
          createAbandonedChallengeResult(savedChallenge, competitionHumanId))
        : null
  const [phase, setPhase] = useState<HostPhase>(
    initialResult ? 'results' : skipRules ? 'countdown' : 'rules'
  )
  const hostPhaseRef = useRef(phase)
  hostPhaseRef.current = phase
  const [utilityView, setUtilityView] = useState<UtilityView>(null)
  const [countdown, setCountdown] = useState(3)
  const [finalValue, setFinalValue] = useState<number | null>(initialResult?.rawValue ?? null)
  const [finalTiebreakerMs, setFinalTiebreakerMs] = useState<number | null>(
    initialResult?.completion?.tiebreakerMs ?? null
  )
  const [finalCompletion, setFinalCompletion] = useState<ReactMinigameCompletion | null>(
    initialResult?.completion ?? null
  )
  const [wasPartial, setWasPartial] = useState(initialResult?.partial ?? false)
  const [attempt, setAttempt] = useState(savedChallenge?.attempt?.number ?? 0)
  const [demoTried, setDemoTried] = useState(false)
  const completionReportedRef = useRef(false)
  const attemptToken = `${sessionId}:${attempt}`
  const activeAttemptTokenRef = useRef(attemptToken)
  const [savingCheckpoint, setSavingCheckpoint] = useState(false)
  const [checkpointError, setCheckpointError] = useState(false)
  const retryCheckpointRef = useRef<(() => void) | null>(null)
  const startingAttemptRef = useRef(false)
  const checkpointWorkRef = useRef<{ token: string; promise: Promise<boolean> } | null>(null)

  const checkpointResult = useCallback(
    (result: CompetitionResult): Promise<boolean> => {
      if (activeAttemptTokenRef.current !== attemptToken) return Promise.resolve(false)
      const state = store.getState()
      const pending = state.challenge.pending
      if (pending?.id !== sessionId) return Promise.resolve(true)
      if (
        pending.origin &&
        (pending.origin.gameId !== state.game.gameId || pending.origin.week !== state.game.week)
      )
        return Promise.resolve(false)
      if (pending.attempt && pending.attempt.number !== attempt) return Promise.resolve(false)
      if (checkpointWorkRef.current?.token === attemptToken) {
        return checkpointWorkRef.current.promise
      }
      store.dispatch(
        checkpointChallengeResult({
          id: sessionId,
          number: attempt,
          result: { ...result, rawValue: result.completion?.rawValue ?? result.rawValue },
        })
      )
      const work = { token: attemptToken, promise: Promise.resolve(false) }
      const save = async (): Promise<boolean> => {
        setSavingCheckpoint(true)
        setCheckpointError(false)
        const saved = await persistCompetitionCheckpoint()
        if (activeAttemptTokenRef.current === attemptToken) {
          setSavingCheckpoint(false)
          setCheckpointError(!saved)
          retryCheckpointRef.current = saved
            ? null
            : () => {
                work.promise = save()
              }
        }
        return saved
      }
      work.promise = save()
      checkpointWorkRef.current = work
      return work.promise
    },
    [attempt, attemptToken, sessionId]
  )

  const reportDoneOnce = useCallback(
    (
      rawValue: number,
      partial = false,
      completion?: ReactMinigameCompletion,
      includeCompletion = completion != null
    ) => {
      if (completionReportedRef.current) return
      completionReportedRef.current = true
      const publish = (result: CompetitionResult) => {
        if (result.completion || includeCompletion) {
          onDone(result.rawValue, result.partial, result.completion)
        } else {
          onDone(result.rawValue, result.partial)
        }
      }
      const result: CompetitionResult = { rawValue, partial, ...(completion ? { completion } : {}) }
      if (store.getState().challenge.pending?.id !== sessionId) {
        publish(result)
        return
      }
      void checkpointResult(result).then((saved) => {
        if (activeAttemptTokenRef.current !== attemptToken) return
        if (!saved) {
          completionReportedRef.current = false
          return
        }
        const pending = store.getState().challenge.pending
        if (pending?.id !== sessionId || pending.attempt?.number !== attempt) return
        publish('result' in pending.attempt ? pending.attempt.result : result)
      })
    },
    [attempt, attemptToken, checkpointResult, onDone, sessionId]
  )

  const beginGameplay = useCallback(() => {
    const pending = store.getState().challenge.pending
    if (pending?.id !== sessionId) {
      setPhase('playing')
      return
    }
    if (pending.attempt?.status === 'finished' || pending.attempt?.status === 'accepted') return
    const campaign = store.getState().game
    if (
      pending.origin &&
      (pending.origin.gameId !== campaign.gameId || pending.origin.week !== campaign.week)
    )
      return
    const saveAndStart = async () => {
      if (startingAttemptRef.current || activeAttemptTokenRef.current !== attemptToken) return
      startingAttemptRef.current = true
      setSavingCheckpoint(true)
      setCheckpointError(false)
      store.dispatch(beginChallengeAttempt({ id: sessionId, number: attempt }))
      const saved = await persistCompetitionCheckpoint()
      startingAttemptRef.current = false
      if (activeAttemptTokenRef.current !== attemptToken) return
      setSavingCheckpoint(false)
      setCheckpointError(!saved)
      retryCheckpointRef.current = saved ? null : () => void saveAndStart()
      if (saved && store.getState().challenge.pending?.id === sessionId) setPhase('playing')
    }
    void saveAndStart()
  }, [attempt, attemptToken, sessionId])

  const rankingOnly = isPlacementRankingGame(launchedGame)
  const competitionRetryEnabled = competitionRetry?.enabled ?? false
  const rulesGame = useMemo(
    () =>
      (() => {
        const override =
          store.getState().remoteConfig.config?.rulesManager?.games?.[launchedGame.key]
        // Stateful rules must stay in lockstep with their resolver. Ignore remote copies
        // for these games so an older saved
        // briefing cannot describe a different ruleset.
        const resolved =
          launchedGame.key === 'silentSaboteur' || launchedGame.key === 'glass_bridge_brutal'
            ? (getCanonicalGame(launchedGame.key) ?? launchedGame)
            : override
              ? { ...launchedGame, ...override }
              : launchedGame
        if (quickTapVipEnabled) {
          return {
            ...resolved,
            title:
              resolved.key === 'quickTapSeasons'
                ? 'Quick Tap Seasons · VIP'
                : 'Quick Tap Race · VIP',
            description:
              resolved.key === 'quickTapSeasons'
                ? 'Three 28-second rounds. Read the weather, risk mystery boxes, and finish with the most points.'
                : 'Three 25-second rounds. Charge the Eye, risk mystery boxes, and finish with the most points.',
            instructions: [
              resolved.key === 'quickTapSeasons'
                ? 'Play three 28-second rounds. The season changes every seven seconds, with no preview of what comes next.'
                : 'Tap the Eye through three 25-second rounds. Your points carry over; short breaks separate the rounds.',
              resolved.key === 'quickTapSeasons'
                ? 'Spring taps score 1.25, summer 0.5, autumn 1, and winter −1. Stop tapping in winter. Once per round, Change Season randomly selects another season.'
                : 'Grab a mystery box or keep tapping. Contents stay hidden until claimed and can include rewards or handicaps.',
              'All contestants get the same mystery windows and odds. Effects activate immediately; Backfire means stop tapping briefly. Timed effects reset between rounds.',
              ...(resolved.key === 'quickTapSeasons'
                ? [
                    'Mystery contents depend on the current season. Stillness awards 14 points after two seconds without tapping; tapping cancels that bonus.',
                  ]
                : []),
              'The highest point total wins. If points tie, raw taps break the tie.',
            ],
            timeLimitMs: resolved.key === 'quickTapSeasons' ? 84_000 : 75_000,
            metricKind: 'points' as const,
            metricLabel: 'Points',
          }
        }
        return resolved
      })(),
    [launchedGame, quickTapVipEnabled]
  )

  useEffect(() => {
    // A new challenge or retry must never mount a React minigame against the
    // preceding attempt's completed feature state.
    resetHostedMinigameState(store.dispatch, launchedGame.reactComponentKey)
    completionReportedRef.current = false
    setUtilityView(null)
    setCountdown(3)
    const pending = store.getState().challenge.pending
    const savedAttempt = pending?.id === sessionId ? pending.attempt : undefined
    const result =
      savedAttempt && 'result' in savedAttempt
        ? savedAttempt.result
        : pending?.id === sessionId && savedAttempt?.status === 'playing'
          ? (recoverCommittedChallengeResult(pending, store.getState().game) ??
            createAbandonedChallengeResult(pending, competitionHumanId))
          : undefined
    setFinalValue(result?.rawValue ?? null)
    setFinalTiebreakerMs(result?.completion?.tiebreakerMs ?? null)
    setFinalCompletion(result?.completion ?? null)
    setWasPartial(result?.partial ?? false)
    setDemoTried(false)
    setPhase(result ? 'results' : skipRules ? 'countdown' : 'rules')
    setAttempt(savedAttempt?.number ?? 0)
    activeAttemptTokenRef.current = `${sessionId}:${savedAttempt?.number ?? 0}`
    checkpointWorkRef.current = null
    setSavingCheckpoint(false)
    setCheckpointError(false)
    if (result && savedAttempt?.status === 'playing') void checkpointResult(result)
    return () => {
      activeAttemptTokenRef.current = ''
      completionReportedRef.current = true
      resetHostedMinigameState(store.dispatch, launchedGame.reactComponentKey)
    }
    // The game selection is stable for a challenge session. Do not rerun this
    // boundary when access metadata changes while a game is in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, skipRules])

  useEffect(() => {
    activeAttemptTokenRef.current = attemptToken
  }, [attemptToken])

  useEffect(() => {
    onPhaseChange?.(phase)
    if (phase !== 'playing') onMusicVariantChange?.('normal')
  }, [onMusicVariantChange, onPhaseChange, phase])

  useEffect(() => {
    const handleVariant = (event: Event) => {
      const detail = (event as CustomEvent<MinigameMusicVariantDetail>).detail
      if (!detail || (detail.gameKey && detail.gameKey !== game.key)) return
      onMusicVariantChange?.(detail.variant)
    }
    window.addEventListener(MINIGAME_MUSIC_VARIANT_EVENT, handleVariant)
    return () => window.removeEventListener(MINIGAME_MUSIC_VARIANT_EVENT, handleVariant)
  }, [game.key, onMusicVariantChange])

  useEffect(() => {
    if (phase === 'results') setUtilityView(null)
  }, [phase])

  useEffect(() => {
    if (utilityView == null) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUtilityView(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [utilityView])

  useEffect(() => {
    if (phase === 'countdown' && utilityView !== null) {
      setCountdown(3)
    }
  }, [phase, utilityView])

  const handleRulesConfirm = useCallback(() => {
    setUtilityView(null)
    setCountdown(3)
    setPhase(TURN_DEMO_KEYS.has(rulesGame.key) ? 'demo' : 'countdown')
  }, [rulesGame.key])

  const handleDemoConfirm = useCallback(() => {
    if (!demoTried) return
    setCountdown(3)
    setPhase('countdown')
  }, [demoTried])

  const handleConfirmEarlyExit = useCallback(() => {
    setUtilityView(null)
    const pending = store.getState().challenge.pending
    const result: CompetitionResult =
      pending?.id === sessionId
        ? pending.attempt && 'result' in pending.attempt
          ? pending.attempt.result
          : createAbandonedChallengeResult(pending, competitionHumanId)
        : { rawValue: 0, partial: true }
    void checkpointResult(result)
    setFinalValue(result.rawValue)
    setFinalCompletion(result.completion ?? null)
    setWasPartial(result.partial)
    setPhase('results')
  }, [checkpointResult, competitionHumanId, sessionId])

  // Pause the host-owned countdown while the menu, rules, or warning is open.
  useEffect(() => {
    if (
      phase !== 'countdown' ||
      utilityView !== null ||
      !ready ||
      savingCheckpoint ||
      checkpointError
    )
      return
    if (skipCountdown) {
      const t = setTimeout(beginGameplay, 0)
      return () => clearTimeout(t)
    }
    if (countdown <= 0) {
      const t = setTimeout(beginGameplay, 600)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [
    beginGameplay,
    checkpointError,
    phase,
    countdown,
    skipCountdown,
    utilityView,
    ready,
    savingCheckpoint,
  ])

  // Keep the countdown SFX synchronized with the reset/paused visual countdown.
  useEffect(() => {
    if (phase !== 'countdown' || skipCountdown || utilityView !== null || !ready) {
      SoundManager.stop(COUNTDOWN_TIMER_KEY)
      return
    }
    void SoundManager.play(COUNTDOWN_TIMER_KEY)
    return () => SoundManager.stop(COUNTDOWN_TIMER_KEY)
  }, [phase, skipCountdown, utilityView, ready])

  const handleComplete = useCallback(
    (result: LegacyRawResult) => {
      void checkpointResult({ rawValue: result.value, partial: false })
      setFinalValue(result.value)
      setWasPartial(false)
      setPhase('results')
    },
    [checkpointResult]
  )

  const handleQuit = useCallback(
    (partial: LegacyRawResult) => {
      void checkpointResult({ rawValue: partial.value, partial: true })
      setFinalValue(partial.value)
      setWasPartial(true)
      setPhase('results')
    },
    [checkpointResult]
  )

  const handleScoredComplete = useCallback(
    (value: number, tiebreakerMs?: number, completion?: ReactMinigameCompletion) => {
      const finalResult =
        completion || tiebreakerMs != null
          ? {
              ...completion,
              ...(tiebreakerMs != null ? { tiebreakerMs } : {}),
            }
          : undefined
      void checkpointResult({
        rawValue: value,
        partial: false,
        ...(finalResult ? { completion: finalResult } : {}),
      })
      setFinalValue(value)
      setFinalTiebreakerMs(tiebreakerMs ?? null)
      setFinalCompletion(finalResult ?? null)
      setWasPartial(false)
      setPhase('results')
    },
    [checkpointResult]
  )

  const getReportedLastPlaceId = useCallback(
    (completion?: ReactMinigameCompletion) => {
      if (completion?.authoritativeLastPlaceId) return completion.authoritativeLastPlaceId
      const rankedIds = completion?.authoritativeRankedIds
      if (
        participants?.length &&
        rankedIds?.length === participants.length &&
        new Set(rankedIds).size === rankedIds.length &&
        participants.every((participant) => rankedIds.includes(participant.id))
      ) {
        return rankedIds.at(-1) ?? null
      }
      if (!completion?.rawResults || !participants?.length) return null

      const ranked = [...participants]
        .map((participant) => ({
          id: participant.id,
          score: completion.rawResults?.[participant.id] ?? participant.precomputedScore,
        }))
        .sort((a, b) =>
          game.scoringAdapter === 'lowerBetter' ? a.score - b.score : b.score - a.score
        )
      return ranked[ranked.length - 1]?.id ?? null
    },
    [game.scoringAdapter, participants]
  )

  const handleReactComplete = useCallback(
    (completion?: ReactMinigameCompletion, fallbackValue = 1, fallbackTiebreakerMs?: number) => {
      const humanId = participants?.find((participant) => participant.isHuman)?.id
      const lastPlaceId = getReportedLastPlaceId(completion)
      void checkpointResult({
        rawValue: completion?.rawValue ?? completion?.rawResults?.[humanId ?? ''] ?? fallbackValue,
        partial: false,
        ...(completion || fallbackTiebreakerMs != null
          ? {
              completion: {
                ...completion,
                ...(fallbackTiebreakerMs != null && completion?.tiebreakerMs == null
                  ? { tiebreakerMs: fallbackTiebreakerMs }
                  : {}),
              },
            }
          : {}),
      })

      // Feature-owned placement games can provide their final standings before
      // a season result has been applied. Keep the outcome inside the host when
      // the human is last so Reverse Time remains available.
      if (competitionRetryEnabled && humanId && lastPlaceId === humanId && completion) {
        setFinalCompletion(completion)
        setFinalValue(completion.rawValue ?? completion.rawResults?.[humanId] ?? fallbackValue)
        setFinalTiebreakerMs(completion.tiebreakerMs ?? fallbackTiebreakerMs ?? null)
        setWasPartial(false)
        setPhase('results')
        return
      }

      reportDoneOnce(completion?.rawValue ?? fallbackValue, false, completion, true)
    },
    [
      checkpointResult,
      competitionRetryEnabled,
      getReportedLastPlaceId,
      participants,
      reportDoneOnce,
    ]
  )

  const enrichCompletionForRetry = useCallback(
    (
      completion: ReactMinigameCompletion,
      value: number,
      tiebreakerMs?: number
    ): ReactMinigameCompletion => ({
      ...completion,
      ...(competitionRetryEnabled && completion.rawValue == null ? { rawValue: value } : {}),
      ...(tiebreakerMs != null && completion.tiebreakerMs == null ? { tiebreakerMs } : {}),
    }),
    [competitionRetryEnabled]
  )

  const handleContinue = useCallback(() => {
    const completion: ReactMinigameCompletion | undefined = finalCompletion
      ? {
          ...finalCompletion,
          ...(finalTiebreakerMs != null ? { tiebreakerMs: finalTiebreakerMs } : {}),
        }
      : finalTiebreakerMs != null
        ? {
            tiebreakerMs: finalTiebreakerMs,
          }
        : undefined
    if (completion != null) {
      reportDoneOnce(finalValue ?? 0, wasPartial, completion)
    } else {
      reportDoneOnce(finalValue ?? 0, wasPartial)
    }
  }, [finalCompletion, finalTiebreakerMs, finalValue, reportDoneOnce, wasPartial])

  const leaderboard = useMemo(() => {
    if (!participants || participants.length === 0) return null
    const reportedScores = finalCompletion?.rawResults
    const humanScore = finalValue ?? 0
    const lowerBetter = game.scoringAdapter === 'lowerBetter'
    const entries = participants.map((p) => {
      const score = reportedScores?.[p.id] ?? (p.isHuman ? humanScore : p.precomputedScore)
      const isPR =
        p.previousPR === null || (lowerBetter ? score < p.previousPR : score > p.previousPR)
      return { ...p, score, isPR }
    })
    entries.sort((a, b) => {
      const authoritativeRank = finalCompletion?.authoritativeRankedIds
      if (authoritativeRank?.length) {
        const rankA = authoritativeRank.indexOf(a.id)
        const rankB = authoritativeRank.indexOf(b.id)
        if (rankA >= 0 && rankB >= 0 && rankA !== rankB) return rankA - rankB
        if (rankA >= 0) return -1
        if (rankB >= 0) return 1
      }
      if (finalCompletion?.authoritativeWinnerId && a.id !== b.id) {
        if (a.id === finalCompletion.authoritativeWinnerId) return -1
        if (b.id === finalCompletion.authoritativeWinnerId) return 1
      }
      if (finalCompletion?.authoritativeLastPlaceId && a.id !== b.id) {
        if (a.id === finalCompletion.authoritativeLastPlaceId) return 1
        if (b.id === finalCompletion.authoritativeLastPlaceId) return -1
      }
      if (competitionRetryEnabled && wasPartial) {
        if (a.isHuman !== b.isHuman) return a.isHuman ? 1 : -1
      }
      return lowerBetter ? a.score - b.score : b.score - a.score
    })
    return entries
  }, [
    competitionRetryEnabled,
    finalCompletion,
    participants,
    finalValue,
    game.scoringAdapter,
    wasPartial,
  ])

  const humanLastPlaceEntry = leaderboard?.[leaderboard.length - 1] ?? null
  const showCompetitionRetry = competitionRetryEnabled && !!humanLastPlaceEntry?.isHuman
  const activeCompetitionRetry = showCompetitionRetry && competitionRetry ? competitionRetry : null
  const showOrganicLastPlace = showCompetitionRetry && !wasPartial
  const showTimeMachineResults = wasPartial || showOrganicLastPlace

  const handleRetryRestart = useCallback(() => {
    // A retry is a fresh run of the same selected game. Reset both the host's
    // completion latch and the child identity; a game-key-only reset is not
    // sufficient when the user deliberately plays one minigame every time.
    const restart = (number: number) => {
      resetHostedMinigameState(store.dispatch, launchedGame.reactComponentKey)
      completionReportedRef.current = false
      checkpointWorkRef.current = null
      setUtilityView(null)
      setFinalValue(null)
      setFinalTiebreakerMs(null)
      setFinalCompletion(null)
      setWasPartial(false)
      setCountdown(3)
      activeAttemptTokenRef.current = `${sessionId}:${number}`
      setAttempt(number)
      setPhase(
        skipCountdown && store.getState().challenge.pending?.id !== sessionId
          ? 'playing'
          : 'countdown'
      )
    }
    const pending = store.getState().challenge.pending
    if (pending?.id !== sessionId) {
      restart(attempt + 1)
      return
    }
    store.dispatch(prepareChallengeRetry({ id: sessionId, number: attempt }))
    const nextAttempt = store.getState().challenge.pending?.attempt
    if (nextAttempt?.status !== 'ready') return
    const persistRetry = async () => {
      setSavingCheckpoint(true)
      setCheckpointError(false)
      const saved = await persistCompetitionCheckpoint()
      if (activeAttemptTokenRef.current !== `${sessionId}:${attempt}`) return
      setSavingCheckpoint(false)
      setCheckpointError(!saved)
      retryCheckpointRef.current = saved ? null : () => void persistRetry()
      if (saved) restart(nextAttempt.number)
    }
    void persistRetry()
  }, [attempt, launchedGame.reactComponentKey, sessionId, skipCountdown])

  const renderActiveGame = () => {
    const participantIds = (participants ?? []).map((p) => p.id)
    const seed = typeof gameOptions?.seed === 'number' ? gameOptions.seed : 0
    const isActiveAttempt = () =>
      activeAttemptTokenRef.current === attemptToken && hostPhaseRef.current === 'playing'
    const handleAttemptReactComplete = (
      completion?: ReactMinigameCompletion,
      fallbackValue?: number,
      fallbackTiebreakerMs?: number
    ) => {
      if (!isActiveAttempt()) return
      handleReactComplete(completion, fallbackValue, fallbackTiebreakerMs)
    }
    const handleAttemptComplete = (result: LegacyRawResult) => {
      if (!isActiveAttempt()) return
      handleComplete(result)
    }
    const handleAttemptQuit = (result: LegacyRawResult) => {
      if (!isActiveAttempt()) return
      handleQuit(result)
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'ClosestWithoutGoingOver') {
      return (
        <ClosestWithoutGoingOverComp
          participantIds={participantIds}
          prizeType={gameOptions?.prizeType as CwgoPrizeType}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'HoldTheWall') {
      return (
        <HoldTheWallComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as HoldTheWallPrizeType}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'BiographyBlitz') {
      return (
        <BiographyBlitzComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as BiographyBlitzCompetitionType}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'FamousFigures') {
      return (
        <FamousFiguresComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as FamousFiguresPrizeType}
          seed={import.meta.env.PROD ? 0 : seed}
          onComplete={handleAttemptReactComplete}
          skipWinnerAnimation={true}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'SilentSaboteur') {
      return (
        <SilentSaboteurComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as SilentSaboteurPrizeType}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'MajorityRules') {
      if (import.meta.env.DEV) {
        console.log('MAJORITY_RULES_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <MajorityRulesComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as MajorityRulesCompetitionType) ?? 'LOH'}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'GlassBridge') {
      if (import.meta.env.DEV) {
        console.log('GLASS_BRIDGE_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <GlassBridgeComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as 'LOH' | 'POS' | undefined}
          premium={usePremiumPresentation}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'CrystalPathShattered') {
      if (import.meta.env.DEV) {
        console.log('CRYSTAL_PATH_SHATTERED_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <CrystalPathShatteredGame
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as 'LOH' | 'POS' | undefined}
          premium={usePremiumPresentation}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'BlackjackTournament') {
      return (
        <BlackjackTournamentComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as BlackjackTournamentCompetitionType) ?? 'LOH'}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'RiskWheel') {
      if (import.meta.env.DEV) {
        console.log('RISK_WHEEL_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <RiskWheelComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as RiskWheelCompetitionType) ?? 'LOH'}
          premiumPresentation={usePremiumPresentation}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'WildcardWestern') {
      return (
        <WildcardWesternComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as 'LOH' | 'POS') ?? 'LOH'}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'CodeBreaker') {
      return (
        <CodeBreakerComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as CodeBreakerPrizeType) ?? 'LOH'}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'Tetris') {
      return (
        <TetrisComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as TetrisPrizeType) ?? 'LOH'}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'HouseOfCards') {
      const isLabPreview = import.meta.env.DEV && gameOptions?.minigameLabPreview === true
      if (import.meta.env.DEV) {
        console.log('HOUSE_OF_CARDS_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: isLabPreview ? undefined : seed,
          labSeed: isLabPreview ? seed : undefined,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <HouseOfCardsComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as HouseOfCardsPrizeType) ?? 'LOH'}
          seed={isLabPreview ? seed : undefined}
          premiumPresentation={usePremiumPresentation}
          previewStage={
            import.meta.env.DEV && gameOptions?.previewStage === 'final' ? 'final' : undefined
          }
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'TiltLabyrinth') {
      return (
        <TiltLabyrinthComp
          key={`tilt-labyrinth:${seed}:${(gameOptions?.prizeType as string) ?? 'LOH'}:${participantIds.join(',')}`}
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as TiltLabyrinthPrizeType) ?? 'LOH'}
          seed={seed}
          labPreview={gameOptions?.labPreview === true}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'MemoryColors') {
      return (
        <MemoryColorsComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as MemoryColorsCompetitionType) ?? 'LOH'}
          seed={seed}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'TrapAuction') {
      return (
        <TrapAuctionComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as 'LOH' | 'POS') ?? 'LOH'}
          seed={seed}
          autoStart={true}
          onComplete={handleAttemptReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'ColorMatch') {
      if (import.meta.env.DEV) {
        console.log('COLOR_MATCH_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <ColorMatchComp
          autoStart={true}
          participantIds={participantIds}
          participants={participants}
          onFinish={(
            value: number,
            tiebreakerMs?: number,
            completion?: ReactMinigameCompletion
          ) => {
            if (!isActiveAttempt()) return
            if (completion?.authoritativeWinnerId) {
              handleAttemptReactComplete(
                enrichCompletionForRetry(completion, value, tiebreakerMs),
                value,
                tiebreakerMs
              )
              return
            }
            handleScoredComplete(value, tiebreakerMs, completion)
          }}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'Capitalization') {
      const CapitalizationComp = reactComponents.Capitalization
      const capitalizationContext =
        gameOptions.capitalizationContext === 'battleBack' ? 'battleBack' : 'loh'
      const capitalizationSeed = typeof gameOptions.seed === 'number' ? gameOptions.seed : undefined

      return (
        <CapitalizationComp
          autoStart={true}
          participantIds={participantIds}
          participants={participants}
          seed={capitalizationSeed}
          context={capitalizationContext}
          onFinish={(
            value: number,
            tiebreakerMs?: number,
            completion?: ReactMinigameCompletion
          ) => {
            if (!isActiveAttempt()) return
            if (completion?.authoritativeWinnerId) {
              handleAttemptReactComplete(
                enrichCompletionForRetry(completion, value, tiebreakerMs),
                value,
                tiebreakerMs
              )
              return
            }
            if (game.scoringAdapter === 'authoritative') {
              reportDoneOnce(value, false, completion, true)
              return
            }
            handleScoredComplete(value, tiebreakerMs, completion)
          }}
        />
      )
    }

    if (launchedGame.implementation === 'react') {
      const key = launchedGame.reactComponentKey
      if (!key) {
        throw new Error(
          `[MinigameHost] game '${launchedGame.key}' has implementation 'react' but no reactComponentKey defined. ` +
            `React-implemented games must define reactComponentKey.`
        )
      }
      const GenericComp = reactComponents[key]
      if (!GenericComp) {
        throw new Error(
          `[MinigameHost] reactComponentKey '${key}' not found in reactComponents map. ` +
            `Add it to src/minigames/reactComponents.ts. ` +
            `React-implemented games (implementation === 'react') should not use LegacyMinigameWrapper.`
        )
      }
      return (
        <GenericComp
          seed={seed}
          autoStart={key !== 'HangmanChallenge'}
          premiumPresentation={usePremiumPresentation}
          vipQuickTap={(key === 'QuickTapRace' || key === 'QuickTapSeasons') && quickTapVipEnabled}
          quickTapVariantOverride={
            key === 'QuickTapRace' || key === 'QuickTapSeasons'
              ? quickTapVariantPreviewOverride
              : undefined
          }
          previewStage={
            import.meta.env.DEV &&
            (gameOptions?.previewStage === 'round6' || gameOptions?.previewStage === 'final2')
              ? gameOptions.previewStage
              : undefined
          }
          voteEffectsEnabled={gameOptions?.voteEffectsEnabled !== false}
          participantIds={participantIds}
          participants={participants}
          relationships={
            key === 'MysticChamber' ? store.getState().social.relationships : undefined
          }
          onFinish={(
            value: number,
            tiebreakerMs?: number,
            completion?: ReactMinigameCompletion
          ) => {
            if (!isActiveAttempt()) return
            if (completion?.authoritativeWinnerId) {
              handleAttemptReactComplete(
                enrichCompletionForRetry(completion, value, tiebreakerMs),
                value,
                tiebreakerMs
              )
              return
            }
            if (game.scoringAdapter === 'authoritative') {
              reportDoneOnce(value, false, completion, true)
              return
            }
            handleScoredComplete(value, tiebreakerMs, completion)
          }}
        />
      )
    }

    return (
      <LegacyMinigameWrapper
        game={game}
        options={gameOptions}
        onComplete={handleAttemptComplete}
        onQuit={handleAttemptQuit}
      />
    )
  }

  if (editionCheckPending || editionNotice) {
    return (
      <div
        className="minigame-host"
        role="dialog"
        aria-modal="true"
        aria-label="Resume competition"
      >
        <div className="minigame-host-demo__card">
          <h2>{editionNotice ? 'Challenge edition updated' : 'Checking your challenge edition'}</h2>
          <p role="status">
            {editionNotice ??
              (vipStatus === 'error'
                ? 'We couldn’t check your purchases. Try again, or continue offline using your last confirmed access.'
                : editionCheckTimedOut
                  ? 'The purchase check is taking longer than expected. Keep waiting, or continue offline using your last confirmed access.'
                  : 'Checking your purchases before this unfinished challenge resumes…')}
          </p>
          {editionNotice ? (
            <button type="button" onClick={() => store.dispatch(acknowledgeChallengeEdition())}>
              Review rules
            </button>
          ) : vipStatus === 'error' || editionCheckTimedOut ? (
            <>
              {vipStatus === 'error' && (
                <button type="button" onClick={() => void store.dispatch(initializeVip())}>
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={() => store.dispatch(reconcileQuickTapChallenge(true))}
              >
                Continue offline
              </button>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={[
        'minigame-host',
        launchedGame.reactComponentKey === 'NumberTrivia' ||
        launchedGame.reactComponentKey === 'SnakeGame' ||
        launchedGame.reactComponentKey === 'BlackjackTournament' ||
        launchedGame.reactComponentKey === 'MysticChamber' ||
        launchedGame.reactComponentKey === 'ChainOfGreed'
          ? 'minigame-host--scrollable-game'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={`${launchedGame.title} minigame`}
    >
      {phase !== 'results' &&
        phase !== 'demo' &&
        utilityView !== 'rules' &&
        utilityView !== 'exit' && (
          <MinigameUtilityDock
            phase={phase}
            menuOpen={utilityView === 'menu'}
            onToggleMenu={() => setUtilityView((current) => (current === 'menu' ? null : 'menu'))}
            onCloseMenu={() => setUtilityView(null)}
            onOpenRules={() => setUtilityView('rules')}
            onRequestExit={() => setUtilityView('exit')}
          />
        )}

      {phase === 'rules' && (
        <MinigameRules
          game={rulesGame}
          onConfirm={handleRulesConfirm}
          onSkip={skipRules ? handleRulesConfirm : undefined}
          attemptNotice={
            savedChallenge
              ? 'Once play starts, closing the app counts as leaving this competition. Finished results are saved before Continue.'
              : undefined
          }
        />
      )}

      {phase === 'demo' && (
        <div
          className="minigame-host-demo"
          role="dialog"
          aria-modal="true"
          aria-label={`${launchedGame.title} example turn`}
        >
          <div className="minigame-host-demo__card">
            <p className="minigame-host-demo__kicker">Demo</p>
            <h2>Try it yourself</h2>
            <p className="minigame-host-demo__copy">Follow the glow and make one choice.</p>
            <MinigameTurnDemo
              gameKey={rulesGame.key}
              title={rulesGame.title}
              guided={!demoTried}
              onInteraction={() => setDemoTried(true)}
            />
            <button
              className="minigame-host-demo__start"
              onClick={handleDemoConfirm}
              disabled={!demoTried}
              autoFocus
            >
              {demoTried ? 'Got it' : 'Try it yourself first'}
            </button>
          </div>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="minigame-host-ready">
          <span className="minigame-host-ready-label">Get Ready</span>
          <span className="minigame-host-ready-game">{launchedGame.title}</span>
          {!ready ? (
            <div className="minigame-host-loading" role="status" aria-live="polite">
              {preparationError ? (
                <>
                  <p>We couldn’t prepare this game. Please try again.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPreparationFailure(null)
                      setPreparationAttempt((current) => current + 1)
                    }}
                  >
                    Try again
                  </button>
                </>
              ) : (
                `Preparing ${launchedGame.title}…`
              )}
            </div>
          ) : countdown > 0 ? (
            <span className="minigame-host-ready-count" key={countdown}>
              {countdown}
            </span>
          ) : (
            <span className="minigame-host-ready-go">GO!</span>
          )}
        </div>
      )}

      {phase === 'playing' && (
        <div
          className={[
            'minigame-host-playing',
            launchedGame.reactComponentKey === 'NumberTrivia'
              ? 'minigame-host-playing--number-trivia'
              : '',
            launchedGame.reactComponentKey === 'SnakeGame' ? 'minigame-host-playing--snake' : '',
            launchedGame.reactComponentKey === 'BlackjackTournament'
              ? 'minigame-host-playing--blackjack'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          key={`${sessionId}:${attempt}`}
        >
          <Suspense
            fallback={
              <div className="minigame-host-loading" role="status" aria-live="polite">
                Preparing {launchedGame.title}…
              </div>
            }
          >
            <CompetitionResultContext.Provider value={checkpointResult}>
              {renderActiveGame()}
            </CompetitionResultContext.Provider>
          </Suspense>
        </div>
      )}

      {(savingCheckpoint || checkpointError) && (
        <div className="minigame-checkpoint-overlay" role={checkpointError ? 'alert' : 'status'}>
          <div className="minigame-host-demo__card">
            <p>
              {checkpointError
                ? 'We couldn’t save this competition. Try saving again to continue.'
                : 'Saving competition…'}
            </p>
            {checkpointError && (
              <button type="button" onClick={() => retryCheckpointRef.current?.()}>
                Try saving again
              </button>
            )}
          </div>
        </div>
      )}

      {utilityView === 'rules' &&
        phase !== 'results' &&
        (quickTapVipEnabled ? (
          createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 9800 }}>
              <MinigameRules
                game={rulesGame}
                mode="reference"
                confirmLabel={phase === 'countdown' ? 'Return to countdown' : 'Return to game'}
                onConfirm={() => setUtilityView(null)}
              />
            </div>,
            document.body
          )
        ) : (
          <MinigameRules
            game={rulesGame}
            mode="reference"
            confirmLabel={phase === 'countdown' ? 'Return to countdown' : 'Return to game'}
            onConfirm={() => setUtilityView(null)}
          />
        ))}

      {utilityView === 'exit' &&
        phase !== 'results' &&
        createPortal(
          <div
            className={`minigame-exit-confirm-overlay${
              launchedGame.reactComponentKey === 'GatesOfTheEye'
                ? ' minigame-exit-confirm-overlay--obsidian'
                : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Leave competition confirmation"
          >
            <div className="minigame-exit-confirm">
              <p className="minigame-exit-confirm__eyebrow">Emergency exit</p>
              <h2 className="minigame-exit-confirm__title">Leave this competition?</h2>
              <p className="minigame-exit-confirm__copy">
                Your score will be recorded as 0. The remaining results will be simulated so the
                season can continue and a winner can still be selected.
              </p>
              <div className="minigame-exit-confirm__actions">
                <button
                  type="button"
                  className="minigame-exit-confirm__button minigame-exit-confirm__button--keep"
                  onClick={() => setUtilityView(null)}
                  autoFocus
                >
                  Keep playing
                </button>
                <button
                  type="button"
                  className="minigame-exit-confirm__button minigame-exit-confirm__button--exit"
                  onClick={handleConfirmEarlyExit}
                >
                  Exit with 0
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {phase === 'results' && (
        <div
          className={`minigame-host-results ${showTimeMachineResults ? 'minigame-host-results--timeline' : ''}`}
        >
          {showTimeMachineResults && (
            <div className="minigame-host-results-rift" aria-hidden="true" />
          )}
          {showTimeMachineResults && (
            <button
              type="button"
              className="minigame-host-results-close"
              aria-label="Close results"
              onClick={() => {
                if (showCompetitionRetry) competitionRetry?.onContinueWithoutRetry?.()
                handleContinue()
              }}
            >
              ×
            </button>
          )}
          {showTimeMachineResults && (
            <p className="minigame-host-results-kicker">
              {showOrganicLastPlace ? 'Alternative universe' : 'Temporal rupture'}
            </p>
          )}
          <h2 className="minigame-host-results-title">
            {showOrganicLastPlace ? 'Is this real?' : wasPartial ? 'Exited early' : '🏁 Finished!'}
          </h2>
          {showTimeMachineResults && (
            <div className="minigame-host-results-divider" aria-hidden="true">
              <span />
            </div>
          )}

          {leaderboard ? (
            <>
              {showTimeMachineResults && (
                <p className="minigame-host-results-alternate-timeline">
                  {showOrganicLastPlace
                    ? "A time shift seems to have opened an alternative universe, because somehow you finished last. You're definitely not a loser, so this must be a temporal rift. Use the time machine to set things straight."
                    : 'You slipped out of the timeline. While you were gone, the competition resolved in an alternate universe.'}
                </p>
              )}
              <p
                className={`minigame-host-results-winner ${showTimeMachineResults ? 'minigame-host-results-winner--timeline' : ''}`}
              >
                {showTimeMachineResults && (
                  <span className="minigame-host-results-trophy" aria-hidden="true">
                    🏆
                  </span>
                )}
                <span>
                  {leaderboard[0]?.name ?? 'Unknown'} wins
                  {leaderboard[0]?.isHuman ? " — that's you!" : '!'}
                </span>
              </p>
              <ol className="minigame-host-leaderboard">
                {leaderboard.map((entry, i) => (
                  <li
                    key={entry.id}
                    className={[
                      'minigame-host-leaderboard-entry',
                      entry.isHuman ? 'minigame-host-leaderboard-entry--you' : '',
                      i === 0 ? 'minigame-host-leaderboard-entry--winner' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="minigame-host-leaderboard-rank" aria-hidden="true">
                      {MEDALS[i] ?? `${i + 1}.`}
                    </span>
                    <span className="minigame-host-leaderboard-name">
                      {entry.name}
                      {entry.isHuman && (
                        <span className="minigame-host-leaderboard-you"> (You)</span>
                      )}
                    </span>
                    <span className="minigame-host-leaderboard-score">
                      {rankingOnly ? (
                        <>
                          {game.metricLabel}: <strong>{fmtOrdinal(i + 1)}</strong>
                        </>
                      ) : (
                        <>
                          {game.metricLabel}: <strong>{fmtScore(entry.score)}</strong>
                        </>
                      )}
                      {!rankingOnly && entry.isPR && (
                        <span className="minigame-host-leaderboard-pr" title="Personal Record!">
                          {' '}
                          🏅 PR
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="minigame-host-results-score">
              {game.metricLabel}: <strong>{fmtScore(finalValue ?? 0)}</strong>
              {wasPartial && ' (partial)'}
            </p>
          )}

          <div className="minigame-host-results-actions">
            {activeCompetitionRetry && (
              <div
                className="minigame-host-results-retry"
                role="group"
                aria-label="Competition retry"
              >
                <button
                  className="minigame-host-results-btn minigame-host-results-btn--retry"
                  onClick={() => activeCompetitionRetry.onWatch(handleRetryRestart)}
                  disabled={activeCompetitionRetry.pending}
                  autoFocus
                >
                  {activeCompetitionRetry.pending ? (
                    'Opening Ad…'
                  ) : (
                    <>
                      <span className="minigame-host-results-rewind" aria-hidden="true">
                        ◀◀
                      </span>
                      Reverse time
                    </>
                  )}
                </button>
                <p className="minigame-host-results-retry-copy">
                  Watch a short ad to retry before this result is locked in.
                </p>
              </div>
            )}

            {(!showTimeMachineResults || !showCompetitionRetry) && (
              <button
                className="minigame-host-results-btn"
                onClick={() => {
                  if (showCompetitionRetry) competitionRetry?.onContinueWithoutRetry?.()
                  handleContinue()
                }}
                {...(!showCompetitionRetry ? { autoFocus: true } : {})}
              >
                {showCompetitionRetry ? 'No Thanks — Continue ▶' : 'Continue ▶'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
