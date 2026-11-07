import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MinigameHost from '../MinigameHost'
import { getGame } from '../../../minigames/registry'
import { store } from '../../../store/store'
import { hydrateChallenge, type PendingChallenge } from '../../../store/challengeSlice'
import { initializeVip, restoreVip } from '../../../store/vipSlice'
import { createEmptyStoreEntitlements } from '../../../vip/vipStorage'

vi.hoisted(() => {
  vi.stubEnv('VITE_VIP_DEV_ENTITLEMENT', 'false')
  vi.stubEnv('VITE_BUILD_TARGET', 'release')
})
vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(), stop: vi.fn() },
}))
vi.mock('../../../store/store', async () => ({
  ...(await vi.importActual<typeof import('../../../store/store')>('../../../store/store')),
  persistCompetitionCheckpoint: vi.fn(async () => true),
}))
vi.mock('../../../minigames/reactComponents', () => ({
  preloadReactMinigame: vi.fn(async () => undefined),
  default: new Proxy(
    {},
    {
      get: () => (props: { vipQuickTap?: boolean }) => (
        <div data-testid="edition-game" data-premium={String(props.vipQuickTap)} />
      ),
    }
  ),
}))
vi.mock('../../../minigames/quickTapRace/presentations', () => ({
  preloadQuickTapRace: vi.fn(async () => undefined),
}))

function snapshot(premium: boolean) {
  return {
    isActive: false,
    billingAvailable: false,
    entitlements: { ...createEmptyStoreEntitlements(), premiumChallenges: premium },
    products: {},
    verifiedAt: '2026-10-31T00:00:00.000Z',
  }
}

function prepare(key: string, premium: boolean) {
  store.dispatch(initializeVip.fulfilled(snapshot(premium), 'initial', undefined))
  const players = store.getState().game.players.slice(0, 2)
  const pending: PendingChallenge = {
    id: 'saved-edition',
    game: getGame(key)!,
    seed: 921,
    participants: players.map((player) => player.id),
    phase: 'rules',
    aiScores: { [players[1].id]: 93 },
    quickTapVariant: premium ? 'vip' : 'classic',
    prizeType: 'POS',
  }
  store.dispatch(hydrateChallenge({ ...store.getState().challenge, pending }))
  return pending
}

function mount(pending: PendingChallenge) {
  return render(
    <Provider store={store}>
      <MinigameHost
        game={pending.game}
        gameOptions={{ sessionId: pending.id }}
        skipRules
        skipCountdown
        onDone={vi.fn()}
      />
    </Provider>
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe.each(['quickTap', 'quickTapSeasons'])('%s edition resume screen', (key) => {
  it('waits for purchase restoration and preserves a premium edition when access returns', async () => {
    const pending = prepare(key, true)
    store.dispatch(restoreVip.pending('restore', undefined))
    mount(pending)
    expect(screen.getByText('Checking your challenge edition')).toBeVisible()
    expect(screen.queryByTestId('edition-game')).toBeNull()
    await act(async () => {
      store.dispatch(restoreVip.fulfilled(snapshot(true), 'restore', undefined))
    })
    expect(await screen.findByTestId('edition-game')).toHaveAttribute('data-premium', 'true')
    expect(screen.queryByText('Challenge edition updated')).toBeNull()
  })

  it('explains a downgrade before starting and keeps the selected edition stable during play', async () => {
    const pending = prepare(key, true)
    store.dispatch(initializeVip.fulfilled(snapshot(false), 'removed', undefined))
    mount(pending)
    expect(await screen.findByText('Challenge edition updated')).toBeVisible()
    expect(screen.queryByTestId('edition-game')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Review rules' }))
    expect(await screen.findByTestId('edition-game')).toHaveAttribute('data-premium', 'false')
    await act(async () => {
      store.dispatch(initializeVip.fulfilled(snapshot(true), 'bought', undefined))
    })
    expect(screen.getByTestId('edition-game')).toHaveAttribute('data-premium', 'false')
  })

  it('offers an offline continuation instead of trapping the player after a failed purchase check', async () => {
    const pending = prepare(key, true)
    store.dispatch(initializeVip.rejected(new Error('Offline'), 'offline', undefined))
    mount(pending)
    fireEvent.click(screen.getByRole('button', { name: 'Continue offline' }))
    expect(await screen.findByTestId('edition-game')).toHaveAttribute('data-premium', 'true')
  })

  it('also offers offline continuation if purchase restoration never responds', async () => {
    vi.useFakeTimers()
    const pending = prepare(key, true)
    store.dispatch(restoreVip.pending('stalled', undefined))
    mount(pending)
    expect(screen.queryByRole('button', { name: 'Continue offline' })).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue offline' }))
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(0)
    })
    expect(store.getState().challenge.pending?.needsEditionReconciliation).toBe(false)
    expect(store.getState().challenge.pending?.quickTapVariant).toBe('vip')
  })
})
