import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOUSEMATES_BIO_CARDS } from '../../src/components/HousematesBioCinematic/housematesBioData'

describe('published Hubmates biography portraits', () => {
  it('ships portraits in the browser image format declared by their filename', () => {
    for (const card of HOUSEMATES_BIO_CARDS) {
      const bytes = readFileSync(resolve('public/assets/Informal_attires', card.portraitFile))
      if (card.portraitFile.endsWith('.png')) {
        expect(bytes.subarray(0, 8).toString('hex'), card.name).toBe('89504e470d0a1a0a')
      } else {
        expect(bytes.subarray(0, 4).toString('ascii'), card.name).toBe('RIFF')
        expect(bytes.subarray(8, 12).toString('ascii'), card.name).toBe('WEBP')
      }
    }
  })
})
