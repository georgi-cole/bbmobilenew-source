import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Capitalization from '../../../src/components/Capitalization/Capitalization';

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'ai-1', name: 'Atlas', isHuman: false, precomputedScore: 82, previousPR: null },
  { id: 'ai-2', name: 'Mira', isHuman: false, precomputedScore: 72, previousPR: null },
  { id: 'ai-3', name: 'Nova', isHuman: false, precomputedScore: 64, previousPR: null },
  { id: 'ai-4', name: 'Rio', isHuman: false, precomputedScore: 58, previousPR: null },
];

function mockCanvas() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 720,
    height: 520,
    top: 0,
    left: 0,
    right: 720,
    bottom: 520,
    toJSON: () => ({}),
  });
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
}

describe('Capitalization component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCanvas();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('plays through nine skipped questions and reports an authoritative winner', () => {
    const onFinish = vi.fn();
    render(<Capitalization seed={44} participants={participants} onFinish={onFinish} />);

    expect(screen.getByText('Globe spin')).toBeInTheDocument();

    for (let question = 1; question <= 9; question += 1) {
      act(() => {
        vi.advanceTimersByTime(2700);
      });

      expect(screen.getByLabelText('Capital city answer')).not.toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
      expect(screen.getByText(`Question ${question} complete`)).toBeInTheDocument();
      expect(screen.queryByLabelText('Live standings')).not.toBeInTheDocument();

      if (question === 3 || question === 6 || question === 9) {
        expect(
          screen.getByLabelText(question === 9 ? 'Final standings' : 'Round standings'),
        ).toBeInTheDocument();
      } else {
        expect(screen.getByLabelText('Answer result')).toBeInTheDocument();
        expect(screen.queryByLabelText('Round standings')).not.toBeInTheDocument();
      }

      fireEvent.click(
        screen.getByRole('button', {
          name: question === 9 ? 'Crown LOH' : 'Continue',
        }),
      );
    }

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][2]).toMatchObject({
      authoritativeWinnerId: expect.any(String),
      rawResults: expect.any(Object),
    });
  });

  it('only replays the globe reveal when the continent changes', () => {
    render(<Capitalization seed={44} participants={participants} onFinish={vi.fn()} />);

    expect(screen.getByText('Globe spin')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2700);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.queryByText('Globe spin')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Capital city answer')).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.queryByText('Globe spin')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Capital city answer')).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByLabelText('Round standings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Globe spin')).toBeInTheDocument();
  });

  it('keeps every Back 2 the Game contestant active through all nine questions', () => {
    const onFinish = vi.fn();
    const battleBackParticipants = participants.slice(0, 3);

    render(
      <Capitalization
        seed={44}
        participants={battleBackParticipants}
        onFinish={onFinish}
        context="battleBack"
      />,
    );

    expect(
      screen.getByText(/every return candidate plays all nine questions/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start Back 2 the Game' }));

    for (let question = 1; question <= 9; question += 1) {
      act(() => {
        vi.advanceTimersByTime(2700);
      });

      expect(screen.getByLabelText('Capital city answer')).not.toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

      if (question === 3 || question === 6) {
        expect(
          screen.getByText(/all contestants remain in play/i),
        ).toBeInTheDocument();
        expect(screen.getAllByText('In play', { exact: false })).toHaveLength(3);
        expect(screen.queryByText(/Out Q\d+/)).not.toBeInTheDocument();
        expect(screen.queryByText(/^Eliminated$/)).not.toBeInTheDocument();
      }

      if (question < 9) {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      }
    }

    expect(screen.queryByText('Crown LOH')).not.toBeInTheDocument();
    expect(screen.getByText(/won the right to return to the game/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\/9 correct/)).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][2]).toMatchObject({
      authoritativeWinnerId: expect.any(String),
      rawResults: expect.objectContaining({
        human: expect.any(Number),
        'ai-1': expect.any(Number),
        'ai-2': expect.any(Number),
      }),
    });
  });
});
