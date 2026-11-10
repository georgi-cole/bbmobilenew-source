import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AVATAR_ASSET_FILES,
  FORMAL_CUTOUT_FILES,
  INFORMAL_CUTOUT_FILES,
} from '../../src/data/avatarAssetManifest'

import { TABLOID_PHOTO_FILES } from '../../src/data/tabloidPhotoManifest'
import { resolveCupidLoveAvatar } from '../../src/utils/cupidLoveAvatar'

describe('avatar asset manifest', () => {
  it.each([
    ['skins', AVATAR_ASSET_FILES],
    ['formal_attires', FORMAL_CUTOUT_FILES],
    ['Informal_attires', INFORMAL_CUTOUT_FILES],
  ] as const)('only references files that ship in public/assets/%s', (folder, files) => {
    const missing = files.filter((file) => !existsSync(resolve('public', 'assets', folder, file)))
    expect(missing).toEqual([])
  })

  it('resolves all Cupid portraits to packaged WebP or the original bundled portrait', () => {
    const paths = AVATAR_ASSET_FILES.map((file) => {
      const original = `assets/skins/${file}`
      const avatar = resolveCupidLoveAvatar(original)
      if (file === 'Bella_avatar.webp') return avatar === original
      return (
        !!avatar?.endsWith('_love.webp') &&
        existsSync(resolve('public/assets/skins/cupid-love', avatar.split('/').at(-1)!))
      )
    })
    expect(paths.every(Boolean)).toBe(true)
  })

  it('lists every bundled tabloid image', () => {
    const photos = readdirSync(resolve('public/assets/tabloid_photos')).filter((file) =>
      /\.(png|jpe?g|jxl|webp|avif)$/.test(file)
    )
    expect([...TABLOID_PHOTO_FILES].sort()).toEqual(photos.sort())
  })
})
