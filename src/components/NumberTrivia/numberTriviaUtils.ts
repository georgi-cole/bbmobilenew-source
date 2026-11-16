import { mulberry32 } from '../../store/rng';
import type { NumberTriviaDifficulty, NumberTriviaQuestion } from './numberTriviaData';

export const NUMBER_TRIVIA_TOTAL_ROUNDS = 5;
export const NUMBER_TRIVIA_MAX_ATTEMPTS = 6;
export const NUMBER_TRIVIA_READING_BUFFER_MS = 3_000;
export const NUMBER_TRIVIA_DUEL_STARTING_LIVES = 3;

export interface TriviaRoundPerformance {
  guessed: boolean;
  attempts: number;
  timeMs: number;
  closestDistance?: number;
  skipped?: boolean;
}

export interface TriviaStanding {
  participantId: string;
  participantName: string;
  isHuman: boolean;
  cumulativeScore: number;
  lastRoundScore: number;
  lastRoundAttempts: number;
  lastRoundTimeMs: number;
  lastRoundGuessed: boolean;
  eliminatedRound: number | null;
}

export interface NumberTriviaAiPerformanceContext {
  aiCapability?: number;
  precomputedScore: number;
  roundNumber: number;
  question: NumberTriviaQuestion;
}

export interface NumberTriviaAiRngContext {
  seed: number;
  roundNumber: number;
  participantId: string;
}

interface NumberTriviaAiDifficultyProfile {
  accuracyRange: [number, number];
  delayRangeMs: [number, number];
  feedbackGain: number;
  nearMissChance: number;
}

const NUMBER_TRIVIA_AI_PROFILES: Record<NumberTriviaDifficulty, NumberTriviaAiDifficultyProfile> = {
  easy: {
    accuracyRange: [0.9, 0.98],
    delayRangeMs: [350, 1_300],
    feedbackGain: 0.08,
    nearMissChance: 0.3,
  },
  medium: {
    accuracyRange: [0.7, 0.86],
    delayRangeMs: [1_800, 4_800],
    feedbackGain: 0.06,
    nearMissChance: 0.4,
  },
  hard: {
    accuracyRange: [0.45, 0.65],
    delayRangeMs: [3_000, 8_000],
    feedbackGain: 0.035,
    nearMissChance: 0.52,
  },
  'very-hard': {
    accuracyRange: [0.22, 0.46],
    delayRangeMs: [4_000, 11_000],
    feedbackGain: 0.02,
    nearMissChance: 0.68,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min: number, max: number, rng: () => number): number {
  return min + (max - min) * rng();
}

function hashNumberTriviaParticipantId(participantId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < participantId.length; index += 1) {
    hash ^= participantId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createNumberTriviaAiRng(context: NumberTriviaAiRngContext): () => number {
  // 0x9e3779b9 is the golden-ratio-derived Fibonacci hashing constant, used here
  // to spread adjacent round numbers apart before mixing in the participant hash.
  const roundSeed = Math.imul(context.roundNumber >>> 0, 0x9e3779b9) >>> 0;
  const participantSeed = hashNumberTriviaParticipantId(context.participantId);
  return mulberry32(((context.seed >>> 0) ^ roundSeed ^ participantSeed) >>> 0);
}

function getNearMissDistance(answer: number, rng: () => number): number {
  const magnitude = Math.abs(answer);
  if (magnitude <= 5) return 1;
  if (magnitude < 100) return 1 + Math.floor(rng() * 3);
  return 1 + Math.floor(rng() * 2);
}

function getFarMissDistance(answer: number, difficulty: NumberTriviaDifficulty, rng: () => number): number {
  const magnitude = Math.max(6, Math.abs(answer));
  const divisor = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5;
  const floor = Math.max(3, Math.round(magnitude / divisor));
  const ceiling = Math.max(floor + 2, Math.round(magnitude / (difficulty === 'very-hard' ? 2.4 : 2.8)));
  return floor + Math.floor(rng() * (ceiling - floor + 1));
}

function getFeedbackAccuracy(
  hint: string,
  profile: NumberTriviaAiDifficultyProfile,
  skillOffset: number,
  attempt: number,
): number {
  const hintAccuracy = hint.includes('Almost!')
    ? 1
    : hint.includes('Close!')
      ? 0.2
      : hint.includes('Much higher') || hint.includes('Much lower')
        ? 0.045
        : hint.includes('Higher!') || hint.includes('Lower!')
          ? 0.08
          : hint.includes('Way higher') || hint.includes('Way lower')
            ? 0.025
            : 0.012;

  // Hints improve the next estimate, but a directional clue does not reveal an
  // exact answer. Keep follow-up guesses materially uncertain even for a strong
  // AI so a six-try round is not equivalent to an instant answer.
  return clamp(
    hintAccuracy + profile.feedbackGain * 0.2 + skillOffset * 0.1 + Math.min(0.02, (attempt - 2) * 0.005),
    0.03,
    0.7,
  );
}

function estimateNextMissDistance(
  previousHint: string,
  answer: number,
  difficulty: NumberTriviaDifficulty,
  rng: () => number,
): number {
  if (previousHint.includes('Almost!')) return 1;
  if (previousHint.includes('Close!')) return 1 + Math.floor(rng() * 5);

  const magnitude = Math.max(6, Math.abs(answer));
  const uncertaintyRatio = previousHint.includes('Much higher') || previousHint.includes('Much lower')
    ? 0.25
    : previousHint.includes('Way higher') || previousHint.includes('Way lower')
      ? 0.5
      : previousHint.includes('Significantly higher') || previousHint.includes('Significantly lower')
        ? 1
        : 0.1;
  const learningScale = difficulty === 'easy' ? 0.85 : difficulty === 'medium' ? 0.95 : 1;
  const uncertainty = Math.max(2, Math.round(magnitude * uncertaintyRatio * learningScale));
  return 1 + Math.floor(rng() * uncertainty);
}

export function simulateNumberTriviaAiPerformance(
  context: NumberTriviaAiPerformanceContext,
  rng: () => number,
): TriviaRoundPerformance {
  const profile = NUMBER_TRIVIA_AI_PROFILES[context.question.difficulty];
  const skillOffset = clamp((context.precomputedScore - 60) / 450, -0.08, 0.08);
  const fatiguePenalty = Math.min(0.06, Math.max(0, context.roundNumber - 3) * 0.015);
  const baseAccuracy = (profile.accuracyRange[0] + profile.accuracyRange[1]) / 2;
  const initialAccuracy = clamp(
    1 - (1 - (baseAccuracy + skillOffset - fatiguePenalty)) / (context.aiCapability ?? 1),
    0.05,
    0.985,
  );
  const normalizedSkill = clamp((context.precomputedScore - 30) / 70, 0, 1);
  const responseSpeedMultiplier = 1.1 - normalizedSkill * 0.25;
  let timeMs = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  let priorMissDistance: number | undefined;
  let priorMissHint: string | undefined;

  for (let attempts = 1; attempts <= NUMBER_TRIVIA_MAX_ATTEMPTS; attempts += 1) {
    const responseTime =
      randomBetween(profile.delayRangeMs[0], profile.delayRangeMs[1], rng) * responseSpeedMultiplier;
    timeMs += responseTime + Math.max(0, fatiguePenalty * 3_000) / NUMBER_TRIVIA_MAX_ATTEMPTS;

    const attemptAccuracy = attempts === 1
      ? initialAccuracy
      : getFeedbackAccuracy(priorMissHint ?? '', profile, skillOffset, attempts);
    if (rng() < attemptAccuracy) {
      return {
        guessed: true,
        attempts,
        timeMs: Math.round(timeMs),
        closestDistance: 0,
      };
    }

    const nearMiss = rng() < clamp(profile.nearMissChance + skillOffset * 0.6, 0.15, 0.95);
    const missDistance = priorMissDistance === undefined
      ? nearMiss
        ? getNearMissDistance(context.question.answer, rng)
        : getFarMissDistance(context.question.answer, context.question.difficulty, rng)
      : estimateNextMissDistance(
        priorMissHint ?? '',
        context.question.answer,
        context.question.difficulty,
        rng,
      );
    closestDistance = Math.min(closestDistance, missDistance);
    priorMissDistance = missDistance;

    if (attempts < NUMBER_TRIVIA_MAX_ATTEMPTS) {
      // The AI keeps the same directional and proximity evidence a human sees.
      // Each miss narrows its next guess, while difficulty limits how quickly it
      // can turn that evidence into a better answer.
      const direction = rng() < 0.5 ? -1 : 1;
      const guessedValue = context.question.answer + direction * missDistance;
      priorMissHint = getTriviaHint(guessedValue, context.question.answer);
    }
  }

  return {
    guessed: false,
    attempts: NUMBER_TRIVIA_MAX_ATTEMPTS,
    timeMs: Math.round(timeMs),
    closestDistance: Number.isFinite(closestDistance) ? closestDistance : undefined,
  };
}

export function computeNumberTriviaRoundScore(performance: TriviaRoundPerformance): number {
  const attempts = Math.max(1, performance.attempts);
  if (performance.guessed) {
    const solvedBonus = 1000;
    const timeBonus = Math.max(0, 700 - Math.round(performance.timeMs / 20));
    const attemptBonus = Math.max(0, 180 - (attempts - 1) * 28);
    return solvedBonus + timeBonus + attemptBonus;
  }

  const closestDistance = Math.max(0, performance.closestDistance ?? Number.POSITIVE_INFINITY);
  const proximityBonus = Number.isFinite(closestDistance)
    ? Math.max(0, 140 - Math.min(140, closestDistance * 8))
    : 0;
  const attemptBonus = performance.skipped ? 0 : Math.max(0, 36 - (attempts - 1) * 6);
  return proximityBonus + attemptBonus;
}

export function getNumberTriviaEliminationCount(roundNumber: number, activeCount: number): number {
  if (roundNumber >= NUMBER_TRIVIA_TOTAL_ROUNDS || activeCount <= 2) return 0;
  return Math.min(activeCount - 2, 1);
}

/**
 * Round five keeps the top two cumulative scores. Everyone tied with the
 * second-place score also qualifies, so a genuine cutoff tie is never broken
 * by an unrelated field such as player name.
 */
export function getNumberTriviaFinalistIds(rankedStandings: TriviaStanding[]): string[] {
  if (rankedStandings.length <= 2) return rankedStandings.map((entry) => entry.participantId);
  const cutoffScore = rankedStandings[1].cumulativeScore;
  return rankedStandings
    .filter((entry) => entry.cumulativeScore >= cutoffScore)
    .map((entry) => entry.participantId);
}

export interface NumberTriviaDuelPerformance {
  participantId: string;
  performance: TriviaRoundPerformance;
}

/** Pick exactly one duel loser. Accuracy comes first; response time only breaks numerical ties. */
export function getNumberTriviaDuelLoserId(
  entries: NumberTriviaDuelPerformance[],
  rng: () => number = () => 0,
): string | null {
  if (entries.length === 0) return null;
  const compare = (a: NumberTriviaDuelPerformance, b: NumberTriviaDuelPerformance) => {
    if (a.performance.guessed !== b.performance.guessed) return a.performance.guessed ? -1 : 1;

    const aDistance = a.performance.guessed
      ? 0
      : Math.max(0, a.performance.closestDistance ?? Number.POSITIVE_INFINITY);
    const bDistance = b.performance.guessed
      ? 0
      : Math.max(0, b.performance.closestDistance ?? Number.POSITIVE_INFINITY);
    if (aDistance !== bDistance) return aDistance - bDistance;
    if (a.performance.timeMs !== b.performance.timeMs) return a.performance.timeMs - b.performance.timeMs;
    if (a.performance.attempts !== b.performance.attempts) return a.performance.attempts - b.performance.attempts;
    return 0;
  };
  const worst = [...entries].sort(compare).at(-1);
  if (!worst) return null;
  const exactTies = entries.filter((entry) => compare(entry, worst) === 0);
  return exactTies[Math.floor(rng() * exactTies.length)]?.participantId ?? worst.participantId;
}

export function compareTriviaStandings(a: TriviaStanding, b: TriviaStanding): number {
  if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore;
  if (b.lastRoundScore !== a.lastRoundScore) return b.lastRoundScore - a.lastRoundScore;
  if (a.lastRoundGuessed !== b.lastRoundGuessed) return a.lastRoundGuessed ? -1 : 1;
  if (a.lastRoundTimeMs !== b.lastRoundTimeMs) return a.lastRoundTimeMs - b.lastRoundTimeMs;
  if (a.lastRoundAttempts !== b.lastRoundAttempts) return a.lastRoundAttempts - b.lastRoundAttempts;
  return a.participantName.localeCompare(b.participantName);
}

export function formatTriviaTimeMs(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return '—';
  return `${(timeMs / 1000).toFixed(1)}s`;
}

export function getTriviaHint(guess: number, answer: number): string {
  const diff = Math.abs(guess - answer);
  const percentOff = (diff / Math.max(Math.abs(answer), 1)) * 100;

  if (guess === answer) {
    return 'Correct!';
  }
  if (diff === 1) {
    return guess < answer ? '↑ Almost! Go higher by 1' : '↓ Almost! Go lower by 1';
  }
  if (diff <= 5) {
    return guess < answer ? '↑ Close! Go higher' : '↓ Close! Go lower';
  }
  if (percentOff <= 10) {
    return guess < answer ? '↑ Higher!' : '↓ Lower!';
  }
  if (percentOff <= 25) {
    return guess < answer ? '↑↑ Much higher!' : '↓↓ Much lower!';
  }
  if (percentOff <= 50) {
    return guess < answer ? '↑↑↑ Way higher!' : '↓↓↓ Way lower!';
  }
  return guess < answer ? '⬆ Significantly higher!' : '⬇ Significantly lower!';
}
