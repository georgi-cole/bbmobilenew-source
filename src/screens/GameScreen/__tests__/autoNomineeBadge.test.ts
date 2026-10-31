import { describe, expect, it } from 'vitest'
import { getImmediateAutoNomineeId } from '../autoNomineeBadge'

describe('immediate automatic-nominee badge', () => {
  it('identifies the last-place finisher as soon as LOH results are shown', () => {
    expect(
      getImmediateAutoNomineeId({
        phase: 'loh_results',
        isVoxPopuli: false,
        publicAutoNomineeId: 'last-place',
        voxAutoNomineeId: null,
        lastHohCompFinisherId: 'last-place',
      })
    ).toBe('last-place')
  })

  it('keeps the Vox last-place badge through nominations and does not leak into later phases', () => {
    const base = {
      isVoxPopuli: true,
      publicAutoNomineeId: 'wrong-public-id',
      voxAutoNomineeId: 'vox-last-place',
      lastHohCompFinisherId: 'fallback-finisher',
    }

    expect(getImmediateAutoNomineeId({ ...base, phase: 'loh_results' })).toBe('vox-last-place')
    expect(getImmediateAutoNomineeId({ ...base, phase: 'social_1' })).toBe('vox-last-place')
    expect(getImmediateAutoNomineeId({ ...base, phase: 'nominations' })).toBe('vox-last-place')
    expect(getImmediateAutoNomineeId({ ...base, phase: 'nomination_results' })).toBe(
      'vox-last-place'
    )
    expect(getImmediateAutoNomineeId({ ...base, phase: 'social_2' })).toBe('vox-last-place')
    expect(getImmediateAutoNomineeId({ ...base, phase: 'pos_comp' })).toBeNull()
  })
})
