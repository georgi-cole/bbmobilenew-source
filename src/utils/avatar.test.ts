import { describe, expect, it } from 'vitest'
import { resolveAvatarCandidates, resolveFormalCutout, resolveInformalCutout } from './avatar'

describe('resolveAvatarCandidates', () => {
  it('keeps generated Surveyeval portraits ahead of speculative local files', () => {
    const portrait = 'https://api.dicebear.com/9.x/bottts/svg?seed=Zari'

    expect(
      resolveAvatarCandidates({ id: 'survivor-robo-9', name: 'Zari', avatar: portrait })[0]
    ).toBe(portrait)
  })

  it.each([
    { id: 'lia', name: 'Lia & Ali', avatar: 'assets/skins/Lia_avatar.webp' },
    { id: 'lia_ali', name: 'Lia', avatar: 'assets/skins/Lia_avatar.webp' },
    {
      id: 'lia',
      name: 'Lia',
      avatar: 'assets/skins/Lia_avatar.webp',
      twinMode: 'combined' as const,
    },
    { id: 'lia', name: 'Lia', avatar: 'assets/skins/Ali_lia_avatar.webp' },
  ])('keeps both twins in portraits and cutouts for $id / $name', (player) => {
    const candidates = resolveAvatarCandidates(player)

    expect(candidates[0]).toContain('Ali_lia_avatar_512.webp')
    expect(candidates[1]).toContain('Ali_lia_avatar.webp')
    expect(candidates.some((candidate) => candidate.endsWith('/Lia_avatar.webp'))).toBe(false)
    expect(resolveFormalCutout(player)).toContain('/formal_attires/Lia_Ali_formal.webp')
    expect(resolveInformalCutout(player)).toContain('/Informal_attires/Lia_Ali_informal.webp')
  })

  it('retains solo Lia and human portraits before the reveal', () => {
    const lia = { id: 'lia', name: 'Lia', avatar: 'assets/skins/Lia_avatar.webp' }
    expect(resolveAvatarCandidates(lia)[0]).toContain('/Lia_avatar.webp')
    expect(resolveFormalCutout(lia)).toContain('/Lia_formal.webp')
    expect(resolveInformalCutout(lia)).toContain('/Lia_informal.webp')

    const user = { id: 'user', name: 'Lia & Ali', avatar: '', isUser: true }
    expect(resolveAvatarCandidates(user)[0]).toContain('/You.png')
  })
})
