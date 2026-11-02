import type { GameState, Player } from '../../types'

export type VoxFinalThreeAppeal = 'underdog' | 'loyalty' | 'resume'
export type VoxFinalThreeViewerRole = 'immune' | 'nominee' | 'spectator'

export interface VoxFinalThreeAppealChoice {
  id: VoxFinalThreeAppeal
  title: string
  copy: string
  speech: string
}

export interface VoxFinalThreeCast {
  holder: Player
  nominees: [Player, Player]
  viewerId: string | undefined
  viewerRole: VoxFinalThreeViewerRole
}

export interface VoxFinalThreeResult {
  evicteeId: string
  percentages: Record<string, number>
}

export const VOX_FINAL_THREE_APPEALS: readonly VoxFinalThreeAppealChoice[] = [
  {
    id: 'underdog',
    title: 'The fight',
    copy: 'Remind them what it took to survive this far.',
    speech:
      "I kept fighting for my place in this game. I'm asking for one last chance to finish my story.",
  },
  {
    id: 'loyalty',
    title: 'The people',
    copy: 'Make your case through the bonds that carried your season.',
    speech:
      'The people in this Hub made this season matter to me. I hope those bonds are what you remember.',
  },
  {
    id: 'resume',
    title: 'The game',
    copy: 'Own the moves and wins that made your season.',
    speech: 'I gave this game everything I had. Let me show you what I can bring to the Final Two.',
  },
]

type CastSource = Pick<GameState, 'phase' | 'voxPopuli' | 'players' | 'nomineeIds' | 'lohId'>
type AppealSource = Pick<GameState, 'phase' | 'voxPopuli' | 'strategicRelationships'>
type ResultSource = Pick<
  GameState,
  'phase' | 'voxPopuli' | 'voteResults' | 'voteResultsMode' | 'pendingEviction'
>

const isLiving = (player: Player) => player.status !== 'evicted' && player.status !== 'jury'

/** Resolve the actual three finalists; the immunity holder is outside the ballot. */
export function getVoxFinalThreeCast(game: CastSource): VoxFinalThreeCast | null {
  if (game.phase !== 'final3_decision' || game.voxPopuli?.status !== 'active') return null
  const holderId = game.voxPopuli.immunityWinnerId ?? game.lohId
  const ids = game.nomineeIds
  if (!holderId || ids.length !== 2 || ids[0] === ids[1] || ids.includes(holderId)) return null

  const living = game.players.filter(isLiving)
  if (living.length !== 3 || new Set(living.map((player) => player.id)).size !== 3) return null
  const holder = living.find((player) => player.id === holderId)
  const first = living.find((player) => player.id === ids[0])
  const second = living.find((player) => player.id === ids[1])
  if (!holder || !first || !second) return null

  const viewerId = game.players.find((player) => player.isUser)?.id
  return {
    holder,
    nominees: [first, second],
    viewerId,
    viewerRole:
      viewerId === holder.id ? 'immune' : ids.includes(viewerId ?? '') ? 'nominee' : 'spectator',
  }
}

export function isVoxFinalThreeAppealRequired(
  game: Pick<GameState, 'phase' | 'voxPopuli'>,
  cast: VoxFinalThreeCast
): boolean {
  return (
    game.phase === 'final3_decision' &&
    game.voxPopuli?.status === 'active' &&
    game.voxPopuli.publicVoteContext === 'final3' &&
    game.voxPopuli.awaitingPublicVote === true &&
    game.voxPopuli.finalThreeAppealUsed !== true &&
    cast.viewerRole === 'nominee'
  )
}

function seasonCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function appealSpeech(player: Player, appeal: VoxFinalThreeAppeal): string {
  const nominations = seasonCount(player.stats?.timesNominated)
  const wins = seasonCount(player.stats?.lohWins) + seasonCount(player.stats?.posWins)
  if (appeal === 'underdog' && nominations > 0) {
    return `I've stood on the block ${nominations} ${nominations === 1 ? 'time' : 'times'}. I kept fighting, and I'm asking you to let me finish this.`
  }
  if (appeal === 'resume' && wins > 0) {
    return `I've earned ${wins} competition ${wins === 1 ? 'win' : 'wins'}. Give me the chance to finish what I came here to do.`
  }
  return VOX_FINAL_THREE_APPEALS.find((choice) => choice.id === appeal)!.speech
}

/** The real appeal options, with complete speeches grounded in this season. */
export function buildVoxFinalThreeAppealChoices(player: Player): VoxFinalThreeAppealChoice[] {
  return VOX_FINAL_THREE_APPEALS.map((choice) => ({
    ...choice,
    speech: appealSpeech(player, choice.id),
  }))
}

export function buildVoxFinalThreePleas(
  game: AppealSource,
  cast: VoxFinalThreeCast,
  appeal: VoxFinalThreeAppeal | null | undefined = game.voxPopuli?.finalThreeAppeal
): Record<string, string> {
  return Object.fromEntries(
    cast.nominees.map((player) => {
      if (player.id === cast.viewerId && appeal) return [player.id, appealSpeech(player, appeal)]
      const wins = seasonCount(player.stats?.lohWins) + seasonCount(player.stats?.posWins)
      const nominations = seasonCount(player.stats?.timesNominated)
      if (wins >= 2) return [player.id, appealSpeech(player, 'resume')]
      if (nominations >= 2) return [player.id, appealSpeech(player, 'underdog')]
      const hasBond = Object.values(game.strategicRelationships?.[player.id] ?? {}).some(
        (relationship) => relationship.affinity >= 35 || relationship.tags.includes('alliance')
      )
      if (hasBond) return [player.id, appealSpeech(player, 'loyalty')]
      return [
        player.id,
        "I kept showing up for this game. I'm asking you for one last chance to prove I belong in the Final Two.",
      ]
    })
  )
}

function validPercentages(
  percentages: Record<string, number> | null | undefined,
  ids: readonly string[]
): percentages is Record<string, number> {
  if (!percentages || Object.keys(percentages).length !== 2) return false
  if (!Object.keys(percentages).every((id) => ids.includes(id))) return false
  const values = ids.map((id) => percentages[id])
  return (
    values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100) &&
    Math.abs(values[0] + values[1] - 100) <= 0.100001
  )
}

/** Read the committed result. Rounded percentages never decide or break a tie here. */
export function getVoxFinalThreeResult(
  game: ResultSource,
  nomineeIds: readonly string[]
): VoxFinalThreeResult | null {
  if (
    game.phase !== 'final3_decision' ||
    game.voxPopuli?.status !== 'active' ||
    game.voxPopuli.publicVoteContext !== 'final3' ||
    game.voxPopuli.awaitingPublicVote ||
    game.voteResultsMode !== 'public' ||
    nomineeIds.length !== 2 ||
    nomineeIds[0] === nomineeIds[1]
  ) {
    return null
  }
  const evicteeId = game.pendingEviction?.evicteeId
  if (!evicteeId || !nomineeIds.includes(evicteeId)) return null

  const publicPercentages = game.voxPopuli.publicVotePercentages
  const percentages = game.voteResults ?? publicPercentages
  if (!validPercentages(percentages, nomineeIds)) return null
  if (
    publicPercentages &&
    (!validPercentages(publicPercentages, nomineeIds) ||
      nomineeIds.some((id) => Math.abs(publicPercentages[id] - percentages[id]) > 0.000001))
  ) {
    return null
  }
  return {
    evicteeId,
    percentages: Object.fromEntries(nomineeIds.map((id) => [id, percentages[id]])),
  }
}
