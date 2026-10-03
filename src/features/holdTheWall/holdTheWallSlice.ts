/**
 * Redux slice for the "Hold the Wall" endurance competition.
 *
 * State machine:
 *   idle → active  (startHoldTheWall dispatched on component mount)
 *   active → complete  (only one player remains standing)
 *
 * AI drop times are computed deterministically from the seed at start so the
 * result is reproducible. The React component schedules the setTimeout calls
 * and dispatches dropPlayer when each AI timer fires.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Earliest an AI player can drop (ms after game start). */
export const AI_DROP_MIN_MS = 10_000;
/** Latest an AI player can drop (ms after game start). */
export const AI_DROP_MAX_MS = 120_000;
/** Final-duel AI checks happen every five seconds in the component. */
export const FINAL_DUEL_DROP_INTERVAL_MS = 5_000;
/** Each final-duel check has a seeded 10% chance to make the AI drop. */
export const FINAL_DUEL_DROP_CHANCE = 0.1;
const FINAL_DUEL_ROLL_SEED_SALT = 0x41d7f00d;

// ─── Types ────────────────────────────────────────────────────────────────────

export type HoldTheWallStatus = 'idle' | 'active' | 'complete';

export type HoldTheWallPrizeType = 'LOH' | 'POS';

export interface HoldTheWallState {
  status: HoldTheWallStatus;
  prizeType: HoldTheWallPrizeType;
  seed: number;
  /** IDs of all competition participants (human + AI). */
  participantIds: string[];
  /**
   * Deterministic drop time (ms after game start) for each AI participant.
   * Keyed by player ID; the human player has no entry here.
   */
  aiDropSchedule: Record<string, number>;
  /**
   * AI reserved for the uncapped final duel against the human. It is removed
   * from aiDropSchedule and instead receives one seeded 10% drop roll every
   * five seconds while it is the final opponent.
   */
  finalDuelAiId: string | null;
  /** Number of final-duel drop rolls already resolved. */
  finalDuelRollCount: number;
  /** IDs of players who have dropped, in drop order (first dropped = index 0). */
  droppedIds: string[];
  /** ID of the last player standing once complete, or null while active. */
  winnerId: string | null;
  /**
   * Guard against dispatching applyMinigameWinner more than once.
   * Mirrors the outcomeResolved pattern used by cwgoCompetitionSlice.
   */
  outcomeResolved: boolean;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: HoldTheWallState = {
  status: 'idle',
  prizeType: 'LOH',
  seed: 0,
  participantIds: [],
  aiDropSchedule: {},
  finalDuelAiId: null,
  finalDuelRollCount: 0,
  droppedIds: [],
  winnerId: null,
  outcomeResolved: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a deterministic drop schedule for every non-human participant.
 * Each AI is assigned a personal drop time in [AI_DROP_MIN_MS, AI_DROP_MAX_MS).
 */
export function buildAiDropSchedule(
  seed: number,
  participantIds: string[],
  humanId: string | null,
): Record<string, number> {
  const rng = mulberry32(seed);
  const schedule: Record<string, number> = {};
  const range = AI_DROP_MAX_MS - AI_DROP_MIN_MS;
  for (const id of participantIds) {
    if (id !== humanId) {
      schedule[id] = AI_DROP_MIN_MS + Math.floor(rng() * range);
    }
  }
  return schedule;
}

/**
 * Deterministic final-duel endurance roll. The probability stays exactly 10%
 * per check while the result remains reproducible for a given seed/check index.
 */
export function shouldFinalDuelAiDrop(seed: number, rollIndex: number): boolean {
  const mixedSeed =
    (seed ^ FINAL_DUEL_ROLL_SEED_SALT ^ Math.imul(Math.max(1, rollIndex), 0x9e3779b1)) >>> 0;
  return mulberry32(mixedSeed)() < FINAL_DUEL_DROP_CHANCE;
}

function dropPlayerInPlace(state: HoldTheWallState, id: string): void {
  if (state.status !== 'active' || state.droppedIds.includes(id)) return;

  state.droppedIds.push(id);
  const aliveIds = state.participantIds.filter((pid) => !state.droppedIds.includes(pid));
  if (aliveIds.length === 1) {
    state.status = 'complete';
    state.winnerId = aliveIds[0];
  } else if (aliveIds.length === 0) {
    state.status = 'complete';
    state.winnerId = state.droppedIds[state.droppedIds.length - 1] ?? null;
  }
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const holdTheWallSlice = createSlice({
  name: 'holdTheWall',
  initialState,
  reducers: {
    /**
     * Initialise (or re-initialise) the competition.
     * Computes the deterministic AI drop schedule from the provided seed.
     */
    startHoldTheWall(
      state,
      action: PayloadAction<{
        participantIds: string[];
        humanId: string | null;
        prizeType: HoldTheWallPrizeType;
        seed: number;
      }>,
    ) {
      const { participantIds, humanId, prizeType, seed } = action.payload;
      state.status = 'active';
      state.prizeType = prizeType;
      state.seed = seed;
      state.participantIds = participantIds;
      state.aiDropSchedule = buildAiDropSchedule(seed, participantIds, humanId);
      state.finalDuelAiId = null;
      state.finalDuelRollCount = 0;
      if (humanId) {
        const scheduledEntries = Object.entries(state.aiDropSchedule);
        const latest = scheduledEntries.sort((left, right) => right[1] - left[1])[0];
        if (latest) {
          state.finalDuelAiId = latest[0];
          delete state.aiDropSchedule[latest[0]];
        }
      }
      state.droppedIds = [];
      state.winnerId = null;
      state.outcomeResolved = false;
    },

    /**
     * Mark a player (human or AI) as having dropped off the wall.
     * Idempotent — safe to call if the player already dropped.
     * Automatically transitions to 'complete' when only one player remains.
     */
    dropPlayer(state, action: PayloadAction<string>) {
      dropPlayerInPlace(state, action.payload);
    },

    /**
     * Resolve one uncapped final-duel check. The component dispatches this once
     * every five seconds only while the human and reserved AI are the final two.
     */
    rollFinalDuelAiDrop(state, action: PayloadAction<{ humanId: string }>) {
      if (state.status !== 'active' || !state.finalDuelAiId) return;
      const aliveIds = state.participantIds.filter((id) => !state.droppedIds.includes(id));
      if (
        aliveIds.length !== 2 ||
        !aliveIds.includes(action.payload.humanId) ||
        !aliveIds.includes(state.finalDuelAiId)
      ) {
        return;
      }

      state.finalDuelRollCount += 1;
      if (shouldFinalDuelAiDrop(state.seed, state.finalDuelRollCount)) {
        dropPlayerInPlace(state, state.finalDuelAiId);
      }
    },

    /** Idempotency guard: prevent the outcome thunk from firing twice. */
    markHoldTheWallOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset to idle (e.g. when navigating away). */
    resetHoldTheWall() {
      return initialState;
    },
  },
});

export const {
  startHoldTheWall,
  dropPlayer,
  rollFinalDuelAiDrop,
  markHoldTheWallOutcomeResolved,
  resetHoldTheWall,
} = holdTheWallSlice.actions;

export default holdTheWallSlice.reducer;
