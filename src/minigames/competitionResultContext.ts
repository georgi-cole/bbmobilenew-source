import { createContext, useContext, useEffect } from 'react'
import type { CompetitionResult } from './competitionResult'

/** Absent in standalone games, demos, native overlays and the minigame lab. */
export const CompetitionResultContext = createContext<
  ((result: CompetitionResult) => Promise<boolean>) | null
>(null)

export function useCompetitionResultCheckpoint(result: CompetitionResult | null): void {
  const checkpoint = useContext(CompetitionResultContext)
  useEffect(() => {
    if (checkpoint && result) void checkpoint(result)
  }, [checkpoint, result])
}
