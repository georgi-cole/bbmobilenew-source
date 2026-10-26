import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MinigameHost from '../components/MinigameHost/MinigameHost'
import QuickTapRace from '../components/QuickTapRace/QuickTapRace'
import QuickTapSeasonsEntry from '../screens/QuickTapSeasons/QuickTapSeasonsEntry'
import { getGame } from '../minigames/registry'
import { store } from '../store/store'
import gameReducer, { createInitialGameState, startMinigame } from '../store/gameSlice'
import settingsReducer from '../store/settingsSlice'
import challengeReducer, { startChallenge } from '../store/challengeSlice'
import vipReducer, { initializeVip } from '../store/vipSlice'
import { createEmptyStoreEntitlements } from './vipStorage'
import { PREMIUM_GAME_VARIANTS } from './paidGameCatalog'
import {
  scoreQuickTapVipAiOnly,
  simulateQuickTapVipAiRace,
} from '../minigames/quickTapRace/vip/quickTapVipLogic'

vi.hoisted(() => {
  vi.stubEnv('VITE_VIP_DEV_ENTITLEMENT', 'false')
  vi.stubEnv('VITE_BUILD_TARGET', 'release')
})

vi.mock('../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(), stop: vi.fn() },
}))
vi.mock('../components/HouseOfCardsComp/HouseOfCardsComp', () => ({
  default: (props: { premiumPresentation?: boolean }) => (
    <div data-testid="presentation" data-premium={String(props.premiumPresentation)} />
  ),
}))
vi.mock('../components/GlassBridgeComp/GlassBridgeComp', () => ({
  default: (props: { premium?: boolean }) => (
    <div data-testid="presentation" data-premium={String(props.premium)} />
  ),
}))
vi.mock('../minigames/crystalPathShattered/CrystalPathShatteredGame', () => ({
  default: (props: { premium?: boolean }) => (
    <div data-testid="presentation" data-premium={String(props.premium)} />
  ),
}))
vi.mock('../components/RiskWheelComp/RiskWheelComp', () => ({
  default: (props: { premiumPresentation?: boolean }) => (
    <div data-testid="presentation" data-premium={String(props.premiumPresentation)} />
  ),
}))
vi.mock('../minigames/reactComponents', () => ({
  preloadReactMinigame: vi.fn(async () => undefined),
  default: new Proxy(
    {},
    {
      get: () => (props: { premiumPresentation?: boolean; vipQuickTap?: boolean }) => (
        <div
          data-testid="presentation"
          data-premium={String(props.premiumPresentation || props.vipQuickTap)}
        />
      ),
    }
  ),
}))
vi.mock('../minigames/quickTapRace/vip/QuickTapRaceVip', () => ({
  default: () => <div>Premium Quick Tap</div>,
}))
vi.mock('../minigames/quickTapRace/QuickTapRaceCanvasGame', () => ({
  default: () => <div>Classic Quick Tap</div>,
}))
vi.mock('../screens/QuickTapSeasons/QuickTapSeasons', () => ({
  default: () => <div>Classic Quick Tap</div>,
}))
vi.mock('../minigames/quickTapRace/vip/quickTapVipLogic', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../minigames/quickTapRace/vip/quickTapVipLogic')>()
  return {
    ...actual,
    scoreQuickTapVipAiOnly: vi.fn(actual.scoreQuickTapVipAiOnly),
    simulateQuickTapVipAiRace: vi.fn(actual.simulateQuickTapVipAiRace),
  }
})

function snapshot(isActive: boolean, premiumChallenges: boolean) {
  return {
    billingAvailable: false,
    isActive,
    entitlements: { ...createEmptyStoreEntitlements(), premiumChallenges },
    products: {},
    verifiedAt: '2026-10-27T00:00:00.000Z',
  }
}

afterEach(cleanup)

describe.each([
  ['free', false, false, false],
  ['Premium Challenges', false, true, true],
  ['VIP', true, false, true],
] as const)('%s minigame access', (_label, vip, pack, expected) => {
  it.each(PREMIUM_GAME_VARIANTS)(
    'launches the correct $key presentation from the host',
    async (game) => {
      store.dispatch(initializeVip.fulfilled(snapshot(vip, pack), 'test', undefined))
      render(
        <Provider store={store}>
          <MinigameHost game={getGame(game.key)!} onDone={vi.fn()} skipRules skipCountdown />
        </Provider>
      )
      expect(await screen.findByTestId('presentation')).toHaveAttribute(
        'data-premium',
        String(expected)
      )
    }
  )

  it.each(['race', 'seasons'])('uses the same access for the direct Quick Tap %s entry', (mode) => {
    store.dispatch(initializeVip.fulfilled(snapshot(vip, pack), 'test', undefined))
    render(
      <Provider store={store}>
        {mode === 'race' ? <QuickTapRace /> : <QuickTapSeasonsEntry />}
      </Provider>
    )
    expect(
      screen.getByText(expected ? 'Premium Quick Tap' : 'Classic Quick Tap')
    ).toBeInTheDocument()
  })

  it.each(['quickTap', 'quickTapSeasons'])(
    'uses matching premium AI rules when scheduling %s',
    (key) => {
      vi.clearAllMocks()
      const game = createInitialGameState({ seed: 932 })
      game.players = [
        { id: 'p0', name: 'Player', avatar: '🙂', isUser: true, status: 'active' },
        { id: 'p1', name: 'Opponent', avatar: '🙂', isUser: false, status: 'active' },
      ]
      const launchStore = configureStore({
        reducer: {
          game: gameReducer,
          settings: settingsReducer,
          vip: vipReducer,
          challenge: challengeReducer,
        },
        preloadedState: { game },
      })
      launchStore.dispatch(initializeVip.fulfilled(snapshot(vip, pack), 'test', undefined))
      const invoke = startChallenge(932, ['p0', 'p1'], { forceGameKey: key, prizeType: 'POS' })
      invoke(
        launchStore.dispatch as typeof store.dispatch,
        launchStore.getState as typeof store.getState
      )
      expect(vi.mocked(simulateQuickTapVipAiRace)).toHaveBeenCalledTimes(expected ? 1 : 0)
      expect(launchStore.getState().challenge.pending?.game.key).toBe(key)
      expect(launchStore.getState().challenge.pending?.aiScores?.p1).toEqual(expect.any(Number))
    }
  )

  it.each(['quickTap', 'quickTapSeasons'])(
    'stores the correct %s rules variant for human and AI-only launches',
    (key) => {
      vi.clearAllMocks()
      for (const human of [true, false]) {
        const game = createInitialGameState({ seed: 921 })
        game.players = [
          { id: 'p0', name: 'Player', avatar: '🙂', isUser: human, status: 'active' },
          { id: 'p1', name: 'Opponent', avatar: '🙂', isUser: false, status: 'active' },
        ]
        const launchStore = configureStore({
          reducer: { game: gameReducer, settings: settingsReducer, vip: vipReducer },
          preloadedState: { game },
        })
        launchStore.dispatch(initializeVip.fulfilled(snapshot(vip, pack), 'test', undefined))
        // This thunk only reads the reducers supplied above on the Quick Tap path.
        const invoke = startMinigame({
          key,
          participants: ['p0', 'p1'],
          seed: 921,
          options: { timeLimit: 30 },
        })
        const result = invoke(
          launchStore.dispatch as typeof store.dispatch,
          launchStore.getState as typeof store.getState
        )
        if (human)
          expect(launchStore.getState().game.pendingMinigame?.quickTapVariant).toBe(
            expected ? 'vip' : 'classic'
          )
        else {
          expect(launchStore.getState().game.pendingMinigame).toBeFalsy()
          expect(result).toBeDefined()
          expect(vi.mocked(scoreQuickTapVipAiOnly)).toHaveBeenCalledTimes(expected ? 1 : 0)
        }
      }
    }
  )
})
