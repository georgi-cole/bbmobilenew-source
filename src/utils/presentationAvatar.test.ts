import { describe, expect, it } from 'vitest'
import {
  resolvePresentationAvatar,
  resolvePresentationAvatarCandidates,
} from './presentationAvatar'
import { getPresentationAvatarPreloadUrls } from './avatarPreloadCandidates'

describe('presentation avatar assets', () => {
  it('prefers the grey WebP and falls back to the existing original', () => {
    const source = '/assets/skins/Finn_avatar.webp'
    expect(resolvePresentationAvatar(source)).toBe('/assets/skins/backup-grey-lux/Finn_avatar.webp')
    expect(resolvePresentationAvatarCandidates(source)).toEqual([
      '/assets/skins/backup-grey-lux/Finn_avatar.webp',
      source,
    ])
  })

  it('does not rewrite non-canonical or already-grey assets', () => {
    expect(resolvePresentationAvatar('/assets/skins/Finn_avatar.png')).toBe(
      '/assets/skins/Finn_avatar.png'
    )
    expect(resolvePresentationAvatar('/assets/skins/backup-grey-lux/Finn_avatar.webp')).toBe(
      '/assets/skins/backup-grey-lux/Finn_avatar.webp'
    )
  })

  it('preloads the grey and original WebPs without requesting absent grey PNGs', () => {
    const urls = getPresentationAvatarPreloadUrls([{ id: 'finn', name: 'Finn', avatar: '' }])
    expect(
      urls.some((url) => url.includes('/backup-grey-lux/') && url.endsWith('_avatar.webp'))
    ).toBe(true)
    expect(urls.some((url) => url.endsWith('/skins/Finn_avatar.webp'))).toBe(true)
    expect(urls.some((url) => url.endsWith('_avatar.png'))).toBe(false)
  })
})
