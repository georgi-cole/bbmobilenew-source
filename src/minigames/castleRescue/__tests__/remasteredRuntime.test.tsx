import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import CastleRescueGame from '../CastleRescueGame'
import {
  RemasteredBennyLennyCastleRescueGame,
  RemasteredCastleRescueGame,
} from '../RemasteredCastleRescueGames'

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(), stop: vi.fn() },
}))

beforeAll(() => {
  const gradient = { addColorStop: vi.fn() }
  const context = new Proxy(
    { createLinearGradient: () => gradient, createRadialGradient: () => gradient },
    { get: (target, key) => Reflect.get(target, key) ?? vi.fn() }
  ) as unknown as CanvasRenderingContext2D
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
})

describe('Find Your Twin production editions', () => {
  it.each(['classic', 'benny-lenny'] as const)(
    'keeps the movement finger held when the jump finger releases in %s',
    (variant) => {
      render(<CastleRescueGame autoStart={false} variant={variant} />)
      const originalAdd = Set.prototype.add
      let heldKeys: Set<string> | undefined
      const spy = vi.spyOn(Set.prototype, 'add').mockImplementation(function (
        this: Set<string>,
        key: string
      ) {
        const result = originalAdd.call(this, key)
        if (key === 'ArrowRight') heldKeys = result
        return result
      })
      const pointer = (button: HTMLElement, type: string, pointerId: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.assign(event, { pointerId, pointerType: 'touch', button: 0 })
        fireEvent(button, event)
      }
      try {
        const right = screen.getByRole('button', { name: 'Move right' })
        const jump = screen.getByRole('button', { name: 'Jump' })
        pointer(right, 'pointerdown', 1)
        pointer(jump, 'pointerdown', 2)
        expect(heldKeys?.has('Space')).toBe(true)
        pointer(jump, 'pointerup', 2)
        expect(heldKeys?.has('Space')).toBe(false)
        expect(heldKeys?.has('ArrowRight')).toBe(true)
        pointer(right, 'pointercancel', 1)
        expect(heldKeys?.has('ArrowRight')).toBe(false)
      } finally {
        spy.mockRestore()
      }
    }
  )

  it('marks the canonical game as the original edition', () => {
    const { container } = render(<CastleRescueGame autoStart={false} />)
    expect(container.querySelector('canvas')).toHaveAttribute('data-game-edition', 'original')
  })

  it.each([
    { width: 480, height: 680, canvasHeight: 270, buttonSize: 72, controls: 'Game controls' },
    { width: 320, height: 700, canvasHeight: 180, buttonSize: 60, controls: 'Game controls' },
    { width: 720, height: 400, canvasHeight: 400, buttonSize: 57, controls: 'Action controls' },
  ])('fits the original game and controls inside a $width × $height host', (layout) => {
    vi.stubGlobal('innerWidth', 1024)
    vi.stubGlobal('innerHeight', 768)
    vi.stubGlobal('visualViewport', undefined)
    const width = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(layout.width)
    const height = vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(layout.height)
    try {
      render(<CastleRescueGame autoStart={false} />)
      expect(screen.getByLabelText('Find Your Twin platformer game')).toHaveStyle({
        width: `${layout.width}px`,
        height: `${layout.canvasHeight}px`,
      })
      expect(screen.getByLabelText(layout.controls)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Jump' }).parentElement).toHaveStyle({
        width: `${layout.buttonSize}px`,
      })
    } finally {
      width.mockRestore()
      height.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it.each([
    ['part 1', RemasteredCastleRescueGame],
    ['lost again', RemasteredBennyLennyCastleRescueGame],
  ] as const)('mounts the explicit remastered renderer for %s', (_label, Component) => {
    const { container } = render(<Component autoStart={false} />)
    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      expect.stringContaining('/minigames/twin-remastered/')
    )
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('reports a trusted completion once and ignores messages from other windows', () => {
    const onFinish = vi.fn()
    const { container } = render(
      <RemasteredCastleRescueGame autoStart={false} onFinish={onFinish} />
    )
    const frame = container.querySelector('iframe')!
    const data = { type: 'twin:complete', score: 1234 }
    window.dispatchEvent(
      new MessageEvent('message', { data, origin: location.origin, source: window })
    )
    expect(onFinish).not.toHaveBeenCalled()
    for (let i = 0; i < 2; i++) {
      window.dispatchEvent(
        new MessageEvent('message', { data, origin: location.origin, source: frame.contentWindow })
      )
    }
    expect(onFinish).toHaveBeenCalledExactlyOnceWith(1234)
  })
})
