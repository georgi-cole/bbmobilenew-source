export type PublicNominationPlan = { autoNomineeId: string; chosenNomineeIds: string[] }
export const PUBLIC_NOMINATION_DURATION: number
export function publicNominationPlan(
  scene: string,
  game: {
    publicModeEnabled?: boolean
    doubleEviction?: { weekActive?: boolean }
    nomineeIds?: string[]
    nominationContext?: { autoNomineeId?: string | null; hohNomineeIds?: string[] } | null
    voxPopuli?: { status?: string }
  },
  cast: Record<string, { playerId?: string }>
): PublicNominationPlan | null
export function stagePublicNomination(
  root: HTMLElement,
  cast: Record<string, { playerId?: string }>,
  plan?: PublicNominationPlan | null
): boolean
export function animatePublicNomination(
  root: HTMLElement,
  animate: (target: string | Element, stops: [number, number, string?][]) => void,
  duration?: number
): void
