import type { GameState, Player } from '../../types'

export type HubSaysQuestionKind =
  | 'betray'
  | 'leak'
  | 'jealous'
  | 'fight'
  | 'calculating'
  | 'fake_friend'
  | 'crush'
  | 'worst_date'
  | 'delusional_power'
  | 'flirt_enemy'
  | 'snoop'
  | 'cry_after_betrayal'
  | 'chaos'
  | 'two_faced'
  | 'overshare'
  | 'grudge'

export interface HubSaysQuestion {
  id: string
  prompt: string
  kind: HubSaysQuestionKind
}

export const HUB_SAYS_QUESTIONS: readonly HubSaysQuestion[] = [
  {
    id: 'betray_first',
    prompt: 'Who would betray their closest ally first?',
    kind: 'betray',
  },
  {
    id: 'leak_secret',
    prompt: 'Who can’t keep a secret?',
    kind: 'leak',
  },
  { id: 'jealous_fast', prompt: 'Who gets jealous fastest?', kind: 'jealous' },
  {
    id: 'night_out_fight',
    prompt: 'Who would start a fight on a night out?',
    kind: 'fight',
  },
  {
    id: 'calculating',
    prompt: 'Who is more strategic than they let on?',
    kind: 'calculating',
  },
  {
    id: 'fake_friendship',
    prompt: 'Who could fake a friendship to the finale?',
    kind: 'fake_friend',
  },
  {
    id: 'hidden_crush',
    prompt: 'Who is hiding a crush?',
    kind: 'crush',
  },
  {
    id: 'worst_date',
    prompt: 'Who would be the worst Hubmate to date?',
    kind: 'worst_date',
  },
  {
    id: 'imaginary_boss',
    prompt: "Who thinks they're running the Hub?",
    kind: 'delusional_power',
  },
  {
    id: 'flirt_enemy',
    prompt: 'Who would flirt with a rival to stay in the game?',
    kind: 'flirt_enemy',
  },
  {
    id: 'snoop',
    prompt: 'Who would snoop, then act innocent?',
    kind: 'snoop',
  },
  {
    id: 'cry_betray',
    prompt: 'Who would betray you, then cry when you react?',
    kind: 'cry_after_betrayal',
  },
  {
    id: 'chaos_button',
    prompt: 'Who would cause chaos just to see what happens?',
    kind: 'chaos',
  },
  { id: 'two_faced', prompt: 'Whose promises are hardest to trust?', kind: 'two_faced' },
  { id: 'overshare', prompt: 'Who shares too much after one drink?', kind: 'overshare' },
  {
    id: 'grudge',
    prompt: 'Who holds a grudge the longest?',
    kind: 'grudge',
  },
] as const

export function getHubSaysQuestion(questionId: string): HubSaysQuestion | undefined {
  return HUB_SAYS_QUESTIONS.find((question) => question.id === questionId)
}

function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function noise(key: string, magnitude: number): number {
  return (hash32(key) / 0x1_0000_0000 - 0.5) * magnitude
}

export function buildHubSaysQuestionIds(
  gameId: string,
  season: number,
  afterDay: number,
  count = 5
): string[] {
  return HUB_SAYS_QUESTIONS.map((question) => ({
    id: question.id,
    order: hash32(`${gameId}|${season}|${afterDay}|${question.id}`),
  }))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .slice(0, Math.min(count, HUB_SAYS_QUESTIONS.length))
    .map((entry) => entry.id)
}

function identitySignal(player: Player, values: readonly string[]): number {
  const archetype = String(player.aiGameIdentity?.archetype ?? '')
  const temperament = String(player.aiGameIdentity?.temperament ?? '')
  return values.includes(archetype) || values.includes(temperament) ? 1 : 0
}

function questionScore(
  state: GameState,
  question: HubSaysQuestion,
  voter: Player,
  candidate: Player
): number {
  const relationship = state.strategicRelationships?.[voter.id]?.[candidate.id]
  const affinity = relationship?.affinity ?? 0
  const tags = new Set(relationship?.tags ?? [])
  const negativeBond = Math.max(0, -affinity)
  const positiveBond = Math.max(0, affinity)
  const stats = candidate.stats
  let score = 20

  switch (question.kind) {
    case 'betray':
      score += negativeBond * 0.25 + (tags.has('betrayal') ? 30 : 0)
      score += identitySignal(candidate, ['opportunist', 'double_agent', 'puppet_master']) * 18
      break
    case 'leak':
    case 'overshare':
      score += identitySignal(candidate, ['social_butterfly', 'chaos_agent', 'impulsive']) * 20
      score += tags.has('unreliable') ? 22 : 0
      break
    case 'jealous':
      score += identitySignal(candidate, ['emotional', 'paranoid', 'romantic_loyalist']) * 20
      score += tags.has('rivalry') ? 14 : 0
      break
    case 'fight':
    case 'chaos':
      score += identitySignal(candidate, ['chaos_agent', 'aggressive_competitor', 'impulsive']) * 24
      score += tags.has('rivalry') || tags.has('conflict') ? 18 : 0
      score += negativeBond * 0.18
      break
    case 'calculating':
      score +=
        identitySignal(candidate, ['puppet_master', 'double_agent', 'strategist', 'opportunist']) *
        25
      score += (stats?.lohWins ?? 0) * 4 + (stats?.posWins ?? 0) * 3
      break
    case 'fake_friend':
    case 'two_faced':
      score += identitySignal(candidate, ['double_agent', 'opportunist', 'secretive']) * 24
      score += tags.has('betrayal') || tags.has('unreliable') ? 24 : 0
      score += negativeBond * 0.2
      break
    case 'crush':
      score += identitySignal(candidate, ['romantic_loyalist', 'emotional', 'secretive']) * 20
      score += positiveBond * 0.08
      break
    case 'worst_date':
      score +=
        identitySignal(candidate, ['chaos_agent', 'impulsive', 'secretive', 'opportunist']) * 18
      score += negativeBond * 0.22
      break
    case 'delusional_power':
      score +=
        identitySignal(candidate, ['puppet_master', 'aggressive_competitor', 'opportunist']) * 18
      score += (stats?.lohWins ?? 0) * 5
      score += negativeBond * 0.12
      break
    case 'flirt_enemy':
      score += identitySignal(candidate, ['opportunist', 'social_butterfly', 'chaos_agent']) * 22
      score += tags.has('rivalry') ? 14 : 0
      break
    case 'snoop':
      score += identitySignal(candidate, ['secretive', 'paranoid', 'double_agent']) * 22
      break
    case 'cry_after_betrayal':
      score += identitySignal(candidate, ['emotional', 'opportunist', 'romantic_loyalist']) * 18
      score += tags.has('betrayal') ? 22 : 0
      break
    case 'grudge':
      score += identitySignal(candidate, ['paranoid', 'emotional', 'secretive']) * 22
      score += negativeBond * 0.2
      break
  }

  return (
    score + noise(`${state.gameId}|${state.season}|${question.id}|${voter.id}|${candidate.id}`, 24)
  )
}

export function resolveHubSaysQuestion(
  state: GameState,
  questionId: string,
  humanVoteTargetId: string
): { winnerId: string; voteCounts: Record<string, number> } | null {
  const question = getHubSaysQuestion(questionId)
  if (!question) return null
  const activePlayers = state.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  const human = activePlayers.find((player) => player.isUser)
  if (!human) return null
  const humanTarget = activePlayers.find(
    (player) => player.id === humanVoteTargetId && player.id !== human.id
  )
  if (!humanTarget) return null

  const voteCounts: Record<string, number> = { [humanTarget.id]: 1 }
  for (const voter of activePlayers.filter((player) => !player.isUser)) {
    const candidates = activePlayers.filter((candidate) => candidate.id !== voter.id)
    const selected = candidates
      .map((candidate) => ({ candidate, score: questionScore(state, question, voter, candidate) }))
      .sort(
        (left, right) =>
          right.score - left.score || left.candidate.id.localeCompare(right.candidate.id)
      )[0]?.candidate
    if (selected) voteCounts[selected.id] = (voteCounts[selected.id] ?? 0) + 1
  }

  const winnerId = Object.entries(voteCounts)
    .map(([playerId, votes]) => ({
      playerId,
      votes,
      tie: hash32(`${state.gameId}|${state.season}|${questionId}|winner|${playerId}`),
    }))
    .sort((left, right) => right.votes - left.votes || left.tie - right.tie)[0]?.playerId

  return winnerId ? { winnerId, voteCounts } : null
}

export function getHubSaysVotePercentage(
  voteCounts: Record<string, number>,
  playerId: string
): number {
  const totalVotes = Object.values(voteCounts).reduce((total, votes) => total + votes, 0)
  if (totalVotes <= 0) return 0
  return Math.round(((voteCounts[playerId] ?? 0) / totalVotes) * 100)
}
