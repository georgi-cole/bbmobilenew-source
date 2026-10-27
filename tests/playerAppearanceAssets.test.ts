import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SELECTABLE_LOOKS,
  getAppearanceAsset,
  type AppearanceRole,
} from '../src/appearance/catalog'

const roles: AppearanceRole[] = ['casual', 'formal', 'grey', 'main', 'paparazzi', 'sad']

describe('published player character assets', () => {
  it('ships exactly one valid WebP file per role for every selectable pack', () => {
    const root = resolve(process.cwd(), 'public/assets/player_characters')
    expect(
      readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    ).toHaveLength(35)
    let fileCount = 0
    for (const look of SELECTABLE_LOOKS) {
      const folder = resolve(root, look.folder)
      expect(readdirSync(folder).sort(), look.folder).toEqual(
        roles.map((role) => `${role}.webp`).sort()
      )
      for (const role of roles) {
        const asset = getAppearanceAsset(
          { kind: 'catalog', lookId: look.id, revision: look.revision },
          role
        )!
        const file = resolve(process.cwd(), 'public', decodeURIComponent(asset.split('?')[0]))
        expect(existsSync(file), asset).toBe(true)
        const bytes = readFileSync(file)
        expect(bytes.subarray(0, 4).toString(), asset).toBe('RIFF')
        expect(bytes.subarray(8, 12).toString(), asset).toBe('WEBP')
        fileCount++
      }
    }
    expect(fileCount).toBe(210)
  })
})
