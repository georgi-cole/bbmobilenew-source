/**
 * Headless Back 2 the Game spectator resolver.
 *
 * AI-only Battle Backs should be quick to watch, but the result still needs to
 * come from the same competition skill system used elsewhere in the game.
 * This module chooses one spectator challenge, simulates every candidate using
 * their competition profile + current season state, and returns an authoritative
 * winner/placement for SpectatorView to present in compressed form.
 */

import {
  getDefaultCompetitionProfile,
  getMinigameAiModel,
  simulateMinigameAiScore,
} from '../../ai/competition'
import type {
  CompetitionSeasonState,
  CompetitionSkillProfile,
  MinigameAiModel,
} from '../../ai/competition/types'
import { mulberry32 } from '../../store/rng'

export type BattleBackSpectatorVariant = 'holdwall' | 'trivia' | 'maze'

export interface BattleBackCompetitionCandidate {
  id: string
  profile?: CompetitionSkillProfile
  seasonState?: CompetitionSeasonState
}

export interface BattleBackCompetitionResult {
  variant: BattleBackSpectatorVariant
  gameKey: string
  scores: Record<string, number>
  placements: string[]
  winnerId: string
}

interface SpectatorChallenge {
  variant: BattleBackSpectatorVariant
  gameKey: string
}

const SPECTATOR_CHALLENGES: readonly SpectatorChallenge[] = [
  { variant: 'holdwall', gameKey: 'holdWall' },
  { variant: 'trivia', gameKey: 'biographyBlitz' },
  { variant: 'maze', gameKey: 'swipeMaze' },
]

function candidateId(candidate: BattleBackCompetitionCandidate | string): string {
  return typeof candidate === 'string' ? candidate : candidate.id
}

function normalizeCandidate(
  candidate: BattleBackCompetitionCandidate | string
): BattleBackCompetitionCandidate {
  return typeof candidate === 'string' ? { id: candidate } : candidate
}

function deterministicTieValue(seed: number, id: string): number {
  let hash = (seed ^ 0x9e3779b9) >>> 0
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

function compareScores(
  leftId: string,
  rightId: string,
  scores: Record<string, number>,
  model: MinigameAiModel,
  seed: number
): number {
  const left = scores[leftId] ?? 0
  const right = scores[rightId] ?? 0
  if (left !== right) {
    return model.scoreDirection === 'lower-is-better' ? left - right : right - left
  }
  return deterministicTieValue(seed, rightId) - deterministicTieValue(seed, leftId)
}

export function simulateBattleBackCompetition(
  candidates: Array<BattleBackCompetitionCandidate | string>,
  seed: number
): BattleBackCompetitionResult {
  if (candidates.length === 0) {
    throw new Error('[battleBackCompetition] candidates must not be empty')
  }

  const normalized = candidates.map(normalizeCandidate)
  const rng = mulberry32((seed ^ 0x0bbbac7) >>> 0)
  const challenge = SPECTATOR_CHALLENGES[Math.floor(rng() * SPECTATOR_CHALLENGES.length)]
  const model = getMinigameAiModel(challenge.gameKey)

  const scores: Record<string, number> = {}
  normalized.forEach((candidate, participantIndex) => {
    scores[candidate.id] = simulateMinigameAiScore({
      gameKey: challenge.gameKey,
      minigameModel: model,
      seed,
      playerId: candidate.id,
      participantIndex,
      profile: candidate.profile ?? getDefaultCompetitionProfile(),
      seasonState: candidate.seasonState,
    })
  })

  const placements = normalized
    .map((candidate) => candidate.id)
    .sort((leftId, rightId) => compareScores(leftId, rightId, scores, model, seed))

  return {
    variant: challenge.variant,
    gameKey: challenge.gameKey,
    scores,
    placements,
    winnerId: placements[0] ?? candidateId(normalized[0]),
  }
}
