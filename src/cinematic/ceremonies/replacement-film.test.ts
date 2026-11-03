import { describe, expect, it } from 'vitest'
import type { ReplacementPresentation } from './replacementPresentation'
import {
  makeReplacementFilm,
  animateReplacementFilm,
  replacementResources,
} from './replacement-film.js'

const pose = { src: 'actor.webp', width: 420, height: 630, bytes: 1000, feetY: 0.94762 }
const cast = Object.fromEntries(
  ['a', 'b', 'c', 'd', 'loh', 'pos', 'co', 'mission'].map((id) => [
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
  openingNomineeIds: ['a', 'b'],
  nomineeIds: ['a', 'c'],
  replacementIds: ['c'],
  continuingNomineeIds: ['a'],
  savedIds: ['b'],
  chooserId: 'loh',
  powerHolderId: 'pos',
  priorAuthorityId: 'loh',
  affectedCoLohId: null,
  coLohIds: [],
  coLohAssignments: [],
  pairUnits: [],
  actionHistory: [
    { kind: 'save', playerId: 'b', actorId: 'pos', slotIndex: 1 },
    { kind: 'replacement', playerId: 'c', actorId: 'loh', slotIndex: 1 },
  ],
  durationMs: 4800,
}
const images = () =>
  Object.fromEntries(
    [
      'replacementSet',
      'replacementPlatform',
      ...Object.keys(cast).map((id) => `replacement-body-${id}`),
      ...Object.keys(cast).map((id) => `replacement-authority-${id}`),
      'replacementShield',
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
  ])('stages and times %s on persistent calibrated platforms', (variant) => {
    const cupid = variant === 'cupid'
    const multiple = ['detox', 'doubleTrouble', 'cupid'].includes(variant)
    const outcome: ReplacementPresentation = {
      ...base,
      variant: variant as ReplacementPresentation['variant'],
      chooserId: variant === 'vox' ? null : 'loh',
      openingNomineeIds: cupid ? ['a', 'b'] : ['a', 'b'],
      nomineeIds: cupid ? ['a', 'b', 'c', 'd'] : multiple ? ['c', 'd'] : ['a', 'c'],
      replacementIds: multiple ? ['c', 'd'] : ['c'],
      continuingNomineeIds: cupid ? ['a', 'b'] : multiple ? [] : ['a'],
      savedIds: multiple ? ['a', 'b'] : ['b'],
      pairUnits: cupid
        ? [
            { id: 'one', memberIds: ['a', 'b'], color: '#d5a6dc' },
            { id: 'two', memberIds: ['c', 'd'], color: '#e9a0c1' },
          ]
        : [],
    }
    const root = makeReplacementFilm(images(), cast, outcome)
    const slots = root.querySelectorAll('.replacement-slot')
    expect(slots).toHaveLength(2)
    expect(root.querySelectorAll('.replacement-platform')).toHaveLength(slots.length)
    expect(root.querySelector('.replacement-authority-shot')).toBeNull()
    if (variant === 'vox') expect(root.querySelector('.replacement-authority')).toBeNull()
    else expect(root.querySelector('.replacement-authority')).toBeTruthy()
    expect(root.textContent).toContain('<script>long player name</script>')
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
        const offsets = stops.map(([time]) => Number(time))
        expect(
          offsets.every((time) => Number.isFinite(time) && time >= 0 && time <= 4500),
          `${variant}: ${JSON.stringify(stops)}`
        ).toBe(true)
        expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
      },
      outcome,
      4500
    )
    expect(selectors).toContain('.replacement-caption')
    expect(selectors).toContain('.replacement-camera')
  })

  it('uses the established Vox studio and does not request a chooser pose', () => {
    const shared = {
      'vox-studio.webp': { width: 400, height: 600, bytes: 1000 },
      'danger-chamber.webp': { width: 400, height: 600, bytes: 1000 },
      'danger-platform.webp': { width: 400, height: 220, bytes: 1000 },
    }
    const voxResources = replacementResources(
      cast,
      {
        replacementOutcome: {
          ...base,
          variant: 'vox',
          chooserId: null,
          powerHolderId: null,
          priorAuthorityId: null,
        },
      },
      shared
    )
    expect(voxResources.replacementSet.src).toContain('vox-studio.webp')
    expect(voxResources['replacement-authority-loh']).toBeUndefined()
    expect(voxResources['replacement-body-b']).toBeUndefined()
    const ordinaryResources = replacementResources(cast, { replacementOutcome: base }, shared)
    expect(ordinaryResources['replacement-body-c'].pose).toBe('front')
    expect(ordinaryResources['replacement-body-loh']).toBeUndefined()
    expect(ordinaryResources['replacement-authority-loh']).toBeUndefined()
    expect(ordinaryResources['replacement-authority-pos']).toBeUndefined()
  })

  it('keeps the nominee body at the approved 44% slot width and shared sole anchor', () => {
    const root = makeReplacementFilm(images(), cast, base)
    const continuing = root.querySelector<HTMLElement>('.replacement-person-opening')
    expect(continuing?.parentElement?.style.getPropertyValue('--slot-width')).toBe('44cqw')
    expect(continuing?.style.bottom).toBe('')
    expect(continuing?.querySelector('img')?.style.getPropertyValue('--feet-y')).toBe('94.762%')
    expect(root.querySelectorAll('.replacement-platform-rim')).toHaveLength(2)
  })

  it('keeps a same-person chooser from being duplicated on the stage', () => {
    const outcome = {
      ...base,
      replacementIds: ['loh'],
      nomineeIds: ['a', 'loh'],
      continuingNomineeIds: ['a'],
    }
    const resources = replacementResources(cast, { replacementOutcome: outcome }, {})
    expect(resources['replacement-body-loh'].pose).toBe('front')
    expect(resources['replacement-authority-loh']).toBeUndefined()
    const root = makeReplacementFilm(images(), cast, outcome)
    expect(root.querySelectorAll('[data-actor-id="loh"]')).toHaveLength(1)
    expect(root.querySelector('.replacement-authority-label strong')?.textContent).toBe('loh')
  })

  it('keeps continuing nominees fully visible and leaves their fitted foot transform untouched', () => {
    const root = makeReplacementFilm(images(), cast, base)
    animateReplacementFilm(
      root,
      (target: string | Element, stops: (number | string)[][]) => {
        if (target instanceof Element && target.classList.contains('replacement-person-opening')) {
          expect(stops.at(-1)).toEqual([base.durationMs, 1])
          expect(stops.slice(1).every(([, opacity]) => opacity === 1)).toBe(true)
          expect(stops.every((stop) => stop.length === 2)).toBe(true)
        }
      },
      base,
      base.durationMs
    )
    expect(root.querySelector('.replacement-authority-figure')).toBeNull()
    expect(root.querySelector('.replacement-slot')?.getAttribute('style')).toContain(
      '--platform-surface-offset: 7.04cqw'
    )
  })
})
