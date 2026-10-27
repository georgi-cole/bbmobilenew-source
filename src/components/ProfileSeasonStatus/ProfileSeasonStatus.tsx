import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppSelector } from '../../store/hooks'
import { selectIsGuest } from '../../store/profilesSlice'
import { publicOpinionConfig } from '../../publicOpinion/publicOpinionConfig'
import { normalizeAffinity } from '../../social/affinityUtils'
import type { Phase, Player, StatusPillVariant } from '../../types'
import '../ui/StatusPill.css'
import './ProfileSeasonStatus.css'

const HOLD_REVEAL_DELAY_MS = 360
const EMPTY_NOMINEES: string[] = []

const PHASE_SHORT_LABELS: Partial<Record<Phase, string>> = {
  // i18n-ignore: Legacy compact phase-label registry stores canonical English copy
  season_start: 'Season',
  week_start: 'Start',
  loh_comp_announcement: 'LOH',
  loh_comp: 'LOH',
  loh_results: 'LOH',
  social_1: 'Social',
  nominations: 'Noms',
  nomination_results: 'Noms',
  pre_veto_public_save: 'Public',
  pos_comp_announcement: 'POS',
  pos_comp: 'POS',
  pos_results: 'POS',
  pos_ceremony: 'Safety',
  pos_ceremony_results: 'Safety',
  social_2: 'Social',
  live_vote: 'Vote',
  eviction_results: 'Evict',
  week_end: 'End',
  final4_eviction: 'F4',
  final3: 'Finale',
  final3_comp1: 'F3 P1',
  final3_comp1_minigame: 'F3 P1',
  final3_comp2: 'F3 P2',
  final3_comp2_minigame: 'F3 P2',
  final3_comp3: 'F3 P3',
  final3_comp3_minigame: 'F3 P3',
  final3_decision: 'Final Power Decision',
  jury_announcement: 'Tribunal',
  jury_cinematic: 'Tribunal',
  jury: 'Tribunal',
}

type StatusChipData = {
  id: string
  icon: string
  variant: StatusPillVariant
  shortValue: string
  detailLabel: string
  detailValue: string
  detailHint?: string
}

function findApprovalBand(approval: number): string {
  return (
    publicOpinionConfig.approvalBands.find((band) => approval >= band.min && approval <= band.max)
      ?.label ?? 'mixed'
  )
}

function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`
}

function formatPhaseLabel(phase: Phase): string {
  const short = PHASE_SHORT_LABELS[phase]
  if (short) return short
  return phase
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function describeHouseRating(rating: number): string {
  if (rating >= 80) return 'Trusted'
  if (rating >= 60) return 'Liked'
  if (rating >= 40) return 'Mixed'
  if (rating >= 20) return 'Distrusted'
  return 'Targeted'
}

function buildNominationChip(nomineeIds: string[], userPlayer: Player | null): StatusChipData {
  if (userPlayer?.finalRank === 1) {
    return {
      id: 'winner',
      icon: '🏆',
      variant: 'success',
      shortValue: 'Winner',
      detailLabel: 'Season result',
      detailValue: 'Winner',
    }
  }
  if (userPlayer?.finalRank === 2) {
    return {
      id: 'runner-up',
      icon: '🥈',
      variant: 'info',
      shortValue: 'Runner-up',
      detailLabel: 'Season result',
      detailValue: 'Runner-up',
    }
  }
  if (userPlayer?.status === 'jury') {
    return {
      id: 'jury',
      icon: '⚖️',
      variant: 'info',
      shortValue: 'Tribunal',
      detailLabel: 'Hub status',
      detailValue: 'Tribunal member',
    }
  }
  if (userPlayer?.status === 'evicted') {
    return {
      id: 'evicted',
      icon: '🚪',
      variant: 'neutral',
      shortValue: 'Out',
      detailLabel: 'Hub status',
      detailValue: 'Eliminated',
    }
  }
  if (nomineeIds.includes(userPlayer?.id ?? 'user')) {
    return {
      id: 'nominated',
      icon: '🎯',
      variant: 'danger',
      shortValue: 'Nominated',
      detailLabel: 'Nomination status',
      detailValue: 'On the block',
    }
  }
  return {
    id: 'safe',
    icon: '🛡️',
    variant: 'success',
    shortValue: 'Safe',
    detailLabel: 'Nomination status',
    detailValue: 'Safe this round',
  }
}

function HoldRevealPill({
  icon,
  variant,
  shortValue,
  detailLabel,
  detailValue,
  detailHint,
}: StatusChipData) {
  const [revealed, setRevealed] = useState(false)
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearRevealTimeout() {
    if (!revealTimeoutRef.current) return
    clearTimeout(revealTimeoutRef.current)
    revealTimeoutRef.current = null
  }

  function startReveal() {
    clearRevealTimeout()
    revealTimeoutRef.current = setTimeout(() => {
      setRevealed(true)
      revealTimeoutRef.current = null
    }, HOLD_REVEAL_DELAY_MS)
  }

  function stopReveal() {
    clearRevealTimeout()
    setRevealed(false)
  }

  useEffect(() => () => clearRevealTimeout(), [])

  const ariaLabel = detailHint
    ? `${detailLabel}: ${detailValue}. ${detailHint}. Press and hold for details.`
    : `${detailLabel}: ${detailValue}. Press and hold for details.`
  const title = detailHint
    ? `${detailLabel}: ${detailValue} • ${detailHint}`
    : `${detailLabel}: ${detailValue}`

  return (
    <button
      type="button"
      className={`status-pill status-pill--${variant} profile-season-status__pill${revealed ? ' profile-season-status__pill--revealed' : ''}`}
      aria-label={ariaLabel}
      title={title}
      onPointerDown={startReveal}
      onPointerUp={stopReveal}
      onPointerLeave={stopReveal}
      onPointerCancel={stopReveal}
      onBlur={stopReveal}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setRevealed(true)
        }
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') stopReveal()
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="status-pill__icon" aria-hidden="true">
        {icon}
      </span>
      {!revealed ? (
        <span className="status-pill__label">{shortValue}</span>
      ) : (
        <span className="profile-season-status__pill-copy">
          <span className="profile-season-status__pill-caption">{detailLabel}</span>
          <span className="profile-season-status__pill-value">{detailValue}</span>
          {detailHint ? (
            <span className="profile-season-status__pill-hint">{detailHint}</span>
          ) : null}
        </span>
      )}
    </button>
  )
}

export default function ProfileSeasonStatus() {
  const game = useAppSelector((s) => s.game)
  const isGuest = useAppSelector(selectIsGuest)
  const { season, week, phase, lohId, posWinnerId } = game
  const userPlayer = game.players?.find((player) => player.isUser) ?? null
  const nomineeIds = game.nomineeIds ?? EMPTY_NOMINEES
  const publicApproval = useAppSelector((s) => {
    const userId = (s.game.players ?? []).find((player) => player.isUser)?.id ?? 'user'
    const profile = s.publicOpinion?.profiles?.[userId]
    if (!profile) return publicOpinionConfig.DEFAULT_APPROVAL
    const boost = (profile.temporaryApprovalBoosts ?? [])
      .filter((item) => s.game.week < item.expiresWeek)
      .reduce((sum, item) => sum + item.delta, 0)
    return Math.max(0, Math.min(100, profile.approval + boost))
  })
  const houseRating = useAppSelector((s) => {
    const userId = (s.game.players ?? []).find((player) => player.isUser)?.id ?? 'user'
    const housePlayers = (s.game.players ?? []).filter(
      (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
    )
    const ratings = housePlayers
      .map((player) => s.social?.relationships?.[player.id]?.[userId]?.affinity)
      .filter((affinity): affinity is number => typeof affinity === 'number')

    if (ratings.length === 0) return null
    const averageAffinity = ratings.reduce((sum, affinity) => sum + affinity, 0) / ratings.length
    return (normalizeAffinity(averageAffinity) + 1) * 50
  })

  const gameInProgress =
    game.status === 'active' || week > 1 || (phase !== 'season_start' && phase !== 'week_start')

  const statusChips = useMemo<StatusChipData[]>(() => {
    if (!gameInProgress) return []

    const chips: StatusChipData[] = [
      {
        id: 'season',
        icon: '🎬',
        variant: 'info',
        shortValue: `S${season}`,
        detailLabel: 'Season',
        detailValue: `Season ${season}`,
      },
      {
        id: 'day',
        icon: '🗓️',
        variant: 'week',
        shortValue: String(week),
        detailLabel: 'Day',
        detailValue: `Day ${week}`,
      },
      {
        id: 'phase',
        icon: '📡',
        variant: 'phase',
        shortValue: formatPhaseLabel(phase),
        detailLabel: 'Phase',
        detailValue: formatPhaseLabel(phase),
      },
      buildNominationChip(nomineeIds, userPlayer),
      {
        id: 'public-rating',
        icon: '📣',
        variant: 'info',
        shortValue: formatPercent(publicApproval, 0),
        detailLabel: "Viewer's rating",
        detailValue: formatPercent(publicApproval, 1),
        detailHint: findApprovalBand(publicApproval),
      },
    ]

    if (houseRating != null) {
      chips.push({
        id: 'house-rating',
        icon: '🏠',
        variant: 'neutral',
        shortValue: formatPercent(houseRating, 0),
        detailLabel: 'Hub rating',
        detailValue: formatPercent(houseRating, 1),
        detailHint: describeHouseRating(houseRating),
      })
    }

    if (userPlayer && lohId === userPlayer.id) {
      chips.push({
        id: 'loh',
        icon: '👑',
        variant: 'success',
        shortValue: 'LOH',
        detailLabel: 'Hub power',
        detailValue: 'Leader of the House',
      })
    }

    if (userPlayer && posWinnerId === userPlayer.id) {
      chips.push({
        id: 'pos',
        icon: '🔑',
        variant: 'warning',
        shortValue: 'POS',
        detailLabel: 'Safety power',
        detailValue: 'Power of Safety holder',
      })
    }

    return chips
  }, [
    gameInProgress,
    houseRating,
    lohId,
    nomineeIds,
    phase,
    posWinnerId,
    publicApproval,
    season,
    userPlayer,
    week,
  ])

  if (isGuest || statusChips.length === 0) return null

  return (
    <section className="profile-season-status" aria-label="Current season status">
      <p className="profile-season-status__title">Current season</p>
      <div className="profile-season-status__chips">
        {statusChips.map((chip) => (
          <HoldRevealPill key={chip.id} {...chip} />
        ))}
      </div>
    </section>
  )
}
