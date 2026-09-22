/**
 * finaleSlice – Redux state for the Final Tribunal voting sequence.
 *
 * Lifecycle:
 *   startFinale()  → overlay appears, Tribunal members listed
 *   revealNextJuror() / castVote() → Tribunal votes accumulate one by one
 *   finalizeFinale() → winner computed, player state updated via callback
 */

import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState, AppDispatch } from './store'
import { mulberry32, seededPickN } from './rng'
import { resolvePublicJuryVote } from '../publicOpinion/PublicFinalVoteService'
import type { PlayerPublicProfile } from '../publicOpinion/types'
import type { RealityDomainState } from '../social/reality'
import {
  aiJurorVote,
  determineWinner,
  tallyVotes,
  pickPhrase,
  JURY_LOCKED_LINES,
  PUBLIC_JURY_VOTE_LINES,
  realityJurorScorecard,
} from '../utils/juryUtils'
import { resolveTribunalSize } from '../rules/tribunalPolicy'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Sentinel juror ID representing the public vote. */
export const PUBLIC_JUROR_ID = '__public__'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JurorReveal {
  jurorId: string
  /** Finalist ID this juror voted for. */
  finalistId: string
  /** Display phrase shown in the bubble, e.g. "I'm voting for…" */
  phrase: string
}

export interface FinaleState {
  /** Whether the finale overlay is active. */
  isActive: boolean
  /** IDs of the 2 players competing as finalists. */
  finalistIds: string[]
  /** Original (unshuffled) Tribunal member IDs — preserved for rerolling. */
  jurorIds: string[]
  /** Ordered list of juror IDs (shuffle-ordered for reveal). */
  revealOrder: string[]
  /**
   * Map of jurorId → voted finalistId.
   * Pre-computed for all AI jurors; human juror slot stays empty until voted.
   */
  votes: Record<string, string>
  /** How many jurors have been "revealed" to the audience so far. */
  revealedCount: number
  /** Juror waiting for human input (ID), or null. */
  awaitingHumanJurorId: string | null
  /** ID of the declared winner after all votes are tallied, or null. */
  winnerId: string | null
  /** ID of the runner-up, or null. */
  runnerUpId: string | null
  /** @deprecated Legacy save field. Finale setup no longer returns pre-Tribunal exits. */
  returnedJurorId: string | null
  /** Whether the finale has fully completed (winner declared). */
  isComplete: boolean
  /**
   * Guard: prevents startFinale from running more than once per game.
   * Reset only on resetGame (via extraReducers wiring in store).
   */
  hasStarted: boolean
  /** Whether the public juror (__public__) is included in this finale. */
  publicJurorEnabled: boolean
  /** The finalist ID that the public voted for, or null. */
  publicVotedFor: string | null
  /** Public ballot is always one equal-weight vote. Kept for save compatibility. */
  publicVoteWeight: 1
  /** Compact, history-derived scores used to keep Tribunal rerolls grounded in the season. */
  juryScorecards: Record<string, Record<string, number>>
  /** Whether the explicit Tribunal tiebreak policy was needed. */
  tieBreakUsed: boolean
  tieBreakReason:
    | 'tribunal_majority'
    | 'season_evaluation'
    | 'public_final_vote'
    | 'legacy_recovery'
    | null
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: FinaleState = {
  isActive: false,
  finalistIds: [],
  jurorIds: [],
  revealOrder: [],
  votes: {},
  revealedCount: 0,
  awaitingHumanJurorId: null,
  winnerId: null,
  runnerUpId: null,
  returnedJurorId: null,
  isComplete: false,
  hasStarted: false,
  publicJurorEnabled: false,
  publicVotedFor: null,
  publicVoteWeight: 1,
  juryScorecards: {},
  tieBreakUsed: false,
  tieBreakReason: null,
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const finaleSlice = createSlice({
  name: 'finale',
  initialState,
  reducers: {
    /**
     * Initialise the finale.
     * Computes AI Tribunal votes, reveal order, and the optional public finalist ballot.
     */
    startFinale(
      state,
      action: PayloadAction<{
        finalistIds: string[]
        /** Tribunal member IDs (internal status === 'jury'). */
        jurorIds: string[]
        /**
         * @deprecated Accepted for callers restoring older finale payloads.
         * Pre-Tribunal exits are never promoted into the Tribunal.
         */
        preJuryIds?: string[]
        /** Human player IDs (to show voting UI instead of auto-vote). */
        humanPlayerIds: string[]
        seed: number
        cfg?: {
          publicFinalVoteEnabled?: boolean
          /** @deprecated Legacy alias. */
          americasVoteEnabled?: boolean
          /** @deprecated Ignored legacy finale-time return flag. */
          enableJuryReturn?: boolean
        }
        /** Optional public approval profiles to enable the public juror vote. */
        publicApprovalProfiles?: Record<string, PlayerPublicProfile>
        /** Reality history used to ground AI Tribunal decisions in the actual season. */
        reality?: RealityDomainState
      }>
    ) {
      if (state.hasStarted) return // idempotency guard

      const {
        finalistIds,
        jurorIds,
        humanPlayerIds,
        seed,
        cfg,
        publicApprovalProfiles,
        reality,
      } = action.payload

      // ── Resolve the optional equal-weight public ballot ──────────────────
      let publicJurorEnabled = false
      let publicVotedFor: string | null = null
      const publicFinalVoteEnabled =
        cfg?.publicFinalVoteEnabled ?? cfg?.americasVoteEnabled ?? false
      if (publicFinalVoteEnabled && publicApprovalProfiles) {
        const publicVoteResult = resolvePublicJuryVote({
          finalistIds,
          profiles: publicApprovalProfiles,
        })
        if (publicVoteResult.winnerId) {
          publicJurorEnabled = true
          publicVotedFor = publicVoteResult.winnerId
        }
      }

      // Tribunal membership was already fixed when each eviction happened.
      // Finale setup must never promote a pre-Tribunal exit for parity.
      let effectiveJurorIds = [...jurorIds]
      const publicVoteWeight = 1 as const

      // ── Shuffle jury for reveal order ─────────────────────────────────────
      const rng = mulberry32(seed)
      const shuffled = seededPickN(rng, effectiveJurorIds, effectiveJurorIds.length)

      // ── Pre-compute AI votes ──────────────────────────────────────────────
      const votes: Record<string, string> = {}
      const juryScorecards: Record<string, Record<string, number>> = {}
      for (const jId of effectiveJurorIds) {
        if (humanPlayerIds.includes(jId)) continue // human votes when input arrives
        const scorecard = realityJurorScorecard(jId, finalistIds, reality)
        if (scorecard) juryScorecards[jId] = scorecard
        votes[jId] = aiJurorVote(jId, finalistIds, seed, reality, scorecard)
      }

      // ── Public juror vote ─────────────────────────────────────────────────
      if (publicJurorEnabled && publicVotedFor) {
        votes[PUBLIC_JUROR_ID] = publicVotedFor
        shuffled.push(PUBLIC_JUROR_ID)
        // Include PUBLIC_JUROR_ID in jurorIds so rerollJurySeed preserves it.
        effectiveJurorIds = [...effectiveJurorIds, PUBLIC_JUROR_ID]
      }

      state.isActive = true
      state.hasStarted = true
      state.finalistIds = finalistIds
      state.jurorIds = effectiveJurorIds
      state.revealOrder = shuffled
      state.votes = votes
      state.revealedCount = 0
      state.awaitingHumanJurorId = null
      state.winnerId = null
      state.runnerUpId = null
      state.returnedJurorId = null
      state.isComplete = false
      state.publicJurorEnabled = publicJurorEnabled
      state.publicVotedFor = publicVotedFor
      state.publicVoteWeight = publicVoteWeight
      state.juryScorecards = juryScorecards
      state.tieBreakUsed = false
      state.tieBreakReason = null
    },

    /**
     * Advance the reveal counter by one step.
     * If the next juror is human, set awaitingHumanJurorId.
     * No-op if all jurors are already revealed.
     */
    revealNextJuror(state, action: PayloadAction<{ humanPlayerIds: string[] }>) {
      if (state.revealedCount >= state.revealOrder.length) return
      const nextJurorId = state.revealOrder[state.revealedCount]

      if (action.payload.humanPlayerIds.includes(nextJurorId) && !state.votes[nextJurorId]) {
        state.awaitingHumanJurorId = nextJurorId
      } else {
        state.revealedCount += 1
        state.awaitingHumanJurorId = null
      }
    },

    /**
     * Cast (or force) a vote for a juror.
     * Clears awaitingHumanJurorId and advances the reveal counter.
     */
    castVote(state, action: PayloadAction<{ jurorId: string; finalistId: string }>) {
      const { jurorId, finalistId } = action.payload
      if (!state.finalistIds.includes(finalistId)) return // guard: must vote for a finalist
      state.votes[jurorId] = finalistId
      if (state.awaitingHumanJurorId === jurorId) {
        state.awaitingHumanJurorId = null
        state.revealedCount += 1
      }
    },

    /**
     * Compute final tally and declare the winner.
     * Updates revealedCount to maximum (reveals any still-hidden jurors).
     * No-op if winner already declared.
     */
    finalizeFinale(state, _action: PayloadAction<{ seed: number }>) {
      if (state.isComplete) return

      // Reveal any outstanding jurors
      state.revealedCount = state.revealOrder.length
      state.awaitingHumanJurorId = null

      const tally = tallyVotes(state.votes)
      const [a, b] = state.finalistIds

      if (!a || !b) {
        state.isComplete = false
        return
      }

      let winnerId = determineWinner(tally, state.finalistIds)
      let tieBreakReason: FinaleState['tieBreakReason'] = null

      if (!winnerId) {
        // A single public ballot can turn a 5–4 Tribunal majority into a 5–5
        // combined tally. In that case the Tribunal itself remains decisive.
        const tribunalVotes = Object.fromEntries(
          Object.entries(state.votes).filter(([jurorId]) => jurorId !== PUBLIC_JUROR_ID)
        )
        const tribunalWinner = determineWinner(tallyVotes(tribunalVotes), state.finalistIds)
        if (tribunalWinner) {
          winnerId = tribunalWinner
          tieBreakReason = 'tribunal_majority'
        }
      }

      if (!winnerId) {
        // Legacy/even Tribunal saves can still tie. Resolve those from the
        // persisted season-long juror evaluations rather than RNG.
        const scoreFor = (finalistId: string) =>
          Object.values(state.juryScorecards).reduce(
            (total, scorecard) => total + (scorecard[finalistId] ?? 0),
            0
          )
        const aScore = scoreFor(a)
        const bScore = scoreFor(b)
        if (Math.abs(aScore - bScore) > 0.0001) {
          winnerId = aScore > bScore ? a : b
          tieBreakReason = 'season_evaluation'
        }
      }

      if (!winnerId && state.publicVotedFor && state.finalistIds.includes(state.publicVotedFor)) {
        winnerId = state.publicVotedFor
        tieBreakReason = 'public_final_vote'
      }

      if (!winnerId) {
        // Last-resort migration safety for a malformed old save with no usable
        // season evidence. Stable ordering is explicit and non-random.
        winnerId = [...state.finalistIds].sort()[0] ?? null
        tieBreakReason = 'legacy_recovery'
      }

      if (!winnerId) {
        state.isComplete = false
        return
      }

      const runnerUpId = state.finalistIds.find((id) => id !== winnerId) ?? null

      state.winnerId = winnerId
      state.runnerUpId = runnerUpId
      state.isComplete = true
      state.tieBreakUsed = tieBreakReason !== null
      state.tieBreakReason = tieBreakReason
    },

    /**
     * Debug: force a specific juror's vote to a specific finalist.
     * Works even if the juror has already voted (override).
     */
    forceJurorVote(state, action: PayloadAction<{ jurorId: string; finalistId: string }>) {
      const { jurorId, finalistId } = action.payload
      if (!state.finalistIds.includes(finalistId)) return
      state.votes[jurorId] = finalistId
    },

    /**
     * Debug: re-roll the reveal order and AI votes using a new seed.
     * Only effective before finalizing.
     * The public juror (PUBLIC_JUROR_ID) is preserved in jurorIds and always
     * placed last in the reveal order; its vote is not re-computed here since
     * it depends on public-opinion state that lives outside this slice.
     */
    rerollJurySeed(state, action: PayloadAction<{ seed: number; humanPlayerIds: string[] }>) {
      if (state.isComplete) return
      const { seed, humanPlayerIds } = action.payload

      // Separate public juror (if present) from regular jurors for shuffle
      const regularJurors = state.jurorIds.filter((id) => id !== PUBLIC_JUROR_ID)
      const rng = mulberry32(seed)
      const shuffled = seededPickN(rng, regularJurors, regularJurors.length)
      // Re-append public juror last if it was enabled
      if (state.publicJurorEnabled) {
        shuffled.push(PUBLIC_JUROR_ID)
      }
      state.revealOrder = shuffled

      for (const jId of state.revealOrder) {
        if (jId === PUBLIC_JUROR_ID) continue // public vote unchanged
        if (humanPlayerIds.includes(jId)) continue
        state.votes[jId] = aiJurorVote(
          jId,
          state.finalistIds,
          seed,
          undefined,
          state.juryScorecards[jId]
        )
      }
      state.revealedCount = 0
      state.winnerId = null
      state.runnerUpId = null
      state.isComplete = false
      state.tieBreakUsed = false
    },

    /** Close / hide the overlay (after winner is confirmed). */
    dismissFinale(state) {
      state.isActive = false
    },

    /**
     * Full reset – for explicit manual resets (e.g., tests or dev tooling).
     * Game resets are handled automatically via extraReducers below.
     */
    resetFinale() {
      return { ...initialState }
    },

    /**
     * Restore a previously saved finale state (manual save/resume).
     * Replaces the entire finale slice with the snapshot.
     */
    hydrateFinale(_state, action: PayloadAction<FinaleState>) {
      return {
        ...action.payload,
        publicVoteWeight: 1,
        juryScorecards: action.payload.juryScorecards ?? {},
        tieBreakUsed: action.payload.tieBreakUsed ?? false,
        tieBreakReason: action.payload.tieBreakReason ?? null,
      }
    },
  },
  extraReducers: (builder) => {
    // Automatically reset finale state whenever the game is fully reset.
    builder.addMatcher(
      (action) => action.type === 'game/resetGame',
      () => ({ ...initialState })
    )
  },
})

export const {
  startFinale,
  revealNextJuror,
  castVote,
  finalizeFinale,
  forceJurorVote,
  rerollJurySeed,
  dismissFinale,
  resetFinale,
  hydrateFinale,
} = finaleSlice.actions

export default finaleSlice.reducer

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectFinale = (state: RootState) => state.finale

export const selectFinaleTimings = createSelector(
  [(state: RootState) => state.game.cfg, (state: RootState) => state.game.players.length],
  (cfg, currentCastSize) => {
    const startingCastSize = cfg?.tribunalStartingCastSize ?? currentCastSize
    const tribunalSize = Math.max(1, resolveTribunalSize(startingCastSize, cfg))
    const tJuryFinale = cfg?.tJuryFinale ?? 42_000
    const tVoteReveal = cfg?.tVoteReveal ?? Math.round(tJuryFinale / tribunalSize)
    return { tJuryFinale, tVoteReveal }
  }
)

// ─── Thunks ──────────────────────────────────────────────────────────────────

/**
 * Reveal the next juror and — if pacing is enabled — auto-advance after delay.
 * Finalizes the vote after the last reveal.
 */
export const revealNextJurorThunk =
  (humanPlayerIds: string[]) => (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(revealNextJuror({ humanPlayerIds }))

    const finale = getState().finale
    if (finale.awaitingHumanJurorId) return // waiting for human input

    if (finale.revealedCount >= finale.revealOrder.length && !finale.isComplete) {
      const { seed } = getState().game
      dispatch(finalizeFinale({ seed }))
    }
  }

/**
 * Skip-all: reveal AI jurors until a human ballot is due, then pause for that
 * ballot. Presentation controls must never cast a vote for a human juror.
 */
export const skipAllJurorsThunk =
  (humanPlayerIds: string[], seed: number) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState().finale

    if (state.revealOrder.length === 0 && !state.isComplete) {
      dispatch(finalizeFinale({ seed }))
      return
    }

    // Reveal until the next human ballot. Once revealNextJuror encounters an
    // uncast human juror it leaves revealedCount unchanged, so break instead
    // of spinning through the rest of the loop.
    let current = getState().finale
    const remaining = current.revealOrder.length - current.revealedCount
    for (let i = 0; i < remaining; i++) {
      dispatch(revealNextJuror({ humanPlayerIds }))
      current = getState().finale
      if (current.awaitingHumanJurorId) return
    }

    current = getState().finale
    if (!current.isComplete) {
      dispatch(finalizeFinale({ seed }))
    }
  }

/**
 * Build the JurorReveal[] list for revealed jurors (used by the UI).
 * Includes the phrase bubble text for each revealed juror.
 */
export const selectRevealedJurors = createSelector(
  selectFinale,
  (state: RootState) => state.game.seed,
  (finale, seed): JurorReveal[] => {
    return finale.revealOrder.slice(0, finale.revealedCount).map((jurorId, idx) => {
      const finalistId = finale.votes[jurorId] ?? ''
      const phrase =
        jurorId === PUBLIC_JUROR_ID
          ? pickPhrase(PUBLIC_JURY_VOTE_LINES, seed, idx)
          : pickPhrase(JURY_LOCKED_LINES, seed, idx)
      return { jurorId, finalistId, phrase }
    })
  }
)
