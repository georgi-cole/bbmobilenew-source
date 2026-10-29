import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HouseOfDarknessComp from '../../../src/components/HouseOfDarknessComp/HouseOfDarknessComp'
import {
  buildHouseOfDarknessBoard,
  getHouseOfDarknessMistakeDamage,
  getHouseOfDarknessOmen,
} from '../../../src/components/HouseOfDarknessComp/houseOfDarknessUtils'

vi.mock('../../../src/services/sound/SoundManager', () => ({
  SoundManager: {
    play: vi.fn().mockResolvedValue(undefined),
  },
}))

const participants = [
  { id: 'human', name: 'Georgi', isHuman: true, precomputedScore: 0, previousPR: null },
  ...Array.from({ length: 7 }, (_, index) => ({
    id: `ai-${index + 1}`,
    name: `AI ${index + 1}`,
    isHuman: false,
    precomputedScore: 0,
    previousPR: null,
  })),
]

function startDepthRound(container: HTMLElement) {
  fireEvent.click(screen.getByRole('button', { name: /Depth Run/ }))
  const peek = container.querySelector<HTMLButtonElement>('.hod-charm-choice--peek')
  expect(peek).toBeTruthy()
  fireEvent.click(peek!)
}

describe('HouseOfDarknessComp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers a run choice, then renders the four-pair opening board and survival HUD', () => {
    const { container } = render(
      <HouseOfDarknessComp
        participantIds={participants.map((participant) => participant.id)}
        participants={participants}
        seed={1234}
      />
    )

    expect(screen.getByText('Deck of Darkness')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Depth Run/ })).toBeInTheDocument()
    startDepthRound(container)
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
    expect(container.querySelector('.hod-hud')).toHaveTextContent('4 pairs')
    expect(container.querySelectorAll('.hod-card:not(.hod-card--placeholder)')).toHaveLength(8)
  })

  it('clones a selected charm into the VIP board before the cards become playable', async () => {
    vi.useFakeTimers()
    try {
      const { container } = render(
        <HouseOfDarknessComp
          participantIds={participants.map((participant) => participant.id)}
          participants={participants}
          seed={1234}
          premiumPresentation
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /Depth Run/ }))
      const peek = container.querySelector<HTMLButtonElement>('.hod-charm-choice--peek')
      expect(peek).toBeTruthy()
      fireEvent.click(peek!)
      expect(container.querySelector('.hod-root')).toHaveAttribute(
        'data-charm-transition',
        'expand'
      )

      await act(async () => {
        vi.advanceTimersByTime(620)
      })

      expect(container.querySelector('.hod-root')).toHaveAttribute('data-phase', 'playing')
      expect(container.querySelector('.hod-root')).toHaveAttribute('data-charm-transition', 'deal')
      expect(container.querySelectorAll('.hod-charm-clone')).toHaveLength(8)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('keeps the first chosen card face-up until a second card is selected', () => {
    const { container } = render(
      <HouseOfDarknessComp
        participantIds={participants.map((participant) => participant.id)}
        participants={participants}
        seed={3456}
      />
    )

    startDepthRound(container)
    const cards = [
      ...container.querySelectorAll<HTMLButtonElement>('.hod-card:not(.hod-card--placeholder)'),
    ]
    fireEvent.click(cards[0])

    expect(cards[0]).toHaveAttribute('data-flipped', 'true')
    expect(cards.filter((card) => card.getAttribute('data-flipped') === 'true')).toHaveLength(1)
  })

  it('applies the seeded round-one hit after a mismatched pair', async () => {
    const { container } = render(
      <HouseOfDarknessComp
        participantIds={participants.map((participant) => participant.id)}
        participants={participants}
        seed={9876}
      />
    )

    startDepthRound(container)
    const cards = [
      ...container.querySelectorAll<HTMLButtonElement>('.hod-card:not(.hod-card--placeholder)'),
    ]
    const board = buildHouseOfDarknessBoard(9876, 4)
    const firstIndex = board.findIndex((card) => !card.isPlaceholder)
    const secondIndex = board.findIndex(
      (card, index) =>
        index > firstIndex && !card.isPlaceholder && card.symbol !== board[firstIndex]!.symbol
    )
    const first = cards[firstIndex]
    const second = cards[secondIndex]
    expect(second).toBeTruthy()

    fireEvent.click(first)
    fireEvent.click(second!)

    const expectedDamage = getHouseOfDarknessMistakeDamage(
      9876,
      'human',
      1,
      0,
      getHouseOfDarknessOmen(1, 9876).damageBonus
    )
    await waitFor(() => {
      const lifeText = container.querySelector('.hod-life-copy strong')?.textContent ?? ''
      const life = Number.parseFloat(lifeText)
      expect(life).toBe(100 - expectedDamage)
    })
  })
})
