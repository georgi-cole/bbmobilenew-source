import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import catalog from '../../src/cinematic/ceremonies/cast.json'
import { createClip, sceneResources } from '../../src/cinematic/ceremonies/renderer.js'
import {
  animateDecisionScene,
  FINAL_EXIT_BRAND_RESOURCE,
  getDecisionTiming,
  makeDecisionScene,
} from '../../src/cinematic/ceremonies/approved/decision-exit.js'

const cast = Object.fromEntries(
  catalog.characters.slice(0, 3).map((actor, index) => [String.fromCharCode(97 + index), actor])
)
const branded = { nativeHandoff: true, closingBrand: true }
type Stop = [number, number, string?, string?]
type RecordedAnimation = {
  element: Element
  effect: { target: Element } | null
  frames: Array<{ offset: number; opacity: number; transform?: string }>
  options: { duration: number }
  playState: string
  currentTime: number
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
}

const descriptors = (
  [
    [Element.prototype, 'animate'],
    [HTMLImageElement.prototype, 'decode'],
    [document, 'timeline'],
  ] as const
).map(([owner, key]) => ({ owner, key, descriptor: Object.getOwnPropertyDescriptor(owner, key) }))
const clips: ReturnType<typeof createClip>[] = []
const animations: RecordedAnimation[] = []

function imagesFor(id: string, closingBrand = true) {
  return Object.fromEntries(
    Object.entries(sceneResources(id, cast, 'generic', { closingBrand })).map(([key, resource]) => {
      const image = document.createElement('img')
      image.src = (resource as { src: string }).src
      return [key, image]
    })
  )
}
function recordTimeline(id: string, closingBrand: boolean) {
  const root = makeDecisionScene(id, imagesFor(id, closingBrand), 0, {
    nativeHandoff: true,
    closingBrand,
  })
  const tracks = new Map<string | Element, Stop[]>()
  animateDecisionScene(
    id,
    root,
    (selector: string | Element, frames: Stop[]) => tracks.set(selector, frames),
    {
      nativeHandoff: true,
      closingBrand,
    }
  )
  return { root, tracks }
}
function opacityAt(animation: RecordedAnimation, ms: number) {
  const fraction = ms / animation.options.duration
  const after = animation.frames.findIndex((frame) => frame.offset >= fraction)
  if (after === 0) return animation.frames[0].opacity
  if (after === -1) return animation.frames.at(-1)!.opacity
  const previous = animation.frames[after - 1]
  const next = animation.frames[after]
  const progress = (fraction - previous.offset) / (next.offset - previous.offset)
  return previous.opacity + (next.opacity - previous.opacity) * progress
}
async function mountClip(scene: 'exit' | 'final3' = 'exit') {
  const clip = createClip()
  clips.push(clip)
  await clip.prepare(scene, cast, 'generic', { closingBrand: true })
  const handoff = vi.fn()
  const complete = vi.fn()
  clip.mount(document.body, handoff, complete)
  return { clip, handoff, complete }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  Object.defineProperty(document, 'timeline', { configurable: true, value: { currentTime: 0 } })
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn(async () => {}),
  })
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (
      this: Element,
      frames: RecordedAnimation['frames'],
      options: RecordedAnimation['options']
    ) {
      const animation: RecordedAnimation = {
        element: this,
        effect: { target: this },
        frames,
        options,
        playState: 'running',
        currentTime: 0,
        pause: vi.fn(() => {
          animation.playState = 'paused'
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
})
afterEach(() => {
  clips.splice(0).forEach((clip) => clip.stop())
  animations.length = 0
  descriptors.forEach(({ owner, key, descriptor }) => {
    if (descriptor) Object.defineProperty(owner, key, descriptor)
    else Reflect.deleteProperty(owner, key)
  })
  vi.useRealTimers()
})

describe('final-day exit closing brand', () => {
  it('prepares the modular Eye for every opted-in departure, including paired exits', () => {
    const asset = readFileSync(path.resolve('public', FINAL_EXIT_BRAND_RESOURCE.src))
    expect(asset.byteLength).toBe(FINAL_EXIT_BRAND_RESOURCE.bytes)
    expect(asset.subarray(8, 16).toString()).toBe('WEBPVP8X')
    expect(asset.readUIntLE(24, 3) + 1).toBe(FINAL_EXIT_BRAND_RESOURCE.width)
    expect(asset.readUIntLE(27, 3) + 1).toBe(FINAL_EXIT_BRAND_RESOURCE.height)
    for (const id of ['exit', 'final3', 'final4', 'tiebreak', 'cupidExit']) {
      expect(sceneResources(id, cast).cinema_closingEye).toBeUndefined()
      expect(sceneResources(id, cast, 'generic', { closingBrand: true }).cinema_closingEye).toEqual(
        FINAL_EXIT_BRAND_RESOURCE
      )
    }
    for (const id of ['safety']) {
      expect(
        sceneResources(id, cast, 'generic', { closingBrand: true }).cinema_closingEye
      ).toBeUndefined()
    }
  })

  it('places the decorative Eye and title over the transition, outside the doorway camera', () => {
    const root = makeDecisionScene('exit', imagesFor('exit'), 0, branded)
    const brand = root.querySelector('.exit-brand')!
    expect(brand.parentElement).toBe(root)
    expect(brand.previousElementSibling).toHaveClass('handoff-veil')
    expect(root.querySelector('.exit-camera .exit-brand')).toBeNull()
    expect(brand.querySelector('.exit-brand-title')).toHaveTextContent('THE BIG EYE')
    expect(brand.querySelectorAll('[data-resource="cinema_closingEye"]')).toHaveLength(3)
    expect(root).toHaveAttribute('aria-hidden', 'true')
    const ordinary = makeDecisionScene('exit', imagesFor('exit', false), 0, { nativeHandoff: true })
    expect(ordinary.querySelector('.exit-brand')).toBeNull()
  })

  it.each(['exit', 'final3', 'final4', 'tiebreak'])(
    'preserves the entire %s doorway sequence before adding the closing hold',
    (id) => {
      const original = recordTimeline(id, false)
      const closing = recordTimeline(id, true)
      for (const selector of [
        '.exit-shot',
        '.exit-camera',
        '.gate-left',
        '.gate-right',
        '.departure-near',
        '.departure-far',
        '.departure-near .cine-rear',
        '.departure-far .cine-rear',
      ]) {
        // The final frame is only the duration hold; every motion keyframe stays intact.
        expect(closing.tracks.get(selector)!.slice(0, -1)).toEqual(
          original.tracks.get(selector)!.slice(0, -1)
        )
      }
      const timing = getDecisionTiming(id, branded)
      const originalTiming = getDecisionTiming(id)
      expect(timing.zoomAt).toBe(originalTiming.zoomAt)
      expect(timing.handoffAt - originalTiming.handoffAt).toBe(3400)
      expect(closing.tracks.get('.exit-brand')!.find((frame) => frame[1] > 0)![0]).toBeGreaterThan(
        originalTiming.handoffAt
      )
      const frontFaceAt = closing.tracks
        .get('.exit-brand-turn')!
        .find((frame) => frame[2] === 'rotateY(360deg) rotateZ(0deg)')![0]
      const flyAt = closing.tracks
        .get('.exit-brand-emblem')!
        .find((frame) => frame[2] === 'scale(1)' && frame[3])![0]
      const fullLensAt = closing.tracks
        .get('.exit-brand-emblem')!
        .find((frame) => frame[2] === 'scale(9.4)')![0]
      const blackAt = closing.tracks
        .get('.exit-brand-blackout')!
        .find((frame) => frame[1] === 1)![0]
      expect(flyAt).toBeGreaterThan(frontFaceAt)
      expect(fullLensAt).toBeLessThan(timing.handoffAt - 250)
      expect(blackAt).toBe(fullLensAt)
      expect(
        closing.tracks.get('.exit-brand-title')!.some((frame) => frame[1] === 0 && frame[0] > flyAt)
      ).toBe(true)
      expect(closing.tracks.get('.exit-brand')!.at(-1)![1]).toBe(1)
    }
  )

  it.each(['exit', 'final3'] as const)(
    'finishes the %s Eye rush and reaches solid black before the single native handoff',
    async (scene) => {
      const { clip, handoff, complete } = await mountClip(scene)
      const endAt = getDecisionTiming(scene, branded).handoffAt
      vi.advanceTimersByTime(getDecisionTiming(scene).handoffAt)
      expect(handoff).not.toHaveBeenCalled()
      vi.advanceTimersByTime(endAt - getDecisionTiming(scene).handoffAt - 1)
      expect(handoff).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(handoff).toHaveBeenCalledTimes(1)
      expect(complete).not.toHaveBeenCalled()
      const brand = animations.find((animation) => animation.element.matches('.exit-brand'))!
      const title = animations.find((animation) => animation.element.matches('.exit-brand-title'))!
      const blackout = animations.find((animation) =>
        animation.element.matches('.exit-brand-blackout')
      )!
      const rush = animations.find((animation) => animation.element.matches('.exit-brand-emblem'))!
      for (const track of [brand, title, blackout, rush]) {
        expect(track.currentTime).toBe(endAt)
        expect(track.playState).toBe('paused')
      }
      expect(opacityAt(brand, endAt)).toBe(1)
      expect(opacityAt(title, endAt)).toBe(0)
      expect(opacityAt(blackout, endAt)).toBe(1)
      expect(rush.frames.at(-1)!.transform).toBe('scale(9.4)')
      expect(blackout.frames.find((frame) => frame.opacity === 1)!.offset).toBeLessThan(
        (endAt - 250) / blackout.options.duration
      )
      expect(
        opacityAt(
          animations.find((animation) => animation.element.matches('.handoff-veil'))!,
          endAt
        )
      ).toBe(0.96)
      expect(
        opacityAt(
          animations.find((animation) => animation.element.matches('.cine-sequence'))!,
          endAt
        )
      ).toBe(0)
      const turn = animations.find((animation) => animation.element.matches('.exit-brand-turn'))!
      expect(turn.frames.at(-1)!.transform).toBe('rotateY(360deg) rotateZ(0deg)')
      const images = [...clip.root.querySelectorAll('img')]
      clip.nativeReady(true)
      vi.advanceTimersByTime(149)
      expect(clip.counts.mounted).toBe(true)
      vi.advanceTimersByTime(1)
      expect(clip.counts).toEqual({ animations: 0, timers: 0, mounted: false, retainedImages: 0 })
      expect(images.every((image) => !image.hasAttribute('src'))).toBe(true)
      expect(animations.every((animation) => animation.effect === null)).toBe(true)
      expect(handoff).toHaveBeenCalledTimes(1)
    }
  )

  it('pauses every brand layer and its handoff clock together while backgrounded', async () => {
    const { clip, handoff } = await mountClip()
    const endAt = getDecisionTiming('exit', branded).handoffAt
    vi.advanceTimersByTime(5400)
    clip.pause()
    expect(animations.every((animation) => animation.playState === 'paused')).toBe(true)
    vi.advanceTimersByTime(10000)
    expect(handoff).not.toHaveBeenCalled()
    clip.resume()
    expect(animations.every((animation) => animation.playState === 'running')).toBe(true)
    vi.advanceTimersByTime(endAt - 5400)
    expect(handoff).toHaveBeenCalledTimes(1)
  })

  it('cancels brand media and the pending handoff when Skip disposes the film', async () => {
    const { clip, handoff, complete } = await mountClip()
    vi.advanceTimersByTime(5500)
    clip.stop()
    vi.advanceTimersByTime(20000)
    expect(handoff).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    expect(clip.counts).toEqual({ animations: 0, timers: 0, mounted: false, retainedImages: 0 })
    expect(animations.every((animation) => animation.effect === null)).toBe(true)
  })
})
