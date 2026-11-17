import type { RelationshipsMap, SocialActionLogEntry } from './types'
import type { RealityDomainState } from './reality/types'

interface CampaignState {
  game: {
    week: number
    phase: string
    mode?: 'classic' | 'survival'
    lohId?: string | null
    coLohIds?: string[] | null
    cupidArrow?: GameState['cupidArrow']
    posWinnerId?: string | null
    nomineeIds?: string[]
    voxPopuli?: { status?: string }
    players: Array<{ id: string; status: string; isUser?: boolean }>
  }
  social: {
    relationships: RelationshipsMap
    reality: RealityDomainState
    actionHistory?: SocialActionLogEntry[]
    sessionLogs: SocialActionLogEntry[]
  }
}

export interface AiCampaignMove {
  actionId: string
  targetIds: string[]
  subjectId?: string
  reason: string
}

/** Individual survival and persuasion, including contestants without a faction agenda. */
export function planAiCampaignMove(state: CampaignState, actorId: string): AiCampaignMove | null {
  const { game, social } = state
  if (game.mode === 'survival' || game.voxPopuli?.status === 'active') return null
  const active = game.players.filter((player) => !['evicted', 'jury'].includes(player.status))
  const actor = active.find((player) => player.id === actorId)
  if (!actor || actor.isUser) return null
  const history = social.actionHistory ?? social.sessionLogs
  const recent = history.filter((entry) => entry.actorId === actorId && entry.week === game.week)
  const affinity = (id: string) => social.relationships[actorId]?.[id]?.affinity ?? 0
  const actorPartnerId = getCupidPartnerId(game, actorId)
  const leaders = new Set([
    game.lohId,
    ...(game.coLohIds ?? []),
    getCupidPartnerId(game, game.lohId),
  ])
  const alreadyAsked = (actionId: string, targetId: string, subjectId?: string) =>
    recent.some(
      (entry) =>
        entry.actionId === actionId && entry.targetId === targetId && entry.subjectId === subjectId
    )
  const move = (
    actionId: string,
    targetId: string,
    subjectId: string | undefined,
    reason: string
  ) =>
    alreadyAsked(actionId, targetId, subjectId)
      ? null
      : { actionId, targetIds: [targetId], subjectId, reason }
  const nominees = active.filter((player) => game.nomineeIds?.includes(player.id))
  const actorAtRisk = nominees.some((player) => player.id === actorId)
  const alliesAtRisk = nominees.filter(
    (player) =>
      player.id !== actorId &&
      (player.id === actorPartnerId ||
        affinity(player.id) >= 20 ||
        social.relationships[actorId]?.[player.id]?.tags.includes('alliance'))
  )

  if (
    ['pos_results', 'pos_ceremony'].includes(game.phase) &&
    game.posWinnerId &&
    game.posWinnerId !== actorId &&
    active.some((player) => player.id === game.posWinnerId)
  ) {
    const saveId = actorAtRisk
      ? actorId
      : alliesAtRisk.sort((a, b) => affinity(b.id) - affinity(a.id))[0]?.id
    if (saveId)
      return move(
        'ask_use_safety',
        game.posWinnerId,
        saveId,
        actorAtRisk
          ? 'campaigning for Safety before the decision closes'
          : 'asking Safety to protect a vulnerable ally'
      )
    if (game.lohId === actorId)
      return move(
        'ask_hold_safety',
        game.posWinnerId,
        undefined,
        'negotiating with Safety to preserve the nomination plan'
      )
  }

  if (
    ['social_2', 'pos_ceremony_results'].includes(game.phase) &&
    (actorAtRisk || alliesAtRisk.length)
  ) {
    const opponents = nominees
      .filter(
        (player) => player.id !== actorId && !alliesAtRisk.some((ally) => ally.id === player.id)
      )
      .sort((a, b) => affinity(a.id) - affinity(b.id) || a.id.localeCompare(b.id))
    const subjectId = opponents[0]?.id
    if (!subjectId) return null
    const voters = active
      .filter(
        (player) =>
          player.id !== actorId &&
          !leaders.has(player.id) &&
          !game.nomineeIds?.includes(player.id) &&
          !alreadyAsked('rally_votes_against', player.id, subjectId)
      )
      .sort((a, b) => affinity(b.id) - affinity(a.id) || a.id.localeCompare(b.id))
    const voter = voters[0]
    return voter
      ? move(
          'rally_votes_against',
          voter.id,
          subjectId,
          actorAtRisk
            ? 'campaigning for survival with a voter who can act'
            : 'organizing support to keep an ally'
        )
      : null
  }

  if (
    game.phase === 'social_1' &&
    game.lohId &&
    game.lohId !== actorId &&
    active.some((player) => player.id === game.lohId)
  ) {
    const targets = active
      .filter(
        (player) =>
          player.id !== actorId &&
          !leaders.has(player.id) &&
          player.id !== actorPartnerId &&
          !social.relationships[actorId]?.[player.id]?.tags.some((tag) =>
            ['alliance', 'romance', 'bromance'].includes(tag)
          )
      )
      .map((player) => {
        const edge = social.reality.relationships[actorId]?.[player.id]
        return {
          id: player.id,
          score:
            -affinity(player.id) +
            (edge?.perceivedThreat ?? 0) * 0.5 +
            (edge?.resentment ?? 0) * 0.3,
        }
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    const target = targets[0]
    if (target && (target.score >= 8 || alliesAtRisk.length))
      return move(
        'pitch_target',
        game.lohId,
        target.id,
        'offering the LOH a concrete alternative to protect their own position'
      )
  }
  return null
}
import type { GameState } from '../types'
import { getCupidPartnerId } from '../features/twists/cupidArrow'
