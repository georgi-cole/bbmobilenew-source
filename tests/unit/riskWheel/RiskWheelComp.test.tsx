import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import RiskWheelComp from '../../../src/components/RiskWheelComp/RiskWheelComp'
import riskWheelReducer, {
  initRiskWheel,
  performSpin,
  WHEEL_SECTORS,
  pickSectorIndex,
  type RiskWheelState,
} from '../../../src/features/riskWheel/riskWheelSlice'
import gameReducer from '../../../src/store/gameSlice'

const mockAudio = vi.hoisted(() => ({
  startWheelSound: vi.fn(),
  stopWheelSound: vi.fn(),
  playGoodRewardSound: vi.fn(),
  playBadRewardSound: vi.fn(),
  play666Sound: vi.fn(),
  playBankruptOrSkipSound: vi.fn(),
  playScoreboardRevealSound: vi.fn(),
  playWinnerRevealSound: vi.fn(),
  playStopAndBankSound: vi.fn(),
  playClickSound: vi.fn(),
}))

vi.mock('../../../src/hooks/useRiskWheelAudio', () => ({
  useRiskWheelAudio: () => mockAudio,
}))

function makeStore() {
  return configureStore({
    reducer: {
      riskWheel: riskWheelReducer,
      game: gameReducer,
    },
  })
}

function findPositivePointsSeed(): number {
  let seed = 1
  while (
    WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
    (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
  ) {
    seed += 1
  }
  return seed
}

describe('RiskWheelComp', () => {
  it('shows tied players and explains the live tie-break before starting it', async () => {
    const initialized = riskWheelReducer(
      undefined,
      initRiskWheel({
        participantIds: ['human', 'ai-1', 'safe-player'],
        competitionType: 'POS',
        seed: 42,
        humanPlayerId: 'human',
      })
    )
    const pendingTie: RiskWheelState = {
      ...initialized,
      phase: 'round_summary',
      roundScores: { human: 0, 'ai-1': 0, 'safe-player': 20 },
      tieBreaker: {
        originalActivePlayerIds: ['human', 'ai-1', 'safe-player'],
        originalRoundScores: { human: 0, 'ai-1': 0, 'safe-player': 20 },
        eliminatedBeforeTieBreaker: [],
        candidatePlayerIds: ['human', 'ai-1'],
        eliminatedTieBreakerIds: [],
        round: 1,
        pendingStart: true,
      },
      eliminatedThisRound: [],
    }
    const testRiskWheelReducer = (
      state: RiskWheelState | undefined,
      action: Parameters<typeof riskWheelReducer>[1]
    ) => {
      if (action.type === 'test/force-pending-tie') return pendingTie
      return riskWheelReducer(state, action)
    }
    const store = configureStore({
      reducer: { riskWheel: testRiskWheelReducer, game: gameReducer },
    })

    render(
      <Provider store={store}>
        <RiskWheelComp
          participantIds={['human', 'ai-1', 'safe-player']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
            { id: 'safe-player', name: 'Safe Player', isHuman: false },
          ]}
          prizeType="POS"
          seed={42}
          standalone
        />
      </Provider>
    )

    await act(async () => {
      store.dispatch({ type: 'test/force-pending-tie' })
    })

    expect(screen.getByText(/score tie at the elimination line/i)).toBeInTheDocument()
    expect(screen.getAllByText('⚖ TIED')).toHaveLength(2)
    expect(screen.getByText(/will each spin once/i)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start tie-break round 1/i }))
    })

    expect(screen.getByRole('button', { name: /take your tie-break spin/i })).toBeInTheDocument()
    expect(screen.getByLabelText('0 of 1 spins used')).toBeInTheDocument()
    expect(store.getState().riskWheel.activePlayerIds).toEqual(['human', 'ai-1'])
  })

  it('keeps the classic skin by default and enables the VIP skin only when requested', async () => {
    const classicStore = makeStore()
    const classic = render(
      <Provider store={classicStore}>
        <RiskWheelComp
          participantIds={['human', 'ai-1']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
          standalone
        />
      </Provider>
    )

    await screen.findByRole('button', { name: /spin the wheel/i })
    expect(classic.container.querySelector('.rw-root--vip')).toBeNull()
    classic.unmount()

    const vipStore = makeStore()
    const preloadImages: Array<{
      onload: ((event: Event) => void) | null
      src: string
    }> = []
    vi.stubGlobal(
      'Image',
      class {
        onload: ((event: Event) => void) | null = null
        onerror: ((event: Event) => void) | null = null
        complete = false
        naturalWidth = 0
        private imageSrc = ''

        constructor() {
          preloadImages.push(this)
        }

        get src() {
          return this.imageSrc
        }

        set src(value: string) {
          this.imageSrc = value
        }
      }
    )
    const vip = render(
      <Provider store={vipStore}>
        <RiskWheelComp
          participantIds={['human', 'ai-1']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
          standalone
          premiumPresentation
        />
      </Provider>
    )

    expect(screen.getByRole('status')).toHaveTextContent('Preparing the game')
    expect(vipStore.getState().riskWheel.phase).toBe('idle')
    expect(preloadImages[0]?.src).toContain('risk_wheel_background_low')

    await act(async () => {
      preloadImages[0]?.onload?.(new Event('load'))
    })
    await screen.findByRole('button', { name: /spin the wheel/i })
    vi.unstubAllGlobals()
    expect(vip.container.querySelector('.rw-root--vip')).not.toBeNull()
    expect(screen.getByLabelText(/VIP Risk Wheel/i)).toBeInTheDocument()
    expect(vip.container.querySelectorAll('.rw-wheel-sector--vip')).toHaveLength(
      WHEEL_SECTORS.length
    )
  })

  it('advances straight to round results when the human taps Stop and Bank', async () => {
    const store = makeStore()
    const seed = findPositivePointsSeed()

    render(
      <Provider store={store}>
        <RiskWheelComp
          participantIds={['human', 'ai-1', 'ai-2']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
            { id: 'ai-2', name: 'AI 2', isHuman: false },
          ]}
          prizeType="LOH"
          seed={seed}
          standalone
        />
      </Provider>
    )

    await screen.findByRole('button', { name: /spin the wheel/i })

    await act(async () => {
      store.dispatch(performSpin())
    })

    const stopAndBankButton = screen.getByRole('button', { name: /stop and bank/i })
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.click(stopAndBankButton)
    })

    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /continue to next player/i })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue as spectator/i })).toBeInTheDocument()
  })

  it('plays playStopAndBankSound when the Stop and Bank button is clicked', async () => {
    mockAudio.playStopAndBankSound.mockClear()

    const store = makeStore()
    const seed = findPositivePointsSeed()

    render(
      <Provider store={store}>
        <RiskWheelComp
          participantIds={['human', 'ai-1']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
          ]}
          prizeType="LOH"
          seed={seed}
          standalone
        />
      </Provider>
    )

    await screen.findByRole('button', { name: /spin the wheel/i })

    await act(async () => {
      store.dispatch(performSpin())
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop and bank/i }))
    })

    expect(mockAudio.playStopAndBankSound).toHaveBeenCalledTimes(1)
  })

  it('plays playClickSound when the eliminated human continues as a spectator', async () => {
    mockAudio.playClickSound.mockClear()

    const store = makeStore()
    const seed = findPositivePointsSeed()

    render(
      <Provider store={store}>
        <RiskWheelComp
          participantIds={['human', 'ai-1', 'ai-2']}
          participants={[
            { id: 'human', name: 'Human', isHuman: true },
            { id: 'ai-1', name: 'AI 1', isHuman: false },
            { id: 'ai-2', name: 'AI 2', isHuman: false },
          ]}
          prizeType="LOH"
          seed={seed}
          standalone
        />
      </Provider>
    )

    await screen.findByRole('button', { name: /spin the wheel/i })

    await act(async () => {
      store.dispatch(performSpin())
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop and bank/i }))
    })

    // Now in round_summary; click the spectator action to advance the round.
    const nextRoundBtn = screen.getByRole('button', { name: /continue as spectator/i })
    await act(async () => {
      fireEvent.click(nextRoundBtn)
    })

    expect(mockAudio.playClickSound).toHaveBeenCalledTimes(1)
  })
})
