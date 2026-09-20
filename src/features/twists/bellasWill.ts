import type { GameState, Player } from '../../types'
import type { SeasonArchive } from '../../store/seasonArchive'
import { getSeasonLaunchIntent } from '../../modes/seasonLaunchIntent'

export const BELLA_ID = 'bella'
export const BELLA_NAME = 'Bella'
export const BELLA_AVATAR = 'assets/skins/Bella_avatar.webp'

export type BellaWillReward = 'immunity_2_days' | 'extra_vote' | 'remove_vote'

export interface BellaWillState {
  active: boolean
  reward: BellaWillReward | null
  heirId: string | null
  inherited: boolean
  immunityDaysRemaining: number
  immunityStartWeek: number | null
  immunityEndWeek: number | null
  extraVotePending: boolean
  voteRemovalPending: boolean
  lastHeirUpdateWeek: number | null
  debugForced: boolean
}

declare module '../../types' {
  interface GameState {
    bellaWill?: BellaWillState
  }
}

export const BELLA_WILL_HINTS = [
  'Some legacies are written in ink. Others are written in loyalty.',
  'Protection is remembered long after the ceremony ends.',
  'A promise kept can outlive the game that created it.',
  'Some bonds leave more behind than memories.',
  'Loyalty has value. So does knowing when to show it.',
  'The House remembers who protects whom.',
] as const

const BELLA_WILL_REWARDS: readonly BellaWillReward[] = [
  'immunity_2_days',
  'extra_vote',
  'remove_vote',
]

export const BELLA_WILL_REWARD_LABELS: Record<BellaWillReward, string> = {
  immunity_2_days: 'Immunity for 2 consecutive days (inactive at Final 4/3/2)',
  extra_vote: '1 extra vote in the next elimination',
  remove_vote: 'Remove 1 vote next time the heir is nominated',
}

export function buildBellaPoolEntry(): Pick<Player, 'id' | 'name' | 'avatar' | 'status' | 'sex'> {
  return {
    id: BELLA_ID,
    name: BELLA_NAME,
    avatar: BELLA_AVATAR,
    sex: 'female',
    status: 'active',
  }
}

function seededUnit(seed: number): number {
  let t = seed >>> 0
  t += 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function findTwinShockSeason(archives: SeasonArchive[]): number | null {
  const candidates = archives
    .filter((archive) => archive.twinShockConsumed === true)
    .map((archive) => archive.seasonIndex)
    .filter((season) => Number.isFinite(season))
  return candidates.length > 0 ? Math.min(...candidates) : null
}

export function wasBellaEverCast(archives: SeasonArchive[]): boolean {
  return archives.some((archive) => archive.bellaCast === true)
}

function isBellaCompatibleArchive(archive: SeasonArchive): boolean {
  return archive.cupidArrowActivated !== true && archive.voxPopuliActivated !== true
}

export function shouldCastBella(options: {
  season: number
  seasonArchives: SeasonArchive[]
  twinShockConsumed: boolean
  seed: number
}): boolean {
  const { season, seasonArchives, twinShockConsumed, seed } = options
  if (!twinShockConsumed) return false

  // Bella's Will currently depends on the ordinary house-vote flow, so "next
  // available season" means the next Classic season. Expansion seasons do not
  // advance Bella's appearance/skip cadence.
  const launchIntent = getSeasonLaunchIntent()
  if (launchIntent != null && launchIntent !== 'classic') return false

  const twinShockSeason = findTwinShockSeason(seasonArchives)
  if (twinShockSeason == null) return false

  const classicAfterTwin = [...seasonArchives]
    .filter(
      (archive) => archive.seasonIndex > twinShockSeason && isBellaCompatibleArchive(archive)
    )
    .sort((left, right) => left.seasonIndex - right.seasonIndex)

  const priorBella = classicAfterTwin.find((archive) => archive.bellaCast === true)
  if (!priorBella) {
    // First compatible season after Twin Shock: Bella is guaranteed.
    return true
  }

  const classicAfterFirstBella = classicAfterTwin.filter(
    (archive) => archive.seasonIndex > priorBella.seasonIndex
  )
  if (classicAfterFirstBella.length === 0) {
    // Skip exactly one compatible season after her first appearance.
    return false
  }

  // Every compatible season after the mandatory skip has a stable 10% roll.
  return seededUnit((seed ^ Math.imul(season, 0x45d9f3b)) >>> 0) < 0.1
}

export function pickBellaWillReward(seed: number, season: number): BellaWillReward {
  const roll = seededUnit((seed ^ Math.imul(season + 17, 0x27d4eb2d)) >>> 0)
  const index = Math.min(BELLA_WILL_REWARDS.length - 1, Math.floor(roll * BELLA_WILL_REWARDS.length))
  return BELLA_WILL_REWARDS[index]
}

export function createBellaWillState(options: {
  active: boolean
  seed: number
  season: number
  reward?: BellaWillReward | null
}): BellaWillState {
  const { active, seed, season, reward } = options
  return {
    active,
    reward: active ? (reward ?? pickBellaWillReward(seed, season)) : null,
    heirId: null,
    inherited: false,
    immunityDaysRemaining: 0,
    immunityStartWeek: null,
    immunityEndWeek: null,
    extraVotePending: false,
    voteRemovalPending: false,
    lastHeirUpdateWeek: null,
    debugForced: false,
  }
}

function bellaRelationshipScore(state: GameState, candidateId: string): number {
  const relation = state.strategicRelationships?.[BELLA_ID]?.[candidateId]
  if (!relation) return 0

  let score = relation.affinity
  const tags = new Set(relation.tags ?? [])

  // Bella values demonstrated loyalty, devotion and protection more than
  // generic friendliness. These weights deliberately outweigh small-talk gains.
  if (tags.has('alliance')) score += 12
  if (tags.has('shield')) score += 14
  if (tags.has('protection')) score += 18
  if (tags.has('ride_or_die')) score += 20
  if (tags.has('loyal')) score += 14
  if (tags.has('promise_keeper')) score += 10
  if (tags.has('saved_by_pos')) score += 22

  if (tags.has('target')) score -= 20
  if (tags.has('broken_promise')) score -= 24
  if (tags.has('betrayal')) score -= 28

  return score
}

export function chooseBellaHeir(state: GameState): string | null {
  if (!state.bellaWill?.active) return null
  const candidates = state.players.filter(
    (player) =>
      player.id !== BELLA_ID &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )
  if (candidates.length === 0) return null

  return [...candidates]
    .sort((left, right) => {
      const scoreDiff = bellaRelationshipScore(state, right.id) - bellaRelationshipScore(state, left.id)
      if (scoreDiff !== 0) return scoreDiff
      return left.id.localeCompare(right.id)
    })[0]?.id ?? null
}

export function activateBellaInheritance(state: GameState): void {
  const will = state.bellaWill
  if (!will?.active || will.inherited || !will.heirId || !will.reward) return

  will.inherited = true
  if (will.reward === 'immunity_2_days') {
    will.immunityDaysRemaining = 2
    will.immunityStartWeek = state.week + 1
    will.immunityEndWeek = state.week + 2
  } else if (will.reward === 'extra_vote') {
    will.extraVotePending = true
  } else if (will.reward === 'remove_vote') {
    will.voteRemovalPending = true
  }
}

export function isBellaHeirImmune(state: GameState, playerId: string): boolean {
  const will = state.bellaWill
  if (!will?.active || !will.inherited || will.heirId !== playerId) return false
  if (will.reward !== 'immunity_2_days' || will.immunityDaysRemaining <= 0) return false
  if (will.immunityStartWeek == null || will.immunityEndWeek == null) return false
  if (state.week < will.immunityStartWeek || state.week > will.immunityEndWeek) return false

  // The legacy protection never applies once the game reaches Final 4 or lower.
  const activeCount = state.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  ).length
  return activeCount > 4
}

export function getBellaHint(seed: number, season: number, week: number): string {
  const index = Math.abs((seed + season * 11 + week * 7) % BELLA_WILL_HINTS.length)
  return BELLA_WILL_HINTS[index]
}

