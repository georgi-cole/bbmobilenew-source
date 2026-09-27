import type { Dispatch, UnknownAction } from '@reduxjs/toolkit'
import {
  activateVoxPopuliNow,
  resetGame,
  setCupidArrowSchedule,
  setSeasonExpansion,
} from '../store/gameSlice'
import { withRunAutosaveSuspended } from '../store/runAutosaveGate'
import { withSeasonLaunchIntent } from './seasonLaunchIntent'

/** Starts a fresh Vox season through the same guarded launch path as HomeHub. */
export function startNewVoxPopuliSeason(dispatch: Dispatch<UnknownAction>): void {
  withRunAutosaveSuspended(() => {
    withSeasonLaunchIntent('voxPopuli', () => {
      dispatch(resetGame())
      dispatch(setSeasonExpansion('voxPopuli'))
      dispatch(setCupidArrowSchedule(null))
      dispatch(activateVoxPopuliNow())
    })
  })
}
