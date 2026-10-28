import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import AvatarTile from './AvatarTile'
import ReunionGuestInteractionDialog from './ReunionGuestInteractionDialog'
import StatusPill from '../ui/StatusPill'
import SurvivorStandoutCard from '../SurvivorStandout/SurvivorStandoutCard'
import SpotlightEvictionOverlay from '../Eviction/SpotlightEvictionOverlay'
import styles from './HouseguestGrid.module.css'
import './cupidRoseGold/CupidRoseGold.css'

import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { createGameFieldEquality } from '../../store/gameFieldEquality'
import { advance, clearSurvivorReplacementTransition } from '../../store/gameSlice'
import { selectSurvivorStandout, type SurvivorStandoutMode } from '../../modes/survivorStandout'

const houseguestGridGameEquality = createGameFieldEquality([
  'cupidArrow',
  'depressionShock',
  'gameId',
  'mode',
  'modeSpecific',
  'phase',
  'players',
  'season',
  'week',
  'weekendInterlude',
])
import { getCupidPair, isCupidArrowVisualsRevealed } from '../../features/twists/cupidArrow'
import { resolveCupidLoveAvatar } from '../../utils/cupidLoveAvatar'

const HOUSEMATES_SECTION_TITLE = 'HUBMATES'

type RoboStatsSummary = {
  daysInGame?: number | null
  lohWins?: number | null
  posWins?: number | null
  averageLohRank?: number | null
  averagePosRank?: number | null
}

export type Houseguest = {
  id: string | number
  name: string
  avatarUrl?: string
  isEvicted?: boolean
  isYou?: boolean
  onClick?: () => void
  roboStats?: RoboStatsSummary
  /**
   * Called when the user has held their finger down long enough to trigger the
   * hold-preview threshold. The caller should show a transient profile preview.
   */
  onHoldPreviewStart?: () => void
  /**
   * Called when the user lifts or cancels their finger after a hold-preview was
   * triggered. The caller should dismiss the transient preview.
   */
  onHoldPreviewEnd?: () => void
  /**
   * Game status string(s) to display as badge overlays.
   * Accepts a single PlayerStatus value (e.g. 'loh', 'nominated+pos')
   * or an array of status codes.
   */
  statuses?: string | string[]
  /**
   * Final placement rank: 1 (winner 🥇), 2 (runner-up 🥈), or 3 (3rd 🥉).
   */
  finalRank?: 1 | 2 | 3 | null
  /**
   * When false, suppresses the permanent badge stack on this tile.
   * Set to false while a ceremony animation is playing so the animated badge
   * is the only badge visible during the sequence.
   */
  showPermanentBadge?: boolean
  /**
   * Framer Motion layoutId for the shared layout match-cut animation.
   * When set, the avatar tile participates in the hero animation with EvictionSplash.
   */
  layoutId?: string
  /**
   * When true, the tile hides itself (opacity 0) while the eviction overlay is
   * active, so the shared-layout portrait is the only visible instance.
   */
  isEvicting?: boolean
  isSurveyevalEvicting?: boolean
  nominationCeremonyState?: 'loh' | 'danger' | 'locked'
}

type Props = {
  houseguests: Houseguest[]
  showCountInHeader?: boolean
  overlaySelector?: string | null
  /** Total grid size (12 or 16). Placeholder tiles will pad to this count. */
  gridSize?: number
  /** Number of placeholder tiles to append after real houseguests. */
  placeholderCount?: number
  /** When true, reduces avatar/tile size and spacing for a denser layout. */
  compact?: boolean
  /** Responsive budget-selected roster behavior. */
  rosterMode?: 'normal' | 'compact-small' | 'scroll'
  /** Whether the HOUSEMATES row stays above the board or moves into the TV chip. */
  headerMode?: 'tv-chip' | 'persistent'
  /** Optional alive/total chip shown beside the section heading. */
  occupancyLabel?: string
  /** Active player whose eviction cinematic is being played in reverse. */
  returningPlayerId?: string | null
  /** Called after the reverse-eviction cinematic settles into the roster tile. */
  onReturnAnimationDone?: () => void
  /** Shows the game-log launcher at the right edge of a persistent roster header. */
  showRosterLogLauncher?: boolean
  /** Opens the log directly when the roster owns the visible launcher. */
  onOpenGameLog?: () => void
  /** Holds visual player names until the season-opening reveal has played. */
  showNames?: boolean
}

function resolveSurvivorStandoutMode(options: {
  compact: boolean
  rosterMode: 'normal' | 'compact-small' | 'scroll'
  viewportWidth: number
  viewportHeight: number
}): SurvivorStandoutMode {
  if (
    options.rosterMode === 'scroll' ||
    options.viewportHeight < 700 ||
    options.viewportWidth < 360
  ) {
    return 'mini-chip'
  }
  if (options.viewportWidth >= 720) return 'full-card'
  if (options.compact || options.rosterMode === 'compact-small') return 'compact-strip'
  return 'full-card'
}

export default function HouseguestGrid({
  houseguests,
  showCountInHeader = false,
  overlaySelector,
  gridSize,
  placeholderCount = 0,
  compact = false,
  rosterMode = 'normal',
  headerMode = 'tv-chip',
  occupancyLabel,
  returningPlayerId = null,
  onReturnAnimationDone,
  showRosterLogLauncher = false,
  onOpenGameLog,
  showNames = true,
}: Props) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game, houseguestGridGameEquality)
  const reunionReturnIds = useMemo(() => {
    const weekend = game.weekendInterlude
    if (
      weekend?.debug === true &&
      weekend.stage === 'finale_reunion' &&
      weekend.reunionPreview &&
      weekend.reunionPreviewEnded !== true
    ) {
      return new Set(weekend.reunionPreview.guestIds)
    }

    const liveFinaleReunionActive =
      weekend?.active === true &&
      weekend.finaleWeekend === true &&
      weekend.weekendDay === 2 &&
      (weekend.stage === 'finale_reunion_social' ||
        weekend.stage === 'finale_sequester_announcement' ||
        weekend.stage === 'finale_battle_ready' ||
        (weekend.stage === 'tribunal_invitation' && weekend.tribunalGlimpse?.opened === true) ||
        ((weekend.stage === 'tribunal_invitation' || weekend.stage === 'tribunal_glimpse') &&
          weekend.tribunalGlimpse?.opened === true)) &&
      weekend.reunionPreviewEnded !== true &&
      weekend.reunionDeparted !== true &&
      (weekend.stage === 'finale_reunion_social' ||
        weekend.stage === 'finale_sequester_announcement' ||
        weekend.stage === 'finale_battle_ready' ||
        (weekend.stage === 'tribunal_invitation' && weekend.tribunalGlimpse?.opened === true) ||
        ((weekend.stage === 'tribunal_invitation' || weekend.stage === 'tribunal_glimpse') &&
          weekend.tribunalGlimpse?.opened === true) ||
        weekend.reunionDepartureActive === true)

    if (!liveFinaleReunionActive) return new Set<string>()

    return new Set(
      game.players
        .filter((player) => player.status === 'evicted' || player.status === 'jury')
        .map((player) => player.id)
    )
  }, [game.players, game.weekendInterlude])
  const cupidVisualsRevealed = isCupidArrowVisualsRevealed(game)
  const previousCupidVisualsRevealedRef = useRef(cupidVisualsRevealed)
  const cupidPairFocusTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [cupidRevealAnimating, setCupidRevealAnimating] = useState(false)
  const [cupidReturnAnimating, setCupidReturnAnimating] = useState(false)
  const [focusedCupidPairId, setFocusedCupidPairId] = useState<string | null>(null)
  const challengeHistory = useAppSelector((s) => s.challenge?.history ?? [])
  const weekend = game.weekendInterlude
  const canInteractWithReunionGuests =
    weekend?.active === true &&
    weekend.finaleWeekend === true &&
    weekend.weekendDay === 2 &&
    weekend.reunionDepartureActive !== true &&
    weekend.reunionDeparted !== true &&
    (weekend.stage === 'finale_reunion_social' ||
      (weekend.debug === true &&
        weekend.reunionPreview !== undefined &&
        weekend.stage === 'finale_reunion'))

  const [reunionSelection, setReunionSelection] = useState<{
    eligible: boolean
    guestId: string | null
  }>(() => ({ eligible: canInteractWithReunionGuests, guestId: null }))
  if (reunionSelection.eligible !== canInteractWithReunionGuests) {
    setReunionSelection({ eligible: canInteractWithReunionGuests, guestId: null })
  }
  const selectedReunionGuestId = reunionSelection.guestId
  const setSelectedReunionGuestId = useCallback(
    (guestId: string | null) =>
      setReunionSelection({ eligible: canInteractWithReunionGuests, guestId }),
    [canInteractWithReunionGuests]
  )
  useEffect(() => {
    const wasRevealed = previousCupidVisualsRevealedRef.current
    previousCupidVisualsRevealedRef.current = cupidVisualsRevealed
    if (!wasRevealed && cupidVisualsRevealed) {
      const revealTimer = window.setTimeout(() => setCupidRevealAnimating(true), 0)
      const resetTimer = window.setTimeout(() => setCupidRevealAnimating(false), 2200)
      return () => {
        window.clearTimeout(revealTimer)
        window.clearTimeout(resetTimer)
      }
    }
    if (wasRevealed && !cupidVisualsRevealed && game.cupidArrow?.status === 'broken') {
      const returnTimer = window.setTimeout(() => {
        setCupidRevealAnimating(false)
        setCupidReturnAnimating(true)
      }, 0)
      const resetTimer = window.setTimeout(() => setCupidReturnAnimating(false), 1350)
      return () => {
        window.clearTimeout(returnTimer)
        window.clearTimeout(resetTimer)
      }
    }
    if (!cupidVisualsRevealed) {
      const resetTimer = window.setTimeout(() => setCupidRevealAnimating(false), 0)
      return () => window.clearTimeout(resetTimer)
    }
  }, [cupidVisualsRevealed, game.cupidArrow?.status])

  useEffect(
    () => () => {
      if (cupidPairFocusTimerRef.current) window.clearTimeout(cupidPairFocusTimerRef.current)
    },
    []
  )

  useEffect(() => {
    if (canInteractWithReunionGuests) return
    const resetTimer = window.setTimeout(() => setSelectedReunionGuestId(null), 0)
    return () => window.clearTimeout(resetTimer)
  }, [canInteractWithReunionGuests, setSelectedReunionGuestId])

  const focusCupidPair = (pairId: string | null, hold = false) => {
    if (!cupidVisualsRevealed || !pairId) return
    if (cupidPairFocusTimerRef.current) window.clearTimeout(cupidPairFocusTimerRef.current)
    setFocusedCupidPairId(pairId)
    if (hold) {
      cupidPairFocusTimerRef.current = window.setTimeout(() => {
        setFocusedCupidPairId(null)
        cupidPairFocusTimerRef.current = null
      }, 1200)
    }
  }
  const returningPlayer = useMemo(
    () =>
      returningPlayerId
        ? (game.players.find((player) => player.id === returningPlayerId) ?? null)
        : null,
    [game.players, returningPlayerId]
  )
  const selectedReunionGuest = useMemo(
    () =>
      selectedReunionGuestId
        ? (game.players.find((player) => String(player.id) === selectedReunionGuestId) ?? null)
        : null,
    [game.players, selectedReunionGuestId]
  )
  const survivorReplacementTransition =
    game.modeSpecific?.kind === 'survival'
      ? (game.modeSpecific.replacementTransition ?? null)
      : null
  const survivorRoboStatsById = useMemo(() => {
    const statsById = new Map<string, RoboStatsSummary>()
    if (game.mode !== 'survival') return statsById
    const currentDay =
      game.modeSpecific?.kind === 'survival' ? game.modeSpecific.currentDay : game.week
    game.players.forEach((player) => {
      if (!player.isRobo) return
      const entryDay = player.survivorEntryDay ?? 1
      statsById.set(player.id, {
        daysInGame: Math.max(1, currentDay - entryDay + 1),
        lohWins: player.stats?.lohWins ?? 0,
        posWins: player.stats?.posWins ?? 0,
        averageLohRank: null,
        averagePosRank: null,
      })
    })
    return statsById
  }, [game.mode, game.modeSpecific, game.players, game.week])
  const renderedHouseguests = useMemo(() => {
    return houseguests
  }, [houseguests])
  const liveEliminationActive = game.phase === 'live_vote' || game.phase === 'eviction_results'
  const headerSignal = occupancyLabel ?? `${renderedHouseguests.length}`
  const showSurvivorStandout = game.mode === 'survival' && overlaySelector === '.game-control-dock'
  const survivorStandout = useMemo(
    () => (showSurvivorStandout ? selectSurvivorStandout(game, challengeHistory) : null),
    [challengeHistory, game, showSurvivorStandout]
  )
  const visualViewport = typeof window === 'undefined' ? undefined : window.visualViewport
  const viewportWidth =
    visualViewport?.width ?? (typeof window === 'undefined' ? 0 : window.innerWidth)
  const viewportHeight =
    visualViewport?.height ?? (typeof window === 'undefined' ? 0 : window.innerHeight)
  const survivorStandoutMode = resolveSurvivorStandoutMode({
    compact,
    rosterMode,
    viewportWidth,
    viewportHeight,
  })

  useEffect(() => {
    if (survivorReplacementTransition === null) return undefined
    const remainingMs = Math.max(
      0,
      survivorReplacementTransition.startedAt +
        survivorReplacementTransition.durationMs -
        Date.now()
    )
    const timer = window.setTimeout(() => {
      dispatch(clearSurvivorReplacementTransition())
      dispatch(advance())
    }, remainingMs)
    return () => window.clearTimeout(timer)
  }, [dispatch, survivorReplacementTransition])

  const gridSizeClass = gridSize === 16 ? styles.hgGrid16 : gridSize === 12 ? styles.hgGrid12 : ''
  const effectiveCompactLayout = compact ? 'small' : 'default'
  const listClassName = `${styles.grid}${gridSizeClass ? ` ${gridSizeClass}` : ''}`
  const itemClassName = styles.gridItem
  const sectionClassName = [
    styles.container,
    compact ? styles.compact : '',
    effectiveCompactLayout === 'small' ? styles.compactSmall : '',
    rosterMode === 'scroll' ? styles.scrollRoster : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <section
        className={sectionClassName}
        aria-labelledby="houseguests-heading"
        data-compact-layout={effectiveCompactLayout}
        data-roster-mode={rosterMode}
        data-header-mode={headerMode}
        data-surveyeval-replacement={survivorReplacementTransition ? 'active' : undefined}
        data-houseguest-roster="true"
      >
        <div key={headerSignal} className={styles.headerRow} aria-live="polite">
          <h3 id="houseguests-heading" className={styles.header}>
            {HOUSEMATES_SECTION_TITLE}
            {showCountInHeader && (
              <span className={styles.count}> ({renderedHouseguests.length})</span>
            )}
            {!showCountInHeader && (
              <span className="visually-hidden"> ({renderedHouseguests.length})</span>
            )}
          </h3>
          {occupancyLabel && (
            <StatusPill
              variant="ghost"
              label={occupancyLabel}
              ariaLabel={`${occupancyLabel} hubmates`}
            />
          )}
          {showRosterLogLauncher && (
            <button
              type="button"
              className={styles.rosterLogLauncher}
              aria-label="Open game log"
              data-onboarding-target="game-log"
              onClick={() => {
                if (onOpenGameLog) {
                  onOpenGameLog()
                  return
                }
                ;(window as Window & { __openTVGameLog?: () => void }).__openTVGameLog?.()
                const event = new CustomEvent('tv:open-game-log')
                window.dispatchEvent(event)
                document.dispatchEvent(new CustomEvent('tv:open-game-log'))
                window.setTimeout(() => {
                  document.querySelector<HTMLButtonElement>('.tv-log__launcher')?.click()
                }, 0)
              }}
            >
              <span aria-hidden="true">☷</span>
              <span>Log</span>
            </button>
          )}
        </div>

        <p id="houseguests-interaction-instructions" className={styles.interactionInstructions}>
          Tap a player to interact. Press and hold to preview their profile.
        </p>

        <ul
          className={listClassName}
          role="list"
          data-roster-scroll={rosterMode === 'scroll' ? 'true' : undefined}
        >
          {renderedHouseguests.map((hg) => {
            const isReunionPresent = reunionReturnIds.has(String(hg.id))
            const isReunionDeparting =
              isReunionPresent && game.weekendInterlude?.reunionDepartureActive === true
            const isReunionReturning =
              isReunionPresent &&
              !isReunionDeparting &&
              (game.weekendInterlude?.reunionPreview !== undefined ||
                game.weekendInterlude?.stage === 'finale_reunion_social' ||
                (game.weekendInterlude?.stage === 'tribunal_invitation' &&
                  game.weekendInterlude.tribunalGlimpse === undefined))
            const reunionPlayerIndex = isReunionPresent
              ? Array.from(reunionReturnIds).indexOf(String(hg.id))
              : -1
            const resolvedRoboStats = hg.roboStats ?? survivorRoboStatsById.get(String(hg.id))
            const cupidPair = cupidVisualsRevealed ? getCupidPair(game, String(hg.id)) : null
            const cupidPartnerId = cupidPair?.memberIds.find((id) => id !== String(hg.id))
            const cupidPartnerName = cupidPartnerId
              ? game.players.find((player) => player.id === cupidPartnerId)?.name
              : undefined
            return (
              <li
                key={hg.id}
                className={`${itemClassName}${focusedCupidPairId === cupidPair?.id ? ` ${styles.cupidPairFocused}` : ''}`}
                data-player-id={String(hg.id)}
                data-reunion-return={isReunionReturning ? 'true' : undefined}
                data-replacement-target={
                  survivorReplacementTransition?.incomingPlayerId === String(hg.id)
                    ? 'true'
                    : undefined
                }
                data-depression-target={!hg.isYou && !hg.isEvicted ? 'true' : undefined}
                onPointerEnter={() => focusCupidPair(cupidPair?.id ?? null)}
                onPointerLeave={() => setFocusedCupidPairId(null)}
                onFocusCapture={() => focusCupidPair(cupidPair?.id ?? null)}
                onBlurCapture={() => setFocusedCupidPairId(null)}
                onPointerDown={() => focusCupidPair(cupidPair?.id ?? null, true)}
              >
                <AvatarTile
                  name={hg.name}
                  avatarUrl={
                    cupidVisualsRevealed ? resolveCupidLoveAvatar(hg.avatarUrl) : hg.avatarUrl
                  }
                  isEvicted={isReunionPresent ? false : hg.isEvicted}
                  isYou={hg.isYou}
                  onClick={() => {
                    if (canInteractWithReunionGuests && isReunionPresent && !hg.isYou) {
                      setSelectedReunionGuestId(String(hg.id))
                      return
                    }
                    hg.onClick?.()
                  }}
                  roboStats={resolvedRoboStats}
                  onHoldPreviewStart={hg.onHoldPreviewStart}
                  onHoldPreviewEnd={hg.onHoldPreviewEnd}
                  statuses={isReunionPresent && !isReunionDeparting ? '' : hg.statuses}
                  finalRank={hg.finalRank}
                  showPermanentBadge={hg.showPermanentBadge}
                  layoutId={hg.layoutId}
                  isEvicting={hg.isEvicting}
                  isSurveyevalEvicting={hg.isSurveyevalEvicting}
                  isReunionReturning={isReunionReturning}
                  isReunionDeparting={isReunionDeparting}
                  reunionEntryDelayMs={
                    isReunionPresent
                      ? Math.min(reunionPlayerIndex * (isReunionDeparting ? 90 : 38), 1080)
                      : undefined
                  }
                  nominationCeremonyState={hg.nominationCeremonyState}
                  descriptionId="houseguests-interaction-instructions"
                  pairColor={cupidPair?.color}
                  pairIndex={cupidPair ? Number(cupidPair.id.replace(/\D+/g, '')) - 1 : undefined}
                  pairLabel={
                    cupidPair ? `Pair ${cupidPair.id.replace('cupid-pair-', '')}` : undefined
                  }
                  partnerName={cupidPartnerName}
                  cupidLoveRevealed={cupidRevealAnimating}
                  cupidLoveReturning={cupidReturnAnimating}
                  depressionRecovery={
                    game.depressionShock?.recoveryWeek === game.week && !hg.isEvicted
                  }
                  liveEvictionNominee={
                    liveEliminationActive &&
                    !hg.isEvicted &&
                    (Array.isArray(hg.statuses)
                      ? hg.statuses
                      : (hg.statuses?.split('+') ?? [])
                    ).includes('nominated')
                  }
                  showName={showNames}
                  animateNameReveal={showNames && game.week === 1}
                  evictionMarkKey={`bbmobilenew:eviction-mark:${game.gameId}:${hg.id}`}
                />
              </li>
            )
          })}
          {Array.from({ length: placeholderCount }).map((_, i) => (
            <li key={`placeholder-${i}`} className={`${itemClassName} ${styles.hgTileInactive}`}>
              <img
                src={`${import.meta.env.BASE_URL}avatars/placeholder.png`}
                alt=""
                aria-hidden="true"
                className={styles.hgPlaceholderImg}
              />
              <span className={styles.hgPlaceholderLabel}>Inactive</span>
            </li>
          ))}
        </ul>
        {survivorStandout && (
          <SurvivorStandoutCard standout={survivorStandout} mode={survivorStandoutMode} />
        )}
      </section>

      {canInteractWithReunionGuests && selectedReunionGuest && (
        <ReunionGuestInteractionDialog
          key={selectedReunionGuest.id}
          player={selectedReunionGuest}
          onClose={() => setSelectedReunionGuestId(null)}
        />
      )}

      <AnimatePresence>
        {returningPlayer && onReturnAnimationDone && (
          <SpotlightEvictionOverlay
            key={`battle-back-return-${returningPlayer.id}`}
            evictee={returningPlayer}
            contextLabel={`Season ${game.season} · Day ${game.week}`}
            layoutId={`avatar-tile-${returningPlayer.id}`}
            variant="return"
            onDone={onReturnAnimationDone}
            devSkip={import.meta.env.DEV || import.meta.env.CI === 'true'}
          />
        )}
      </AnimatePresence>
    </>
  )
}
