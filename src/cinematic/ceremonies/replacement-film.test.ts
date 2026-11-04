import { describe, expect, it } from 'vitest'
import type { ReplacementPresentation } from './replacementPresentation'
import {
  makeReplacementFilm,
  animateReplacementFilm,
  replacementResources,
} from './replacement-film.js'
import { replacementBeats, replacementDuration } from './replacement-timing.js'
import { coLeaderOutcome } from './co-leader-film.js'
import { royalPowerResources, makeRoyalPowerFilm } from './royal-power.js'

const pose = { src: 'actor.webp', width: 420, height: 630, bytes: 1000, feetY: 0.94762 }
const cast = Object.fromEntries(
  ['a', 'b', 'c', 'd', 'loh', 'pos', 'co', 'mission'].map((id) => [
    id,
    {
      id,
      name: id === 'c' ? '<script>long player name</script>' : id,
      poses: { front: pose, 'decision-back': pose, 'royal-seated': pose },
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
      'replacementMist',
      'royal-room.webp',
      'throne.webp',
      'crown.webp',
      ...Object.keys(cast).map((id) => `replacement-body-${id}`),
      ...Object.keys(cast).map((id) => `replacement-authority-${id}`),
      ...Object.keys(cast).map((id) => `replacement-holder-${id}`),
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
    expect(root.querySelectorAll('.replacement-decision-shot')).toHaveLength(2)
    expect(root.querySelector('.replacement-decision-shot[data-actor-id="pos"]')).toBeTruthy()
    expect(root.querySelector('.replacement-decision-shot[data-actor-id="loh"]')).toBeTruthy()
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
        } else expect(target).toBeInstanceOf(Element)
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

  it('uses the established Vox studio without inventing a chooser for ballot replacements', () => {
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
          actionHistory: [{ kind: 'replacement', playerId: 'c', actorId: null, slotIndex: 1 }],
        },
      },
      shared
    )
    expect(voxResources.replacementSet.src).toContain('vox-studio.webp')
    expect(voxResources['replacement-authority-loh']).toBeUndefined()
    expect(voxResources['replacement-body-b'].pose).toBe('front')
    const ordinaryResources = replacementResources(cast, { replacementOutcome: base }, shared)
    expect(ordinaryResources['replacement-body-c'].pose).toBe('front')
    expect(ordinaryResources['replacement-body-loh']).toBeUndefined()
    expect(ordinaryResources['replacement-authority-loh'].pose).toBe('royal-seated')
    expect(ordinaryResources['replacement-holder-pos'].pose).toBe('decision-back')
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
    expect(resources['replacement-authority-loh'].pose).toBe('royal-seated')
    const root = makeReplacementFilm(images(), cast, outcome)
    expect(root.querySelectorAll('.replacement-person[data-actor-id="loh"]')).toHaveLength(1)
    expect(
      root.querySelector('.replacement-decision-shot[data-actor-id="loh"] strong')?.textContent
    ).toBe('loh')
  })

  it('keeps continuing nominees fully visible and leaves their fitted foot transform untouched', () => {
    const root = makeReplacementFilm(images(), cast, base)
    animateReplacementFilm(
      root,
      (target: string | Element, stops: (number | string)[][]) => {
        if (
          target instanceof HTMLElement &&
          target.classList.contains('replacement-person-opening') &&
          target.dataset.actorId === 'a'
        ) {
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

  it('gives leadership precedence over Safety and introduces a dual holder only once', () => {
    const outcome = {
      ...base,
      leaderIds: ['loh'],
      safetyHolderIds: ['loh'],
      powerHolderId: 'loh',
      actionHistory: base.actionHistory.map((action) => ({ ...action, actorId: 'loh' })),
    }
    const resources = replacementResources(cast, { replacementOutcome: outcome }, {})
    expect(resources['replacement-authority-loh'].pose).toBe('royal-seated')
    expect(resources['replacement-holder-loh']).toBeUndefined()
    const root = makeReplacementFilm(images(), cast, outcome)
    expect(root.querySelectorAll('.replacement-decision-shot')).toHaveLength(1)
    expect(root.querySelector('.is-royal .royal-safety-plinth')).toBeTruthy()
    expect(root.querySelector('.replacement-holder-foreground')).toBeNull()
    animateReplacementFilm(
      root,
      (target: string | Element, stops: (number | string)[][]) => {
        if (target === '.replacement-block') expect(stops[0]).toEqual([0, 0])
      },
      outcome,
      replacementDuration(outcome)
    )
  })
  it('uses the actual rear pose without an opaque backdrop for a nonroyal power holder', () => {
    const root = makeReplacementFilm(images(), cast, base)
    const shot = root.querySelector('.is-over-shoulder')!
    expect(shot.querySelector('.replacement-holder-back')).toBeTruthy()
    expect(shot.querySelector('.replacement-decision-backdrop')).toBeNull()
  })
  it('holds one continuous Vox stage and labels a real fifth-place or tied ballot rank', () => {
    const outcome = {
      ...base,
      variant: 'vox' as const,
      leaderIds: [],
      actionHistory: [
        { kind: 'save' as const, playerId: 'b', actorId: 'pos', slotIndex: 1 },
        {
          kind: 'replacement' as const,
          playerId: 'c',
          actorId: null,
          slotIndex: 1,
          ballotRank: 5,
          tiedRank: true,
        },
        {
          kind: 'replacement' as const,
          playerId: 'd',
          actorId: null,
          slotIndex: 2,
          ballotRank: 5,
          tiedRank: true,
        },
      ],
      nomineeIds: ['a', 'c', 'd'],
      replacementIds: ['c', 'd'],
    }
    const root = makeReplacementFilm(images(), cast, outcome)
    expect(root.querySelectorAll('.is-royal')).toHaveLength(0)
    expect(root.textContent).toContain('TIED BALLOT RANK #5')
    expect(replacementBeats(outcome).at(-1)?.actions).toHaveLength(2)
    animateReplacementFilm(
      root,
      (target: string | Element, stops: (number | string)[][]) => {
        if (target === '.replacement-block')
          expect(stops.every(([, opacity]) => opacity === 1)).toBe(true)
        if (target instanceof Element) expect(target).not.toBeNull()
        if (typeof target === 'string') expect(root.querySelector(target)).toBeTruthy()
      },
      outcome,
      replacementDuration(outcome)
    )
  })
  it('gives each co-leader their own royal shot and persistent ownership on the correct nominee', () => {
    const outcome = coLeaderOutcome(cast, {
      coLohAssignments: [
        { coLohId: 'loh', nomineeId: 'a' },
        { coLohId: 'co', nomineeId: 'b' },
      ],
    })
    const root = makeReplacementFilm(images(), cast, outcome!)
    expect(root.querySelectorAll('.is-royal')).toHaveLength(2)
    expect(root.querySelector('[data-actor-id="a"] small')?.textContent).toBe('loh’S NOMINEE')
    expect(root.querySelector('[data-actor-id="b"] small')?.textContent).toBe('co’S NOMINEE')
    expect(outcome!.actionHistory.map((a) => a.actorId)).toEqual(['loh', 'co'])
  })
  it('shows both Cupid leaders in one royal unit rather than a solo casual holder', () => {
    const outcome = {
      ...base,
      leaderIds: ['loh', 'co'],
      authorityPairs: [
        { id: 'leaders', memberIds: ['loh', 'co'] as [string, string], color: '#a89' },
      ],
      actionHistory: base.actionHistory.slice(1),
    }
    const root = makeReplacementFilm(images(), cast, outcome)
    expect(root.querySelectorAll('.is-royal .royal-member')).toHaveLength(2)
    expect(root.querySelector('.is-royal strong')?.textContent).toBe('loh & co')
  })
  it('uses royal seated artwork with a separate shield for All the Power', () => {
    const resources = royalPowerResources({ a: cast.loh }, {})
    expect(resources['replacement-authority-loh'].pose).toBe('royal-seated')
    const root = makeRoyalPowerFilm(images(), { a: cast.loh })
    expect(root.querySelector('.royal-safety-plinth')).toBeTruthy()
    expect(root.querySelector('.replacement-holder-back')).toBeNull()
  })
})
