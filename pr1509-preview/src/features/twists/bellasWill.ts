import type { GameState, Player } from '../../types'
import type { SeasonArchive } from '../../store/seasonArchive'
import type { BellaProgress } from '../../store/profilesSlice'
import { getSeasonLaunchIntent } from '../../modes/seasonLaunchIntent'

export const BELLA_ID = 'bella'
export const BELLA_NAME = 'Bella'
/** Bella's black-and-gold in-house portrait. */
export const BELLA_AVATAR = 'assets/skins/Bella_sad_avatar.webp'
/** Bella's grey-lux studio portrait, used only by minigames and events. */
export const BELLA_MINIGAME_AVATAR = 'assets/skins/Bella_avatar.webp'

export type BellaWillReward = 'immunity_2_days' | 'extra_vote' | 'remove_vote'

export interface BellaVoteRemovalAdjustment {
  week: number
  targetId: string
  amount: 1
}

export interface BellaWillState {
  active: boolean
  reward: BellaWillReward | null
  heirId: string | null
  inherited: boolean
  /** Public Faux-TV card shown immediately after Bella's exit animation. */
  publicAnnouncementPending: boolean
  /** Public Faux-TV card shown only when the inherited power has resolved. */
  completionAnnouncementPending: boolean
  /** A human heir must be privately briefed in the Confessional exactly once. */
  privateBriefingPending: boolean
  /** The private invitation waits until the public heir announcement is dismissed. */
  privateBriefingInvited: boolean
  immunityDaysRemaining: number
  immunityStartWeek: number | null
  immunityEndWeek: number | null
  extraVotePending: boolean
  /** Human heir is currently choosing the normal and inherited Bella ballots. */
  extraVoteChoiceActive: boolean
  voteRemovalPending: boolean
  lastVoteRemovalAdjustment: BellaVoteRemovalAdjustment | null
  lastHeirUpdateWeek: number | null
  expiredAtEndgame: boolean
  debugForced: boolean
  /** True only when Debug Suite injected Bella into a season that did not naturally cast her. */
  debugCastForced: boolean
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
  extra_vote: '1 extra vote in the next eligible elimination',
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

function isBellaCompatibleArchive(archive: SeasonArchive): boolean {
  return archive.cupidArrowActivated !== true && archive.voxPopuliActivated !== true
}

function migratedBellaProgress(
  progress: BellaProgress | undefined,
  archives: SeasonArchive[],
  twinShockConsumed: boolean
): BellaProgress {
  const archivedBellaSeasons = archives
    .filter((archive) => archive.bellaCast === true && isBellaCompatibleArchive(archive))
    .map((archive) => archive.seasonIndex)
    .filter((season) => Number.isFinite(season))
    .sort((left, right) => left - right)
  const firstArchivedBellaSeason = archivedBellaSeasons[0] ?? null
  const archivedSkipConsumed =
    firstArchivedBellaSeason != null &&
    archives.some(
      (archive) =>
        isBellaCompatibleArchive(archive) && archive.seasonIndex > firstArchivedBellaSeason
    )

  return {
    twinShockConsumedEver:
      progress?.twinShockConsumedEver === true ||
      twinShockConsumed ||
      archives.some((archive) => archive.twinShockConsumed === true),
    unlocked: progress?.unlocked === true || archives.some((archive) => archive.bellaCast === true),
    hasAppeared:
      progress?.hasAppeared === true || archives.some((archive) => archive.bellaCast === true),
    mandatorySkipConsumed: progress?.mandatorySkipConsumed === true || archivedSkipConsumed,
  }
}

export function shouldCastBella(options: {
  season: number
  seasonArchives: SeasonArchive[]
  twinShockConsumed: boolean
  seed: number
  bellaProgress?: BellaProgress
}): boolean {
  const { season, seasonArchives, twinShockConsumed, seed, bellaProgress } = options

  // Bella is Classic-only by design. Expansion launches neither cast her nor consume her cadence.
  const launchIntent = getSeasonLaunchIntent()
  if (launchIntent != null && launchIntent !== 'classic') return false

  const progress = migratedBellaProgress(bellaProgress, seasonArchives, twinShockConsumed)
  if (!progress.twinShockConsumedEver) return false

  // Once the Twin Shock has been consumed, Bella is guaranteed in the next
  // compatible Classic season.
  if (!progress.hasAppeared) return true

  // Only the first Bella appearance creates one mandatory compatible-season skip.
  if (!progress.mandatorySkipConsumed) return false

  // Every compatible Classic season after that has a stable 10% return roll.
  return seededUnit((seed ^ Math.imul(season, 0x45d9f3b)) >>> 0) < 0.1
}

export function pickBellaWillReward(seed: number, season: number): BellaWillReward {
  const roll = seededUnit((seed ^ Math.imul(season + 17, 0x27d4eb2d)) >>> 0)
  const index = Math.min(
    BELLA_WILL_REWARDS.length - 1,
    Math.floor(roll * BELLA_WILL_REWARDS.length)
  )
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
    publicAnnouncementPending: false,
    completionAnnouncementPending: false,
    privateBriefingPending: false,
    privateBriefingInvited: false,
    immunityDaysRemaining: 0,
    immunityStartWeek: null,
    immunityEndWeek: null,
    extraVotePending: false,
    extraVoteChoiceActive: false,
    voteRemovalPending: false,
    lastVoteRemovalAdjustment: null,
    lastHeirUpdateWeek: null,
    expiredAtEndgame: false,
    debugForced: false,
    debugCastForced: false,
  }
}

function bellaRelationshipScore(state: GameState, candidateId: string): number {
  const relation = state.strategicRelationships?.[BELLA_ID]?.[candidateId]
  if (!relation) return 0

  let score = relation.affinity
  const tags = new Set(relation.tags ?? [])

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

export function chooseBellaHeir(
  state: GameState,
  excludedIds: readonly string[] = []
): string | null {
  if (!state.bellaWill?.active) return null
  const excluded = new Set(excludedIds)
  const candidates = state.players.filter(
    (player) =>
      player.id !== BELLA_ID &&
      !excluded.has(player.id) &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )
  if (candidates.length === 0) return null

  return (
    [...candidates].sort((left, right) => {
      const scoreDiff =
        bellaRelationshipScore(state, right.id) - bellaRelationshipScore(state, left.id)
      if (scoreDiff !== 0) return scoreDiff
      return left.id.localeCompare(right.id)
    })[0]?.id ?? null
  )
}

function activePlayerCount(state: GameState): number {
  return state.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
    .length
}

/**
 * Bella's Will is an ordinary-season modifier only. As soon as the House reaches
 * Final 4, all unresolved inheritance effects expire and can never affect F4/F3/F2.
 */
export function expireBellaWillAtEndgame(state: GameState): boolean {
  const will = state.bellaWill
  if (!will?.active || activePlayerCount(state) > 4) return false
  will.immunityDaysRemaining = 0
  will.immunityStartWeek = null
  will.immunityEndWeek = null
  will.extraVotePending = false
  will.extraVoteChoiceActive = false
  will.voteRemovalPending = false
  will.expiredAtEndgame = true
  return true
}

export function activateBellaInheritance(state: GameState): void {
  const will = state.bellaWill
  if (!will?.active || will.inherited || !will.heirId || !will.reward) return
  if (expireBellaWillAtEndgame(state)) return

  will.inherited = true
  will.publicAnnouncementPending = true
  will.privateBriefingPending = state.players.some(
    (player) => player.id === will.heirId && player.isUser === true
  )
  will.privateBriefingInvited = false
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
  if (will.expiredAtEndgame) return false
  if (will.reward !== 'immunity_2_days' || will.immunityDaysRemaining <= 0) return false
  if (will.immunityStartWeek == null || will.immunityEndWeek == null) return false
  if (state.week < will.immunityStartWeek || state.week > will.immunityEndWeek) return false
  return activePlayerCount(state) > 4
}

/** Marks the two-day inheritance as spent immediately after its final protected day. */
export function expireBellaWillImmunity(state: GameState): boolean {
  const will = state.bellaWill
  if (
    !will?.active ||
    !will.inherited ||
    will.reward !== 'immunity_2_days' ||
    will.immunityDaysRemaining <= 0 ||
    will.immunityEndWeek == null ||
    state.week <= will.immunityEndWeek
  ) {
    return false
  }

  will.immunityDaysRemaining = 0
  return true
}

export function getBellaHint(seed: number, season: number, week: number): string {
  const index = Math.abs((seed + season * 11 + week * 7) % BELLA_WILL_HINTS.length)
  return BELLA_WILL_HINTS[index]
}
