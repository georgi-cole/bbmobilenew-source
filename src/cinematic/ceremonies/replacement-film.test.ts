import { describe, expect, it } from 'vitest'
import type { ReplacementPresentation } from './replacementPresentation'
import {
  makeReplacementFilm,
  animateReplacementFilm,
  replacementResources,
} from './replacement-film.js'

const pose = { src: 'actor.webp', width: 420, height: 630, bytes: 1000, feetY: 0.94762 }
const cast = Object.fromEntries(
  ['a', 'c', 'd', 'loh'].map((id) => [
    id,
    {
      id,
      name: id === 'c' ? '<script>long player name</script>' : id,
      poses: { front: pose, 'decision-back': pose },
    },
  ])
)
const base: ReplacementPresentation = {
  owner: 'replacement',
  eventKey: 'replacement:test',
  variant: 'ordinary',
  replacementIds: ['c'],
  continuingNomineeIds: ['a'],
  savedIds: ['b'],
  chooserId: 'loh',
  durationMs: 4500,
}
const images = () =>
  Object.fromEntries(
    [
      'replacementSet',
      'replacementPlatform',
      ...Object.keys(cast).map((id) => `replacement-block-${id}`),
      'replacement-chooser-loh',
    ].map((key) => {
      const image = document.createElement('img')
      image.src = `${key}.webp`
      return [key, image]
    })
  )

describe('replacement film family', () => {
  it.each([
    'ordinary',
    'halo',
    'force',
    'mission',
    'coLoh',
    'detox',
    'doubleTrouble',
    'vox',
    'cupid',
  ])('builds and times %s using the same reusable set', (variant) => {
    const outcome = {
      ...base,
      variant: variant as ReplacementPresentation['variant'],
      chooserId: variant === 'vox' ? null : 'loh',
      replacementIds: ['detox', 'doubleTrouble', 'cupid'].includes(variant) ? ['c', 'd'] : ['c'],
    }
    const root = makeReplacementFilm(images(), cast, outcome)
    expect(root.querySelectorAll('.replacement-slot')).toHaveLength(
      outcome.replacementIds.length + 1
    )
    expect(root.querySelectorAll('.replacement-authority-shot')).toHaveLength(
      variant === 'vox' ? 0 : 1
    )
    if (variant === 'vox') expect(root.querySelector('.replacement-authority-shot')).toBeNull()
    else expect(root.querySelector('.replacement-authority-shot')).toBeTruthy()
    const body = root.querySelector<HTMLImageElement>('.replacement-body')
    expect(body?.alt).toBe('')
    expect(body?.style.getPropertyValue('--feet-y')).toBe('94.762%')
    expect(root.querySelector('script')).toBeNull()
    const selectors: string[] = []
    animateReplacementFilm(
      root,
      (target: string | Element, stops: (number | string)[][]) => {
        if (typeof target === 'string') {
          expect(root.querySelector(target)).toBeTruthy()
          selectors.push(target)
        }
        for (const [time] of stops) expect(time).toBeLessThanOrEqual(4500)
      },
      outcome,
      4500
    )
    expect(selectors).toContain('.replacement-caption')
  })
  it('uses the existing Vox studio and only the real chooser pose', () => {
    const shared = {
      'vox-studio.webp': { width: 400, height: 600, bytes: 1000 },
      'danger-platform.webp': { width: 400, height: 220, bytes: 1000 },
    }
    const voxResources = replacementResources(
      cast,
      { replacementOutcome: { ...base, variant: 'vox', chooserId: null } },
      shared
    )
    expect(voxResources.replacementSet.src).toContain('vox-studio.webp')
    expect(voxResources['replacement-chooser-loh']).toBeUndefined()
    const ordinaryResources = replacementResources(cast, { replacementOutcome: base }, shared)
    expect(ordinaryResources['replacement-block-c'].pose).toBe('front')
    expect(ordinaryResources['replacement-block-loh'].pose).toBe('front')
    expect(ordinaryResources['replacement-chooser-loh'].pose).toBe('decision-back')
  })

  it('keeps the decision pose separate when the chooser is also on the block', () => {
    const outcome = { ...base, replacementIds: ['loh'], continuingNomineeIds: [] }
    const resources = replacementResources(cast, { replacementOutcome: outcome }, {})
    expect(resources['replacement-block-loh'].pose).toBe('front')
    expect(resources['replacement-chooser-loh'].pose).toBe('decision-back')
    const root = makeReplacementFilm(images(), cast, outcome)
    expect(root.querySelector('.replacement-body')?.getAttribute('src')).toContain(
      'replacement-block-loh.webp'
    )
  })
})
