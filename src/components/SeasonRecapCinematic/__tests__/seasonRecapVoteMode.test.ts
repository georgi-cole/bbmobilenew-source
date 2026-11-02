import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../../store/gameSlice'
import { buildSeasonRecapData } from '../seasonRecapData'

const players = createInitialGameState({ seed: 331 }).players

describe('pre-verdict season recap', () => {
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
