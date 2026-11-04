import { describe, expect, it } from 'vitest'
import { removeNominationOrdinalLabels } from './nomination-labels'

describe('nomination label cleanup', () => {
  it('removes every redundant ordinal without removing names or attribution', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<div class="nom-label"><span>01</span>NOMINATED</div><div class="nom-label"><span>02</span>NOMINATED</div><div class="nom-label"><span>03</span>NOMINATED</div><div class="nom-label">Ash &amp; Lux</div><div class="replacement-name">Sol · Chosen by Rune</div>'
    removeNominationOrdinalLabels(root)
    expect(root.querySelectorAll('.nom-label')).toHaveLength(1)
    expect(root.textContent).toBe('Ash & LuxSol · Chosen by Rune')
  })
})
