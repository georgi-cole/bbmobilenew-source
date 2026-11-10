import { useEffect, useSyncExternalStore } from 'react'
import {
  clearSurvivalRunsError,
  getSurvivalRunsSnapshot,
  purchaseSurvivalRun,
  refreshSurvivalRuns,
  subscribeSurvivalRuns,
} from './survivalRunPurchaseService'

/** Shared store state keeps purchased credits alive across screens and run changes. */
export function useSurvivalRuns() {
  const snapshot = useSyncExternalStore(subscribeSurvivalRuns, getSurvivalRunsSnapshot)
  useEffect(() => {
    void refreshSurvivalRuns()
  }, [])
  return {
    ...snapshot,
    purchase: purchaseSurvivalRun,
    refresh: refreshSurvivalRuns,
    clearError: clearSurvivalRunsError,
  }
}
