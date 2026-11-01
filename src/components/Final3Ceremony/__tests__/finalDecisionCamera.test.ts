import { fireEvent, within } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountFinalDecision, type FinalDecisionController } from '../finalDecisionScene.mjs'

type RecordedAnimation = {
  element: Element
  options: KeyframeAnimationOptions
  currentTime: number
  playState: string
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
}

const animations: RecordedAnimation[] = []
const mounted: Array<{ root: HTMLElement; controller: FinalDecisionController }> = []
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
const originalGetAnimations = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations')

function mount(reducedMotion = false) {
  const root = document.createElement('div')
  root.id = 'final-decision-scene'
  document.body.appendChild(root)
  const controller = mountFinalDecision(root, {
    sceneId: 'camera-continuity',
    preview: false,
    reducedMotion,
    fixture: {
      holder: { id: 'human', name: 'You' },
      nominees: [
        { id: 'aria', name: 'Aria', assetKey: 'aria', plea: 'Give me one last chance.' },
        { id: 'dex', name: 'Dex', assetKey: 'dex', plea: 'Let my story continue.' },
      ],
    },
    assets: {},
    monitor: {
      aspectRatio: 1923 / 818,
      screen: { x: 0.071, y: 0.165, width: 0.858, height: 0.642 },
    },
    onDecision: vi.fn(),
    onComplete: vi.fn(),
    onCheckpoint: vi.fn(),
  })
  mounted.push({ root, controller })
  return { root, controller, view: within(root) }
}

function cameraAnimations() {
  return animations.filter((animation) =>
    animation.element.matches('.fd-camera-drift, .fd-background, .fd-foreground-depth')
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (this: Element, _frames: Keyframe[], options: KeyframeAnimationOptions) {
      const animation: RecordedAnimation = {
        element: this,
        options,
        currentTime: 0,
        playState: 'running',
        pause: vi.fn(() => {
          animation.playState = 'paused'
          // A browser may settle pause on its next frame. The scene must pin
          // the captured time instead of advancing that final pending tick.
          animation.currentTime += 16
        }),
        play: vi.fn(() => {
          animation.playState = 'running'
        }),
        cancel: vi.fn(() => {
          animation.playState = 'idle'
        }),
      }
      animations.push(animation)
      return animation
    },
  })
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: function (this: Element) {
      return animations.filter(
        (animation) => this.contains(animation.element) && animation.playState !== 'idle'
      )
    },
  })
})

afterEach(() => {
  mounted.splice(0).forEach(({ root, controller }) => {
    controller.dispose()
    root.remove()
  })
  animations.length = 0
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate)
  else Reflect.deleteProperty(Element.prototype, 'animate')
  if (originalGetAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', originalGetAnimations)
  else Reflect.deleteProperty(Element.prototype, 'getAnimations')
  vi.useRealTimers()
})

describe('continuous final decision camera', () => {
  it('keeps the same camera travel through speeches, choice and the solo reveal', () => {
    const { root, controller, view } = mount()
    const travel = cameraAnimations()
    expect(travel).toHaveLength(3)
    expect(travel.every((animation) => animation.options.iterations === Infinity)).toBe(true)
    travel.forEach((animation) => {
      animation.currentTime = 5300
    })

    vi.advanceTimersByTime(3400)
    expect(controller.getState().stage).toBe('plea-a')
    fireEvent.click(view.getByRole('button', { name: 'Hear Dex' }))
    controller.skip()
    fireEvent.click(view.getByRole('button', { name: 'Choose to eliminate Dex' }))
    fireEvent.click(view.getByRole('button', { name: 'Confirm: eliminate Dex and keep Aria' }))
    vi.advanceTimersByTime(2800)
    expect(controller.getState().stage).toBe('announcement')

    expect(cameraAnimations()).toEqual(travel)
    expect(travel.every((animation) => animation.currentTime === 5300)).toBe(true)
    expect(travel.every((animation) => animation.cancel.mock.calls.length === 0)).toBe(true)
    expect(
      root.querySelector('.fd-camera-drift')?.contains(root.querySelector('.fd-monitor'))
    ).toBe(false)
  })

  it('freezes the shared travel exactly, resumes its phase and cancels it on disposal', () => {
    const { controller } = mount()
    const travel = cameraAnimations()
    travel.forEach((animation) => {
      animation.currentTime = 8123
    })
    controller.pause('presentation')
    controller.pause('visibility')
    controller.resume('presentation')
    expect(travel.every((animation) => animation.playState === 'paused')).toBe(true)
    expect(travel.every((animation) => animation.currentTime === 8123)).toBe(true)
    controller.resume('visibility')
    expect(travel.every((animation) => animation.playState === 'running')).toBe(true)
    expect(travel.every((animation) => animation.currentTime === 8123)).toBe(true)
    controller.dispose()
    expect(travel.every((animation) => animation.playState === 'idle')).toBe(true)
  })

  it('creates no camera travel when reduced motion is requested', () => {
    const { controller } = mount(true)
    vi.advanceTimersByTime(500)
    controller.skip()
    expect(cameraAnimations()).toHaveLength(0)
  })
})
