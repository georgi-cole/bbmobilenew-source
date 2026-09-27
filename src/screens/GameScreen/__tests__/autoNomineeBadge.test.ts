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

  it('uses Vox immunity results and does not leak the badge into later phases', () => {
    const base = {
      isVoxPopuli: true,
      publicAutoNomineeId: 'wrong-public-id',
      voxAutoNomineeId: 'vox-last-place',
      lastHohCompFinisherId: 'fallback-finisher',
    }

    expect(getImmediateAutoNomineeId({ ...base, phase: 'loh_results' })).toBe('vox-last-place')
    expect(getImmediateAutoNomineeId({ ...base, phase: 'nominations' })).toBeNull()
  })
})
