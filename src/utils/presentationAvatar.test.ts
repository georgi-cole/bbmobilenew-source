import { describe, expect, it } from 'vitest'
import {
  resolvePresentationAvatar,
  resolvePresentationAvatarCandidates,
  resolveCloseUpAvatarCandidates,
} from './presentationAvatar'
import { getPresentationAvatarPreloadUrls } from './avatarPreloadCandidates'

describe('presentation avatar assets', () => {
  it('uses bundled close-ups for all player looks without changing thumbnails', () => {
    for (let number = 1; number <= 35; number++) {
      const source = `/game/assets/player_characters/character%20${number}/main.webp?v=old`
      expect(resolveCloseUpAvatarCandidates(source)).toEqual([
        `/game/assets/player_characters/character%20${number}/grey-closeup.webp`,
        `/game/assets/player_characters/character%20${number}/grey.webp`,
        source,
      ])
      expect(resolvePresentationAvatarCandidates(source)[0]).toContain('/grey.webp')
    }
  })

  it('keeps legacy portraits and uploaded photos unchanged in close-ups', () => {
    for (const source of [
      '/assets/skins/Finn_avatar.webp',
      'data:image/png;base64,photo',
      'blob:https://localhost/photo',
      '/assets/player_characters/character%201/grey-closeup.webp',
    ]) {
      expect(resolveCloseUpAvatarCandidates(source)).toEqual(
        resolvePresentationAvatarCandidates(source)
      )
    }
  })

  it('prefers the grey WebP and exposes the PNG fallback', () => {
    const source = '/assets/skins/Finn_avatar.webp'
    expect(resolvePresentationAvatar(source)).toBe('/assets/skins/backup-grey-lux/Finn_avatar.webp')
    expect(resolvePresentationAvatarCandidates(source)).toEqual([
      '/assets/skins/backup-grey-lux/Finn_avatar.webp',
      '/assets/skins/backup-grey-lux/Finn_avatar.png',
    ])
  })

  it('keeps both twins in the presentation portrait', () => {
    const source = '/game/assets/skins/Ali_lia_avatar_512.webp'
    expect(resolvePresentationAvatarCandidates(source)).toEqual([
      '/game/assets/skins/Ali_lia_avatar_grey.webp',
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

  it('uses the shared Bella portrait for both standard and legacy grey paths', () => {
    expect(resolvePresentationAvatarCandidates('/assets/skins/Bella_avatar.webp')).toEqual([
      '/assets/skins/Bella_avatar.webp',
    ])
    expect(
      resolvePresentationAvatar('/bbmobilenew/assets/skins/backup-grey-lux/Bella_avatar.webp?rev=1')
    ).toBe('/bbmobilenew/assets/skins/Bella_avatar.webp?rev=1')
  })

  it('includes grey WebP and PNG candidates in gameplay preload URLs', () => {
    const urls = getPresentationAvatarPreloadUrls([{ id: 'finn', name: 'Finn', avatar: '' }])
    expect(
      urls.some((url) => url.includes('/backup-grey-lux/') && url.endsWith('_avatar.webp'))
    ).toBe(true)
    expect(
      urls.some((url) => url.includes('/backup-grey-lux/') && url.endsWith('_avatar.png'))
    ).toBe(true)
  })
})
