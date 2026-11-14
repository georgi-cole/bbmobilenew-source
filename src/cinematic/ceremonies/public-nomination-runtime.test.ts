import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClip } from './renderer.js'
import catalog from './cast.json'
import { publicNominationPlan } from './public-nomination-film.js'

vi.mock('./ceremony-audio', () => ({
  createCeremonyAudio: () => ({ play: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn() }),
  ceremonyCuePlan: () => [],
}))

const cast = Object.fromEntries(
  ['ali', 'ash', 'jax', 'dex'].map((id, index) => [
    ['a', 'b', 'c', 'd'][index],
    { ...catalog.characters.find((actor) => actor.id === id)!, playerId: id },
  ])
)
const game = {
  publicModeEnabled: true,
  nomineeIds: ['ali', 'jax', 'ash'],
  nominationContext: { autoNomineeId: 'ash', hohNomineeIds: ['ali', 'jax'] },
}
const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode')
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
const originalTimeline = Object.getOwnPropertyDescriptor(document, 'timeline')
let animations: {
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  effect: unknown
}[]

beforeEach(() => {
  vi.useFakeTimers()
  animations = []
  Object.defineProperty(document, 'timeline', { configurable: true, value: { currentTime: 0 } })
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn(async () => {}),
  })
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: vi.fn(() => {
      const animation = {
        playState: 'running',
        startTime: 0,
        effect: {},
        pause: vi.fn(),
        play: vi.fn(),
        cancel: vi.fn(),
      }
      animations.push(animation)
      return animation
    }),
  })
})
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
  if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
  else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate)
  else Reflect.deleteProperty(Element.prototype, 'animate')
  if (originalTimeline) Object.defineProperty(document, 'timeline', originalTimeline)
  else Reflect.deleteProperty(document, 'timeline')
})

describe('public nomination renderer integration', () => {
  it.each([true, false])(
    'selects the approved sequence only with committed automatic-nominee provenance (%s)',
    async (enabled) => {
      const clip = createClip()
      try {
        await clip.prepare('nominations', cast, 'generic', {
          nomineeCount: 3,
          publicNomination: enabled ? publicNominationPlan('nominations', game, cast) : null,
        })
        clip.mount(document.body, vi.fn(), vi.fn())
        expect(clip.root?.classList.contains('nom-public')).toBe(enabled)
        expect(clip.durationMs).toBe(enabled ? 9600 : 7600)
        if (enabled) {
          expect(clip.root?.querySelector<HTMLElement>('.public-auto')?.dataset.playerId).toBe(
            'ash'
          )
          expect(
            [...clip.root!.querySelectorAll<HTMLElement>('.public-choice')].map(
              (node) => node.dataset.playerId
            )
          ).toEqual(['ali', 'jax'])
        }
        clip.pause()
        expect(animations.every((animation) => animation.pause.mock.calls.length > 0)).toBe(true)
        clip.resume()
        expect(animations.every((animation) => animation.play.mock.calls.length > 0)).toBe(true)
        clip.stop()
        expect(
          animations.every(
            (animation) => animation.cancel.mock.calls.length > 0 && animation.effect === null
          )
        ).toBe(true)
        expect(clip.counts).toEqual({ animations: 0, timers: 0, mounted: false, retainedImages: 0 })
      } finally {
        clip.stop()
      }
    }
  )
})
