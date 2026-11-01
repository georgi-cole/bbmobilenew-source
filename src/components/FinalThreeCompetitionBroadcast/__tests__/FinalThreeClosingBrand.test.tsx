import { StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FinalThreeClosingBrand from '../FinalThreeClosingBrand'
import { animateFinaleClosingBrand } from '../../../cinematic/ceremonies/approved/finale-closing-brand.js'

type RecordedAnimation = {
  element: Element
  frames: Keyframe[]
  options: KeyframeAnimationOptions
  playState: string
  currentTime: number
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
}
const recorded: RecordedAnimation[] = []
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden')
const eye = '/assets/ceremonies/final-decision/token.webp'

beforeEach(() => {
  recorded.length = 0
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      const animation: RecordedAnimation = {
        element: this,
        frames,
        options,
        playState: 'running',
        currentTime: 0,
        play: vi.fn(() => {
          animation.playState = 'running'
        }),
        pause: vi.fn(() => {
          animation.playState = 'paused'
        }),
        cancel: vi.fn(() => {
          animation.playState = 'idle'
        }),
      }
      recorded.push(animation)
      return animation
    },
  })
})

afterEach(() => {
  cleanup()
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor)
  else Reflect.deleteProperty(Element.prototype, 'animate')
  if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor)
  else Reflect.deleteProperty(document, 'hidden')
})

describe('shared Final Three closing ident', () => {
  it('starts at handoff, turns the Eye face-on, then flies toward the lens and fades to black', () => {
    const { container, rerender } = render(
      <FinalThreeClosingBrand eyeSrc={eye} active={false} paused={false} />
    )
    expect(container.querySelector('.exit-brand')).toBeNull()
    expect(recorded).toHaveLength(0)
    rerender(<FinalThreeClosingBrand eyeSrc={eye} active paused={false} />)
    expect(container.querySelector('.exit-brand-title')).toHaveTextContent('THE BIG EYE')
    expect(container.querySelectorAll('img')).toHaveLength(3)
    expect(
      [...container.querySelectorAll('img')].every((image) => image.getAttribute('src') === eye)
    ).toBe(true)
    const brand = recorded.find((animation) => animation.element.matches('.exit-brand'))!
    const title = recorded.find((animation) => animation.element.matches('.exit-brand-title'))!
    const turn = recorded.find((animation) => animation.element.matches('.exit-brand-turn'))!
    const fly = recorded.find((animation) => animation.element.matches('.exit-brand-emblem'))!
    const blackout = recorded.find((animation) => animation.element.matches('.exit-brand-blackout'))!
    expect(brand.options.duration).toBe(3000)
    expect(brand.frames.at(-1)).toMatchObject({ offset: 1, opacity: 1 })
    expect(title.frames.at(-1)).toMatchObject({ offset: 1, opacity: 0 })
    expect(turn.frames.at(-1)?.transform).toBe('rotateY(360deg) rotateZ(0deg)')
    expect(fly.frames.at(-1)).toMatchObject({ offset: 1, transform: 'scale(9.4)' })
    expect(blackout.frames.at(-1)).toMatchObject({ offset: 1, opacity: 1 })
  })

  it('does not change the approved Final Three exit ident unless flight is requested', () => {
    const animations = new Map<string, unknown>()
    animateFinaleClosingBrand((selector, frames) => animations.set(selector, frames))
    expect(animations.has('.exit-brand-emblem')).toBe(false)
    expect(animations.has('.exit-brand-blackout')).toBe(false)
    expect(animations.has('.exit-brand-title')).toBe(true)
  })

  it('retains the current turn while suspended instead of replaying it on resume', () => {
    const { rerender } = render(<FinalThreeClosingBrand eyeSrc={eye} active paused={false} />)
    const count = recorded.length
    recorded.forEach((animation) => {
      animation.currentTime = 1350
    })
    rerender(<FinalThreeClosingBrand eyeSrc={eye} active paused />)
    expect(recorded.every((animation) => animation.playState === 'paused')).toBe(true)
    rerender(<FinalThreeClosingBrand eyeSrc={eye} active paused={false} />)
    expect(recorded).toHaveLength(count)
    expect(
      recorded.every(
        (animation) => animation.currentTime === 1350 && animation.playState === 'running'
      )
    ).toBe(true)
    recorded.forEach((animation) => {
      animation.currentTime = 3000
      animation.playState = 'finished'
    })
    rerender(<FinalThreeClosingBrand eyeSrc={eye} active paused />)
    rerender(<FinalThreeClosingBrand eyeSrc={eye} active paused={false} />)
    expect(recorded.every((animation) => animation.playState === 'finished')).toBe(true)
  })

  it('honors page visibility even if the parent has not rendered its suspension yet', () => {
    render(<FinalThreeClosingBrand eyeSrc={eye} active paused={false} />)
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(recorded.every((animation) => animation.playState === 'paused')).toBe(true)
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(recorded.every((animation) => animation.playState === 'running')).toBe(true)
  })

  it('cleans discarded Strict Mode playback and releases images and animations on unmount', () => {
    const { container, unmount } = render(
      <StrictMode>
        <FinalThreeClosingBrand eyeSrc={eye} active paused />
      </StrictMode>
    )
    expect(recorded.some((animation) => animation.playState === 'idle')).toBe(true)
    expect(
      recorded
        .filter((animation) => animation.playState !== 'idle')
        .every((animation) => animation.playState === 'paused')
    ).toBe(true)
    const images = [...container.querySelectorAll('img')]
    unmount()
    expect(recorded.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true)
    expect(images.every((image) => !image.hasAttribute('src'))).toBe(true)
  })

  it('keeps a readable static ident when Web Animations is unavailable', () => {
    Reflect.deleteProperty(Element.prototype, 'animate')
    const { container } = render(<FinalThreeClosingBrand eyeSrc={eye} active paused={false} />)
    expect(container.querySelector('.exit-brand')).toHaveStyle({ opacity: '1' })
    expect(container.querySelector('.exit-brand-title')).toHaveStyle({ opacity: '1' })
    expect(container.querySelector('.exit-brand-turn')).toHaveStyle({
      transform: 'rotateY(360deg) rotateZ(0deg)',
    })
    expect(container.querySelector('.exit-brand-blackout')).not.toHaveStyle({ opacity: '1' })
  })
})
