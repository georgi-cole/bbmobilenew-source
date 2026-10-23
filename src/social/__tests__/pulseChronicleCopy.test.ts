import { describe, expect, it } from 'vitest'
import {
  getPulseChronicleOpening,
  normalizePulseStoryTerminology,
  type PulseChronicleTheme,
} from '../pulseChronicleCopy'

describe('Pulse Chronicle story copy', () => {
  it('uses deterministic format-specific openings', () => {
    const vox: PulseChronicleTheme = { format: 'voxPopuli' }
    const cupid: PulseChronicleTheme = { format: 'cupidArrow' }
    const voxOpening = getPulseChronicleOpening(vox, 'season-2-day-4')

    expect(voxOpening).toMatch(/Vox Populi|ballots|audience/i)
    expect(getPulseChronicleOpening(vox, 'season-2-day-4')).toBe(voxOpening)
    expect(getPulseChronicleOpening(cupid, 'season-2-day-4')).toMatch(/Cupid|pair|partner/i)
  })

  it('lets Depression Shock set the atmosphere over the season format', () => {
    const opening = getPulseChronicleOpening(
      { format: 'voxPopuli', depressionShock: 'day2' },
      'season-2-day-4'
    )

    expect(opening).toMatch(/storm|grey|quiet|heavier/i)
    expect(opening).not.toMatch(/ballot|audience/i)
  })

  it('repairs only old housemate and houseguest terms in Pulse prose', () => {
    expect(
      normalizePulseStoryTerminology(
        'One Less Housemate. Two housemates and HOUSEGUESTS remain. The House of Cards alliance stays.'
      )
    ).toBe('One Less Hubmate. Two hubmates and HUBMATES remain. The House of Cards alliance stays.')
  })
})
