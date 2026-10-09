import { describe, expect, it } from 'vitest';
import { shouldRenderGameControlDock, shouldShowGameControlDock } from '../gameScreenUiGuards';

describe('shouldShowGameControlDock', () => {
  it('shows the dock on the main game screen when no blockers are active', () => {
    expect(shouldShowGameControlDock(true, [false, false, false])).toBe(true);
  });

  it('keeps the dock mounted on the main game screen even while flows are blocking', () => {
    expect(shouldShowGameControlDock(true, [false, true, false])).toBe(true);
  });

  it('hides the dock before gameplay starts', () => {
    expect(shouldShowGameControlDock(false, [false, false])).toBe(false);
  });

  it('keeps the dock visible for terminal survivor runs so the end modal can mount', () => {
    expect(shouldShowGameControlDock(false, [false, false], true)).toBe(true);
  });
});

describe('shouldRenderGameControlDock', () => {
  it('hides the game dock while the season finale chat owns the screen controls', () => {
    expect(shouldRenderGameControlDock(true, true)).toBe(false);
  });

  it('keeps the dock visible outside the season finale when it is available', () => {
    expect(shouldRenderGameControlDock(true, false)).toBe(true);
  });
});
