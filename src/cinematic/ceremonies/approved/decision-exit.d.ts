export type DepartureScene = 'exit' | 'tiebreak' | 'final4' | 'final3'
export const DECISION_IDS: DepartureScene[]
export { FINAL_EXIT_BRAND_RESOURCE } from './finale-closing-brand'
export const DECISION_CONFIG: Record<
  DepartureScene,
  {
    duration: number
    exitAt: number
    avatarAt: number
    art: string[]
    description: string
    beats: [string, string][]
    moments: number[]
  }
>
export interface DecisionOptions {
  nativeHandoff?: boolean
  closingBrand?: boolean
}
export interface DecisionTiming {
  duration: number
  exitAt: number
  zoomAt: number
  avatarAt: number
  handoffAt: number
  closingBrand: boolean
}
export function getDecisionTiming(
  scene: string,
  options?: { closingBrand?: boolean }
): DecisionTiming
export function makeDecisionScene(
  scene: string,
  images: Record<string, HTMLImageElement>,
  cast?: number,
  options?: DecisionOptions
): HTMLDivElement
export function animateDecisionScene(
  scene: string,
  root: HTMLElement,
  animate: (selector: string | Element, stops: [number, number, string?, string?][]) => void,
  options?: DecisionOptions
): void
