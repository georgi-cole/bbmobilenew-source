import type { AppDispatch, RootState } from '../../store/store'
import {
  debugActivateWeekendInterlude,
  debugEndFinaleReunionPreview,
  debugExitWeekendInterlude,
  debugPrepareFinaleReunionPreview,
} from '../../store/gameSlice'
import { clearWeekendDebugSnapshot } from '../../store/weekendDebugPreviewSlice'
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate'
import { captureWeekendDebugSnapshot, restoreWeekendDebugSnapshot } from './weekendDebugActions'

export function startWeekendDebugPreview(afterDay: 5 | 10 | 15 | 'finale' | 'tribunal') {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState()
    if (
      state.settings.gameUX.weekendsEnabled === false ||
      state.game.weekendInterlude?.active ||
      state.game.mode === 'survival'
    )
      return
    dispatch(
      captureWeekendDebugSnapshot({
        game: state.game,
        social: state.social,
        publicOpinion: state.publicOpinion,
      })
    )
    dispatch(debugActivateWeekendInterlude(afterDay))
  }
}

export function finishWeekendDebugPreview() {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const snapshot = getState().weekendDebugPreview.snapshot
    if (!snapshot) {
      dispatch(debugExitWeekendInterlude())
      return
    }

    withRunAutosaveSuspended(() => {
      dispatch(restoreWeekendDebugSnapshot(snapshot))
      dispatch(clearWeekendDebugSnapshot())
    })
  }
}

/** Start a temporary finale preview directly at the Sunday reunion scene. */
export function startFinaleReunionDebugPreview() {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState()
    if (
      state.settings.gameUX.weekendsEnabled === false ||
      state.game.weekendsEnabledForSeason === false ||
      state.game.weekendInterlude?.active ||
      state.game.mode === 'survival' ||
      state.game.players.length < 4
    ) {
      return
    }

    dispatch(
      captureWeekendDebugSnapshot({
        game: state.game,
        social: state.social,
        publicOpinion: state.publicOpinion,
      })
    )
    dispatch(debugActivateWeekendInterlude('finale'))
    dispatch(debugPrepareFinaleReunionPreview())
  }
}

export function endFinaleReunionDebugPreview() {
  return (dispatch: AppDispatch) => dispatch(debugEndFinaleReunionPreview())
}
