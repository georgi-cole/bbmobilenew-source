import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultCrackerCanvasEngine } from '../../../src/minigames/vaultCracker/engine/vaultCrackerCanvasEngine';
import { createVaultCrackerLayout } from '../../../src/minigames/vaultCracker/engine/layout';

describe('createVaultCrackerLayout', () => {
  it.each([
    [390, 320],
    [360, 280],
    [844, 420],
  ])('keeps the combination controls and submit button inside a %i×%i stage', (width, height) => {
    const layout = createVaultCrackerLayout(width, height, 1);

    expect(layout.headerRect.y + layout.headerRect.height).toBeLessThan(layout.vaultCenterY - layout.vaultRadius);
    expect(layout.digitRackRect.y + layout.digitRackRect.height).toBeLessThanOrEqual(height);
    expect(layout.submitRect.y + layout.submitRect.height).toBeLessThanOrEqual(height);
    expect(layout.dialSlots).toHaveLength(4);
    expect(layout.dialSlots.every((slot) => slot.y + slot.height <= layout.digitRackRect.y + layout.digitRackRect.height)).toBe(true);
  });

  it('lays out the dial controls, submit action, and vault side by side in landscape', () => {
    const width = 540
    const height = 132
    const layout = createVaultCrackerLayout(width, height, 1)

    expect(layout.dialSlots).toHaveLength(4)
    expect(layout.dialSlots.every((slot) => slot.x >= 0 && slot.x + slot.width <= width)).toBe(true)
    expect(layout.dialSlots.every((slot) => slot.y >= 0 && slot.y + slot.height <= height)).toBe(true)
    expect(layout.digitRackRect.x + layout.digitRackRect.width).toBeLessThanOrEqual(width)
    expect(layout.submitRect.x).toBeGreaterThan(layout.digitRackRect.x + layout.digitRackRect.width)
    expect(layout.submitRect.x + layout.submitRect.width).toBeLessThanOrEqual(width)
    expect(layout.submitRect.y + layout.submitRect.height).toBeLessThanOrEqual(height)
  });
});

function makeGradientStub() {
  return {
    addColorStop: vi.fn(),
  };
}

function makeContextStub() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(() => makeGradientStub()),
    createRadialGradient: vi.fn(() => makeGradientStub()),
    set fillStyle(_value: string | CanvasGradient) {},
    set strokeStyle(_value: string | CanvasGradient) {},
    set lineWidth(_value: number) {},
    set globalAlpha(_value: number) {},
    set lineCap(_value: CanvasLineCap) {},
    set textAlign(_value: CanvasTextAlign) {},
    set textBaseline(_value: CanvasTextBaseline) {},
    set font(_value: string) {},
  };
}

describe('VaultCrackerCanvasEngine', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeContextStub() as never);
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 16) as unknown as number;
    });
    window.cancelAnimationFrame = vi.fn((handle: number) => {
      window.clearTimeout(handle);
    });
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts, pauses, resumes, resizes, and destroys without leaking the RAF loop', async () => {
    const canvas = document.createElement('canvas');
    const engine = new VaultCrackerCanvasEngine(canvas, { seed: 42 });

    engine.resize(240, 480, 2);
    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(960);

    engine.start();
    expect(window.requestAnimationFrame).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(32);
    const snapshotWhileRunning = engine.getSnapshot();
    expect(snapshotWhileRunning.phase).toBe('active');

    engine.pause();
    expect(engine.getSnapshot().phase).toBe('paused');

    const requestCallsBeforeResume = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    engine.resume();
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(requestCallsBeforeResume);

    engine.destroy();
    const requestCallsBeforeDestroyAdvance = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(64);
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(requestCallsBeforeDestroyAdvance);
  });

  it('keeps layout sizing in CSS while only updating the backing resolution on resize', () => {
    const context = makeContextStub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const canvas = document.createElement('canvas');
    const engine = new VaultCrackerCanvasEngine(canvas, { seed: 42 });

    engine.resize(240, 480, 2);

    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(960);
    expect(canvas.style.width).toBe('');
    expect(canvas.style.height).toBe('');
    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
  });

  it('rejects a combination containing repeated digits without consuming an attempt', () => {
    const canvas = document.createElement('canvas');
    const engine = new VaultCrackerCanvasEngine(canvas, { seed: 42 });
    const internals = engine as unknown as {
      state: { digits: number[] };
      submitGuess: () => void;
    };

    internals.state.digits = [3, 8, 3, 9];
    internals.submitGuess();

    const snapshot = engine.getSnapshot();
    expect(snapshot.attempts).toBe(0);
    expect(snapshot.guessHistory).toHaveLength(0);
    expect(snapshot.validationMessage).toMatch(/different digits/i);
  });

  it('does not reschedule the RAF loop after an onProgress callback pauses the engine', async () => {
    const canvas = document.createElement('canvas');
    let engine: VaultCrackerCanvasEngine | null = null;
    let pauseTriggered = false;
    engine = new VaultCrackerCanvasEngine(canvas, {
      seed: 42,
      onProgress: ({ elapsedMs }) => {
        if (!pauseTriggered && elapsedMs >= 1_000) {
          pauseTriggered = true;
          engine?.pause();
        }
      },
    });

    engine.start();
    const requestCallsBeforeTick = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    const engineInternals = engine as unknown as {
      lastTimestamp: number;
      state: {
        timerStarted: boolean;
      };
      tick: (timestamp: number) => void;
    };
    engineInternals.state.timerStarted = true;
    engineInternals.lastTimestamp = 1;
    engineInternals.tick(1_201);
    const requestCallsAfterTick = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(250);

    expect(pauseTriggered).toBe(true);
    expect(engine.getSnapshot().phase).toBe('paused');
    expect(requestCallsAfterTick).toBe(requestCallsBeforeTick);
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(requestCallsAfterTick);
  });
});
