import type { GameRegistryEntry } from '../../minigames/registry'
import { getGame, supportsPlayerCount } from '../../minigames/registry'
import { selectNextCompetitionGame } from './scheduling'
import { CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS, DEFAULT_BRACKET_TEMPLATE } from './bracketTemplate'

type CompetitionType = 'LOH' | 'POS'
type PreferredGames = Record<CompetitionType, readonly string[]>

/** Priorities among the games retained on the competition map. */
export const COMPETITION_DIRECTOR_PREFERENCES: Record<number, PreferredGames> = {
  16: { LOH: ['holdWall'], POS: ['quickTap', 'riskWheel'] },
  15: { LOH: ['holdWall'], POS: ['quickTap', 'cardClash'] },
  14: { LOH: ['holdWall'], POS: ['colorMatch', 'riskWheel'] },
  13: { LOH: ['holdWall'], POS: ['quickTap', 'cardClash'] },
  12: { LOH: ['snake'], POS: ['colorMatch', 'riskWheel'] },
  11: { LOH: ['snake'], POS: ['quickTapSeasons', 'cardClash'] },
  10: { LOH: ['snake'], POS: ['quickTapSeasons', 'riskWheel'] },
  9: { LOH: ['crystal_path_shattered'], POS: ['quickTapSeasons', 'riskWheel'] },
  8: {
    LOH: ['crystal_path_shattered', 'timingBar', 'capitalization'],
    POS: ['quickTapSeasons', 'colorMatch'],
  },
  7: { LOH: ['timingBar', 'holdWall'], POS: ['quickTapSeasons', 'riskWheel'] },
  6: { LOH: ['timingBar', 'holdWall'], POS: ['quickTap', 'riskWheel'] },
  5: { LOH: ['capitalization', 'holdWall'], POS: ['quickTapSeasons', 'colorMatch'] },
  4: { LOH: ['timingBar', 'capitalization'], POS: ['quickTap', 'riskWheel'] },
}

/** Pacing limits are narrower than the technical roster limits when necessary. */
export const COMPETITION_PACING_LIMITS: Readonly<Record<string, { min: number; max: number }>> = {
  crystal_path_shattered: { min: 7, max: 11 },
}

const STORY_MIN_DAY: Readonly<Record<string, number>> = {
  crystal_path_shattered: 8,
}

const SIGNATURE_GAMES = new Set(['crystal_path_shattered'])

/** Approval and LOH/POS separation are inherited from the existing campaign map. */
const APPROVED = new Set<string>(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)
const BY_PRIZE: Record<CompetitionType, Set<string>> = {
  LOH: new Set(
    DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined).flatMap((band) => band.loh)
  ),
  POS: new Set(
    DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined).flatMap((band) => band.pos)
  ),
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

function isEligible(key: string, context: DirectorContext): boolean {
  if (!APPROVED.has(key) || !BY_PRIZE[context.compType].has(key)) return false
  if (context.day < (STORY_MIN_DAY[key] ?? 1)) return false

  const game = getGame(key)
  if (!game || game.retired || !supportsPlayerCount(game, context.playerCount)) return false
  const bounds = COMPETITION_PACING_LIMITS[key]
  return !bounds || (context.playerCount >= bounds.min && context.playerCount <= bounds.max)
}

export function getCompetitionDirectorCandidates(context: DirectorContext): DirectorCandidate[] {
  if (context.playerCount < 3 || context.playerCount > 16) return []
  // Preserve the premiere. No reserve pool is used on Day 1.
  const preferred = COMPETITION_DIRECTOR_PREFERENCES[context.playerCount]?.[context.compType] ?? []
  const keys =
    context.day === 1
      ? context.compType === 'LOH'
        ? ['holdWall']
        : ['quickTap', 'riskWheel']
      : [...BY_PRIZE[context.compType]]

  const carry =
    context.compType === 'LOH' && context.democraciaCarry?.day === context.day - 1
      ? (COMPETITION_DIRECTOR_PREFERENCES[context.democraciaCarry.playerCount]?.LOH ?? [])
      : []
  const carriedKeys = new Set(carry)

  return keys
    .filter((key) => isEligible(key, context))
    .map((key) => {
      const game = getGame(key)!
      const pacing = COMPETITION_PACING_LIMITS[key]
      const isPreferred = preferred.includes(key)
      const finalSuitableCast = pacing && context.playerCount === pacing.min
      const weight =
        carriedKeys.has(key) || (finalSuitableCast && SIGNATURE_GAMES.has(key))
          ? 3
          : isPreferred
            ? 2
            : 1
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
  const balancedDayOnePool = context.day === 1
  const selected = selectNextCompetitionGame({
    seed,
    // Keep Day 1 selection free of recency and late-season multipliers.
    recentGameKeys: balancedDayOnePool ? [] : recentGameKeys,
    lateSeasonBias: balancedDayOnePool ? false : context.playerCount <= 6,
    games: eligible.map(({ game, weight }) => ({
      ...game,
      weight: balancedDayOnePool ? 1 : weight,
    })),
  })
  // Return the canonical registry entry rather than the selection-only weight override.
  return getGame(selected.key)
}
