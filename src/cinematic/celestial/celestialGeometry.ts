import type { TimelineState } from '../timeline/timeline';
import { clamp01, lerp, smootherstep } from '../utils/math';

export const CELESTIAL_DISC_RADIUS = 12;
export const CELESTIAL_EYE_SCALE = 0.92;
export const CELESTIAL_PUPIL_RADIUS = CELESTIAL_DISC_RADIUS / CELESTIAL_EYE_SCALE;

export const getCelestialBreath = (frame: number): number =>
  1 + Math.sin(frame * 0.026) * 0.008;

export const getCelestialEyePosition = (state: TimelineState): readonly [number, number] => {
  const moonY = lerp(-42, 138, state.moonProgress);
  return [
    lerp(moonY, 15, state.sunPositionProgress),
    lerp(-540, -760, state.sunPositionProgress),
  ];
};

export const getVisibleSunFraction = (state: TimelineState): number => {
  const morphWeight = smootherstep(clamp01((state.sunMorph - 0.18) / 0.68));
  const horizonVisibleFraction = lerp(0.78, 0.5, state.sunHorizonProgress);
  return lerp(1, horizonVisibleFraction, morphWeight) * (1 - clamp01(state.sunsetProgress));
};
