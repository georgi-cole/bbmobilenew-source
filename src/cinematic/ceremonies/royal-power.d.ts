import type { CeremonyCastMember, CeremonyPoseResource } from './replacement-film.js'
export function royalPowerResources(
  cast: Record<string, CeremonyCastMember>,
  shared: Record<string, Omit<CeremonyPoseResource, 'src'>>,
  paired?: boolean
): Record<string, CeremonyPoseResource>
export function makeRoyalPowerFilm(
  images: Record<string, HTMLImageElement>,
  cast: Record<string, CeremonyCastMember>,
  paired?: boolean
): HTMLElement
export function animateRoyalPowerFilm(
  root: HTMLElement,
  animate: (target: string | Element, stops: (number | string)[][]) => void,
  duration: number
): void
