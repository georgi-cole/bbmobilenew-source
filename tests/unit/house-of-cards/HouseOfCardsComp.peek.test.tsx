import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HouseOfCardsComp from '../../../src/components/HouseOfCardsComp/HouseOfCardsComp'
import {
  buildHouseOfCardsBoard,
  buildPortraitPairBoard,
  chooseHouseOfCardsAiPair,
  chooseHouseOfCardsFinalWinner,
  getHouseOfCardsAttemptToolOffer,
  type HouseOfCardsRoundToolId,
} from '../../../src/components/HouseOfCardsComp/houseOfCardsUtils'
import houseOfCardsReducer, {
  HOUSE_OF_CARDS_TILE_COUNTS,
} from '../../../src/features/houseOfCards/houseOfCardsSlice'

function seedWithTool(tool: HouseOfCardsRoundToolId): number {
  return Array.from({ length: 100 }, (_, seed) => seed).find((seed) =>
    getHouseOfCardsAttemptToolOffer(seed).includes(tool)
  )!
}

function makeStore() {
  return configureStore({
    reducer: {
      game: (state = { phase: 'loh_comp' }) => state,
      houseOfCards: houseOfCardsReducer,
    },
  })
}

function renderGame(seed = 42, premiumPresentation = false) {
  const store = makeStore()
  render(
    <Provider store={store}>
      <HouseOfCardsComp
        participantIds={['human']}
        participants={[{ id: 'human', name: 'You', isHuman: true }]}
        prizeType="LOH"
        seed={seed}
        premiumPresentation={premiumPresentation}
      />
    </Provider>
  )
  return store
}

function getPairIndexes(seed: number, pairCount: number): number[][] {
  const bySymbol = new Map<string, number[]>()
  buildHouseOfCardsBoard(seed, pairCount).forEach((card) => {
    bySymbol.set(card.symbol, [...(bySymbol.get(card.symbol) ?? []), card.index])
  })
  return [...bySymbol.values()]
}

describe('Deck of Light — four preliminaries and a finale', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the requested board sizes and has an elapsed timer with no cutoff', () => {
    expect(HOUSE_OF_CARDS_TILE_COUNTS).toEqual([8, 12, 16, 20, 24])
    renderGame()
    fireEvent.click(screen.getByRole('button', { name: /^Peek/ }))

    expect(screen.getByText('Round 1/5')).toBeInTheDocument()
    expect(screen.getByText('8 tiles')).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(8)

    act(() => vi.advanceTimersByTime(61_000))
    expect(screen.getByText('61s')).toBeInTheDocument()
    expect(screen.getByText('Elapsed · no limit')).toBeInTheDocument()
    expect(screen.getByLabelText('Round 1 card grid')).toBeInTheDocument()
  })

  it('reveals a candidate privately without consuming the pending first flip', () => {
    renderGame()
    fireEvent.click(screen.getByRole('button', { name: /^Peek/ }))
    const [first, candidate] = screen.getAllByRole('gridcell')
    fireEvent.click(first)
    fireEvent.click(screen.getByRole('button', { name: 'Use Peek' }))
    fireEvent.click(candidate)
    expect(candidate).toHaveAttribute('data-flipped', 'true')
    expect(candidate).not.toHaveAccessibleName('Hidden card')
    expect(first).toHaveAttribute('data-flipped', 'true')
    act(() => vi.advanceTimersByTime(1_150))
    expect(candidate).toHaveAccessibleName('Hidden card')

    expect(screen.queryByRole('button', { name: 'Use Peek' })).not.toBeInTheDocument()
    expect(first).toHaveAttribute('data-flipped', 'true')
    expect(screen.getByText('0s')).toBeInTheDocument()
  })

  it('allows a blind Bonus Bet after the halfway point', () => {
    const seed = seedWithTool('bonus-bet')
    renderGame(seed)
    fireEvent.click(screen.getByRole('button', { name: /^Bonus Bet/ }))
    const cards = screen.getAllByRole('gridcell')
    const pairs = getPairIndexes(seed, 4)

    for (const [first, second] of pairs.slice(0, 2)) {
      fireEvent.click(cards[first])
      expect(screen.getByRole('button', { name: 'Arm Bonus Bet' })).toBeDisabled()
      fireEvent.click(cards[second])
      act(() => vi.advanceTimersByTime(260))
    }

    fireEvent.click(screen.getByRole('button', { name: 'Arm Bonus Bet' }))
    fireEvent.click(cards[pairs[2][0]])
    fireEvent.click(cards[pairs[2][1]])
    expect(screen.getByText('+150')).toBeInTheDocument()
  })

  it('rejects either previously seen card in an armed bet even after it is hidden again', () => {
    renderGame(seedWithTool('bonus-bet'))
    fireEvent.click(screen.getByRole('button', { name: /^Bonus Bet/ }))
    const [[first, freshMate], [other], [freshOther]] = getPairIndexes(seedWithTool('bonus-bet'), 4)
    const cards = screen.getAllByRole('gridcell')
    fireEvent.click(cards[first])
    fireEvent.click(cards[other])
    act(() => vi.advanceTimersByTime(1_400))

    fireEvent.click(screen.getByRole('button', { name: 'Arm Bonus Bet' }))
    expect(cards[first]).toBeDisabled()
    expect(cards[other]).toBeDisabled()
    expect(cards[freshMate]).toBeEnabled()
    fireEvent.click(cards[first])
    expect(cards[first]).toHaveAttribute('data-flipped', 'false')

    fireEvent.click(cards[freshMate])
    fireEvent.click(cards[first])
    expect(screen.queryByText('+150')).not.toBeInTheDocument()
    expect(cards[freshMate]).toHaveAttribute('data-flipped', 'true')
    fireEvent.click(cards[freshOther])
    expect(screen.getByText('-120')).toBeInTheDocument()
  })

  it.each([false, true])(
    'keeps an attempted pair visible and selectable with premium=%s',
    (premium) => {
      renderGame(42, premium)
      fireEvent.click(screen.getByRole('button', { name: /^Keep Open/ }))
      if (premium) act(() => vi.advanceTimersByTime(2_000))
      const [[first, mate], [other, otherMate]] = getPairIndexes(42, 4)
      const cards = screen.getAllByRole('gridcell')
      fireEvent.click(screen.getByRole('button', { name: 'Arm Keep Open' }))
      fireEvent.click(cards[first])
      fireEvent.click(cards[other])
      act(() => vi.advanceTimersByTime(1_400))

      for (const index of [first, other]) {
        expect(cards[index]).toHaveAttribute('data-flipped', 'true')
        expect(cards[index]).toHaveAttribute('data-kept-open', 'true')
        expect(cards[index]).toBeEnabled()
      }
      expect(screen.queryByRole('button', { name: 'Arm Keep Open' })).not.toBeInTheDocument()

      fireEvent.click(cards[first])
      fireEvent.click(cards[first])
      expect(cards[first]).toHaveAttribute('data-matched', 'false')
      fireEvent.click(cards[mate])
      expect(cards[first]).toHaveAttribute('data-matched', 'true')
      act(() => vi.advanceTimersByTime(260))
      fireEvent.click(cards[other])
      fireEvent.click(cards[otherMate])
      expect(cards[other]).toHaveAttribute('data-matched', 'true')
    }
  )

  it.each([false, true])('replays two random seen hidden cards once with premium=%s', (premium) => {
    renderGame(42, premium)
    fireEvent.click(screen.getByRole('button', { name: /^Replay/ }))
    if (premium) act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByRole('button', { name: 'Use Replay' })).toBeDisabled()
    const pairs = getPairIndexes(42, 4)
    const cards = screen.getAllByRole('gridcell')
    const seen = pairs.map((pair) => pair[0])
    for (const [first, second] of [
      [seen[0], seen[1]],
      [seen[2], seen[3]],
    ]) {
      fireEvent.click(cards[first])
      fireEvent.click(cards[second])
      act(() => vi.advanceTimersByTime(1_400))
    }
    fireEvent.click(cards[pairs[0][0]])
    fireEvent.click(cards[pairs[0][1]])
    act(() => vi.advanceTimersByTime(260))

    fireEvent.click(screen.getByRole('button', { name: 'Use Replay' }))
    const replayed = cards.filter((card) => card.getAttribute('data-replayed') === 'true')
    expect(replayed).toHaveLength(2)
    for (const card of replayed) {
      expect(seen.slice(1)).toContain(cards.indexOf(card))
      expect(card).toHaveAttribute('data-flipped', 'true')
      expect(card).toHaveAttribute('data-matched', 'false')
      expect(card).toBeDisabled()
    }
    for (const [, unseen] of pairs.slice(1)) {
      expect(cards[unseen]).toHaveAccessibleName('Hidden card')
    }
    act(() => vi.advanceTimersByTime(1_150))
    expect(screen.queryByRole('button', { name: 'Use Replay' })).not.toBeInTheDocument()
    for (const card of replayed) {
      expect(card).toHaveAttribute('data-flipped', 'false')
      expect(card).toBeEnabled()
    }
  })

  it('scores a clean Peek board without a Bright Pair award', () => {
    const seed = 42
    renderGame(seed)
    fireEvent.click(screen.getByRole('button', { name: /^Peek/ }))
    const cards = screen.getAllByRole('gridcell')
    for (const [first, second] of getPairIndexes(seed, 4)) {
      fireEvent.click(cards[first])
      fireEvent.click(cards[second])
      act(() => vi.advanceTimersByTime(260))
    }
    expect(screen.getByLabelText('Round 1 standings')).not.toHaveTextContent('Bright Pair')
    expect(screen.getByLabelText('Round 1 standings')).toHaveTextContent('4,060')
  })

  it('deducts one Shield miss in the opening rounds and two in round three', () => {
    const seed = seedWithTool('shield')
    renderGame(seed)
    for (let round = 1; round <= 3; round += 1) {
      fireEvent.click(screen.getByRole('button', { name: /^Shield/ }))
      const boardSeed = round === 1 ? seed : seed ^ Math.imul(round, 0x85ebca6b)
      const pairs = getPairIndexes(boardSeed, HOUSE_OF_CARDS_TILE_COUNTS[round - 1] / 2)
      const cards = screen.getAllByRole('gridcell')
      for (let miss = 0; miss < 3; miss += 1) {
        fireEvent.click(cards[pairs[0][0]])
        fireEvent.click(cards[pairs[1][0]])
        act(() => vi.advanceTimersByTime(1_400))
      }
      const allowance = round <= 2 ? 1 : 2
      expect(screen.getByText(`${allowance}/${allowance} misses deducted.`)).toBeInTheDocument()
      expect(screen.getByText('Misses').parentElement).toHaveTextContent(String(3 - allowance))
      for (const [first, second] of pairs) {
        fireEvent.click(cards[first])
        fireEvent.click(cards[second])
        act(() => vi.advanceTimersByTime(260))
      }
      expect(screen.getByLabelText(`Round ${round} standings`)).toHaveTextContent(
        `${3 - allowance} misses`
      )
      if (round < 3) fireEvent.click(screen.getByRole('button', { name: 'Next round' }))
    }
  })

  it.each([
    { match: true, delta: '+150' },
    { match: false, delta: '-120' },
  ])('pays $delta when the armed attempt has match=$match', ({ match, delta }) => {
    const seed = seedWithTool('bonus-bet')
    renderGame(seed)
    fireEvent.click(screen.getByRole('button', { name: /^Bonus Bet/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Arm Bonus Bet' }))
    const [[first, mate], [other]] = getPairIndexes(seed, 4)
    const cards = screen.getAllByRole('gridcell')

    fireEvent.click(cards[first])
    fireEvent.click(cards[match ? mate : other])

    expect(screen.getByText(delta)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arm Bonus Bet' })).not.toBeInTheDocument()
  })

  it('expands the chosen premium charm before it deals the board', () => {
    renderGame(42, true)
    fireEvent.click(screen.getByRole('button', { name: /^Peek/ }))

    expect(document.querySelector('.hoc-root')).toHaveAttribute('data-tool-transition', 'expand')
    expect(
      screen.getByText(
        'Scout early or check a candidate after your first flip, before committing to a pair.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Shield/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Round 1 card grid')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(620))
    expect(screen.getByLabelText('Round 1 card grid')).toBeInTheDocument()
    expect(document.querySelector('.hoc-board-wrap')).toHaveAttribute(
      'data-tool-transition',
      'deal'
    )
    expect(document.querySelectorAll('.hoc-charm-clone')).toHaveLength(8)
    expect(document.querySelector('.hoc-charm-clone-layer')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelectorAll('.hoc-charm-copy')).toHaveLength(8)
    expect(document.querySelectorAll('.hoc-charm-clone__back-face')).toHaveLength(8)
    expect(
      screen.getAllByText(
        'Scout early or check a candidate after your first flip, before committing to a pair.'
      )
    ).toHaveLength(8)
    expect(document.querySelectorAll('.hoc-board > .hoc-card')).toHaveLength(8)
    expect(
      (document.querySelector('.hoc-charm-clone') as HTMLElement).style.getPropertyValue(
        '--charm-start-x'
      )
    ).toMatch(/^-?\d+(\.\d+)?px$/)

    act(() => vi.advanceTimersByTime(1_200))
    expect(document.querySelector('.hoc-root')).toHaveAttribute('data-tool-transition', 'landed')
    expect(document.querySelectorAll('.hoc-charm-clone')).toHaveLength(0)
    expect(screen.getAllByRole('gridcell')).toHaveLength(8)
    expect(
      screen.getAllByRole('gridcell').every((card) => !(card as HTMLButtonElement).disabled)
    ).toBe(true)
  })

  it('advances from the 8-tile first round to the 12-tile second round', async () => {
    const seed = 42
    renderGame(seed)
    fireEvent.click(screen.getByRole('button', { name: /^Peek/ }))
    const pairs = getPairIndexes(seed, 4)

    for (const pair of pairs) {
      await act(async () => {
        fireEvent.click(screen.getAllByRole('gridcell')[pair[0]])
      })
      await act(async () => {
        fireEvent.click(screen.getAllByRole('gridcell')[pair[1]])
      })
      act(() => vi.advanceTimersByTime(260))
    }

    expect(screen.getByText('Round 1 complete')).toBeInTheDocument()
    const resultsPanel = document.querySelector('.hoc-round-results-panel')
    expect(resultsPanel).not.toBeNull()
    expect(resultsPanel).toContainElement(screen.getByRole('heading', { name: 'Round 1 complete' }))
    expect(resultsPanel?.querySelector('.minigame-continue-area button')).toHaveAttribute(
      'aria-label',
      'Next round'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next round' }))
    fireEvent.click(screen.getByRole('button', { name: /^Peek/ }))
    expect(screen.getByText('Round 2/5')).toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')).toHaveLength(12)
  })

  it('uses preliminary totals only when final pair points are tied', () => {
    expect(
      chooseHouseOfCardsFinalWinner(
        ['alice', 'bob'],
        { alice: 7, bob: 6 },
        { alice: 100, bob: 900 }
      )
    ).toBe('alice')
    expect(
      chooseHouseOfCardsFinalWinner(
        ['alice', 'bob'],
        { alice: 7, bob: 7 },
        { alice: 100, bob: 900 }
      )
    ).toBe('bob')
  })

  it('lets a finalist keep matching until a miss passes the turn', async () => {
    const seed = 42
    const participants = [
      { id: 'human', name: 'Quartz', isHuman: true },
      { id: 'rival', name: 'Remy', isHuman: false },
    ]
    render(
      <Provider store={makeStore()}>
        <HouseOfCardsComp
          participantIds={participants.map(({ id }) => id)}
          participants={participants}
          prizeType="LOH"
          seed={seed}
          previewStage="final"
        />
      </Provider>
    )

    fireEvent.click(screen.getByRole('button', { name: /^Open the duel/ }))
    const finalBoardSeed = seed ^ Math.imul(5, 0x85ebca6b)
    const board = buildPortraitPairBoard(
      finalBoardSeed,
      6,
      participants.map(({ id, name }) => ({ id, name })),
      ['human', 'rival']
    )
    const indexesBySymbol = new Map<string, number[]>()
    board.forEach((card) => {
      indexesBySymbol.set(card.symbol, [...(indexesBySymbol.get(card.symbol) ?? []), card.index])
    })
    const pairs = [...indexesBySymbol.values()]
    const cards = screen.getAllByRole('gridcell')

    for (const pair of pairs.slice(0, 3)) {
      await act(async () => {
        fireEvent.click(cards[pair[0]])
      })
      await act(async () => {
        fireEvent.click(cards[pair[1]])
      })
      act(() => vi.advanceTimersByTime(260))
    }

    expect(document.querySelector('.hoc-final-score')?.textContent).toContain('Quartz: 3')
    expect(document.querySelector('.hoc-final-score')?.textContent).toContain("Quartz's turn")

    const matchedIndexes = new Set(pairs.slice(0, 3).flat())
    const unmatched = board.filter((card) => !matchedIndexes.has(card.index))
    const firstUnmatched = unmatched[0]!
    const mismatch = [
      firstUnmatched,
      unmatched.find((card) => card.symbol !== firstUnmatched.symbol)!,
    ]
    await act(async () => {
      fireEvent.click(cards[mismatch[0].index])
    })
    await act(async () => {
      fireEvent.click(cards[mismatch[1].index])
    })
    act(() => vi.advanceTimersByTime(1_400))

    expect(document.querySelector('.hoc-final-score')?.textContent).toContain("Remy's turn")
  })

  it('makes a finalist discover a fresh board instead of reading hidden matches', () => {
    const board = buildHouseOfCardsBoard(2026, 12)
    let firstTurnMatches = 0

    for (let seed = 1; seed <= 120; seed += 1) {
      const pair = chooseHouseOfCardsAiPair({
        board,
        rememberedIndexes: new Set(),
        seed,
        skill: 60,
      })
      expect(pair).not.toBeNull()
      if (pair && board[pair[0]].symbol === board[pair[1]].symbol) firstTurnMatches += 1
    }

    expect(firstTurnMatches).toBeLessThan(25)
  })

  it('does not turn a fully observed final board into near-perfect AI play', () => {
    const board = buildHouseOfCardsBoard(2026, 12)
    const rememberedIndexes = new Set(board.map((card) => card.index))
    let matches = 0

    for (let seed = 1; seed <= 500; seed += 1) {
      const pair = chooseHouseOfCardsAiPair({
        board,
        rememberedIndexes,
        seed,
        skill: 55,
      })
      expect(pair).not.toBeNull()
      if (pair && board[pair[0]].symbol === board[pair[1]].symbol) matches += 1
    }

    expect(matches / 500).toBeGreaterThan(0.25)
    expect(matches / 500).toBeLessThan(0.6)
  })
})
