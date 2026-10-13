import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BatteryLow from '../../../src/components/VaultVerdict/VaultVerdict'
import { createInitialContestant } from '../../../src/components/VaultVerdict/vaultVerdictLogic'

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 90, previousPR: null },
  { id: 'ai-1', name: 'Kian', isHuman: false, precomputedScore: 80, previousPR: null },
  { id: 'ai-2', name: 'Mira', isHuman: false, precomputedScore: 70, previousPR: null },
  { id: 'ai-3', name: 'Jules', isHuman: false, precomputedScore: 60, previousPR: null },
]

const labParticipants = [
  { id: 'player-1', name: 'You', isHuman: true, precomputedScore: 100, previousPR: null },
  { id: 'player-2', name: 'AI 1', isHuman: false, precomputedScore: 91, previousPR: 83 },
  { id: 'player-3', name: 'AI 2', isHuman: false, precomputedScore: 82, previousPR: 76 },
  { id: 'player-4', name: 'AI 3', isHuman: false, precomputedScore: 73, previousPR: 69 },
]

function seedWithSpecialFifthPick() {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const contestant = createInitialContestant(labParticipants[0]!, 0, seed + 101)
    const firstFive = contestant.vaults.slice(0, 5)
    if (
      firstFive.slice(0, 4).every((battery) => !battery.specialEffect) &&
      firstFive[4]?.specialEffect &&
      !contestant.vaults[7]?.specialEffect
    ) {
      return seed
    }
  }
  throw new Error('Could not find a Battery Low seed with a special fifth reveal')
}

describe('Battery Low UI', () => {
  afterEach(() => vi.useRealTimers())

  it('renders the complete board and keeps the required gameplay information visible', () => {
    render(<BatteryLow seed={1226} participants={participants} />)

    expect(screen.getByRole('heading', { name: 'Battery Low' })).toBeInTheDocument()
    expect(screen.getByText('Choose a reserve battery')).toBeInTheDocument()
    expect(screen.getByText('Max charge remaining')).toBeInTheDocument()
    expect(screen.getByLabelText(/Battery Low broadcast stage/i)).toBeInTheDocument()
    expect(screen.getByText('The Eye Bank')).toBeInTheDocument()
    expect(screen.getByLabelText(/Elapsed time/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Battery \d+$/i })).toHaveLength(24)
  })

  it('uses an explicit Reserve state instead of the old MY marker', async () => {
    const user = userEvent.setup()
    render(<BatteryLow seed={1226} participants={participants} />)

    await user.click(screen.getByRole('button', { name: 'Battery 8' }))

    expect(await screen.findByRole('button', { name: 'Reserve battery 8' })).toBeInTheDocument()
    expect(screen.getByText('Reserve battery 8')).toBeInTheDocument()
    expect(screen.queryByText('MY')).not.toBeInTheDocument()
    expect(screen.getByText(/Round 1 · 5 picks left/i)).toBeInTheDocument()
  })

  it('holds the Bank Offer until the final battery reveal has been readable', async () => {
    vi.useFakeTimers()
    render(<BatteryLow seed={1226} participants={labParticipants} />)

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Battery 8' })))
    for (const number of [1, 2, 3, 4, 5]) {
      act(() => fireEvent.click(screen.getByRole('button', { name: `Battery ${number}` })))
    }

    expect(screen.queryByRole('dialog', { name: 'Bank Offer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Battery 5, opened/ })).toBeDisabled()
    expect(screen.getByText(/Round 1 · 0 picks left/i)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2599))
    expect(screen.queryByRole('dialog', { name: 'Bank Offer' })).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('dialog', { name: 'Bank Offer' })).toBeInTheDocument()
  })

  it('keeps a special-cell monitor reveal visible for three seconds before the offer', () => {
    vi.useFakeTimers()
    render(<BatteryLow seed={seedWithSpecialFifthPick()} participants={labParticipants} />)

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Battery 8' })))
    for (const number of [1, 2, 3, 4, 5]) {
      act(() => fireEvent.click(screen.getByRole('button', { name: `Battery ${number}` })))
    }

    const heroStage = screen.getByLabelText(/Battery Low broadcast stage/i)
    expect(heroStage.querySelector('.vault-verdict__hero-event')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Bank Offer' })).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2999))
    expect(heroStage.querySelector('.vault-verdict__hero-event')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Bank Offer' })).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(heroStage.querySelector('.vault-verdict__hero-event')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Bank Offer' })).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByRole('dialog', { name: 'Bank Offer' })).toBeInTheDocument()
  })
})
