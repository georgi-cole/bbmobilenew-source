import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import publicOpinionReducer, {
  hydratePublicOpinion,
} from '../../../publicOpinion/publicOpinionSlice'
import socialReducer, { openSocialPanel } from '../../../social/socialSlice'
import gameReducer, {
  createInitialGameState,
  debugActivateWeekendInterlude,
} from '../../../store/gameSlice'
import weekendDebugPreviewReducer from '../../../store/weekendDebugPreviewSlice'
import { captureWeekendDebugSnapshot, restoreWeekendDebugSnapshot } from '../weekendDebugActions'

describe('weekend debug previews', () => {
  it('restores the season, social state, and public opinion after a preview', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        social: socialReducer,
        publicOpinion: publicOpinionReducer,
        weekendDebugPreview: weekendDebugPreviewReducer,
      },
    })
    const original = store.getState()

    store.dispatch(
      captureWeekendDebugSnapshot({
        game: original.game,
        social: original.social,
        publicOpinion: original.publicOpinion,
      })
    )
    store.dispatch(debugActivateWeekendInterlude(10))
    store.dispatch(openSocialPanel())
    store.dispatch(hydratePublicOpinion({ ...original.publicOpinion, currentFeedDay: 42 }))

    expect(store.getState().game.weekendInterlude?.debug).toBe(true)
    expect(store.getState().social.panelOpen).toBe(true)
    expect(store.getState().publicOpinion.currentFeedDay).toBe(42)

    const snapshot = store.getState().weekendDebugPreview.snapshot
    expect(snapshot).not.toBeNull()
    store.dispatch(restoreWeekendDebugSnapshot(snapshot!))

    expect(store.getState().game).toEqual(original.game)
    expect(store.getState().social).toEqual(original.social)
    expect(store.getState().publicOpinion).toEqual(original.publicOpinion)
    expect(store.getState().weekendDebugPreview.snapshot).toBeNull()
  })

  it('does not change the calendar when a preview begins', () => {
    const initial = createInitialGameState({ seed: 2510 })
    const preview = gameReducer(initial, debugActivateWeekendInterlude(10))

    expect(preview.week).toBe(initial.week)
    expect(preview.phase).toBe(initial.phase)
    expect(preview.weekendInterlude).toMatchObject({
      afterDay: 10,
      weekendDay: 1,
      debug: true,
      stage: 'intro',
    })
  })
})
