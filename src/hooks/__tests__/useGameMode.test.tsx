import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import useGameMode from '../useGameMode'
import { syncNativeGameDisplay } from '../../platform/nativeGameDisplay'

const {
  getPlatform,
  hideStatusBar,
  isNativePlatform,
  isPluginAvailable,
  setNativeState,
  showStatusBar,
} = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  hideStatusBar: vi.fn().mockResolvedValue(undefined),
  isNativePlatform: vi.fn(() => false),
  isPluginAvailable: vi.fn(() => false),
  setNativeState: vi.fn().mockResolvedValue(undefined),
  showStatusBar: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform,
    isNativePlatform,
    isPluginAvailable,
  },
  SystemBars: {
    hide: hideStatusBar,
    show: showStatusBar,
  },
  registerPlugin: () => ({ setState: setNativeState }),
}))

function GameModeHarness({
  activePlay = true,
  allowLandscape = false,
}: {
  activePlay?: boolean
  allowLandscape?: boolean
}) {
  useGameMode(activePlay, allowLandscape)
  return <div>game mode</div>
}

interface MockWakeLockSentinel {
  release: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

describe('useGameMode', () => {
  const visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
  const hadOwnVisibilityState = Object.prototype.hasOwnProperty.call(document, 'visibilityState')
  const orientationDescriptor = Object.getOwnPropertyDescriptor(screen, 'orientation')
  const hadOwnOrientation = Object.prototype.hasOwnProperty.call(screen, 'orientation')
  const wakeLockDescriptor = Object.getOwnPropertyDescriptor(navigator, 'wakeLock')
  const hadOwnWakeLock = Object.prototype.hasOwnProperty.call(navigator, 'wakeLock')

  function restoreProperty(
    target: object,
    key: string,
    existedBefore: boolean,
    descriptor?: PropertyDescriptor
  ) {
    if (existedBefore && descriptor) {
      Object.defineProperty(target, key, descriptor)
      return
    }
    Reflect.deleteProperty(target, key)
  }

  function setVisibilityState(value: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value,
    })
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    hideStatusBar.mockReset().mockResolvedValue(undefined)
    getPlatform.mockReset().mockReturnValue('android')
    isNativePlatform.mockReset().mockReturnValue(false)
    isPluginAvailable.mockReset().mockReturnValue(false)
    setNativeState.mockReset().mockResolvedValue(undefined)
    showStatusBar.mockReset().mockResolvedValue(undefined)
    setVisibilityState('visible')
  })

  afterEach(async () => {
    cleanup()
    await syncNativeGameDisplay({ active: false, allowLandscape: false })
    restoreProperty(document, 'visibilityState', hadOwnVisibilityState, visibilityStateDescriptor)
    restoreProperty(screen, 'orientation', hadOwnOrientation, orientationDescriptor)
    restoreProperty(navigator, 'wakeLock', hadOwnWakeLock, wakeLockDescriptor)
  })

  it('requests a wake lock, locks portrait orientation, and cleans up on unmount', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const request = vi.fn().mockResolvedValue({
      release,
      addEventListener,
      removeEventListener,
    })
    const lock = vi.fn().mockResolvedValue(undefined)
    const unlock = vi.fn()

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { lock, unlock },
    })

    const { unmount } = render(<GameModeHarness />)

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen')
    })
    expect(lock).toHaveBeenCalledWith('portrait')
    expect(addEventListener).toHaveBeenCalledWith('release', expect.any(Function))

    unmount()

    await waitFor(() => {
      expect(release).toHaveBeenCalledTimes(1)
    })
    expect(removeEventListener).toHaveBeenCalledWith('release', expect.any(Function))
    expect(unlock).toHaveBeenCalledTimes(1)
  })

  it.each(['android', 'ios'])(
    'hides both phone bars on %s and restores normal display on exit',
    async (platform) => {
      isNativePlatform.mockReturnValue(true)
      isPluginAvailable.mockReturnValue(true)
      getPlatform.mockReturnValue(platform)
      Object.defineProperty(screen, 'orientation', {
        configurable: true,
        value: {},
      })

      const { unmount } = render(<GameModeHarness />)

      await waitFor(() => {
        expect(hideStatusBar).toHaveBeenCalledWith()
        expect(setNativeState).toHaveBeenLastCalledWith({ active: true, allowLandscape: false })
      })
      expect(showStatusBar).not.toHaveBeenCalled()

      unmount()

      await waitFor(() => {
        expect(showStatusBar).toHaveBeenCalledWith()
        expect(setNativeState).toHaveBeenLastCalledWith({ active: false, allowLandscape: false })
      })
    }
  )

  it('re-hides the native status bar when gameplay becomes visible again', async () => {
    isNativePlatform.mockReturnValue(true)
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: {},
    })

    render(<GameModeHarness />)

    await waitFor(() => {
      expect(hideStatusBar).toHaveBeenCalledTimes(1)
    })

    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => {
      expect(hideStatusBar).toHaveBeenCalledTimes(2)
    })
  })

  it('re-hides the native status bar when the Android activity regains focus', async () => {
    isNativePlatform.mockReturnValue(true)
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: {},
    })

    render(<GameModeHarness />)

    await waitFor(() => {
      expect(hideStatusBar).toHaveBeenCalledTimes(1)
    })

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(hideStatusBar).toHaveBeenCalledTimes(2)
    })
  })

  it('uses native wake/orientation control and changes landscape without a menu flash', async () => {
    isNativePlatform.mockReturnValue(true)
    isPluginAvailable.mockReturnValue(true)
    const request = vi.fn()
    const lock = vi.fn()
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { lock },
    })

    const { rerender } = render(<GameModeHarness />)
    await waitFor(() =>
      expect(setNativeState).toHaveBeenCalledWith({ active: true, allowLandscape: false })
    )
    rerender(<GameModeHarness allowLandscape />)
    await waitFor(() =>
      expect(setNativeState).toHaveBeenLastCalledWith({ active: true, allowLandscape: true })
    )
    expect(request).not.toHaveBeenCalled()
    expect(lock).not.toHaveBeenCalled()
    expect(showStatusBar).not.toHaveBeenCalled()

    rerender(<GameModeHarness activePlay={false} allowLandscape />)
    await waitFor(() => {
      expect(setNativeState).toHaveBeenLastCalledWith({ active: false, allowLandscape: false })
      expect(showStatusBar).toHaveBeenCalled()
    })
  })

  it('restores the menu after an earlier hide request completes late', async () => {
    isNativePlatform.mockReturnValue(true)
    isPluginAvailable.mockReturnValue(true)
    let finishHide: (() => void) | undefined
    hideStatusBar.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishHide = resolve
        })
    )
    const { rerender } = render(<GameModeHarness allowLandscape />)
    await waitFor(() => expect(hideStatusBar).toHaveBeenCalledTimes(1))
    rerender(<GameModeHarness activePlay={false} />)
    expect(showStatusBar).not.toHaveBeenCalled()
    if (!finishHide) throw new Error('Native hide request was not started')
    finishHide()
    await waitFor(() =>
      expect(setNativeState).toHaveBeenLastCalledWith({ active: false, allowLandscape: false })
    )
    expect(showStatusBar).toHaveBeenCalledTimes(1)
  })

  it('does not invoke native bars on the web or keep a menu awake', async () => {
    const request = vi.fn()
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    render(<GameModeHarness activePlay={false} />)
    expect(request).not.toHaveBeenCalled()
    expect(hideStatusBar).not.toHaveBeenCalled()
    expect(showStatusBar).not.toHaveBeenCalled()
  })

  it('releases the browser wake lock when returning to a menu', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi
      .fn()
      .mockResolvedValue({ release, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    const { rerender } = render(<GameModeHarness />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    rerender(<GameModeHarness activePlay={false} />)
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1))
    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('continues native wake control if the system bars API is unavailable', async () => {
    isNativePlatform.mockReturnValue(true)
    isPluginAvailable.mockReturnValue(true)
    hideStatusBar.mockRejectedValueOnce(new Error('Unavailable'))
    render(<GameModeHarness />)
    await waitFor(() =>
      expect(setNativeState).toHaveBeenCalledWith({ active: true, allowLandscape: false })
    )
  })

  it('re-requests wake lock when the document becomes visible again', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        release: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      .mockResolvedValueOnce({
        release: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: {},
    })

    render(<GameModeHarness />)

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1)
    })

    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2)
    })
  })

  it('re-locks portrait orientation when the document becomes visible again', async () => {
    const lock = vi.fn().mockResolvedValue(undefined)
    const unlock = vi.fn()
    const request = vi.fn().mockResolvedValue({
      release: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { lock, unlock },
    })

    render(<GameModeHarness />)

    await waitFor(() => {
      expect(lock).toHaveBeenCalledWith('portrait')
    })

    const initialLockCount = lock.mock.calls.length

    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => {
      expect(lock.mock.calls.length).toBeGreaterThan(initialLockCount)
    })
    expect(lock).toHaveBeenLastCalledWith('portrait')
  })

  it('re-requests wake lock after an unexpected release while still visible', async () => {
    const firstAddEventListener = vi.fn()
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        release: vi.fn(),
        addEventListener: firstAddEventListener,
        removeEventListener: vi.fn(),
      })
      .mockResolvedValueOnce({
        release: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: {},
    })

    render(<GameModeHarness />)

    await waitFor(() => {
      expect(firstAddEventListener).toHaveBeenCalledWith('release', expect.any(Function))
    })

    expect(firstAddEventListener.mock.calls[0]?.[1]).toBeDefined()
    const releaseHandler = firstAddEventListener.mock.calls[0][1] as () => void
    releaseHandler()

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2)
    })
  })

  it('does not issue a duplicate wake lock request while one is already in flight', async () => {
    let resolveRequest: ((sentinel: MockWakeLockSentinel) => void) | undefined
    const request = vi.fn().mockImplementation(
      () =>
        new Promise<MockWakeLockSentinel>((resolve) => {
          resolveRequest = resolve
        })
    )

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    })
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: {},
    })

    render(<GameModeHarness />)

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1)
    })

    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(request).toHaveBeenCalledTimes(1)

    const finishRequest = resolveRequest
    expect(finishRequest).toBeTypeOf('function')
    if (!finishRequest) {
      throw new Error('wake lock request resolver was not assigned')
    }

    finishRequest({
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })
})
