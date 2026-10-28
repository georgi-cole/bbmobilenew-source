import type { Dispatch, UnknownAction } from '@reduxjs/toolkit'
import type { SeasonContestant } from '../appearance/seasonContestant'
import { withSeasonContestant } from '../appearance/seasonContestant'
import {
  activateCupidArrowNow,
  activateVoxPopuliNow,
  hydrateGame,
  resetGame,
  setCupidArrowSchedule,
  setSeasonExpansion,
  setVoxPopuliSchedule,
} from '../store/gameSlice'
import type { SeasonArchive } from '../store/seasonArchive'
import { withRunAutosaveSuspended } from '../store/runAutosaveGate'
import { createSurvivorRun } from './survivorRun'
import { withSeasonLaunchIntent } from './seasonLaunchIntent'
import { rulesetExpansion, type SeasonRuleset } from './seasonRulesets'

export type NewSeasonMode = SeasonRuleset | 'survival'

export function parseNewSeasonMode(value: string | null): NewSeasonMode {
  return value === 'survival' || value === 'cupidArrow' || value === 'voxPopuli' ? value : 'classic'
}

/** Install the contestant before roster, pairing and story initialization run. */
export function launchSeasonWithContestant(
  dispatch: Dispatch<UnknownAction>,
  mode: NewSeasonMode,
  contestant: SeasonContestant,
  archives?: SeasonArchive[]
): void {
  withRunAutosaveSuspended(() => {
    withSeasonContestant(contestant, () => {
      if (mode === 'survival') {
        dispatch(hydrateGame(createSurvivorRun()))
        return
      }
      withSeasonLaunchIntent(mode, () => {
        dispatch(resetGame(archives))
        const expansion = rulesetExpansion(mode)
        dispatch(setSeasonExpansion(expansion))
        if (expansion === 'cupidArrow') {
          dispatch(setVoxPopuliSchedule(null))
          dispatch(activateCupidArrowNow())
        } else if (expansion === 'voxPopuli') {
          dispatch(setCupidArrowSchedule(null))
          dispatch(activateVoxPopuliNow())
        }
      })
    })
  })
}
