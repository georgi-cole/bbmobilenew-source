import { createContext, useContext } from 'react'
import type { SeasonAiRuntime } from './seasonAiDifficulty'

export const SeasonAiContext = createContext<SeasonAiRuntime | undefined>(undefined)
export const useSeasonAiRuntime = () => useContext(SeasonAiContext)
export const useSeasonAiCapability = () => useSeasonAiRuntime()?.capability ?? 1
