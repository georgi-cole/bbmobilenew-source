import type { SimulationSeeds } from './types'

/** Derive stable, independent seeds for each Playwright repeat in a batch. */
export function seedsForRepeat(base: SimulationSeeds, repeatIndex: number): SimulationSeeds {
  if (!Number.isInteger(repeatIndex) || repeatIndex < 0) {
    throw new Error(`repeatIndex must be a non-negative integer; received '${repeatIndex}'.`)
  }
  if (repeatIndex === 0) return { ...base }

  return {
    roster: (base.roster + Math.imul(repeatIndex, 0x9e3779b9)) >>> 0,
    season: (base.season + Math.imul(repeatIndex, 0x85ebca6b)) >>> 0,
    actor: (base.actor + Math.imul(repeatIndex, 0xc2b2ae35)) >>> 0,
  }
}
