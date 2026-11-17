import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../../store/gameSlice'
import { buildSeasonRecapData, resolveRecapTabloidSources } from '../seasonRecapData'

const players = createInitialGameState({ seed: 331 }).players

describe('pre-verdict season recap', () => {
  it('keeps combined twins together when older data supplies a solo tabloid photo', () => {
    const sources = resolveRecapTabloidSources(
      {
        id: 'lia',
        name: 'Lia & Ali',
        status: 'active',
        avatar: 'assets/skins/Lia_avatar.webp',
      },
      '/assets/tabloid_photos/Lia_tabloid.jpg'
    )

    expect(sources[0]).toContain('assets/tabloid_photos/Lia_Ali_tabloid.webp')
    expect(sources[1]).toContain('assets/Informal_attires/Lia_Ali_informal.webp')
    expect(sources[2]).toContain('assets/skins/Ali_lia_avatar_512.webp')
    expect(sources).not.toContain('/assets/tabloid_photos/Lia_tabloid.jpg')
  })

  it('keeps the original Tribunal caption for Classic seasons', () => {
    const classic = buildSeasonRecapData(players, 12)
    expect(classic.montageFragments).toContain('TRIBUNAL LOCKED')
    expect(classic.montageFragments).not.toContain('PUBLIC VOTE NEXT')
    expect(classic.montageFragments).toContain('FINAL TWO')
  })

  it('advertises the upcoming public vote in Vox without claiming a completed Tribunal', () => {
    const vox = buildSeasonRecapData(players, 12, null, 'audience')
    expect(vox.montageFragments).toContain('PUBLIC VOTE NEXT')
    expect(vox.montageFragments).toContain('FINAL TWO')
    expect(vox.montageFragments).not.toContain('TRIBUNAL LOCKED')
    expect(vox.montageBeats).toHaveLength(4)
  })
})
