/**
 * confessionalDecisionSelectors.ts
 *
 * Derives the currently-active player ceremony decision that must be
 * completed inside the Confessional before game-flow can advance.
 *
 * Design notes:
 *  - Purely derived from the existing `awaitingXxx` / `replacementNeeded`
 *    flags already present in GameState.  No new Redux state is needed.
 *  - Final 4 (`final4_eviction`) and all Final 3 phases are EXPLICITLY
 *    excluded.  Those flows have their own UI and must not be rerouted.
 *  - Big Eye / tally logic continues to read from committed store state;
 *    the selector only influences *where* the UI renders the decision.
 */

import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { GameState, Phase } from '../types';

/** All known ceremony decision types that route through the Confessional. */
export type ConfessionalDecisionType =
  | 'nominations'          // Human LOH picks nominees (multi-select)
  | 'eviction_vote'        // Human voter casts single eviction vote
  | 'double_vote_offer'    // Big Eye offers stored Double-Vote power
  | 'double_vote'          // Human casts two eviction votes (atomic)
  | 'mission_immunity_offer' // Big Eye offers stored secret immunity
  | 'pos_decision'         // Human POS holder decides to use/skip power
  | 'vip_second_use'       // VIP second-use yes/no decision
  | 'pos_save_target'      // Human POS holder picks who to save
  | 'replacement_nominee'  // Human LOH (or POS holder) names replacement
  | 'tie_break'            // Human LOH breaks a tied eviction vote
  | 'twin_shock';          // Mandatory Lia/Ali story Confessional

export interface ActiveConfessionalDecision {
  /** What kind of decision must be resolved. */
  type: ConfessionalDecisionType;
  /** Current game week (used for display / stale-session detection). */
  week: number;
  /** Current game phase (informational). */
  phase: Phase;
  /**
   * Stable identity for this exact interaction stage. It distinguishes chained
   * power steps and a Twin Shock retry from a previous response in the same
   * week and phase.
   */
  interactionId?: string;
}

/**
 * Returns the stage within a decision type that is relevant to a player-facing
 * session. It deliberately uses only persisted game state so an interrupted
 * session has the same identity after a reload.
 */
export function getConfessionalInteractionId(
  game: GameState,
  type: ConfessionalDecisionType
): string {
  const prefix = [game.gameId ?? `season-${game.season}`, game.week, game.phase, type]

  switch (type) {
    case 'replacement_nominee':
      prefix.push(
        game.specialVeto?.awaitingCoupReplacement1
          ? 'coup-1'
          : game.specialVeto?.awaitingCoupReplacement2
            ? 'coup-2'
            : game.specialVeto?.awaitingHolderReplacement
              ? 'holder'
              : 'standard'
      )
      break
    case 'pos_save_target':
      prefix.push(game.specialVeto?.awaitingVipSecondSaveTarget ? 'vip-second-save' : 'save')
      break
    case 'vip_second_use':
      prefix.push(`vip-use-${game.specialVeto?.vipUseStage ?? 0}`)
      break
    case 'twin_shock':
      prefix.push(
        game.twinShock?.promptStage ?? 'none',
        `retry-${game.twinShock?.retryCount ?? 0}`
      )
      break
    case 'nominations':
      prefix.push(game.voxPopuli?.status === 'active' ? 'vox' : 'classic')
      break
    default:
      break
  }

  return prefix.join(':')
}

/** Compatibility fallback for callers that construct a decision in a test. */
export function getConfessionalDecisionKey(decision: ActiveConfessionalDecision): string {
  return decision.interactionId ?? `${decision.type}:${decision.week}:${decision.phase}`
}

/**
 * Phases that belong to the Final 4 / Final 3 endgame flows.
 * These are NEVER routed through the generic confessional decision system.
 */
const ENDGAME_PHASES = new Set<Phase>([
  'final4_eviction',
  'final3',
  'final3_comp1',
  'final3_comp1_minigame',
  'final3_comp2',
  'final3_comp2_minigame',
  'final3_comp3',
  'final3_comp3_minigame',
  'final3_decision',
]);

/**
 * Returns the active confessional ceremony decision that the human player
 * must resolve before the game can continue, or `null` when none is pending.
 *
 * Priority order matches the canonical phase sequence:
 *   nominations → pos_decision / save / replacement → vote / double-vote → tie-break
 */
function getActiveConfessionalDecisionFromGame(
  game: RootState['game'],
): ActiveConfessionalDecision | null {
  if (!game) return null;

  const { phase, week } = game;

  // ── Hard exclude Final 4 and all Final 3 phases ──────────────────────────
  if (ENDGAME_PHASES.has(phase)) return null;

  // ── Only relevant when the human player is alive and in the house ─────────
  const humanPlayer = game.players?.find((p) => p.isUser);
  if (!humanPlayer) return null;
  if (humanPlayer.status === 'evicted' || humanPlayer.status === 'jury') return null;
  const active = (type: ConfessionalDecisionType): ActiveConfessionalDecision => ({
    type,
    week,
    phase,
    interactionId: getConfessionalInteractionId(game, type),
  });

  if (game.twinShock?.promptStage) return active('twin_shock');

  // ── Nominations ─────────────────────────────────────────────────────────
  if (game.awaitingNominations) {
    return active('nominations');
  }

  // ── POS (Power of Safety) ceremony decisions ─────────────────────────────
  if (game.awaitingMissionImmunityOffer) {
    return active('mission_immunity_offer');
  }
  if (game.awaitingPovDecision) {
    return active('pos_decision');
  }
  if (game.specialVeto?.awaitingVipSecondUseDecision) {
    return active('vip_second_use');
  }
  if (game.awaitingPovSaveTarget || game.specialVeto?.awaitingVipSecondSaveTarget) {
    return active('pos_save_target');
  }
  if (
    game.replacementNeeded ||
    game.specialVeto?.awaitingHolderReplacement ||
    game.specialVeto?.awaitingCoupReplacement1 ||
    game.specialVeto?.awaitingCoupReplacement2
  ) {
    return active('replacement_nominee');
  }

  // ── Live eviction vote (incl. Double-Vote shock) ──────────────────────────
  if (game.awaitingDoubleVoteOffer) {
    return active('double_vote_offer');
  }
  if (game.awaitingHumanVote && game.humanDoubleVoteActive) {
    return active('double_vote');
  }
  if (game.awaitingHumanVote) {
    return active('eviction_vote');
  }

  // ── Tie-break (human LOH must break tied vote) ────────────────────────────
  if (game.awaitingTieBreak) {
    return active('tie_break');
  }

  return null;
}

const selectGame = (state: RootState) => state.game;

export const selectActiveConfessionalDecision = createSelector(
  [selectGame],
  (game) => getActiveConfessionalDecisionFromGame(game),
);
