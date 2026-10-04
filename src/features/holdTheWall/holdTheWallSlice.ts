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

// ─── Types ────────────────────────────────────────────────────────────────────

export type HoldTheWallStatus = 'idle' | 'active' | 'complete';

export type HoldTheWallPrizeType = 'LOH' | 'POS';

export type HoldTheWallDealStatus = 'offered' | 'accepted' | 'declined';

export interface HoldTheWallFinalTwoDeal {
  promisorId: string;
  beneficiaryId: string;
  offeredBy: 'human' | 'ai';
  status: HoldTheWallDealStatus;
  affinityAtDeal: number;
  tagsAtDeal: string[];
  /** True only when the beneficiary actually drops and gives the promisor the win. */
  triggered: boolean;
}

export interface HoldTheWallState {
  status: HoldTheWallStatus;
  prizeType: HoldTheWallPrizeType;
  seed: number;
  /** Human participant, retained so deal/drop reducers can validate the final two. */
  humanId: string | null;
  /** IDs of all competition participants (human + AI). */
  participantIds: string[];
  /**
   * Deterministic drop time (ms after game start) for each AI participant.
   * Keyed by player ID; the human player has no entry here.
   */
  aiDropSchedule: Record<string, number>;
  /** IDs of players who have dropped, in drop order (first dropped = index 0). */
  droppedIds: string[];
  /** ID of the last player standing once complete, or null while active. */
  winnerId: string | null;
  /** One optional final-two safety bargain for LOH Hold the Wall. */
  finalTwoDeal: HoldTheWallFinalTwoDeal | null;
  /** Prevents repeatedly reopening the final-two bargaining window. */
  dealOpportunityResolved: boolean;
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
  humanId: null,
  participantIds: [],
  aiDropSchedule: {},
  droppedIds: [],
  winnerId: null,
  finalTwoDeal: null,
  dealOpportunityResolved: false,
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

function applyPlayerDrop(
  state: HoldTheWallState,
  id: string,
  allowFinalDuelAiDrop: boolean,
): void {
  if (state.status !== 'active') return;
  if (state.droppedIds.includes(id)) return;

  const aliveBeforeDrop = state.participantIds.filter(
    (participantId) => !state.droppedIds.includes(participantId),
  );
  const isProtectedFinalDuelAi =
    aliveBeforeDrop.length === 2 &&
    state.humanId !== null &&
    aliveBeforeDrop.includes(state.humanId) &&
    id !== state.humanId;

  // Once the human and one AI are the final two, the old precomputed deadline
  // is no longer authoritative. Only a final-duel roll or an accepted deal can
  // make that AI drop.
  if (isProtectedFinalDuelAi && !allowFinalDuelAiDrop) return;

  if (
    aliveBeforeDrop.length === 2 &&
    state.finalTwoDeal?.status === 'accepted' &&
    state.finalTwoDeal.beneficiaryId === id &&
    aliveBeforeDrop.includes(state.finalTwoDeal.promisorId)
  ) {
    state.finalTwoDeal.triggered = true;
  }

  state.droppedIds.push(id);

  const aliveIds = state.participantIds.filter(
    (participantId) => !state.droppedIds.includes(participantId),
  );
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
      state.humanId = humanId;
      state.participantIds = participantIds;
      state.aiDropSchedule = buildAiDropSchedule(seed, participantIds, humanId);
      state.droppedIds = [];
      state.winnerId = null;
      state.finalTwoDeal = null;
      state.dealOpportunityResolved = false;
      state.outcomeResolved = false;
    },

    offerFinalTwoDeal(
      state,
      action: PayloadAction<{
        promisorId: string;
        beneficiaryId: string;
        offeredBy: 'human' | 'ai';
        affinityAtDeal: number;
        tagsAtDeal: string[];
      }>,
    ) {
      if (state.status !== 'active' || state.prizeType !== 'LOH') return;
      if (state.finalTwoDeal || state.dealOpportunityResolved) return;
      const aliveIds = state.participantIds.filter((id) => !state.droppedIds.includes(id));
      if (aliveIds.length !== 2) return;
      const { promisorId, beneficiaryId, offeredBy, affinityAtDeal, tagsAtDeal } = action.payload;
      if (
        promisorId === beneficiaryId ||
        !aliveIds.includes(promisorId) ||
        !aliveIds.includes(beneficiaryId)
      ) {
        return;
      }
      state.finalTwoDeal = {
        promisorId,
        beneficiaryId,
        offeredBy,
        status: 'offered',
        affinityAtDeal,
        tagsAtDeal: [...tagsAtDeal],
        triggered: false,
      };
    },

    resolveFinalTwoDeal(state, action: PayloadAction<boolean>) {
      if (state.status !== 'active' || state.finalTwoDeal?.status !== 'offered') return;
      state.finalTwoDeal.status = action.payload ? 'accepted' : 'declined';
      state.dealOpportunityResolved = true;
    },

    skipFinalTwoDeal(state) {
      if (state.status !== 'active' || state.dealOpportunityResolved) return;
      state.dealOpportunityResolved = true;
    },

    /**
     * Mark a player (human or AI) as having dropped off the wall.
     * Idempotent — safe to call if the player already dropped.
     * Automatically transitions to 'complete' when only one player remains.
     */
    dropPlayer(state, action: PayloadAction<string>) {
      applyPlayerDrop(state, action.payload, false);
    },

    /** Authoritative final-two AI fall: either the 10% roll or an accepted bargain. */
    dropFinalDuelAi(state, action: PayloadAction<string>) {
      applyPlayerDrop(state, action.payload, true);
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
  offerFinalTwoDeal,
  resolveFinalTwoDeal,
  skipFinalTwoDeal,
  dropPlayer,
  dropFinalDuelAi,
  markHoldTheWallOutcomeResolved,
  resetHoldTheWall,
} = holdTheWallSlice.actions;

export default holdTheWallSlice.reducer;
