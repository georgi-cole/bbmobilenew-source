import { describe, expect, it } from 'vitest'
import type { RootState } from '../../../store/store'
import gameReducer, {
  createInitialGameState,
  debugActivateWeekendInterlude,
  debugPrepareFinaleReunionPreview,
} from '../../../store/gameSlice'
import publicOpinionReducer from '../../../publicOpinion/publicOpinionSlice'
import socialReducer from '../../../social/socialSlice'
import { runFinaleReunionQa } from '../reunionQa'

describe('finale reunion QA checks', () => {
  it('passes for a reversible Sunday preview without changing player statuses', () => {
    const originalGame = createInitialGameState({ seed: 59301 })
    const social = socialReducer(undefined, { type: 'init' })
    const publicOpinion = publicOpinionReducer(undefined, { type: 'init' })
    let preview = gameReducer(originalGame, debugActivateWeekendInterlude('finale'))
    preview = gameReducer(preview, debugPrepareFinaleReunionPreview())
    const state = {
      game: preview,
      social,
      publicOpinion,
      weekendDebugPreview: {
        snapshot: { game: originalGame, social, publicOpinion },
      },
    } as RootState

    const checks = runFinaleReunionQa(state)

    expect(checks.every((check) => check.passed)).toBe(true)
    expect(preview.weekendInterlude?.reunionPreview?.guestIds).toHaveLength(
      originalGame.players.length - 3
    )
    expect(preview.players.map(({ id, status }) => [id, status])).toEqual(
      originalGame.players.map(({ id, status }) => [id, status])
    )
    expect(preview.week).toBe(originalGame.week)
  })

  it('reports failed checks when no reunion preview is active', () => {
    const game = createInitialGameState({ seed: 59302 })
    const social = socialReducer(undefined, { type: 'init' })
    const publicOpinion = publicOpinionReducer(undefined, { type: 'init' })
    const state = {
      game,
      social,
      publicOpinion,
      weekendDebugPreview: { snapshot: null },
    } as RootState

    expect(runFinaleReunionQa(state).some((check) => !check.passed)).toBe(true)
  })
})
