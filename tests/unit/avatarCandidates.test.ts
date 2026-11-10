import { describe, expect, it } from 'vitest'
import {
  getLocalAvatarFallback,
  resolveAvatar,
  resolveAvatarCandidates,
} from '../../src/utils/avatar'

describe('resolveAvatarCandidates', () => {
  it('uses the bundled player image without requesting speculative custom-name assets', () => {
    const player = { id: 'guest-1', name: 'You', avatar: '', isUser: true } as const
    const candidates = resolveAvatarCandidates(player)
    const fallback = getLocalAvatarFallback(player.name, true)

    expect(candidates).toEqual([fallback])
    expect(fallback).toContain('assets/skins/You.png')
    expect(resolveAvatar(player)).toBe(fallback)
  })

  it('provides an offline-safe initials fallback for houseguests', () => {
    expect(getLocalAvatarFallback('Nova Ray')).toMatch(/^data:image\/svg\+xml,/)
  })

  it.each([
    ['./assets/skins/Finn_avatar.svg', 'assets/skins/Finn_avatar.webp'],
    [
      '/bbmobilenew/assets/skins/backup-grey-lux/Finn_avatar.svg?rev=1',
      'assets/skins/backup-grey-lux/Finn_avatar.webp?rev=1',
    ],
    [
      './assets/skins/backup-grey-lux/Bella_avatar.webp?rev=1',
      'assets/skins/Bella_avatar.webp?rev=1',
    ],
  ])('resolves a saved portrait URL %s to the bundled WebP', (avatar, expected) => {
    const player = { id: 'user', name: 'You', avatar, isUser: true }
    expect(resolveAvatar(player)).toContain(expected)
  })

  it('preserves external avatar URLs', () => {
    const avatar = 'https://example.com/assets/skins/Finn_avatar.svg'
    expect(resolveAvatar({ id: 'user', name: 'You', avatar })).toBe(avatar)
  })

  it('prefers an explicit Lia avatar path before any scanned avatar asset', () => {
    const candidates = resolveAvatarCandidates({
      id: 'lia',
      name: 'Lia',
      avatar: 'assets/skins/Lia_avatar.webp',
    })

    expect(candidates[0]).toContain('assets/skins/Lia_avatar.webp')
  })

  it('does not fuzzy-match Lia to the combined Lia_Ali avatar', () => {
    const candidates = resolveAvatarCandidates({
      id: 'lia',
      name: 'Lia',
      avatar: 'assets/skins/Lia_avatar.webp',
    })

    expect(candidates[0]).not.toContain('Lia_Ali_avatar')
  })
})
