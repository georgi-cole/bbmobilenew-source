import { describe, expect, it } from 'vitest';
import { getVisibleSunFraction } from '../celestial/celestialGeometry';
import { CINEMATIC_CONFIG } from '../config/cinematicConfig';
import { getTimelineState } from './timeline';

const authoredToOutputFrame = (authoredFrame: number): number =>
  (authoredFrame / 1799) * (CINEMATIC_CONFIG.durationInFrames - 1);

describe('cinematic timeline handoffs', () => {
  it('morphs the iris as it travels, then keeps the original second leg to the horizon', () => {
    const visibleMorph = getTimelineState(authoredToOutputFrame(1495));
    const transformingSun = getTimelineState(authoredToOutputFrame(1512));

    expect(visibleMorph.apertureClosure).toBeGreaterThan(0);
    expect(visibleMorph.sunMorph).toBeGreaterThan(0);
    expect(visibleMorph.sunRevealProgress).toBeGreaterThan(0);
    expect(visibleMorph.sunIntensity).toBeGreaterThan(0);
    expect(transformingSun.sunMorph).toBeGreaterThan(0.45);
    expect(transformingSun.sunMorph).toBeLessThan(0.55);
    expect(transformingSun.sunRevealProgress).toBeGreaterThan(0);
    expect(transformingSun.sunIntensity).toBeGreaterThan(0);

    const endOfFirstLeg = getTimelineState(authoredToOutputFrame(1545));
    expect(endOfFirstLeg.sunPositionProgress).toBeGreaterThan(0.999);
    expect(endOfFirstLeg.sunMorph).toBeGreaterThan(0.999);
    expect(endOfFirstLeg.sunHorizonProgress).toBe(0);
    expect(endOfFirstLeg.oceanRevealProgress).toBe(1);

    const halfSetSun = getTimelineState(authoredToOutputFrame(1662));
    expect(halfSetSun.sunHorizonProgress).toBeGreaterThan(0.999);
    expect(halfSetSun.sunsetProgress).toBe(0);
    expect(halfSetSun.oceanRevealProgress).toBeGreaterThan(0.999);
    expect(halfSetSun.sunReflectionProgress).toBeGreaterThan(0.8);
  });

  it('forms the sea before the sun becomes visible and before it reaches the horizon', () => {
    const sunFirstAppears = getTimelineState(authoredToOutputFrame(1480));
    const horizonReady = getTimelineState(authoredToOutputFrame(1606));

    expect(sunFirstAppears.oceanRevealProgress).toBe(1);
    expect(sunFirstAppears.sunRevealProgress).toBe(0);
    expect(horizonReady.sunHorizonProgress).toBe(0);
    expect(horizonReady.oceanRevealProgress).toBe(1);
    expect(horizonReady.cityExitProgress).toBeGreaterThan(0.8);

    const sunsetBegins = getTimelineState(authoredToOutputFrame(1684));
    expect(sunsetBegins.sunHorizonProgress).toBeGreaterThan(0.999);
    expect(sunsetBegins.sunsetProgress).toBe(0);
  });

  it('keeps the reflection while the sun is visible, then fades it with the sun', () => {
    const halfSetSun = getTimelineState(authoredToOutputFrame(1728));
    const nearlySetSun = getTimelineState(authoredToOutputFrame(1770));
    const submergedSun = getTimelineState(authoredToOutputFrame(1786));

    expect(halfSetSun.sunsetProgress).toBeGreaterThan(0.35);
    expect(halfSetSun.sunReflectionProgress).toBeGreaterThan(0.9);
    expect(nearlySetSun.sunsetProgress).toBeGreaterThan(0.9);
    expect(nearlySetSun.sunReflectionProgress).toBeLessThan(0.2);
    expect(submergedSun.sunReflectionProgress).toBeLessThan(0.001);
  });

  it('keeps the visible sun cap monotonic through the horizon crossing and fully sets it', () => {
    let previousVisibleFraction = getVisibleSunFraction(
      getTimelineState(authoredToOutputFrame(1662)),
    );

    expect(previousVisibleFraction).toBeCloseTo(0.5);

    for (let authoredFrame = 1666; authoredFrame <= 1786; authoredFrame += 4) {
      const state = getTimelineState(authoredToOutputFrame(authoredFrame));
      const visibleFraction = getVisibleSunFraction(state);

      expect(visibleFraction).toBeLessThanOrEqual(previousVisibleFraction + 0.000001);
      previousVisibleFraction = visibleFraction;
    }

    expect(previousVisibleFraction).toBe(0);
  });

  it('never leaves a gap between the city and the opaque coast', () => {
    for (let authoredFrame = 1540; authoredFrame <= 1600; authoredFrame += 2) {
      const state = getTimelineState(authoredToOutputFrame(authoredFrame));
      const cityStillCoversFrame = state.cityExitProgress < 0.995;
      const coastCoversFrame = state.coastProgress > 0.12;

      expect(cityStillCoversFrame || coastCoversFrame).toBe(true);
    }
  });

  it('holds a multi-second graded sunset before final darkness', () => {
    const sunsetStart = getTimelineState(authoredToOutputFrame(1672));
    const sunsetMiddle = getTimelineState(authoredToOutputFrame(1730));
    const sunsetEnd = getTimelineState(authoredToOutputFrame(1786));

    expect(sunsetStart.sunsetProgress).toBe(0);
    expect(sunsetMiddle.sunsetProgress).toBeGreaterThan(0.35);
    expect(sunsetMiddle.sunsetProgress).toBeLessThan(0.7);
    expect(sunsetMiddle.fadeToDark).toBe(0);
    expect(sunsetEnd.sunsetProgress).toBe(1);
    expect(sunsetEnd.fadeToDark).toBeGreaterThan(0.6);
  });
});
