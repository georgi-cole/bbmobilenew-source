/**
 * Thunk: resolveFamousFiguresOutcome
 *
 * Reads the completed Famous Figures competition state, validates the current
 * game phase matches the competition type, and awards LOH or POS via
 * `applyMinigameWinner`.
 *
 * Idempotent — if outcomeResolved is already true it returns immediately
 * without dispatching again. Mirrors the biographyBlitz/thunks.ts pattern.
 */
import type { AppDispatch, RootState } from '../../store/store'
import { applyMinigameWinner } from '../../store/gameSlice'
import { markFamousFiguresOutcomeResolved } from './famousFiguresSlice'
import type { FamousFiguresState } from './famousFiguresSlice'
import { rankFamousFigures } from './standings'

export const resolveFamousFiguresOutcome =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const s = getState()
    const ff = (s as RootState & { famousFigures?: FamousFiguresState }).famousFigures
    if (!ff || ff.status !== 'complete') return

    // Idempotency guard
    if (ff.outcomeResolved) {
      console.log('[famousFigures] resolveFamousFiguresOutcome: already resolved, skipping.')
      return
    }

    const winnerId = ff.winnerId
    if (!winnerId) return

    const phase = s.game.phase

    console.log('[famousFigures] resolveFamousFiguresOutcome start', {
      winnerId,
      competitionType: ff.competitionType,
      phase,
    })

    if (ff.competitionType === 'LOH' && phase !== 'loh_comp') {
      console.error(
        '[famousFigures] resolveFamousFiguresOutcome: expected phase "loh_comp" for LOH, got',
        phase
      )
      return
    }
    if (ff.competitionType === 'POS' && phase !== 'pos_comp') {
      console.error(
        '[famousFigures] resolveFamousFiguresOutcome: expected phase "pos_comp" for POS, got',
        phase
      )
      return
    }

    dispatch(markFamousFiguresOutcomeResolved())
    const participants = Object.keys(ff.playerScores)
    const placements = rankFamousFigures(
      participants,
      ff.playerScores,
      ff.playerRoundScores,
      ff.tieBreakOrder
    )
    dispatch(
      applyMinigameWinner({
        winnerId,
        participants,
        scores: ff.playerScores,
        placements,
        gameKey: 'famousFigures',
        includePlacementBonuses: false,
        lastPlaceId: placements.length > 1 ? placements.at(-1) : null,
        lastPlaceType: 'scored',
      })
    )
  }
