import { describe, expect, it, vi } from 'vitest'
import manifest from './walk-manifest.json'
import catalog from './cast.json'
import { sceneResources } from './renderer.js'
import {
  makeDecisionScene,
  animateDecisionScene,
  getDecisionTiming,
} from './approved/decision-exit.js'
import { adaptModeFilm } from './mode-films.js'
import {
  upgradeWalkResources,
  attachWalkSprites,
  animateWalkSprites,
  continueDoorwayTravel,
} from './walk-cycles.js'
import type { WalkStop } from './walk-cycles.js'

const [a, b, c] = catalog.characters.map((actor) => ({ ...actor, playerId: actor.id }))
const fakeImages = (resources: Record<string, { src: string }>) =>
  Object.fromEntries(
    Object.entries(resources).map(([key, resource]) => {
      const image = document.createElement('img')
      image.dataset.resourceKey = key
      image.src = resource.src
      return [key, image]
    })
  )

describe('reusable cast walks', () => {
  it('covers every cast identity with eight packaged frames and empty hands beyond the approved Ali pilot', () => {
    expect(Object.keys(manifest.characters).sort()).toEqual(
      catalog.characters.map((c) => c.id).sort()
    )
    for (const [id, walk] of Object.entries(manifest.characters)) {
      expect(walk.frames).toBe(8)
      expect(walk.width).toBe(walk.frames * walk.frameWidth)
      expect(walk.emptyHanded).toBe(id !== 'ali')
    }
    expect(manifest.characters.ash.gait).toBe('grounded')
  })
  it('loads only the departing actors and keeps a static fallback for missing or failed atlases', () => {
    const resources = sceneResources('exit', { a, b, c })
    expect(Object.values(resources).filter((r) => r.walkCycle)).toHaveLength(1)
    expect(resources.cinema_exitC.character).toBe(c.id)
    expect(resources.cinema_exitC.fallback?.src).toBe(c.poses['exit-back'].src)
    const unknown = { pose: 'exit-back', character: 'unavailable', src: 'fallback.webp' }
    expect(upgradeWalkResources({ unknown }).unknown).toBe(unknown)
    expect(upgradeWalkResources(resources, false)).toBe(resources)
  })
  it('gives each Cupid partner their own strip in both depth layers', () => {
    const cast = { a, b, c },
      resources = sceneResources('cupidExit', cast)
    const images = fakeImages(resources),
      root = makeDecisionScene('exit', images, 0, { nativeHandoff: true })
    adaptModeFilm('cupidExit', root, images, resources, cast, {}, vi.fn())
    const sprites = attachWalkSprites(root, resources)
    expect(sprites).toHaveLength(4)
    for (const layer of root.querySelectorAll('.cine-departure')) {
      expect(layer.querySelector<HTMLElement>('.pair-first')?.dataset.character).toBe(c.id)
      expect(layer.querySelector<HTMLElement>('.pair-second')?.dataset.character).toBe(b.id)
      expect(layer.querySelectorAll('.walk-cycle-strip')).toHaveLength(2)
    }
  })
  it.each(['exit', 'tiebreak', 'final4', 'final3'])(
    'keeps %s gait and travel alive until door closure without retiming the Eye',
    (id) => {
      const options = { nativeHandoff: true, closingBrand: true },
        timing = getDecisionTiming(id, options)
      const root = makeDecisionScene(
        id,
        fakeImages(sceneResources(id, { a, b, c }, 'generic', { closingBrand: true })),
        0,
        options
      )
      const snapshots: [string | Element, WalkStop[]][] = []
      animateDecisionScene(
        id,
        root,
        (selector, frames) =>
          snapshots.push([selector, continueDoorwayTravel(selector, frames, timing.exitAt, false)]),
        options
      )
      const travel = snapshots.find(([selector]) => selector === '.departure-near')![1]
      expect(travel.some(([at]) => at === timing.exitAt + 3900)).toBe(true)
      const near = travel.find(([at]) => at === timing.exitAt + 3600),
        far = travel.find(([at]) => at === timing.exitAt + 3900)
      expect(near![2]).not.toBe(far![2])
      const sprites = attachWalkSprites(root, sceneResources(id, { a, b, c })),
        animate = vi.fn<(node: HTMLImageElement, stops: WalkStop[]) => void>()
      animateWalkSprites(sprites, animate, timing.duration, timing.exitAt)
      const stops = animate.mock.calls[0][1]
      expect(stops.find(([at]) => at === timing.exitAt + 3120)![2]).not.toBe(
        stops.find(([at]) => at === timing.exitAt + 3360)![2]
      )
      expect(stops.every(([at], i) => i === 0 || at >= stops[i - 1][0])).toBe(true)
      expect(snapshots.some(([selector]) => selector === '.exit-brand-turn')).toBe(true)
      expect(timing.handoffAt - getDecisionTiming(id).handoffAt).toBe(3400)
    }
  )
})
