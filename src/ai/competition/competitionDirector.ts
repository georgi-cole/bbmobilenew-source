import type { GameRegistryEntry } from '../../minigames/registry'
import { getGame, supportsPlayerCount } from '../../minigames/registry'
import { selectNextCompetitionGame } from './scheduling'
import {
  CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS,
  DEFAULT_BRACKET_TEMPLATE,
} from './bracketTemplate'

type CompetitionType = 'LOH' | 'POS'
type PreferredGames = Record<CompetitionType, readonly string[]>

/**
 * Cast-aware priorities, not a rigid playlist. All other QA-approved games for
 * the correct prize type remain available as reserves.
 *
 * The actual number of COMPETITORS is used, not the day guide's projected
 * remaining housemates (returns, reserves, and outgoing LOHs can change it).
 */
export const COMPETITION_DIRECTOR_PREFERENCES: Record<number, PreferredGames> = {
  16: { LOH: ['majorityRules'], POS: ['quickTap'] },
  15: { LOH: ['trapAuction', 'batteryLow', 'holdWall'], POS: ['riskWheel', 'cardClash'] },
  14: { LOH: ['batteryLow', 'trapAuction', 'hangman'], POS: ['colorMatch', 'logicLocks'] },
  13: { LOH: ['silentSaboteur', 'hangman', 'trapAuction'], POS: ['cardClash', 'dontGoOver'] },
  12: { LOH: ['chainOfGreed', 'silentSaboteur', 'batteryLow'], POS: ['riskWheel', 'threeDigitsQuiz'] },
  11: { LOH: ['hangman', 'chainOfGreed', 'batteryLow'], POS: ['logicLocks', 'quickTapSeasons'] },
  10: { LOH: ['chainOfGreed', 'silentSaboteur', 'batteryLow'], POS: ['tetris', 'quickTapSeasons'] },
   9: { LOH: ['glass_bridge_brutal', 'crystal_path_shattered', 'chainOfGreed', 'trapAuction'], POS: ['tetris', 'minesweeps'] },
   8: { LOH: ['castleRescue', 'glass_bridge_brutal', 'crystal_path_shattered', 'wildcardWestern', 'trapAuction'], POS: ['minesweeps', 'tetris'] },
   7: { LOH: ['wildcardWestern', 'glass_bridge_brutal', 'crystal_path_shattered', 'castleRescue', 'houseOfDarkness'], POS: ['quickTapSeasons', 'tiltLabyrinth'] },
   6: { LOH: ['wildcardWestern', 'houseOfDarkness', 'castleRescue2'], POS: ['tetris', 'minesweeps'] },
   5: { LOH: ['castleRescue2', 'houseOfDarkness', 'pressurePlank'], POS: ['mysticChamber', 'tetris'] },
   4: { LOH: ['houseOfDarkness', 'castleRescue2', 'holdWall'], POS: ['mysticChamber', 'logicLocks'] },
}

/** Pacing limits are narrower than the technical roster limits when necessary. */
export const COMPETITION_PACING_LIMITS: Readonly<Record<string, { min: number; max: number }>> = {
  trapAuction: { min: 8, max: 16 },
  silentSaboteur: { min: 8, max: 16 },
  chainOfGreed: { min: 7, max: 12 },
  glass_bridge_brutal: { min: 6, max: 9 },
  crystal_path_shattered: { min: 7, max: 11 },
  wildcardWestern: { min: 4, max: 8 },
  castleRescue: { min: 5, max: 9 },
  castleRescue2: { min: 4, max: 6 },
  houseOfDarkness: { min: 4, max: 8 },
  mysticChamber: { min: 4, max: 5 },
}

const STORY_MIN_DAY: Readonly<Record<string, number>> = {
  silentSaboteur: 4,
  glass_bridge_brutal: 7,
  crystal_path_shattered: 8,
  wildcardWestern: 8,
  castleRescue: 8,
  castleRescue2: 10,
  mysticChamber: 10,
}

const REQUIRES_ORIGINAL: Readonly<Record<string, string>> = {
  crystal_path_shattered: 'glass_bridge_brutal',
  castleRescue2: 'castleRescue',
}

const SPECIAL_PURPOSE = new Set(['capitalization', 'finalThreeCircuit', 'downMemoryLane'])
const SIGNATURE_GAMES = new Set([
  'trapAuction', 'silentSaboteur', 'chainOfGreed', 'glass_bridge_brutal',
  'crystal_path_shattered', 'wildcardWestern', 'castleRescue', 'castleRescue2',
  'houseOfDarkness', 'mysticChamber', 'batteryLow', 'hangman',
])

/** Approval and LOH/POS separation are inherited from the existing campaign map. */
const APPROVED = new Set<string>(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)
const BY_PRIZE: Record<CompetitionType, Set<string>> = {
  LOH: new Set(DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined).flatMap((band) => band.loh)),
  POS: new Set(DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined).flatMap((band) => band.pos)),
}

export interface DirectorContext {
  day: number
  playerCount: number
  compType: CompetitionType
  playedGameKeys: readonly string[]
  /** One skipped Democracia LOH day. Only its immediate next day gets a bonus. */
  democraciaCarry?: { day: number; playerCount: number } | null
}

export interface DirectorCandidate {
  game: GameRegistryEntry
  /** Normal reserve = 1, preferred = 2, last cast opportunity / carry = 3. */
  weight: number
}

function isEligible(key: string, context: DirectorContext, played: Set<string>): boolean {
  if (!APPROVED.has(key) || !BY_PRIZE[context.compType].has(key) || SPECIAL_PURPOSE.has(key)) return false
  if (context.day < (STORY_MIN_DAY[key] ?? 1)) return false
  const original = REQUIRES_ORIGINAL[key]
  if (original && !played.has(original)) return false

  const game = getGame(key)
  if (!game || game.retired || !supportsPlayerCount(game, context.playerCount)) return false
  const bounds = COMPETITION_PACING_LIMITS[key]
  return !bounds || (context.playerCount >= bounds.min && context.playerCount <= bounds.max)
}

export function getCompetitionDirectorCandidates(context: DirectorContext): DirectorCandidate[] {
  if (context.playerCount < 4 || context.playerCount > 16) return []
  const played = new Set(context.playedGameKeys)
  // Preserve the premiere. No reserve pool is used on Day 1.
  const preferred = COMPETITION_DIRECTOR_PREFERENCES[context.playerCount]?.[context.compType] ?? []
  const keys = context.day === 1
    ? (context.compType === 'LOH' ? ['majorityRules'] : ['quickTap'])
    : [...BY_PRIZE[context.compType]]

  const carry = context.compType === 'LOH' &&
    context.democraciaCarry?.day === context.day - 1
    ? COMPETITION_DIRECTOR_PREFERENCES[context.democraciaCarry.playerCount]?.LOH ?? []
    : []
  const carriedKeys = new Set(carry)

  return keys.filter((key) => isEligible(key, context, played)).map((key) => {
    const game = getGame(key)!
    const pacing = COMPETITION_PACING_LIMITS[key]
    const isPreferred = preferred.includes(key)
    const finalSuitableCast = pacing && context.playerCount === pacing.min
    const weight = carriedKeys.has(key) || (finalSuitableCast && SIGNATURE_GAMES.has(key))
      ? 3
      : isPreferred ? 2 : 1
    return { game, weight }
  })
}

/**
 * Draw without replacement across the full eligible LOH/POS season history.
 * Only repeat when ALL appropriate approved games for this draw are exhausted.
 * The existing seeded scheduler retains its category diversity behavior.
 */
export function pickCompetitionDirectorGame(
  context: DirectorContext,
  seed: number,
  recentGameKeys: string[] = []
): GameRegistryEntry | undefined {
  const candidates = getCompetitionDirectorCandidates(context)
  if (!candidates.length) return undefined
  const played = new Set(context.playedGameKeys)
  const unused = candidates.filter(({ game }) => !played.has(game.key))
  const eligible = unused.length ? unused : candidates
  const selected = selectNextCompetitionGame({
    seed,
    recentGameKeys,
    lateSeasonBias: context.playerCount <= 6,
    games: eligible.map(({ game, weight }) => ({ ...game, weight })),
  })
  // Return the canonical registry entry rather than the selection-only weight override.
  return getGame(selected.key)
}
