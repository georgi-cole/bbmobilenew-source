import type { Phase } from '../../types'

/**
 * Classic campaign competition map.
 *
 * The most specific rule matching the current day, alive-housemate count, and
 * Final 3 phase owns the random-selection pool. Keeping LOH and POS lists separate prevents
 * a short luck game from accidentally becoming the week's main competition.
 */

export interface BracketBand {
  /** Human-readable label used by tests, diagnostics, and design reviews. */
  label: string
  /** Inclusive alive-housemate bounds. */
  minPlayers: number
  maxPlayers: number
  /** Optional inclusive campaign-day bounds. */
  minDay?: number
  maxDay?: number
  /** Optional exact phases, used to make the Final 3 trilogy escalate. */
  phases?: Phase[]
  loh: string[]
  pos: string[]
}

export type BracketTemplate = BracketBand[]

export interface ClassicCampaignContext {
  day: number
  playerCount: number
  compType: 'LOH' | 'POS'
  phase?: Phase
  /** All games already completed in this season. */
  playedGameKeys?: readonly string[]
}

const SOCIAL_COMPETITION_KEYS = ['rockPaperScissors', 'lastLight'] as const

/** Status is limited to the season competition map; all entries remain in the registry. */
export const MINIGAME_COMPETITION_MAP_STATUS = {
  inCompetitionMap: [
    'quickTap',
    'quickTapSeasons',
    'timingBar',
    'holdWall',
    'colorMatch',
    'snake',
    'riskWheel',
    'crystal_path_shattered',
    'capitalization',
    'cardClash',
    ...SOCIAL_COMPETITION_KEYS,
  ],
  forCalibration: [
    'memoryMatch',
    'boxedOut',
    'estimationGame',
    'famousFigures',
    'silentSaboteur',
    'percentagePanic',
    'majorityRules',
    'pressurePlank',
    'logicLocks',
    'hangman',
    'tiltLabyrinth',
    'threeDigitsQuiz',
    'minesweeps',
    'dontGoOver',
    'blackjackTournament',
    'wildcardWestern',
    'castleRescue',
    'castleRescueRemastered',
    'castleRescue2',
    'castleRescue2Remastered',
    'glass_bridge_brutal',
    'trapAuction',
    'chainOfGreed',
    'batteryLow',
    'houseOfDarkness',
    'mysticChamber',
    'gatesOfTheEye',
    'finalThreeCircuit',
    'downMemoryLane',
  ],
} as const

/** Explicitly approved games for the automatic season competition map. */
export const CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS = MINIGAME_COMPETITION_MAP_STATUS.inCompetitionMap

/** Active games held out of the automatic map while their AI balance is calibrated. */
export const CLASSIC_CAMPAIGN_CALIBRATION_GAME_KEYS = MINIGAME_COMPETITION_MAP_STATUS.forCalibration

/** Per-game story prerequisites that apply in addition to the roster map. */
export const CLASSIC_CAMPAIGN_GAME_MIN_DAY: Partial<
  Record<(typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number], number>
> = {
  crystal_path_shattered: 8,
  rockPaperScissors: 2,
  lastLight: 2,
}

/** Narrative prerequisites that cannot be represented by day alone. */
export const CLASSIC_CAMPAIGN_GAME_REQUIRED_PREVIOUS: Partial<
  Record<(typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number], string>
> = {}

/** Registry limits for games whose campaign band spans a wider roster range. */
export const CLASSIC_CAMPAIGN_GAME_MAX_PLAYERS: Partial<
  Record<(typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number], number>
> = { rockPaperScissors: 8, lastLight: 8 }

export const CLASSIC_CAMPAIGN_GAME_MIN_PLAYERS: Partial<
  Record<(typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number], number>
> = { rockPaperScissors: 5, lastLight: 5 }

export function getApprovedCompetitionGameKeys(
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE
): string[] {
  return [...new Set(template.flatMap((band) => [...band.loh, ...band.pos]))]
}

/**
 * Design rules represented below:
 *
 * - Each regular season day has its own pool, targeting the expected house
 *   count with a one-player tolerance for twists and double evictions.
 * - Only games marked inCompetitionMap participate in automatic draws.
 * - Final 3 phases draw from the same approved set and support two or three players.
 */
const BASE_BRACKET_TEMPLATE: BracketTemplate = [
  {
    label: 'Day 1 · premiere',
    minPlayers: 5,
    maxPlayers: 16,
    minDay: 1,
    maxDay: 1,
    loh: ['holdWall'],
    pos: ['quickTap', 'riskWheel'],
  },
  {
    label: 'Day 2 · 15 hubmates (±1)',
    minPlayers: 14,
    maxPlayers: 16,
    minDay: 2,
    maxDay: 2,
    loh: ['holdWall'],
    pos: ['quickTap', 'riskWheel', 'colorMatch', 'cardClash'],
  },
  {
    label: 'Day 3 · 14 hubmates (±1)',
    minPlayers: 13,
    maxPlayers: 15,
    minDay: 3,
    maxDay: 3,
    loh: ['holdWall'],
    pos: ['quickTap', 'colorMatch', 'cardClash', 'riskWheel'],
  },
  {
    label: 'Day 4 · 13 hubmates (±1)',
    minPlayers: 12,
    maxPlayers: 14,
    minDay: 4,
    maxDay: 4,
    loh: ['holdWall'],
    pos: ['quickTap', 'colorMatch', 'cardClash', 'riskWheel'],
  },
  {
    label: 'Day 5 · 12 hubmates (±1)',
    minPlayers: 11,
    maxPlayers: 13,
    minDay: 5,
    maxDay: 5,
    loh: ['snake'],
    pos: ['quickTap', 'colorMatch', 'cardClash', 'riskWheel'],
  },
  {
    label: 'Day 6 · 11 hubmates (±1)',
    minPlayers: 10,
    maxPlayers: 12,
    minDay: 6,
    maxDay: 6,
    loh: ['snake'],
    pos: ['quickTap', 'colorMatch', 'cardClash', 'riskWheel'],
  },
  {
    label: 'Day 7 · 9 hubmates (±1)',
    minPlayers: 8,
    maxPlayers: 10,
    minDay: 7,
    maxDay: 7,
    loh: ['snake', 'crystal_path_shattered'],
    pos: ['quickTapSeasons', 'riskWheel'],
  },
  {
    label: 'Day 8 · 8 hubmates (±1)',
    minPlayers: 7,
    maxPlayers: 9,
    minDay: 8,
    maxDay: 8,
    loh: ['timingBar', 'holdWall', 'capitalization', 'crystal_path_shattered'],
    pos: ['quickTapSeasons', 'riskWheel'],
  },
  {
    label: 'Day 9 · 7 hubmates (±1)',
    minPlayers: 6,
    maxPlayers: 8,
    minDay: 9,
    maxDay: 9,
    loh: ['timingBar', 'holdWall', 'capitalization', 'crystal_path_shattered'],
    pos: ['quickTapSeasons', 'riskWheel', 'quickTap', 'colorMatch'],
  },
  {
    label: 'Day 10 · 5 hubmates',
    minPlayers: 5,
    maxPlayers: 5,
    minDay: 10,
    maxDay: 10,
    loh: ['timingBar', 'holdWall', 'capitalization', 'crystal_path_shattered'],
    pos: ['quickTapSeasons', 'riskWheel', 'quickTap', 'colorMatch'],
  },
  {
    label: 'Day 11 · 5 hubmates',
    minPlayers: 4,
    maxPlayers: 5,
    minDay: 11,
    maxDay: 11,
    loh: ['timingBar', 'holdWall', 'capitalization', 'crystal_path_shattered'],
    pos: ['quickTapSeasons', 'riskWheel', 'quickTap', 'colorMatch'],
  },
  {
    label: 'Day 12 · 4 hubmates (±1)',
    minPlayers: 3,
    maxPlayers: 5,
    minDay: 12,
    maxDay: 12,
    loh: ['timingBar', 'holdWall', 'capitalization', 'crystal_path_shattered'],
    pos: ['quickTapSeasons', 'riskWheel', 'quickTap', 'colorMatch'],
  },
  {
    label: 'Final 3 - Part 1 competition map',
    minPlayers: 2,
    maxPlayers: 3,
    phases: ['final3_comp1', 'final3_comp1_minigame'],
    loh: ['quickTap', 'timingBar', 'cardClash'],
    pos: [],
  },
  {
    label: 'Final 3 - Part 2 competition map',
    minPlayers: 2,
    maxPlayers: 3,
    phases: ['final3_comp2', 'final3_comp2_minigame'],
    loh: ['timingBar', 'holdWall', 'cardClash'],
    pos: [],
  },
  {
    label: 'Final 3 - Part 3 competition map',
    minPlayers: 2,
    maxPlayers: 3,
    phases: ['final3_comp3', 'final3_comp3_minigame'],
    loh: ['quickTapSeasons', 'snake', 'capitalization'],
    pos: [],
  },
  {
    // Phase-less compatibility pool for tools that only know player count.
    label: '3 players (Final Trilogy)',
    minPlayers: 3,
    maxPlayers: 3,
    loh: [
      'quickTap',
      'quickTapSeasons',
      'timingBar',
      'holdWall',
      'colorMatch',
      'snake',
      'riskWheel',
      'crystal_path_shattered',
      'capitalization',
      'cardClash',
    ],
    pos: [],
  },
]

export const DEFAULT_BRACKET_TEMPLATE: BracketTemplate = BASE_BRACKET_TEMPLATE.map((band) => {
  if (
    band.phases ||
    !band.minDay ||
    band.minDay === 1 ||
    band.minPlayers > 8 ||
    band.maxPlayers < 5
  ) {
    return band
  }
  return {
    ...band,
    loh: [...band.loh, ...SOCIAL_COMPETITION_KEYS],
    pos: [...band.pos, ...SOCIAL_COMPETITION_KEYS],
  }
})

function matchesCampaignContext(band: BracketBand, context: ClassicCampaignContext): boolean {
  if (context.playerCount < band.minPlayers || context.playerCount > band.maxPlayers) return false
  if (band.minDay !== undefined && context.day < band.minDay) return false
  if (band.maxDay !== undefined && context.day > band.maxDay) return false
  if (band.phases && (!context.phase || !band.phases.includes(context.phase))) return false
  return true
}

function applyGameStoryPrerequisites(
  pool: string[],
  day: number,
  playedGameKeys: readonly string[] = []
): string[] {
  const played = new Set(playedGameKeys)
  return pool.filter((key) => {
    const minDay =
      CLASSIC_CAMPAIGN_GAME_MIN_DAY[key as (typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number]]
    if (minDay !== undefined && day < minDay) return false
    const requiredPrevious =
      CLASSIC_CAMPAIGN_GAME_REQUIRED_PREVIOUS[
        key as (typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number]
      ]
    return requiredPrevious === undefined || played.has(requiredPrevious)
  })
}

function applyPlayerCountPrerequisites(pool: string[], playerCount: number): string[] {
  return pool.filter((key) => {
    const minPlayers =
      CLASSIC_CAMPAIGN_GAME_MIN_PLAYERS[key as (typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number]]
    const maxPlayers =
      CLASSIC_CAMPAIGN_GAME_MAX_PLAYERS[key as (typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number]]
    return (
      (minPlayers === undefined || playerCount >= minPlayers) &&
      (maxPlayers === undefined || playerCount <= maxPlayers)
    )
  })
}

function getRosterFallbackBand(
  playerCount: number,
  template: BracketTemplate
): BracketBand | undefined {
  const dayGuideBands = template.filter(
    (band) =>
      !band.phases && band.minDay !== undefined && band.maxDay !== undefined && band.minDay !== 1
  )

  return dayGuideBands.sort((left, right) => {
    const distance = (band: BracketBand) =>
      playerCount < band.minPlayers
        ? band.minPlayers - playerCount
        : playerCount > band.maxPlayers
          ? playerCount - band.maxPlayers
          : 0
    const midpointDistance = (band: BracketBand) =>
      Math.abs((band.minPlayers + band.maxPlayers) / 2 - playerCount)

    return (
      distance(left) - distance(right) ||
      midpointDistance(left) - midpointDistance(right) ||
      (left.minDay ?? 0) - (right.minDay ?? 0)
    )
  })[0]
}

/**
 * Resolve the exact classic-campaign pool for a day/housemate/phase context.
 * Counts above the supported cast size use the widest large-house band. Counts
 * below Final 3 intentionally return no pool.
 */
export function getClassicCampaignPoolForContext(
  context: ClassicCampaignContext,
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE
): string[] {
  if (context.playerCount < 2) return []

  const matched = template
    .filter((band) => matchesCampaignContext(band, context))
    .sort((left, right) => {
      const specificity = (band: BracketBand) =>
        (band.phases ? 100 : 0) + (band.minDay !== undefined || band.maxDay !== undefined ? 10 : 0)
      return specificity(right) - specificity(left)
    })[0]
  if (matched) {
    const pool = context.compType === 'POS' ? matched.pos : matched.loh
    return applyPlayerCountPrerequisites(
      applyGameStoryPrerequisites(pool, context.day, context.playedGameKeys),
      context.playerCount
    )
  }

  const fallback = getRosterFallbackBand(context.playerCount, template)
  if (fallback) {
    const pool = context.compType === 'POS' ? fallback.pos : fallback.loh
    return applyPlayerCountPrerequisites(
      applyGameStoryPrerequisites(pool, context.day, context.playedGameKeys),
      context.playerCount
    )
  }

  return []
}

export function getBracketPoolForContext(
  playerCount: number,
  compType: 'LOH' | 'POS',
  template: BracketTemplate = DEFAULT_BRACKET_TEMPLATE
): string[] {
  if (playerCount < 3) return []

  const final3Compatibility = template.find(
    (band) =>
      playerCount === 3 &&
      band.minPlayers === 3 &&
      band.maxPlayers === 3 &&
      !band.minDay &&
      !band.maxDay &&
      !band.phases
  )
  if (final3Compatibility) {
    const pool = compType === 'POS' ? final3Compatibility.pos : final3Compatibility.loh
    return applyPlayerCountPrerequisites(
      applyGameStoryPrerequisites(pool, Number.MAX_SAFE_INTEGER),
      playerCount
    )
  }

  const fallback = getRosterFallbackBand(playerCount, template)
  if (!fallback) {
    const genericTemplate = template.filter((band) => !band.minDay && !band.maxDay && !band.phases)
    return getClassicCampaignPoolForContext(
      { day: Number.MAX_SAFE_INTEGER, playerCount, compType },
      genericTemplate
    )
  }
  const pool = compType === 'POS' ? fallback.pos : fallback.loh
  return applyPlayerCountPrerequisites(
    applyGameStoryPrerequisites(pool, Number.MAX_SAFE_INTEGER),
    playerCount
  )
}
