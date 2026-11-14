import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import manifest from '../src/cinematic/ceremonies/walk-manifest.json'

describe('departure asset integrity', () => {
  it('ships every atlas at the declared size and digest', () => {
    for (const walk of Object.values(manifest.characters)) {
      const bytes = readFileSync('public/' + walk.src)
      expect(bytes.length).toBe(walk.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(walk.sha256)
    }
  })
})
