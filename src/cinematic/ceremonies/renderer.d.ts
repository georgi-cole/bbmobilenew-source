export interface ClipMetrics {
  preparationMs: number
  transferBytes: number
  decodedBytes: number
}
export interface ClipController {
  stop(): void
  pause(): void
  resume(): void
  seek(ms: number): void
  setVisible(visible: boolean): void
  prepare(
    id: string,
    cast: Record<string, unknown>,
    shockType?: string,
    details?: Record<string, unknown>
  ): Promise<(ClipMetrics & { images: Record<string, HTMLImageElement> }) | null>
  mount(
    parent: HTMLElement,
    onHandoff: () => void,
    onComplete: () => void,
    shockType?: string,
    options?: { matchHandoff?: boolean; origin?: DOMRect | null }
  ): void
  nativeReady(rosterOnly?: boolean): void
  readonly root: HTMLElement | null
  readonly metrics: ClipMetrics | null
  readonly counts: { animations: number; timers: number; mounted: boolean; retainedImages: number }
}
export function createClip(): ClipController
