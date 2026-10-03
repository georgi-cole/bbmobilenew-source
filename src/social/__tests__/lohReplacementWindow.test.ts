import { describe, expect, it } from 'vitest'
import { isLohReplacementPending } from '../lohReplacementWindow'

describe('LOH replacement conversation window', () => {
  it('opens after a Safety save for human and AI leaders, then closes once named', () => {
    expect(
      isLohReplacementPending({ phase: 'pos_ceremony_results', replacementNeeded: true })
    ).toBe(true)
    expect(isLohReplacementPending({ phase: 'pos_ceremony_results', aiReplacementStep: 1 })).toBe(
      true
    )
    expect(isLohReplacementPending({ phase: 'pos_ceremony_results', aiReplacementStep: 2 })).toBe(
      true
    )
    expect(isLohReplacementPending({ phase: 'pos_ceremony_results', aiReplacementStep: 0 })).toBe(
      false
    )
    expect(isLohReplacementPending({ phase: 'pos_ceremony', replacementNeeded: true })).toBe(false)
  })
})
