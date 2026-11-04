import type { ReplacementPresentation } from './replacementPresentation'

export interface CeremonyPoseResource {
  src: string
  width: number
  height: number
  bytes: number
  sha256?: string
  feetY?: number
  character?: string
  pose?: string
  crown?: { x: number; baseY: number; width: number; angle: number }
}

export interface CeremonyCastMember {
  id: string
  name: string
  playerId?: string
  poses: Record<string, CeremonyPoseResource>
}

export function replacementResources(
  cast: Record<string, CeremonyCastMember>,
  details: { replacementOutcome: ReplacementPresentation },
  shared: Record<string, Omit<CeremonyPoseResource, 'src'>>
): Record<string, CeremonyPoseResource>

export function makeReplacementFilm(
  images: Record<string, HTMLImageElement>,
  cast: Record<string, CeremonyCastMember>,
  outcome: ReplacementPresentation
): HTMLElement

export function animateReplacementFilm(
  root: HTMLElement,
  animate: (target: string | Element, stops: (number | string)[][]) => void,
  outcome: ReplacementPresentation,
  duration: number
): void
