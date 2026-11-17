import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import manifest from '../../docs/portrait-closeups.json'
import { APPEARANCE_LOOKS, getAppearanceAsset } from '../../src/appearance/catalog'
import { resolveCloseUpAvatarCandidates } from '../../src/utils/presentationAvatar'

describe('offline player close-up artwork', () => {
  it('bundles a genuine high-resolution portrait for every selectable look within 1.7 MB', () => {
    expect(manifest.portraits.map((portrait) => portrait.lookId)).toEqual(
      APPEARANCE_LOOKS.map((look) => look.id)
    )
    let bytes = 0
    for (const portrait of manifest.portraits) {
      const source = getAppearanceAsset(
        { kind: 'catalog', lookId: portrait.lookId, revision: 1 },
        'main'
      )!
      expect(decodeURIComponent(resolveCloseUpAvatarCandidates(source)[0])).toBe(portrait.asset)
      const data = readFileSync(`public/${portrait.asset}`)
      expect(data.toString('ascii', 0, 4)).toBe('RIFF')
      expect(data.toString('ascii', 8, 16)).toBe('WEBPVP8 ')
      expect(data.readUInt16LE(26) & 0x3fff).toBe(960)
      expect(data.readUInt16LE(28) & 0x3fff).toBe(960)
      expect(data.length).toBe(portrait.bytes)
      expect(createHash('sha256').update(data).digest('hex')).toBe(portrait.sha256)
      bytes += data.length
    }
    expect(bytes).toBe(manifest.totalBytes)
    expect(bytes).toBeLessThan(1_700_000)
  })
})
