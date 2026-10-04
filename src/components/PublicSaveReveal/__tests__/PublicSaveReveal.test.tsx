import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { CupidArrowPair, Player } from '../../../types'
import { store } from '../../../store/store'
import { setGameUX } from '../../../store/settingsSlice'
import { normalisePublicSaveVoteShares } from '../../../publicOpinion/PublicSaveService'
import PublicSaveReveal from '../PublicSaveReveal'

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    avatar: '🧑',
    status: 'nominated',
  }
}

const nominees = [makePlayer('p1', 'Blue'), makePlayer('p2', 'Kian'), makePlayer('p3', 'Georgi')]

const rawApprovals = {
  p1: 42,
  p2: 43,
  p3: 50,
}

function formatShare(value: number): string {
  const rounded = Number(value.toFixed(4))
  const formatted = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return `${formatted}%`
}

function advanceReveal(ms = 5000): void {
  act(() => {
    vi.advanceTimersByTime(900)
  })
  act(() => {
    vi.advanceTimersByTime(20)
  })
  if (ms > 920) {
    act(() => {
      vi.advanceTimersByTime(ms - 920)
    })
  }
}

describe('PublicSaveReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
      window.setTimeout(() => callback(performance.now() + 5000), 16)
    )
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => window.clearTimeout(id))
    document.body.classList.remove('no-animations')
    store.dispatch(setGameUX({ dramaMode: false }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.classList.remove('no-animations')
  })

  it('keeps vote shares hidden until the existing five-second reveal point', () => {
    const expectedShares = normalisePublicSaveVoteShares(
      nominees.map((nominee) => nominee.id),
      rawApprovals
    )

    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ ...rawApprovals }}
        savedId="p3"
        onDone={vi.fn()}
      />
    )

    expect(screen.getAllByText('—')).toHaveLength(3)

    advanceReveal()

    expect(screen.queryByText('—')).toBeNull()
    nominees.forEach((nominee) => {
      expect(screen.getByText(formatShare(expectedShares[nominee.id]))).toBeTruthy()
    })
  })

  it('explains an exact audience-score tie when the tie rules settle the save', () => {
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ p1: 25, p2: 50, p3: 50 }}
        savedId="p3"
        tieBreakUsed
        onDone={vi.fn()}
      />
    )

    advanceReveal()

    expect(screen.getAllByText('40%')).toHaveLength(2)
    expect(screen.queryByText('40.1%')).toBeNull()
    expect(screen.queryByText('39.9%')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(
      screen.getByText(
        'Audience scores tied. Season average, completed goals, then stable player order settled the save.'
      )
    ).toBeTruthy()
  })

  it('shows distinct four-decimal shares for close but different scores', () => {
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ p1: 25, p2: 50, p3: 50.01 }}
        savedId="p3"
        onDone={vi.fn()}
      />
    )

    advanceReveal(7600)

    expect(screen.getByText('39.9968%')).toBeTruthy()
    expect(screen.getByText('40.0048%')).toBeTruthy()
    expect(screen.queryByText(/round to a tie/)).toBeNull()
  })

  it('explains when displayed shares match at the reveal precision', () => {
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ p1: 25, p2: 50, p3: 50 }}
        savedId="p3"
        onDone={vi.fn()}
      />
    )

    advanceReveal(7600)

    expect(screen.getAllByText('40%')).toHaveLength(2)
    expect(
      screen.getByText(
        'These shares match at 0.0001% precision. The saved result follows the full audience-ballot calculation.'
      )
    ).toBeTruthy()
  })

  it('preserves the original timing and saved-player treatment', () => {
    const onDone = vi.fn()
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ ...rawApprovals }}
        savedId="p3"
        onDone={onDone}
      />
    )

    act(() => {
      vi.advanceTimersByTime(7600)
    })
    expect(document.querySelector('.psr__nominee--saved')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2399)
    })
    expect(onDone).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('hands the existing result flow vote shares that total exactly 100%', () => {
    const approvals = { ...rawApprovals }
    const onDone = vi.fn()

    render(
      <PublicSaveReveal nominees={nominees} approvals={approvals} savedId="p3" onDone={onDone} />
    )

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(Object.values(approvals).reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(approvals.p3).toBeGreaterThan(approvals.p2)
  })

  it('uses the original Normal Mode visual when Drama Mode is enabled', () => {
    const currentState = store.getState()
    vi.spyOn(store, 'getState').mockReturnValue({
      ...currentState,
      game: {
        ...currentState.game,
        publicModeEnabled: true,
      },
      settings: {
        ...currentState.settings,
        gameUX: {
          ...currentState.settings.gameUX,
          dramaMode: true,
        },
      },
    })

    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ ...rawApprovals }}
        savedId="p3"
        onDone={vi.fn()}
      />
    )

    expect(document.querySelector('.psr')).toBeTruthy()
    expect(document.querySelector('.avr')).toBeNull()
    expect(screen.getAllByText('—')).toHaveLength(3)

    advanceReveal()

    expect(screen.queryByText('—')).toBeNull()
    expect(
      screen
        .getAllByText(/%$/)
        .map((element) => element.textContent)
        .filter(Boolean)
    ).toHaveLength(3)
  })

  it('groups six Cupid nominees into three readable pair cards with shared percentages', () => {
    const cupidNominees = Array.from({ length: 6 }, (_, index) =>
      makePlayer(`c${index + 1}`, `Cupid ${index + 1}`)
    )
    const pairs: CupidArrowPair[] = [
      { id: 'pair-1', memberIds: ['c1', 'c2'], color: '#ff5d8f' },
      { id: 'pair-2', memberIds: ['c3', 'c4'], color: '#5bbcff' },
      { id: 'pair-3', memberIds: ['c5', 'c6'], color: '#ffc857' },
    ]

    render(
      <PublicSaveReveal
        nominees={cupidNominees}
        approvals={{ c1: 70, c2: 70, c3: 50, c4: 50, c5: 30, c6: 30 }}
        savedId="c1"
        pairs={pairs}
        onDone={vi.fn()}
      />
    )

    expect(document.querySelectorAll('.psr__nominee')).toHaveLength(3)
    expect(document.querySelectorAll('.psr__avatar-member')).toHaveLength(6)
    expect(screen.getByText('Cupid 1 & Cupid 2')).toBeTruthy()
    expect(screen.getAllByText('—')).toHaveLength(3)

    advanceReveal()

    expect(screen.queryByText('—')).toBeNull()
    expect(screen.getByText('46.6666%')).toBeTruthy()
  })
})
