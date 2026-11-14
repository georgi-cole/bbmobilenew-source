import type { CompetitionSkillProfile } from './types'

export const SEASON_AI_CAPABILITY_MULTIPLIER = 1.2

// These engines own native skill/error decisions and must not also boost their
// precomputed seed scores. Every other engine consumes the effective profile.
export const DIRECT_SEASON_AI_GAMES = new Set([
  'memoryMatch',
  'boxedOut',
  'holdWall',
  'famousFigures',
  'silentSaboteur',
  'percentagePanic',
  'majorityRules',
  'colorMatch',
  'logicLocks',
  'cardClash',
  'hangman',
  'threeDigitsQuiz',
  'capitalization',
  'dontGoOver',
  'blackjackTournament',
  'riskWheel',
  'wildcardWestern',
  'trapAuction',
  'mysticChamber',
  'chainOfGreed',
  'batteryLow',
  'houseOfDarkness',
  'gatesOfTheEye',
])

export interface SeasonAiRuntime {
  version: 1
  runId: string
  capability: number
  profiles: Record<string, { base: CompetitionSkillProfile; effective: CompetitionSkillProfile }>
}

const skillKeys = [
  'overall',
  'physical',
  'mental',
  'precision',
  'nerve',
  'consistency',
  'clutch',
] as const
const bounded = (value: number) => Math.max(0, Math.min(100, value))

/** Always receives a base profile; effective profiles are never written to the roster. */
export function effectiveSeasonProfile(profile?: CompetitionSkillProfile): CompetitionSkillProfile {
  const base: CompetitionSkillProfile = {
    overall: 50,
    physical: 50,
    mental: 50,
    precision: 50,
    nerve: 50,
    consistency: 50,
    clutch: 50,
    chokeRisk: 50,
    luck: 50,
    ...profile,
  }
  const result = { ...base }
  for (const key of skillKeys) {
    const value = base[key]
    if (value !== undefined) result[key] = bounded(value * SEASON_AI_CAPABILITY_MULTIPLIER)
  }
  result.chokeRisk = bounded(base.chokeRisk / SEASON_AI_CAPABILITY_MULTIPLIER)
  return result
}

export function captureSeasonAiRuntime(
  game: { mode?: string; status?: string; gameId?: string },
  players: readonly { id: string; isUser?: boolean; competitionProfile?: CompetitionSkillProfile }[]
): SeasonAiRuntime | undefined {
  if (game.mode !== 'classic' || game.status !== 'active' || !game.gameId) return undefined
  return {
    version: 1,
    runId: game.gameId,
    capability: SEASON_AI_CAPABILITY_MULTIPLIER,
    profiles: Object.fromEntries(
      players
        .filter((p) => !p.isUser)
        .map((p) => {
          const effective = effectiveSeasonProfile(p.competitionProfile)
          const base = p.competitionProfile
            ? { ...p.competitionProfile }
            : {
                overall: 50,
                physical: 50,
                mental: 50,
                precision: 50,
                nerve: 50,
                consistency: 50,
                clutch: 50,
                chokeRisk: 50,
                luck: 50,
              }
          return [p.id, { base, effective }]
        })
    ),
  }
}

export function runtimeCompetitionProfile(
  runtime: SeasonAiRuntime | undefined,
  playerId: string,
  fallback?: CompetitionSkillProfile,
  gameKey?: string
): CompetitionSkillProfile | undefined {
  if (gameKey && DIRECT_SEASON_AI_GAMES.has(gameKey))
    return runtime?.profiles[playerId]?.base ?? fallback
  return runtime?.profiles[playerId]?.effective ?? fallback
}
