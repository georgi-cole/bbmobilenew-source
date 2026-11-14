export const DEPRESSION_ROSTER_TARGET =
  '[data-houseguest-roster="true"] [data-depression-target="true"]'

export const CHOCOLATE_TIMING = { flight: 860, stagger: 62, reliefDelay: 680, reliefDuration: 3050 }

export function chocolateCompletionMs(targetCount: number): number {
  return Math.max(
    3200,
    CHOCOLATE_TIMING.reliefDelay +
      Math.max(0, targetCount - 1) * CHOCOLATE_TIMING.stagger +
      CHOCOLATE_TIMING.reliefDuration +
      100
  )
}
