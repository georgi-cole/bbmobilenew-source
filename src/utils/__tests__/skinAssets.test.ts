import { describe, expect, it } from 'vitest'
import {
  hasSkinAsset,
  resolveSkinAsset,
  resolveSkinAssetPath,
  resolveSkinAssetPathWithFallback,
  SKIN_REGISTRY,
} from '../skinAssets'

describe('public skin asset resolution', () => {
  it('uses the application public URL without importing an image module', () => {
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`
    expect(resolveSkinAssetPath('Lia_flip_avatar.webp')).toBe(
      `${base}assets/skins/Lia_flip_avatar.webp`
    )
    expect(hasSkinAsset('Lia_flip_avatar.webp')).toBe(true)
    expect(hasSkinAsset('unreleased-avatar.webp')).toBe(false)
    expect(resolveSkinAssetPathWithFallback('unreleased-avatar.webp', 'Ali_avatar.webp')).toBe(
      `${base}assets/skins/Ali_avatar.webp`
    )
  })

  it('keeps registered backgrounds and nested theme files available', () => {
    for (const entry of Object.values(SKIN_REGISTRY)) {
      expect(hasSkinAsset(entry.canonicalFile)).toBe(true)
      for (const alias of entry.aliases ?? []) expect(hasSkinAsset(alias)).toBe(true)
    }
    const day = resolveSkinAsset('day')
    expect(day.file).toBe(SKIN_REGISTRY.day?.canonicalFile)
    expect(day.source).toBe('public')
    expect(day.url).not.toContain('/public/')
  })
})
