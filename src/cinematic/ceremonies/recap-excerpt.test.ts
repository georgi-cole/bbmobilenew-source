import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import catalog from './cast.json'
import { createClip } from './renderer.js'

const audio = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn(), pause: vi.fn(), resume: vi.fn() }))
vi.mock('./ceremony-audio', () => ({
  createCeremonyAudio: () => audio,
  ceremonyCuePlan: () => [{ at: 100, cue: 'reveal' }],
}))
const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
const timelineDescriptor = Object.getOwnPropertyDescriptor(document, 'timeline')
let tracks: Animation[]
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  tracks = []
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img')
    image.decode = async () => {}
    return image
  })
  Object.defineProperty(document, 'timeline', { configurable: true, value: { currentTime: 0 } })
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => {
      const animation = {
        currentTime: 0,
        startTime: 0,
        playbackRate: 1,
        playState: 'running',
        effect: {},
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
      } as unknown as Animation
      tracks.push(animation)
      return animation
    },
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor)
  else Reflect.deleteProperty(Element.prototype, 'animate')
  if (timelineDescriptor) Object.defineProperty(document, 'timeline', timelineDescriptor)
  else Reflect.deleteProperty(document, 'timeline')
})

describe('ceremony renderer excerpts', () => {
  it.each(['loh', 'safety'])(
    'starts on the completed %s look without full ceremony audio or handoffs',
    async (scene) => {
      const actor = catalog.characters.find((entry) => entry.id === 'lia')!
      const clip = createClip()
      await clip.prepare(scene, { a: actor, b: actor, c: actor })
      const parent = document.createElement('div')
      const handoff = vi.fn(),
        done = vi.fn()
      const fromMs = scene === 'loh' ? 2100 : 2350
      const toMs = scene === 'loh' ? 2600 : 3100
      clip.mount(parent, handoff, done, 'generic', { excerpt: { fromMs, toMs, durationMs: 3000 } })
      expect(
        clip.root?.querySelector(scene === 'loh' ? '.loh-royal .loh-crown' : '.safety-knight')
      ).not.toBeNull()
      expect(tracks.length).toBeGreaterThan(5)
      expect(tracks.every((track) => track.currentTime === fromMs)).toBe(true)
      expect(tracks.every((track) => track.playbackRate === (toMs - fromMs) / 3000)).toBe(true)
      vi.advanceTimersByTime(3000)
      expect(tracks.every((track) => track.currentTime === toMs)).toBe(true)
      expect(done).toHaveBeenCalledOnce()
      expect(handoff).not.toHaveBeenCalled()
      expect(audio.play).not.toHaveBeenCalled()
      clip.stop()
      expect(clip.counts).toMatchObject({ animations: 0, timers: 0, mounted: false })
      expect(parent.childElementCount).toBe(0)
    }
  )

  it.each([1, 2, 3])(
    'keeps all %i recorded nominee names on the shortened block',
    async (count) => {
      const [a, b, c] = catalog.characters.slice(0, count)
      const clip = createClip()
      await clip.prepare('nominations', { a, b: b ?? a, c: c ?? a }, 'generic', {
        nomineeCount: count,
      })
      clip.mount(document.createElement('div'), vi.fn(), vi.fn(), 'generic', {
        excerpt: { fromMs: 3500, toMs: 3750, durationMs: 3000 },
      })
      expect(
        [...clip.root!.querySelectorAll('.nom-label')].map((label) => label.textContent)
      ).toEqual(catalog.characters.slice(0, count).map((actor) => actor.name))
      vi.advanceTimersByTime(3000)
      expect(audio.play).not.toHaveBeenCalled()
      clip.stop()
    }
  )

  it('preserves full ceremony timing and sound without excerpt options', async () => {
    const actor = catalog.characters.find((entry) => entry.id === 'lia')!
    const clip = createClip()
    await clip.prepare('loh', { a: actor, b: actor, c: actor })
    const done = vi.fn()
    clip.mount(document.createElement('div'), vi.fn(), done)
    expect(tracks.every((track) => track.playbackRate === 1)).toBe(true)
    vi.advanceTimersByTime(1800)
    expect(audio.play).toHaveBeenCalledWith('reveal')
    expect(done).not.toHaveBeenCalled()
    clip.stop()
  })
})
