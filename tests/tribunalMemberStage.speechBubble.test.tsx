import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TribunalMemberStage from '../src/components/TribunalMemberStage/TribunalMemberStage'

describe('TribunalMemberStage ballot', () => {
  it('uses Bea’s formal portrait during the paired entrance and ballot reveal', () => {
    const bea = { id: 'bea', name: 'Bea', avatar: '', status: 'jury' as const }
    const { container, rerender } = render(
      <TribunalMemberStage
        mode="opening"
        paired
        waitingForOpeningCue
        tribunalMembers={[bea]}
        finalists={[]}
        onCastVote={() => {}}
      />
    )
    expect(container.querySelector('.tms-pair img')?.getAttribute('src')).toMatch(
      /Bea_formal\.webp$/i
    )
    rerender(
      <TribunalMemberStage
        mode="reveal"
        beat="recipient"
        ballot={{
          voter: bea,
          voterId: bea.id,
          voterName: bea.name,
          finalistName: 'Avery',
          number: 1,
          tone: 'gold',
        }}
      />
    )
    expect(container.querySelector('.tms-cutout')?.getAttribute('src')).toMatch(
      /Bea_formal\.webp$/i
    )
  })

  it('shows the juror footage beside the actual ballot recipient', () => {
    const { container } = render(
      <TribunalMemberStage
        mode="reveal"
        ballot={{
          voter: { id: 'j1', name: 'Casey', avatar: '', status: 'jury' },
          voterId: 'j1',
          voterName: 'Casey',
          finalistName: 'Avery',
          number: 1,
          tone: 'gold',
        }}
      />
    )

    const cutout = container.querySelector('.tms-cutout-wrap')
    const ballot = screen.getByText('Votes for').parentElement
    expect(cutout?.querySelector('img')).toBeTruthy()
    expect(cutout?.contains(ballot ?? null)).toBe(false)
    expect(ballot?.textContent).toBe('Votes forAvery')
    expect(screen.getByRole('status').textContent).toBe('Casey voted for Avery.')
    expect(screen.queryByText('Final word')).toBeNull()
  })
})
