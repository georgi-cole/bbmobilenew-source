import { describe, expect, it } from 'vitest'
import {
  PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE,
  PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH,
  getPressurePlankGaugeSafeZoneBounds,
  getPressurePlankStabilityDamagePerSecond,
} from '../../src/components/PressurePlank/pressurePlankLogic'
import {
  normalizeTiltDelta,
  tiltLabyrinthFrameScale,
} from '../../src/components/TiltLabyrinthComp/tiltLabyrinthInput'

describe('minigame bug-fix regressions', () => {
  it('renders the minimum Pressure Plank safe zone on the same scale as its damage bounds', () => {
    const bounds = getPressurePlankGaugeSafeZoneBounds(PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH, 100)
    const protectedEdge =
      PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH + PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE

    expect(bounds.leftPercent).toBe(49)
    expect(bounds.widthPercent).toBe(2)
    expect(getPressurePlankStabilityDamagePerSecond(2, 2, 92)).toBe(0)
    expect(getPressurePlankStabilityDamagePerSecond(protectedEdge, 2, 92)).toBe(0)
    expect(getPressurePlankStabilityDamagePerSecond(protectedEdge + 0.01, 2, 92)).toBeGreaterThan(0)
  })

  it('keeps a neutral orientation reading neutral and applies a dead zone', () => {
    expect(normalizeTiltDelta(0)).toBe(0)
    expect(normalizeTiltDelta(1)).toBe(0)
    expect(normalizeTiltDelta(-1)).toBe(0)
    expect(normalizeTiltDelta(15)).toBeGreaterThan(0)
    expect(normalizeTiltDelta(-15)).toBeLessThan(0)
  })

  it('scales Tilt Labyrinth physics to elapsed frame time and caps stalled frames', () => {
    expect(tiltLabyrinthFrameScale(1000 / 30)).toBeCloseTo(2)
    expect(tiltLabyrinthFrameScale(1000 / 60)).toBeCloseTo(1)
    expect(tiltLabyrinthFrameScale(1000 / 120)).toBeCloseTo(0.5)
    expect(tiltLabyrinthFrameScale(250)).toBe(6)
    expect(tiltLabyrinthFrameScale(0)).toBe(0)
    expect(tiltLabyrinthFrameScale(Number.NaN)).toBe(0)
  })
})
