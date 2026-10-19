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

/**
 * Explicitly approved normal-campaign games. Registry activation alone is not
 * enough: entries only belong here after gameplay QA and campaign approval.
 */
export const CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS = [
  'quickTap',
  'quickTapSeasons',
  'blackjackTournament',
  'riskWheel',
  'timingBar',
  'estimationGame',
  'holdWall',
  'famousFigures',
  'silentSaboteur',
  'majorityRules',
  'pressurePlank',
  'colorMatch',
  'logicLocks',
  'snake',
  'cardClash',
  'tiltLabyrinth',
  'threeDigitsQuiz',
  'tetris',
  'minesweeps',
  'dontGoOver',
  'capitalization',
  'castleRescue',
  'castleRescue2',
  'glass_bridge_brutal',
  'crystal_path_shattered',
  'wildcardWestern',
  'trapAuction',
  'bigSpender',
  'chainOfGreed',
  'batteryLow',
  'houseOfDarkness',
  'mysticChamber',
  'finalThreeCircuit',
  'downMemoryLane',
] as const

/** Per-game story prerequisites that apply in addition to the roster map. */
export const CLASSIC_CAMPAIGN_GAME_MIN_DAY: Partial<
  Record<(typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number], number>
> = {
  silentSaboteur: 4,
  castleRescue2: 9,
}

/** Narrative prerequisites that cannot be represented by day alone. */
export const CLASSIC_CAMPAIGN_GAME_REQUIRED_PREVIOUS: Partial<
  Record<(typeof CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)[number], string>
> = {
  castleRescue2: 'castleRescue',
}

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
 * - Day 1 is a fixed two-game premiere: Majority Rules for LOH and Quick Tap
 *   Race for POS.
 * - With many housemates, LOH uses fixed-round or simultaneous games and POS
 *   stays short. Sequential/turn-heavy formats remain in the large-cast days.
 * - LOH becomes longer and more technical as the season progresses.
 * - POS increasingly permits shorter, simpler, and chance-driven formats.
 * - Final 4 only uses games that make sense with four players.
 * - Elimination ladders, turn-order spectacles, and social-deduction formats
 *   stay in the large-cast portion of the season. They lose their tension when
 *   only a few housemates remain.
 * - Final 3 Parts 1 and 2 use the finale-only Final Three Circuit. Part 1 runs
 *   with all three finalists; Part 2 runs with the two Part 1 non-winners.
 * - Final 3 Part 3 is the two-player Down Memory Lane season-recall duel.
 */
export const DEFAULT_BRACKET_TEMPLATE: BracketTemplate = [
  {
    label: 'Day 1 · premiere',
    minPlayers: 5,
    maxPlayers: 16,
    minDay: 1,
    maxDay: 1,
    loh: ['majorityRules'],
    pos: ['quickTap', 'riskWheel'],
  },
  {
    label: 'Day 2 · 15 hubmates (±1)',
    minPlayers: 14,
    maxPlayers: 16,
    minDay: 2,
    maxDay: 2,
    loh: [
      'holdWall',
      'blackjackTournament',
      'famousFigures',
      'majorityRules',
      'batteryLow',
      'trapAuction',
    ],
    pos: ['quickTap', 'riskWheel', 'colorMatch', 'cardClash', 'dontGoOver', 'tiltLabyrinth'],
  },
  {
    label: 'Day 3 · 14 hubmates (±1)',
    minPlayers: 13,
    maxPlayers: 15,
    minDay: 3,
    maxDay: 3,
    loh: [
      'blackjackTournament',
      'famousFigures',
      'majorityRules',
      'silentSaboteur',
      'batteryLow',
      'trapAuction',
    ],
    pos: [
      'quickTap',
      'colorMatch',
      'cardClash',
      'riskWheel',
      'dontGoOver',
      'tiltLabyrinth',
      'threeDigitsQuiz',
      'logicLocks',
    ],
  },
  {
    label: 'Day 4 · 13 hubmates (±1)',
    minPlayers: 12,
    maxPlayers: 14,
    minDay: 4,
    maxDay: 4,
    loh: [
      'blackjackTournament',
      'famousFigures',
      'silentSaboteur',
      'majorityRules',
      'batteryLow',
      'trapAuction',
    ],
    pos: [
      'quickTap',
      'colorMatch',
      'cardClash',
      'logicLocks',
      'riskWheel',
      'tiltLabyrinth',
      'dontGoOver',
      'threeDigitsQuiz',
    ],
  },
  {
    label: 'Day 5 · 12 hubmates (±1)',
    minPlayers: 11,
    maxPlayers: 13,
    minDay: 5,
    maxDay: 5,
    loh: [
      'snake',
      'blackjackTournament',
      'famousFigures',
      'silentSaboteur',
      'chainOfGreed',
      'batteryLow',
      'trapAuction',
    ],
    pos: [
      'quickTap',
      'colorMatch',
      'cardClash',
      'logicLocks',
      'riskWheel',
      'threeDigitsQuiz',
      'dontGoOver',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Day 6 · 11 hubmates (±1)',
    minPlayers: 10,
    maxPlayers: 12,
    minDay: 6,
    maxDay: 6,
    loh: [
      'snake',
      'blackjackTournament',
      'famousFigures',
      'silentSaboteur',
      'chainOfGreed',
      'batteryLow',
      'trapAuction',
    ],
    pos: [
      'quickTap',
      'colorMatch',
      'cardClash',
      'logicLocks',
      'riskWheel',
      'threeDigitsQuiz',
      'dontGoOver',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Day 7 · 9 hubmates (±1)',
    minPlayers: 8,
    maxPlayers: 10,
    minDay: 7,
    maxDay: 7,
    loh: [
      'snake',
      'blackjackTournament',
      'famousFigures',
      'silentSaboteur',
      'batteryLow',
      'chainOfGreed',
      'trapAuction',
      'glass_bridge_brutal',
      'crystal_path_shattered',
      'wildcardWestern',
    ],
    pos: [
      'quickTapSeasons',
      'logicLocks',
      'riskWheel',
      'tiltLabyrinth',
      'minesweeps',
      'dontGoOver',
      'bigSpender',
      'threeDigitsQuiz',
      'tetris',
    ],
  },
  {
    label: 'Day 8 · 8 hubmates (±1)',
    minPlayers: 7,
    maxPlayers: 9,
    minDay: 8,
    maxDay: 8,
    loh: [
      'castleRescue',
      'blackjackTournament',
      'famousFigures',
      'majorityRules',
      'timingBar',
      'estimationGame',
      'holdWall',
      'pressurePlank',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'quickTapSeasons',
      'bigSpender',
      'logicLocks',
      'riskWheel',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
    ],
  },
  {
    label: 'Day 9 · 7 hubmates (±1)',
    minPlayers: 6,
    maxPlayers: 8,
    minDay: 9,
    maxDay: 9,
    loh: [
      'castleRescue2',
      'blackjackTournament',
      'famousFigures',
      'timingBar',
      'holdWall',
      'pressurePlank',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'quickTapSeasons',
      'bigSpender',
      'logicLocks',
      'riskWheel',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
      'quickTap',
      'colorMatch',
      'tiltLabyrinth',
    ],
  },
  {
    label: 'Day 10 · 5 hubmates',
    minPlayers: 5,
    maxPlayers: 5,
    minDay: 10,
    maxDay: 10,
    loh: [
      'castleRescue',
      'castleRescue2',
      'blackjackTournament',
      'timingBar',
      'estimationGame',
      'holdWall',
      'pressurePlank',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'quickTapSeasons',
      'bigSpender',
      'logicLocks',
      'riskWheel',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
      'quickTap',
      'colorMatch',
      'tiltLabyrinth',
      'mysticChamber',
    ],
  },
  {
    label: 'Day 11 · 5 hubmates',
    minPlayers: 4,
    maxPlayers: 5,
    minDay: 11,
    maxDay: 11,
    loh: [
      'castleRescue2',
      'blackjackTournament',
      'famousFigures',
      'timingBar',
      'estimationGame',
      'holdWall',
      'pressurePlank',
      'threeDigitsQuiz',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'quickTapSeasons',
      'bigSpender',
      'logicLocks',
      'riskWheel',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
      'quickTap',
      'colorMatch',
      'tiltLabyrinth',
      'mysticChamber',
    ],
  },
  {
    label: 'Day 12 · 4 hubmates (±1)',
    minPlayers: 3,
    maxPlayers: 5,
    minDay: 12,
    maxDay: 12,
    loh: [
      'castleRescue2',
      'blackjackTournament',
      'famousFigures',
      'timingBar',
      'estimationGame',
      'holdWall',
      'pressurePlank',
      'threeDigitsQuiz',
      'capitalization',
      'chainOfGreed',
      'batteryLow',
      'houseOfDarkness',
    ],
    pos: [
      'quickTapSeasons',
      'bigSpender',
      'logicLocks',
      'riskWheel',
      'minesweeps',
      'tetris',
      'threeDigitsQuiz',
      'dontGoOver',
      'quickTap',
      'colorMatch',
      'tiltLabyrinth',
      'mysticChamber',
    ],
  },
  {
    label: 'Final 3 - Part 1 Circuit qualifier',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp1', 'final3_comp1_minigame'],
    loh: ['finalThreeCircuit'],
    pos: [],
  },
  {
    label: 'Final 3 - Part 2 Circuit qualifier',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp2', 'final3_comp2_minigame'],
    loh: ['finalThreeCircuit'],
    pos: [],
  },
  {
    label: 'Final 3 - Part 3 · Down Memory Lane',
    minPlayers: 3,
    maxPlayers: 3,
    phases: ['final3_comp3', 'final3_comp3_minigame'],
    loh: ['downMemoryLane'],
    pos: [],
  },
  {
    // Phase-less compatibility pool for tools that only know player count.
    label: '3 players (Final Trilogy)',
    minPlayers: 3,
    maxPlayers: 3,
    loh: ['finalThreeCircuit', 'downMemoryLane'],
    pos: [],
  },
]

/**
 * CAMPAIGN MAP — BASE CHALLENGE-SELECTION ODDS (not player win odds)
 *
 * These are scheduler probabilities calculated from the current map's eligible
 * pools and each game's registry weight; they are not empirical frequencies.
 * The requested games' registry weights were each reduced by 10%.
 * No aggregated production draw log is available in the repo. Days 10-12 also
 * include the scheduler's late-season category bias at the target cast size
 * (5, 5, and 4). They are baseline odds for a clean history: recent-category
 * filtering and recency multipliers, unique-mode season history, roster
 * eligibility, story prerequisites, and Game Manager / remote overrides can
 * change a live draw. Find Your Twin 2 requires Find Your Twin to have appeared
 * earlier. Percentages are rounded to one decimal place.
 *
 * | Day / target cast | Comp | Game and baseline chance |
 * | --- | --- | --- |
 * | 1 / premiere | LOH | Majority Rules 100% (fixed) |
 * | 1 / premiere | POS | Quick Tap Race 66.7%; Risk Wheel 33.3% |
 * | 2 / 15 (±1) | LOH | Hold the Wall 12.8%; Blackjack Tournament 12.8%; Famous Figures 12.8%; Majority Rules 12.8%; Battery Low 23.1%; Trap Auction 25.6% |
 * | 2 / 15 (±1) | POS | Quick Tap Race 29.0%; Risk Wheel 14.5%; Color Match 14.5%; House of Cards 14.5%; Don't Go Over 14.5%; Tilt Labyrinth 13.0% |
 * | 3 / 14 (±1) | LOH | Blackjack Tournament 12.8%; Famous Figures 12.8%; Majority Rules 12.8%; Silent Saboteur 12.8%; Battery Low 23.1%; Trap Auction 25.6% |
 * | 3 / 14 (±1) | POS | Quick Tap Race 22.5%; Color Match 11.2%; House of Cards 11.2%; Risk Wheel 11.2%; Don't Go Over 11.2%; Tilt Labyrinth 10.1%; Number Trivia 11.2%; Vault Cracker 11.2% |
 * | 4 / 13 (±1) | LOH | Blackjack Tournament 12.8%; Famous Figures 12.8%; Silent Saboteur 12.8%; Majority Rules 12.8%; Battery Low 23.1%; Trap Auction 25.6% |
 * | 4 / 13 (±1) | POS | Quick Tap Race 22.5%; Color Match 11.2%; House of Cards 11.2%; Vault Cracker 11.2%; Risk Wheel 11.2%; Tilt Labyrinth 10.1%; Don't Go Over 11.2%; Number Trivia 11.2% |
 * | 5 / 12 (±1) | LOH | Serpentine 17.0%; Blackjack Tournament 9.4%; Famous Figures 9.4%; Silent Saboteur 9.4%; Chain of Greed 18.9%; Battery Low 17.0%; Trap Auction 18.9% |
 * | 5 / 12 (±1) | POS | Quick Tap Race 22.5%; Color Match 11.2%; House of Cards 11.2%; Vault Cracker 11.2%; Risk Wheel 11.2%; Number Trivia 11.2%; Don't Go Over 11.2%; Tilt Labyrinth 10.1% |
 * | 6 / 11 (±1) | LOH | Serpentine 17.0%; Blackjack Tournament 9.4%; Famous Figures 9.4%; Silent Saboteur 9.4%; Chain of Greed 18.9%; Battery Low 17.0%; Trap Auction 18.9% |
 * | 6 / 11 (±1) | POS | Quick Tap Race 22.5%; Color Match 11.2%; House of Cards 11.2%; Vault Cracker 11.2%; Risk Wheel 11.2%; Number Trivia 11.2%; Don't Go Over 11.2%; Tilt Labyrinth 10.1% |
 * | 7 / 9 (±1) | LOH | Serpentine 13.2%; Blackjack Tournament 7.4%; Famous Figures 7.4%; Silent Saboteur 7.4%; Battery Low 13.2%; Chain of Greed 14.7%; Trap Auction 14.7%; The Crystal Path 7.4%; Crystal Path: Infinity 7.4%; Wildcard Western 7.4% |
 * | 7 / 9 (±1) | POS | Quick Tap Race 2: Seasons 10.5%; Vault Cracker 10.5%; Risk Wheel 10.5%; Tilt Labyrinth 9.5%; Minesweeps 9.5%; Don't Go Over 10.5%; Big Spender: Closing Time 9.5%; Number Trivia 10.5%; Fit Me In 18.9% |
 * | 8 / 8 (±1) | LOH | Find Your Twin 7.4%; Blackjack Tournament 7.4%; Famous Figures 7.4%; Majority Rules 7.4%; Timing Bar 7.4%; Estimation 6.7%; Hold the Wall 7.4%; Pressure Plank 6.7%; Capitalization 7.4%; Chain of Greed 14.8%; Battery Low 13.3%; House of Darkness 6.7% |
 * | 8 / 8 (±1) | POS | Quick Tap Race 2: Seasons 11.6%; Big Spender: Closing Time 10.5%; Vault Cracker 11.6%; Risk Wheel 11.6%; Minesweeps 10.5%; Fit Me In 20.9%; Number Trivia 11.6%; Don't Go Over 11.6% |
 * | 9 / 7 (±1) | LOH | Find Your Twin 2: Lost Again 8.6%; Blackjack Tournament 8.6%; Famous Figures 8.6%; Timing Bar 8.6%; Hold the Wall 8.6%; Pressure Plank 7.8%; Capitalization 8.6%; Chain of Greed 17.2%; Battery Low 15.5%; House of Darkness 7.8% |
 * | 9 / 7 (±1) | POS | Quick Tap Race 2: Seasons 8.0%; Big Spender: Closing Time 7.2%; Vault Cracker 8.0%; Risk Wheel 8.0%; Minesweeps 7.2%; Fit Me In 14.4%; Number Trivia 8.0%; Don't Go Over 8.0%; Quick Tap Race 16.0%; Color Match 8.0%; Tilt Labyrinth 7.2% |
 * | 10 / 5 | LOH | Find Your Twin 8.1%; Find Your Twin 2: Lost Again 8.1%; Blackjack Tournament 7.5%; Timing Bar 8.4%; Estimation 7.6%; Hold the Wall 7.2%; Pressure Plank 6.5%; Capitalization 8.4%; Chain of Greed 16.9%; Battery Low 13.6%; House of Darkness 7.6% |
 * | 10 / 5 | POS | Quick Tap Race 2: Seasons 5.9%; Big Spender: Closing Time 6.6%; Vault Cracker 7.3%; Risk Wheel 6.6%; Minesweeps 6.6%; Fit Me In 13.2%; Number Trivia 7.3%; Don't Go Over 6.6%; Quick Tap Race 11.8%; Color Match 7.3%; Tilt Labyrinth 6.6%; Mystic Chamber 14.2% |
 * | 11 / 5 | LOH | Find Your Twin 2: Lost Again 7.5%; Blackjack Tournament 6.9%; Famous Figures 7.8%; Timing Bar 7.8%; Estimation 7.0%; Hold the Wall 6.6%; Pressure Plank 6.0%; Number Trivia 7.8%; Capitalization 7.8%; Chain of Greed 15.5%; Battery Low 12.5%; House of Darkness 7.0% |
 * | 11 / 5 | POS | Quick Tap Race 2: Seasons 5.9%; Big Spender: Closing Time 6.6%; Vault Cracker 7.3%; Risk Wheel 6.6%; Minesweeps 6.6%; Fit Me In 13.2%; Number Trivia 7.3%; Don't Go Over 6.6%; Quick Tap Race 11.8%; Color Match 7.3%; Tilt Labyrinth 6.6%; Mystic Chamber 14.2% |
 * | 12 / 4 (±1) | LOH | Find Your Twin 2: Lost Again 7.5%; Blackjack Tournament 6.9%; Famous Figures 7.8%; Timing Bar 7.8%; Estimation 7.0%; Hold the Wall 6.6%; Pressure Plank 6.0%; Number Trivia 7.8%; Capitalization 7.8%; Chain of Greed 15.5%; Battery Low 12.5%; House of Darkness 7.0% |
 * | 12 / 4 (±1) | POS | Quick Tap Race 2: Seasons 5.9%; Big Spender: Closing Time 6.6%; Vault Cracker 7.3%; Risk Wheel 6.6%; Minesweeps 6.6%; Fit Me In 13.2%; Number Trivia 7.3%; Don't Go Over 6.6%; Quick Tap Race 11.8%; Color Match 7.3%; Tilt Labyrinth 6.6%; Mystic Chamber 14.2% |
 * | Final 3 · Part 1 | LOH | Final Three Circuit 100% (fixed) |
 * | Final 3 · Part 2 | LOH | Final Three Circuit 100% (fixed) |
 * | Final 3 · Part 3 | LOH | Down Memory Lane 100% (fixed) |
 */

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
  if (context.playerCount < 3) return []

  const matched = template
    .filter((band) => matchesCampaignContext(band, context))
    .sort((left, right) => {
      const specificity = (band: BracketBand) =>
        (band.phases ? 100 : 0) + (band.minDay !== undefined || band.maxDay !== undefined ? 10 : 0)
      return specificity(right) - specificity(left)
    })[0]
  if (matched) {
    const pool = context.compType === 'POS' ? matched.pos : matched.loh
    return applyGameStoryPrerequisites(pool, context.day, context.playedGameKeys)
  }

  const fallback = getRosterFallbackBand(context.playerCount, template)
  if (fallback) {
    const pool = context.compType === 'POS' ? fallback.pos : fallback.loh
    return applyGameStoryPrerequisites(pool, context.day, context.playedGameKeys)
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
    return applyGameStoryPrerequisites(pool, Number.MAX_SAFE_INTEGER)
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
  return applyGameStoryPrerequisites(pool, Number.MAX_SAFE_INTEGER)
}
