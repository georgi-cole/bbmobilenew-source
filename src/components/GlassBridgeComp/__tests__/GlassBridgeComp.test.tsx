import { act, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import glassBridgeReducer, {
  finaliseOrderSelection,
  initGlassBridge,
  recordNumberChoice,
  startPlaying,
  resolveStep,
  HINT_PENALTY_MS,
} from '../../../features/glassBridge/glassBridgeSlice'
import EntitlementAwareGlassBridgeComp from '../GlassBridgeComp'
import { mulberry32 } from '../../../store/rng'

const playSafeStep = vi.fn()
const playDeath = vi.fn()
const playWinner = vi.fn()
const playNewTurn = vi.fn()
const helpButtonPattern = /seek guidance|ask the expert|one last whisper/i
const exhaustedHelpPattern =
  /no more aid remains|the expert is silent now|you must face the path alone/i

function GlassBridgeComp(props: ComponentProps<typeof EntitlementAwareGlassBridgeComp>) {
  return <EntitlementAwareGlassBridgeComp {...props} premium />
}

vi.mock('../../../hooks/useGlassBridgeAudio', () => ({
  useGlassBridgeAudio: () => ({
    playSafeStep,
    playDeath,
    playWinner,
    playNewTurn,
  }),
}))

vi.mock('../../../features/glassBridge/thunks', () => ({
  resolveGlassBridgeOutcome: () => () => {},
}))

function makeStore() {
  return configureStore({
    reducer: {
      glassBridge: glassBridgeReducer,
    },
  })
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function makeRect(top: number, bottom: number, width = 360): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: width,
    width,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('GlassBridgeComp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-29T00:00:00Z'))
    playSafeStep.mockReset()
    playDeath.mockReset()
    playWinner.mockReset()
    playNewTurn.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the original presentation for standard players', () => {
    const store = makeStore()
    const { container } = render(
      <Provider store={store}>
        <EntitlementAwareGlassBridgeComp participantIds={['user', 'ai-1']} seed={1} />
      </Provider>
    )

    const theme = container.querySelector('style[data-crystal-path-theme="standard"]')
    expect(theme).not.toBeNull()
    expect(container.querySelector('style[data-crystal-path-theme="premium"]')).toBeNull()
  })

  it('keeps a single active turn and forfeits only that player when the death clock expires', async () => {
    const ids = ['user', 'ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-5']
    const seed = 42
    const store = makeStore()
    render(
      <Provider store={store}>
        <EntitlementAwareGlassBridgeComp
          participantIds={ids}
          participants={ids.map((id) => ({ id, name: id, isHuman: id === 'user' }))}
          seed={seed}
        />
      </Provider>
    )
    await advance(0)

    // Assign the user the number that the seeded reveal will place first.
    const shuffledNumbers = ids.map((_, index) => index + 1)
    const rng = mulberry32(seed + 1)
    for (let i = shuffledNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[shuffledNumbers[i], shuffledNumbers[j]] = [shuffledNumbers[j], shuffledNumbers[i]]
    }
    const firstNumber = shuffledNumbers[0]
    const remainingNumbers = ids.map((_, index) => index + 1).filter((n) => n !== firstNumber)

    await act(async () => {
      store.dispatch(
        initGlassBridge({
          participantIds: ids,
          participants: ids.map((id) => ({ id, name: id, isHuman: id === 'user' })),
          competitionType: 'LOH',
          seed,
          humanPlayerId: 'user',
        })
      )
      store.dispatch(recordNumberChoice({ playerId: 'user', number: firstNumber }))
      ids.slice(1).forEach((id, index) => {
        store.dispatch(recordNumberChoice({ playerId: id, number: remainingNumbers[index] }))
      })
      store.dispatch(finaliseOrderSelection())
      store.dispatch(startPlaying({ now: Date.now() }))
    })

    expect(store.getState().glassBridge.turnOrder[0]).toBe('user')
    expect(screen.getByLabelText('Your turn clock').className).toContain('gb-death-clock-green')
    await advance(4_000)
    expect(screen.getByLabelText('Your turn clock').className).toContain('gb-death-clock-yellow')
    await advance(4_250)
    expect(screen.getByLabelText('Current turn').textContent).toBe('Your turn')
    const clockValue = Number(
      screen.getByLabelText('Your turn clock').getAttribute('aria-valuenow')
    )
    expect(clockValue).toBeLessThan(4_000)
    expect(clockValue).toBeGreaterThan(3_500)
    expect(screen.getByLabelText('Your turn clock').className).toContain('gb-death-clock-orange')
    expect(store.getState().glassBridge.progress['ai-1'].firstStepAtMs).toBeUndefined()
    await advance(1_000)
    expect(screen.getByLabelText('Your turn clock').className).toContain('gb-death-clock-red')
    await advance(3_000)

    const state = store.getState().glassBridge
    expect(state.progress.user.furthestRowReached).toBe(0)
    expect(store.getState().glassBridge.progress.user.forfeited).toBe(true)
    ids.slice(1).forEach((id) => expect(state.progress[id].forfeited).not.toBe(true))
    expect(screen.getByRole('dialog', { name: 'Eliminated' }).textContent).toContain(
      'run is forfeited'
    )
    expect(screen.getByRole('dialog', { name: 'Eliminated' }).textContent).toContain(
      'You did not choose a move within the time limit, so your run is forfeited.'
    )
  })

  it('pauses the bridge clock and AI decision windows while the spectator choice is open', async () => {
    const store = makeStore()
    const { container } = render(
      <Provider store={store}>
        <GlassBridgeComp participantIds={['user', 'ai-1']} seed={1} />
      </Provider>
    )
    await advance(0)
    fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }))
    await act(async () => {
      store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }))
      store.dispatch(finaliseOrderSelection())
      store.dispatch(startPlaying({ now: Date.now() }))
    })
    expect(
      Array.from(container.querySelectorAll('.gb-tile-label')).map((label) => label.textContent)
    ).toEqual(expect.arrayContaining(['L', 'R']))
    const wrong = store.getState().glassBridge.rows[0].safeSide === 'left' ? 'right' : 'left'
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`${wrong} tile.*step here`, 'i') })
    )
    await advance(300)
    const shatteringTile = document.querySelector('.gb-tile.gb-tile-shatter')
    expect(shatteringTile).not.toBeNull()
    expect(shatteringTile?.classList).toContain('gb-tile-broken')
    expect(shatteringTile?.querySelectorAll('.gb-shard-fragment')).toHaveLength(8)
    expect(shatteringTile?.querySelector('.gb-fracture-lines')).not.toBeNull()
    await advance(800)
    expect(screen.getByRole('dialog', { name: 'Eliminated' })).toBeTruthy()
    const brokenTile = document.querySelector('.gb-tile.gb-tile-broken')
    expect(brokenTile).not.toBeNull()
    expect(brokenTile?.querySelector('.gb-tile-label')).toBeNull()
    expect(brokenTile?.querySelector('.gb-shatter-overlay')).toBeNull()
    expect(brokenTile?.querySelector('.gb-tile-remnants')).toBeNull()
    expect(brokenTile?.querySelectorAll('.gb-glass-shard')).toHaveLength(0)
    const aiProgress = store.getState().glassBridge.progress['ai-1']
    await advance(45_000)
    expect(screen.queryByLabelText('Time remaining')).toBeNull()
    expect(store.getState().glassBridge.progress['ai-1']).toEqual(aiProgress)
    expect(store.getState().glassBridge.progress['ai-1'].forfeited).not.toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /continue watching/i }))
    await advance(1_100)
    expect(store.getState().glassBridge.progress['ai-1'].firstStepAtMs).toBeDefined()
  })

  it('highlights the human next row and resets per-row hint strength during open crossing', async () => {
    const store = makeStore()
    const { container } = render(
      <Provider store={store}>
        <GlassBridgeComp participantIds={['user', 'ai-1']} seed={1} />
      </Provider>
    )
    await advance(0)
    fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }))
    await act(async () => {
      store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }))
      store.dispatch(finaliseOrderSelection())
      store.dispatch(startPlaying({ now: Date.now() }))
    })
    fireEvent.click(screen.getByRole('button', { name: helpButtonPattern }))
    const safe = store.getState().glassBridge.rows[0].safeSide
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`${safe} tile.*step here`, 'i') })
    )
    await advance(300)
    expect(screen.getByLabelText('Current turn').textContent).toContain('Your turn')
    expect(container.querySelector('.gb-row-current .gb-row-label')?.textContent).toBe('2')
    expect(screen.queryByRole('status')).toBeNull()
    expect(container.querySelectorAll('.gb-tile-known-safe, .gb-tile-evidence').length).toBe(0)
    expect(container.querySelector('.gb-row-current')?.textContent).not.toContain('Proven safe')
    fireEvent.click(screen.getByRole('button', { name: helpButtonPattern }))
    const hint = screen.getByRole('status').textContent
    const secondRow = store.getState().glassBridge.rows[1]
    expect(hint).toContain(`${secondRow.safeSide === 'right' ? 65 : 35}%`)
  })

  it('uses season player profiles even when the host only supplies names and IDs', async () => {
    const profile = {
      physical: 50,
      mental: 50,
      precision: 50,
      nerve: 86,
      consistency: 50,
      clutch: 50,
      chokeRisk: 20,
      luck: 50,
    }
    const store = configureStore({
      reducer: {
        glassBridge: glassBridgeReducer,
        game: () => ({
          players: [{ id: 'ai-1', name: 'Confident AI', competitionProfile: profile }],
        }),
      },
    })
    render(
      <Provider store={store}>
        <GlassBridgeComp participantIds={['user', 'ai-1']} seed={1} />
      </Provider>
    )
    await advance(0)
    expect(
      store.getState().glassBridge.participants.find((p) => p.id === 'ai-1')?.competitionProfile
    ).toEqual(profile)
  })

  it('moves the help button above the first row and strengthens repeated hints on the same row', async () => {
    const store = makeStore()
    const { container } = render(
      <Provider store={store}>
        <GlassBridgeComp
          participantIds={['user', 'ai-1']}
          participants={[
            { id: 'user', name: 'You', isHuman: true },
            { id: 'ai-1', name: 'AI One', isHuman: false },
          ]}
          seed={42}
        />
      </Provider>
    )

    await advance(0)
    fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }))

    await act(async () => {
      store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }))
      store.dispatch(finaliseOrderSelection())
      store.dispatch(startPlaying({ now: Date.now() }))
    })

    // After reveal animation, check the human is going first (turn order with seed 42 may vary;
    // we just verify the Request Help button appears in the playing phase for the human).
    const helpBtn = screen.queryByRole('button', { name: helpButtonPattern })
    expect(helpBtn).not.toBeNull()
    expect(helpBtn!.textContent).toMatch(/3 left/i)

    const floatingUi = container.querySelector('.gb-floating-ui')
    const bridgeScroll = container.querySelector('.gb-bridge-scroll')
    const bridgeContainer = container.querySelector('.gb-bridge-container')
    const hintArea = container.querySelector('.gb-floating-ui .gb-hint-area')
    const firstRow = container.querySelector('.gb-bridge-container .gb-row')
    expect(floatingUi).not.toBeNull()
    expect(bridgeScroll).not.toBeNull()
    expect(bridgeContainer).not.toBeNull()
    expect(hintArea).not.toBeNull()
    expect(firstRow).not.toBeNull()
    expect(floatingUi!.nextElementSibling).toBe(bridgeScroll)
    expect(bridgeScroll!.contains(bridgeContainer)).toBe(true)

    const currentRow = store.getState().glassBridge.currentPlayerRow
    const currentRowState = store.getState().glassBridge.rows[currentRow - 1]
    const expectedHints = currentRowState.safeSide === 'right' ? [65, 90, 99] : [35, 10, 1]

    const observedHints: number[] = []

    // Click the hint button three times on the same row.
    await act(async () => {
      fireEvent.click(helpBtn!)
    })
    let hintMsg = screen.queryByRole('status')
    expect(hintMsg).not.toBeNull()
    observedHints.push(Number(hintMsg!.textContent!.match(/(\d+)%/)?.[1] ?? '0'))
    expect(screen.getByRole('button', { name: helpButtonPattern }).textContent).toMatch(/2 left/i)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: helpButtonPattern }))
    })
    hintMsg = screen.queryByRole('status')
    expect(hintMsg).not.toBeNull()
    observedHints.push(Number(hintMsg!.textContent!.match(/(\d+)%/)?.[1] ?? '0'))
    expect(screen.getByRole('button', { name: helpButtonPattern }).textContent).toMatch(/1 left/i)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: helpButtonPattern }))
    })
    hintMsg = screen.queryByRole('status')
    expect(hintMsg).not.toBeNull()
    observedHints.push(Number(hintMsg!.textContent!.match(/(\d+)%/)?.[1] ?? '0'))

    // Hint penalty should be recorded in Redux state (30 000 ms).
    const state = store.getState()
    const userProgress = state.glassBridge.progress['user']
    expect(userProgress?.hintPenaltyMs).toBe(HINT_PENALTY_MS * 3)
    expect(observedHints).toEqual(expectedHints)

    const exhaustedBtn = screen.getByRole('button', { name: exhaustedHelpPattern })
    expect(exhaustedBtn).toBeDisabled()
  })

  it('generates a fresh session seed on each mount when no explicit seed is provided', async () => {
    const generatedSeeds = [0x12345678, 0x9abcdef0]
    let seedIndex = 0
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    const cryptoObject = originalCryptoDescriptor?.value ?? {
      getRandomValues: <T extends ArrayBufferView | null>(array: T): T => array,
    }

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: cryptoObject,
    })

    const getRandomValuesSpy = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((array) => {
        if (array instanceof Uint32Array && array.length > 0) {
          array[0] = generatedSeeds[Math.min(seedIndex, generatedSeeds.length - 1)]
          seedIndex += 1
        }
        return array
      })

    try {
      const firstStore = makeStore()
      const firstRender = render(
        <Provider store={firstStore}>
          <GlassBridgeComp
            participantIds={['user', 'ai-1']}
            participants={[
              { id: 'user', name: 'You', isHuman: true },
              { id: 'ai-1', name: 'AI One', isHuman: false },
            ]}
          />
        </Provider>
      )

      await advance(0)
      const firstSeed = firstStore.getState().glassBridge.seed
      firstRender.unmount()

      const secondStore = makeStore()
      render(
        <Provider store={secondStore}>
          <GlassBridgeComp
            participantIds={['user', 'ai-1']}
            participants={[
              { id: 'user', name: 'You', isHuman: true },
              { id: 'ai-1', name: 'AI One', isHuman: false },
            ]}
          />
        </Provider>
      )

      await advance(0)
      const secondSeed = secondStore.getState().glassBridge.seed

      expect(firstSeed).toBe(generatedSeeds[0])
      expect(secondSeed).toBe(generatedSeeds[1])
      expect(secondSeed).not.toBe(firstSeed)
    } finally {
      getRandomValuesSpy.mockRestore()
      if (originalCryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor)
      } else {
        Reflect.deleteProperty(globalThis, 'crypto')
      }
    }
  })

  it('shows a spectator fast-forward button and cycles 1x, 2x, 3x playback', async () => {
    const store = makeStore()
    render(
      <Provider store={store}>
        <GlassBridgeComp
          participantIds={['user', 'ai-1']}
          participants={[
            { id: 'user', name: 'You', isHuman: true },
            { id: 'ai-1', name: 'AI One', isHuman: false },
          ]}
          seed={1}
        />
      </Provider>
    )

    await advance(0)
    fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }))

    await act(async () => {
      store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }))
      store.dispatch(finaliseOrderSelection())
      store.dispatch(startPlaying({ now: Date.now() }))
    })

    expect(store.getState().glassBridge.turnOrder[0]).toBe('user')

    const firstRow = store.getState().glassBridge.rows[0]
    const wrongSide = firstRow.safeSide === 'left' ? 'right' : 'left'
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`${wrongSide} tile.*step here`, 'i') })
    )

    await advance(1_100)

    expect(screen.getByRole('dialog', { name: /eliminated/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /continue watching/i }))

    let ffwdBtn = screen.getByRole('button', { name: /playback speed 1x/i })
    expect(ffwdBtn.textContent).toContain('1×')

    fireEvent.click(ffwdBtn)
    ffwdBtn = screen.getByRole('button', { name: /playback speed 2x/i })
    expect(ffwdBtn.textContent).toContain('2×')

    fireEvent.click(ffwdBtn)
    ffwdBtn = screen.getByRole('button', { name: /playback speed 3x/i })
    expect(ffwdBtn.textContent).toContain('3×')
  })

  it('keeps the former shared countdown out of the crossing UI', async () => {
    const store = makeStore()
    render(
      <Provider store={store}>
        <GlassBridgeComp
          participantIds={['user', 'ai-1']}
          participants={[
            { id: 'user', name: 'You', isHuman: true },
            { id: 'ai-1', name: 'AI One', isHuman: false },
          ]}
          seed={1}
        />
      </Provider>
    )

    await advance(0)
    fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }))

    await act(async () => {
      store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }))
      store.dispatch(finaliseOrderSelection())
      store.dispatch(startPlaying({ now: Date.now() }))
    })

    const firstRow = store.getState().glassBridge.rows[0]
    const wrongSide = firstRow.safeSide === 'left' ? 'right' : 'left'
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`${wrongSide} tile.*step here`, 'i') })
    )

    await advance(1_100)
    fireEvent.click(screen.getByRole('button', { name: /continue watching/i }))

    expect(screen.queryByLabelText('Time remaining')).toBeNull()
    expect(screen.queryByText(/open crossing|one minute remains/i)).toBeNull()
  })

  it('auto-scrolls the active row into view on mobile as the player advances', async () => {
    const originalInnerWidth = window.innerWidth
    const originalMatchMedia = window.matchMedia
    const originalScrollTo = HTMLElement.prototype.scrollTo
    const scrollToSpy = vi.fn()

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 640px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToSpy,
    })

    try {
      const store = makeStore()
      const { container } = render(
        <Provider store={store}>
          <GlassBridgeComp
            participantIds={['user', 'ai-1']}
            participants={[
              { id: 'user', name: 'You', isHuman: true },
              { id: 'ai-1', name: 'AI One', isHuman: false },
            ]}
            seed={1}
          />
        </Provider>
      )

      await advance(0)
      fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }))

      await act(async () => {
        store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }))
        store.dispatch(finaliseOrderSelection())
        store.dispatch(startPlaying({ now: Date.now() }))
      })
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })

      const scrollContainer = container.querySelector('.gb-bridge-scroll') as HTMLDivElement | null
      const floatingUi = container.querySelector('.gb-floating-ui') as HTMLDivElement | null
      const hintArea = container.querySelector(
        '.gb-floating-ui .gb-hint-area'
      ) as HTMLDivElement | null
      const rows = Array.from(container.querySelectorAll('.gb-row')) as HTMLDivElement[]

      expect(scrollContainer).not.toBeNull()
      expect(floatingUi).not.toBeNull()
      expect(hintArea).not.toBeNull()
      expect(floatingUi!.nextElementSibling).toBe(scrollContainer)
      expect(rows.length).toBeGreaterThan(1)

      Object.defineProperty(scrollContainer!, 'scrollTop', {
        configurable: true,
        writable: true,
        value: 0,
      })
      Object.defineProperty(scrollContainer!, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(0, 240)),
      })
      Object.defineProperty(rows[0], 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(110, 170)),
      })
      Object.defineProperty(rows[1], 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(230, 290)),
      })

      await act(async () => {
        const safeSide = store.getState().glassBridge.rows[0].safeSide
        store.dispatch(resolveStep({ chosenSide: safeSide, now: Date.now() }))
      })

      expect(scrollToSpy).toHaveBeenCalledWith({ top: 62, behavior: 'smooth' })
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      })
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      })
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        value: originalScrollTo,
      })
    }
  })

  it('uses instant auto-scroll when animations are disabled', async () => {
    const originalInnerWidth = window.innerWidth
    const originalMatchMedia = window.matchMedia
    const originalScrollTo = HTMLElement.prototype.scrollTo
    const scrollToSpy = vi.fn()

    document.body.classList.add('no-animations')
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 640px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToSpy,
    })

    try {
      const store = makeStore()
      const { container } = render(
        <Provider store={store}>
          <GlassBridgeComp
            participantIds={['user', 'ai-1']}
            participants={[
              { id: 'user', name: 'You', isHuman: true },
              { id: 'ai-1', name: 'AI One', isHuman: false },
            ]}
            seed={1}
          />
        </Provider>
      )

      await advance(0)
      fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }))

      await act(async () => {
        store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }))
        store.dispatch(finaliseOrderSelection())
        store.dispatch(startPlaying({ now: Date.now() }))
      })
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })

      const scrollContainer = container.querySelector('.gb-bridge-scroll') as HTMLDivElement | null
      const floatingUi = container.querySelector('.gb-floating-ui') as HTMLDivElement | null
      const rows = Array.from(container.querySelectorAll('.gb-row')) as HTMLDivElement[]

      expect(scrollContainer).not.toBeNull()
      expect(floatingUi).not.toBeNull()
      expect(floatingUi!.nextElementSibling).toBe(scrollContainer)
      expect(rows.length).toBeGreaterThan(1)

      Object.defineProperty(scrollContainer!, 'scrollTop', {
        configurable: true,
        writable: true,
        value: 0,
      })
      Object.defineProperty(scrollContainer!, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(0, 240)),
      })
      Object.defineProperty(rows[0], 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(110, 170)),
      })
      Object.defineProperty(rows[1], 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(230, 290)),
      })

      await act(async () => {
        const safeSide = store.getState().glassBridge.rows[0].safeSide
        store.dispatch(resolveStep({ chosenSide: safeSide, now: Date.now() }))
      })

      expect(scrollToSpy).toHaveBeenCalledWith({ top: 62, behavior: 'auto' })
    } finally {
      document.body.classList.remove('no-animations')
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      })
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      })
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        value: originalScrollTo,
      })
    }
  })
})
