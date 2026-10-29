import { describe, expect, it } from 'vitest'
import { getPulseChronicleTheme } from '../pulseChronicleTheme'

describe('getPulseChronicleTheme', () => {
  it('uses the activated season format and ignores merely scheduled twists', () => {
    expect(
      getPulseChronicleTheme(
        {
          gameId: 'pulse-theme-vox-test',
          season: 4,
          voxPopuli: { activatedSeason: 4 },
        },
        2
      )
    ).toEqual({ format: 'voxPopuli' })

    expect(
      getPulseChronicleTheme(
        {
          gameId: 'pulse-theme-cupid-test',
          season: 4,
          cupidArrow: { activatedSeason: 4 },
        },
        2
      )
    ).toEqual({ format: 'cupidArrow' })

    expect(
      getPulseChronicleTheme(
        {
          gameId: 'pulse-theme-classic-test',
          season: 4,
          voxPopuli: { activatedSeason: 5 },
          cupidArrow: { activatedSeason: null },
        },
        2
      )
    ).toEqual({ format: 'classic' })
  })
})
