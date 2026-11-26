import type { GameRegistryEntry } from '../../minigames/registry'
import { getGame, supportsPlayerCount } from '../../minigames/registry'
import { selectNextCompetitionGame } from './scheduling'
import {
  CAMPAIGN_PREMIERE,
  CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS,
  CLASSIC_CAMPAIGN_GAME_MIN_DAY,
  CLASSIC_CAMPAIGN_GAME_REQUIRED_PREVIOUS,
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
  16: { LOH: ['majorityRules', 'boxedOut'], POS: ['quickTap'] },
  15: {
    LOH: ['trapAuction', 'batteryLow', 'holdWall', 'boxedOut'],
    POS: ['riskWheel', 'cardClash'],
  },
  14: {
    LOH: ['batteryLow', 'trapAuction', 'boxedOut'],
    POS: ['colorMatch'],
  },
  13: {
    LOH: ['trapAuction', 'boxedOut'],
    POS: ['cardClash'],
  },
  12: {
    LOH: ['chainOfGreed', 'batteryLow', 'boxedOut'],
    POS: ['riskWheel'],
  },
  11: {
    LOH: ['chainOfGreed', 'batteryLow', 'boxedOut'],
    POS: ['quickTapSeasons'],
  },
  10: {
    LOH: ['chainOfGreed', 'batteryLow', 'boxedOut'],
    POS: ['gatesOfTheEye', 'quickTapSeasons'],
  },
  9: {
    LOH: [
      'glass_bridge_brutal',
      'crystal_path_shattered',
      'chainOfGreed',
      'trapAuction',
      'boxedOut',
    ],
    POS: ['gatesOfTheEye'],
  },
  8: {
    LOH: [
      'glass_bridge_brutal',
      'crystal_path_shattered',
      'wildcardWestern',
      'trapAuction',
      'boxedOut',
    ],
    POS: ['gatesOfTheEye'],
  },
  7: {
    LOH: ['wildcardWestern', 'glass_bridge_brutal', 'crystal_path_shattered'],
    POS: ['quickTapSeasons'],
  },
  6: {
    LOH: ['wildcardWestern'],
    POS: ['gatesOfTheEye'],
  },
  5: {
    LOH: [],
    POS: ['mysticChamber', 'gatesOfTheEye'],
  },
  4: {
    LOH: ['holdWall'],
    POS: ['mysticChamber'],
  },
}

/** Pacing limits are narrower than the technical roster limits when necessary. */
export const COMPETITION_PACING_LIMITS: Readonly<Record<string, { min: number; max: number }>> = {
  trapAuction: { min: 8, max: 16 },
  chainOfGreed: { min: 7, max: 12 },
  glass_bridge_brutal: { min: 6, max: 9 },
  crystal_path_shattered: { min: 7, max: 11 },
  wildcardWestern: { min: 4, max: 8 },
  mysticChamber: { min: 4, max: 5 },
  gatesOfTheEye: { min: 3, max: 10 },
  boxedOut: { min: 8, max: 16 },
}

const SPECIAL_PURPOSE = new Set(['capitalization', 'finalThreeCircuit', 'downMemoryLane'])
const SIGNATURE_GAMES = new Set([
  'trapAuction',
  'chainOfGreed',
  'boxedOut',
  'glass_bridge_brutal',
  'crystal_path_shattered',
  'wildcardWestern',
  'mysticChamber',
  'batteryLow',
])

/** Approval and LOH/POS separation are inherited from the existing campaign map. */
const APPROVED = new Set<string>(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)
const REGULAR_BANDS = DEFAULT_BRACKET_TEMPLATE.filter(
  (band) => band.minDay !== undefined && band.minDay > 1
)
const BY_PRIZE: Record<CompetitionType, Set<string>> = {
  LOH: new Set(REGULAR_BANDS.flatMap((band) => band.loh)),
  POS: new Set(REGULAR_BANDS.flatMap((band) => band.pos)),
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

function isEligible(key: string, context: DirectorContext, played: ReadonlySet<string>): boolean {
  if (!APPROVED.has(key) || SPECIAL_PURPOSE.has(key)) return false
  const campaignKey = key as (typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number]
  if (context.day < (CLASSIC_CAMPAIGN_GAME_MIN_DAY[campaignKey] ?? 1)) return false
  const requiredPrevious = CLASSIC_CAMPAIGN_GAME_REQUIRED_PREVIOUS[campaignKey]
  if (requiredPrevious && !played.has(requiredPrevious)) return false

  const game = getGame(key)
  if (!game || game.retired || !supportsPlayerCount(game, context.playerCount)) return false
  const bounds = COMPETITION_PACING_LIMITS[key]
  return !bounds || (context.playerCount >= bounds.min && context.playerCount <= bounds.max)
}

export function getCompetitionDirectorCandidates(context: DirectorContext): DirectorCandidate[] {
  if (context.playerCount < 3 || context.playerCount > 16) return []
  const played = new Set(context.playedGameKeys)
  // Preserve the premiere. No reserve pool is used on Day 1.
  const preferred = COMPETITION_DIRECTOR_PREFERENCES[context.playerCount]?.[context.compType] ?? []
  const keys =
    context.day === 1
      ? context.compType === 'LOH'
        ? CAMPAIGN_PREMIERE.loh
        : CAMPAIGN_PREMIERE.pos
      : [...BY_PRIZE[context.compType]]

  const carry =
    context.compType === 'LOH' && context.democraciaCarry?.day === context.day - 1
      ? (COMPETITION_DIRECTOR_PREFERENCES[context.democraciaCarry.playerCount]?.LOH ?? [])
      : []
  const carriedKeys = new Set(carry)

  return keys
    .filter((key) => isEligible(key, context, played))
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
