import { createContext, useContext } from 'react'

/** Hosted overlays share the safe viewport; standalone games retain their page portal. */
export const MinigamePortalContext = createContext<HTMLElement | null>(null)

export function useMinigamePortalTarget(): HTMLElement {
  return useContext(MinigamePortalContext) ?? document.body
}
