import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SELECTABLE_LOOKS } from '../../src/appearance/catalog'
import catalog from '../../src/cinematic/ceremonies/cast.json'
import shared from '../../src/cinematic/ceremonies/shared-manifest.json'
import vfx from '../../src/cinematic/ceremonies/vfx.json'
import optical from '../../src/cinematic/ceremonies/optical.json'

describe('released ceremony artwork', () => {
  it('includes every selectable player look without dropping the existing houseguest packs', () => {
    const playerIds = catalog.characters
      .filter((character) => character.id.startsWith('character-'))
      .map((character) => character.id)
    expect(playerIds.sort()).toEqual(
      SELECTABLE_LOOKS.map((look) => `character-${Number(look.id.slice(3))}`).sort()
    )
    expect(
      catalog.characters.filter((character) => !character.id.startsWith('character-'))
    ).toHaveLength(28)
    expect(new Set(catalog.characters.map((character) => character.id)).size).toBe(
      catalog.characters.length
    )
  })

  it('contains the six approved transparent poses for every supported character', () => {
    for (const character of catalog.characters) {
      expect(Object.keys(character.poses).sort()).toEqual([
        'decision-back',
        'exit-back',
        'front',
        'royal-seated',
        'royal-standing',
        'safety-knight',
      ])
      for (const pose of Object.values(character.poses)) {
        const data = readFileSync(path.resolve('public', pose.src))
        expect(data.length).toBe(pose.bytes)
        expect(data.subarray(8, 12).toString()).toBe('WEBP')
        expect(createHash('sha256').update(data).digest('hex')).toBe(pose.sha256)
      }
    }
  })
  it('ships every reusable prop and type-specific effect with matching metadata', () => {
    for (const [name, resource] of Object.entries(shared)) {
      const data = readFileSync(path.resolve('public/assets/ceremonies/shared', name))
      expect(data.length).toBe(resource.bytes)
      expect(data.subarray(8, 12).toString()).toBe('WEBP')
    }
    for (const resource of [...Object.values(vfx), optical]) {
      const data = readFileSync(path.resolve('public', resource.src))
      expect(data.length).toBe(resource.bytes)
      expect(data.subarray(8, 12).toString()).toBe('WEBP')
    }
  })
})
