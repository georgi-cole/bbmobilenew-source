import type { CeremonyPoseResource } from './replacement-film'
export type WalkStop = [number, number, string?, string?]
export type WalkSprite = { node: HTMLImageElement; frames: number; frameMs: number }
export function upgradeWalkResources<T extends { src: string; pose?: string; character?: string }>(
  resources: Record<string, T>,
  enabled?: boolean
): Record<string, T & { walkCycle?: boolean; fallback?: T }>
export function attachWalkSprites(
  root: HTMLElement,
  resources: Record<string, CeremonyPoseResource>
): WalkSprite[]
export function continueDoorwayTravel(
  selector: string | Element,
  frames: WalkStop[],
  exitAt: number,
  paired: boolean
): WalkStop[]
export function animateWalkSprites(
  sprites: WalkSprite[],
  animate: (node: HTMLImageElement, stops: WalkStop[]) => void,
  duration: number,
  exitAt: number
): void
