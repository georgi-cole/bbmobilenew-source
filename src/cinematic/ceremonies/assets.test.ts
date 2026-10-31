import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import catalog from './cast.json'
import shared from './shared-manifest.json'
import vfx from './vfx.json'
import optical from './optical.json'

describe('released ceremony artwork', () => {
  it('contains the six approved transparent poses for every supported character', () => {
    expect(catalog.characters).toHaveLength(55)
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
