import type { CeremonyCastMember, CeremonyPoseResource } from './replacement-film'
export function adaptModeFilm(
  scene: string,
  root: HTMLElement,
  images: Record<string, HTMLImageElement>,
  resources: Record<string, CeremonyPoseResource>,
  cast: Record<string, CeremonyCastMember>,
  details: Record<string, unknown>,
  fitCrown: (...args: unknown[]) => void
): void
