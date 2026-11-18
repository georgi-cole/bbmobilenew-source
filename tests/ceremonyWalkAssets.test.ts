import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import manifest from '../src/cinematic/ceremonies/walk-manifest.json'
import compressionProof from '../docs/qa/walk-alpha-lossless.json'

describe('departure asset integrity', () => {
  it('preserves every original colour bitstream and the complete eight-pose atlas layout', () => {
    // The twin atlas was rendered separately from the original alpha recompression batch.
    const originalAtlases = Object.entries(manifest.characters)
      .filter(([id]) => id !== 'lia-ali')
      .map(([, walk]) => walk.src.split('/').pop())
      .sort()
    expect(compressionProof.files.map(({ file }) => file).sort()).toEqual(originalAtlases)
    for (const record of compressionProof.files) {
      const bytes = readFileSync('public/assets/ceremonies/walks/' + record.file)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.afterSha256)
      const chunks = new Map<string, Buffer>()
      for (let offset = 12; offset + 8 <= bytes.length; ) {
        const size = bytes.readUInt32LE(offset + 4)
        expect(offset + 8 + size).toBeLessThanOrEqual(bytes.length)
        chunks.set(
          bytes.toString('ascii', offset, offset + 4),
          bytes.subarray(offset + 8, offset + 8 + size)
        )
        offset += 8 + size + (size % 2)
      }
      expect(createHash('sha256').update(chunks.get('VP8 ')!).digest('hex')).toBe(
        record.colourBitstreamSha256
      )
      const header = chunks.get('VP8X')!
      expect(header.readUIntLE(4, 3) + 1).toBe(record.width)
      expect(header.readUIntLE(7, 3) + 1).toBe(record.height)
      expect(record.width).toBe(384 * 8)
      expect(record.height).toBe(576)
    }
  })
  it('ships every atlas at the declared size and digest', () => {
    for (const walk of Object.values(manifest.characters)) {
      const bytes = readFileSync('public/' + walk.src)
      expect(bytes.toString('ascii', 12, 16)).toBe('VP8X')
      expect(bytes.readUIntLE(24, 3) + 1).toBe(walk.width)
      expect(bytes.readUIntLE(27, 3) + 1).toBe(walk.height)
      expect(walk.width).toBe(walk.frameWidth * walk.frames)
      expect(bytes.length).toBe(walk.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(walk.sha256)
    }
  })
})
