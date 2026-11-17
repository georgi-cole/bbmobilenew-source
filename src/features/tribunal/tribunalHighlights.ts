import type { GameState, TribunalHighlight } from '../../types'
import { FEATURE_TRIBUNAL_HIGHLIGHTS } from '../../config/featureFlags'

export function tribunalHighlightsEnabled(): boolean {
  return (
    FEATURE_TRIBUNAL_HIGHLIGHTS ||
    (import.meta.env.DEV &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('tribunalHighlights') === '1')
  )
}

export function tribunalRequiresLiveShow(game: GameState): boolean {
  return Boolean(game.battleBack?.active || game.battleBack?.returnAnimationPending)
}

export function isTribunalHighlightsEligible(game: GameState): boolean {
  const human = game.players.find((player) => player.isUser)
  return Boolean(
    game.mode !== 'survival' &&
    game.voxPopuli?.status !== 'active' &&
    human?.status === 'jury' &&
    human.tribunalEligible !== false &&
    game.tribunalInvitationAcknowledged &&
    !game.tribunalInvitationTransition &&
    !game.seasonFinale &&
    game.phase !== 'jury'
  )
}

export function isTribunalVoteReady(game: GameState): boolean {
  return ['jury_announcement', 'jury_cinematic', 'jury'].includes(game.phase)
}

export function buildTribunalHighlight(game: GameState, evicteeIds: string[]): TribunalHighlight {
  const context = game.pendingExitContext
  const kind =
    game.phase === 'final3_decision'
      ? 'final_three'
      : game.phase === 'final4_eviction'
        ? 'final_four'
        : game.dayStartShock || game.phase === 'week_start'
          ? 'shock'
          : 'eviction'
  return {
    id: `${game.gameId}:${game.week}:${kind}`,
    week: game.week,
    lohId: game.lohId,
    posWinnerId: game.posWinnerId,
    nomineeIds: [...(context?.nomineeIds ?? game.nomineeIds)],
    savedId: game.povSavedId ?? null,
    evicteeIds: [...evicteeIds],
    voteCounts: kind === 'eviction' ? { ...(context?.voteCounts ?? game.voteResults ?? {}) } : null,
    kind,
  }
}

export function tribunalHighlightLines(highlight: TribunalHighlight, game: GameState): string[] {
  const name = (id: string | null) => game.players.find((player) => player.id === id)?.name
  const lohName = name(highlight.lohId)
  const posName = name(highlight.posWinnerId)
  const savedName = name(highlight.savedId)
  const nominees = highlight.nomineeIds.map(name).filter(Boolean).join(' and ')
  const lines: string[] = []
  if (highlight.kind === 'final_three') {
    if (lohName) lines.push(`${lohName} won the Final Power Battle and chose the Final Two.`)
  } else if (highlight.kind === 'final_four') {
    if (posName) lines.push(`${posName} held the sole vote to eliminate at the Final Four.`)
  } else if (highlight.kind === 'shock') {
    lines.push('A morning shock brought an unexpected departure.')
  } else {
    if (lohName) lines.push(`${lohName} led the Hub as LOH.`)
    if (posName) {
      lines.push(
        savedName
          ? `${posName} won POS. ${savedName} was saved during the Safety ceremony.`
          : `${posName} won the Power of Safety.`
      )
    }
    if (nominees) lines.push(`${nominees} faced the elimination vote.`)
  }
  return lines
}

export function tribunalVoteLabel(highlight: TribunalHighlight, playerId: string): string | null {
  if (!highlight.voteCounts || !Object.keys(highlight.voteCounts).length) return null
  const votes = highlight.voteCounts[playerId]
  if (votes == null) return null
  // Multi-nominee and double eliminations do not have a truthful X-to-Y margin.
  return `${votes} vote${votes === 1 ? '' : 's'} to eliminate`
}
