import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import HomeHub from '../HomeHub'
import { preloadImage } from '../../../utils/preload'
import { shouldShowWeatherPermissionRationale } from '../../../services/locationAccess'
import type { RemoteConfig } from '../../../remoteConfig/remoteConfigTypes'
import type { ResolvedTheme } from '../../../utils/backgroundTheme'

const mockNavigate = vi.fn()
const mockDispatch = vi.fn()
const mockRequestWeatherLocation = vi.hoisted(() =>
  vi.fn<() => Promise<ResolvedTheme | undefined>>(() => Promise.resolve(undefined))
)
let mockBackgroundUrl = '/assets/background.jpg'
let mockWeatherReason = 'fallback:location'
let mockWeatherPermission: ResolvedTheme['permissionStatus'] = 'unknown'
const mockState: {
  game: {
    gameId: string
    season?: number
    week?: number
    phase?: string
    twinShockConsumed?: boolean
    players: Array<{ id: string; isUser: boolean }>
    seasonArchives: Array<{ seasonId: string; bellaCast?: boolean }>
  }
  profiles: { activeProfileId: null; isGuest: boolean; profiles: never[] }
  remoteConfig: { config: RemoteConfig | null }
  vip: {
    isActive: boolean
    entitlements: { survivalMode: boolean }
  }
} = {
  game: {
    gameId: 'game-A',
    players: [],
    seasonArchives: [],
  },
  profiles: {
    activeProfileId: null,
    isGuest: true,
    profiles: [],
  },
  remoteConfig: {
    config: null,
  },
  vip: {
    isActive: false,
    entitlements: { survivalMode: false },
  },
}

const preloadImageMock = vi.mocked(preloadImage)

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}))

vi.mock('../../../hooks/useBackgroundTheme', () => ({
  default: () => ({
    url: mockBackgroundUrl,
    reason: mockWeatherReason,
    permissionStatus: mockWeatherPermission,
    requestWeatherLocation: mockRequestWeatherLocation,
  }),
}))

vi.mock('../../../hooks/useLoadIntroHub', async () => {
  const { useEffect } = await import('react')

  return {
    default: function useLoadIntroHubMock() {
      useEffect(() => {
        const container = document.getElementById('intro-hub')
        if (!container || container.querySelector('.hub-chip')) {
          return () => {}
        }

        const chip = document.createElement('button')
        chip.className = 'hub-chip'
        chip.dataset.hubId = 'store'
        chip.setAttribute('aria-label', 'Store')
        const icon = document.createElement('span')
        icon.className = 'hub-chip__icon hub-chip__icon--shop'
        chip.appendChild(icon)
        chip.addEventListener('click', () => mockNavigate('/store'))
        container.appendChild(chip)

        return () => {
          chip.remove()
        }
      }, [])
    },
  }
})

vi.mock('../../../utils/preload', () => ({
  preloadImage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../components/KolequantSplash/KolequantSplash', () => ({
  default: ({
    onFinish,
    progress,
    status,
    duration,
  }: {
    onFinish?: () => void
    progress?: number
    ready?: boolean
    status?: string
    duration?: number
  }) => (
    <button
      data-testid="kolequant-splash"
      data-duration={duration}
      onClick={onFinish}
      type="button"
    >
      {status ?? 'Finish splash'} {progress ?? 0}%
    </button>
  ),
}))

vi.mock('../../../components/ConfirmExitModal/ConfirmExitModal', () => ({
  default: () => null,
}))

vi.mock('../../../components/PermissionPrompts/PermissionPrompts', () => ({
  default: () => <div data-testid="permission-prompts" />,
}))

vi.mock('../../../components/AssetPreloaderOverlay/AssetPreloaderOverlay', () => ({
  default: ({ destination }: { destination?: string }) => (
    <div data-destination={destination} data-testid="asset-preloader-overlay" />
  ),
}))

vi.mock('../../../components/HousematesBioCinematic/HousematesBioCinematic', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="housemates-bio-cinematic" role="dialog">
      <button type="button" onClick={onComplete}>
        Return to IntroHub
      </button>
    </div>
  ),
}))

vi.mock('../../../components/GameButton/GameButton', () => ({
  default: ({
    label,
    icon,
    variant,
    onClick,
  }: {
    label: string
    icon?: React.ReactNode
    variant: string
    onClick: () => void
  }) => (
    <button
      className={`game-btn--${variant}`}
      data-has-icon={Boolean(icon)}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  ),
}))

function renderHomeHub(initialEntry: string | { pathname: string; state?: unknown } = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <HomeHub />
    </MemoryRouter>
  )
}

async function waitForMenuReady() {
  // Startup has asynchronous image, font and runtime gates. Query cheaply while
  // pending instead of repeatedly constructing getByRole's full DOM error.
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Play' })).not.toBeNull(), {
    timeout: 5000,
  })
}

describe('HomeHub', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    localStorage.setItem('bb:locationPermissionRequested', 'true')
    delete (window as Window & { game?: Record<string, unknown> }).game
    mockState.game = {
      gameId: 'game-A',
      players: [],
      seasonArchives: [],
    }
    mockState.remoteConfig.config = null
    mockBackgroundUrl = '/assets/background.jpg'
    mockWeatherReason = 'fallback:location'
    mockWeatherPermission = 'unknown'
    mockState.vip.isActive = false
    mockState.vip.entitlements.survivalMode = false
    mockDispatch.mockReset()
    mockNavigate.mockReset()
    mockRequestWeatherLocation.mockReset().mockImplementation(() => {
      localStorage.setItem('bb:locationPermissionRequested', 'true')
      return Promise.resolve(undefined)
    })
    preloadImageMock.mockReset()
    preloadImageMock.mockImplementation(async (url: string) => ({ url, status: 'loaded' as const }))
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as Window & { game?: Record<string, unknown> }).game
  })

  it('uses five seconds initially and no minimum on later in-app loads', async () => {
    const firstRender = renderHomeHub()

    expect(screen.getByTestId('kolequant-splash')).toBeInTheDocument()
    expect(screen.getByTestId('kolequant-splash')).toHaveAttribute('data-duration', '5000')

    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitForMenuReady()

    firstRender.unmount()

    renderHomeHub()

    expect(screen.queryByTestId('kolequant-splash')).toBeNull()
    await waitForMenuReady()
  })

  it('explains local weather before the first location prompt and requests it once', async () => {
    vi.useFakeTimers()
    localStorage.removeItem('bb:locationPermissionRequested')
    expect(shouldShowWeatherPermissionRationale()).toBe(true)
    const view = renderHomeHub()

    fireEvent.click(screen.getByTestId('kolequant-splash'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Allow approximate location to match the Home Hub to your local weather. Coordinates go to Open-Meteo only to fetch weather for the background.'
    )
    expect(mockRequestWeatherLocation).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(650)
    })
    expect(mockRequestWeatherLocation).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).toBeNull()

    view.rerender(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>
    )
    expect(mockRequestWeatherLocation).toHaveBeenCalledOnce()
  })

  it('offers an explicit weather retry after an earlier permission attempt', async () => {
    localStorage.setItem('bb:allowLocation', 'denied')
    renderHomeHub()
    fireEvent.click(screen.getByTestId('kolequant-splash'))
    await waitForMenuReady()
    expect(mockRequestWeatherLocation).not.toHaveBeenCalled()

    let finishRequest: (theme: ResolvedTheme) => void = () => undefined
    mockRequestWeatherLocation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve
        })
    )
    const refreshButton = screen.getByRole('button', { name: 'Refresh local weather' })
    fireEvent.click(refreshButton)
    expect(refreshButton).toBeDisabled()
    expect(refreshButton).toHaveTextContent('Checking weather…')
    fireEvent.click(refreshButton)
    expect(mockRequestWeatherLocation).toHaveBeenCalledOnce()

    await act(async () => {
      mockWeatherReason = 'weather:61:rain'
      mockWeatherPermission = 'granted'
      finishRequest({
        key: 'weather:rain:day',
        url: '/assets/rain.webp',
        reason: 'weather:61:rain',
        assetFile: 'rain.webp',
        assetSource: 'bundled',
        platform: 'web',
        permissionStatus: 'granted',
      })
    })
    expect(refreshButton).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('Local weather updated.')
  })

  it.each([
    [
      'denied',
      'fallback:location',
      'Allow location in your browser or device settings, then retry.',
    ],
    ['prompt', 'fallback:location', 'Location was unavailable.'],
    ['granted', 'fallback:weather', 'Weather is temporarily unavailable.'],
  ] as const)(
    'explains a %s weather retry result without reporting success',
    async (permissionStatus, reason, message) => {
      mockWeatherReason = reason
      mockWeatherPermission = permissionStatus
      mockRequestWeatherLocation.mockResolvedValueOnce({
        key: 'day',
        url: '/assets/day.webp',
        reason,
        assetFile: 'day.webp',
        assetSource: 'bundled',
        platform: 'web',
        permissionStatus,
      })
      const view = renderHomeHub()
      fireEvent.click(screen.getByTestId('kolequant-splash'))
      await waitForMenuReady()
      fireEvent.click(screen.getByRole('button', { name: 'Refresh local weather' }))
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(message))
      expect(screen.getByRole('button', { name: 'Refresh local weather' })).toBeEnabled()
      expect(screen.queryByText('Local weather updated.')).toBeNull()

      mockWeatherReason = 'weather:61:rain'
      mockWeatherPermission = 'granted'
      view.rerender(
        <MemoryRouter>
          <HomeHub />
        </MemoryRouter>
      )
      expect(screen.getByRole('status')).toHaveTextContent('Local weather updated.')
      expect(mockRequestWeatherLocation).toHaveBeenCalledOnce()
    }
  )

  it('opens a later season menu without repeating launch artwork', async () => {
    const firstRender = renderHomeHub()

    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitForMenuReady()

    firstRender.unmount()
    mockState.game.gameId = 'game-B'

    renderHomeHub()

    expect(screen.queryByTestId('kolequant-splash')).toBeNull()
    await waitForMenuReady()
  })

  it('opens the return menu without repeating launch artwork after quitting', async () => {
    sessionStorage.setItem('bb:homeHubSplashShownThisSession', 'true')

    renderHomeHub()

    expect(screen.queryByTestId('kolequant-splash')).toBeNull()
    await waitForMenuReady()
  })

  it('still shows the five-second launch splash when the current game was seen previously', () => {
    localStorage.setItem('bb:homeHubSplashLastGameId', 'game-A')

    renderHomeHub()

    expect(screen.getByTestId('kolequant-splash')).toHaveAttribute('data-duration', '5000')
  })

  it('preloads and crossfades a later remote background without hiding the menu', async () => {
    const OriginalImage = window.Image
    class ReadyImage {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.()
        })
      }
    }
    window.Image = ReadyImage as unknown as typeof Image

    let resolveInitialBg = () => {}
    let resolveRemoteBg = () => {}
    preloadImageMock.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          if (url === '/assets/background.jpg') {
            resolveInitialBg = () => resolve({ url, status: 'loaded' })
            return
          }
          if (url === 'https://example.com/remote-bg.jpg') {
            resolveRemoteBg = () => resolve({ url, status: 'loaded' })
            return
          }
          resolve({ url, status: 'loaded' })
        })
    )

    try {
      const view = renderHomeHub()

      fireEvent.click(screen.getByTestId('kolequant-splash'))
      expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()

      await act(async () => {
        resolveInitialBg()
      })
      await waitForMenuReady()
      const playButton = screen.getByRole('button', { name: 'Play' })

      mockState.remoteConfig.config = {
        season: {
          introHub: {
            backgroundImageUrl: 'https://example.com/remote-bg.jpg',
          },
        },
      }
      view.rerender(
        <MemoryRouter>
          <HomeHub />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(preloadImageMock).toHaveBeenCalledWith('https://example.com/remote-bg.jpg')
      })
      expect(screen.getByRole('button', { name: 'Play' })).toBe(playButton)
      expect(
        document.querySelector<HTMLElement>('.homehub-intro-bg--active')?.style.backgroundImage
      ).toContain('/assets/background.jpg')

      await act(async () => {
        resolveRemoteBg()
      })
      await waitFor(() => {
        expect(
          document.querySelector<HTMLElement>('.homehub-intro-bg--active')?.style.backgroundImage
        ).toContain('https://example.com/remote-bg.jpg')
      })
      expect(screen.getByRole('button', { name: 'Play' })).toBe(playButton)
    } finally {
      window.Image = OriginalImage
    }
  })

  it('falls back to the local background when the remote intro-hub image fails to load', async () => {
    const OriginalImage = window.Image
    class ErrorImage {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      set src(_value: string) {
        queueMicrotask(() => {
          this.onerror?.()
        })
      }
    }
    window.Image = ErrorImage as unknown as typeof Image
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      mockState.remoteConfig.config = {
        season: {
          introHub: {
            backgroundImageUrl: 'https://example.com/remote-bg.webp',
          },
        },
      }

      renderHomeHub()

      fireEvent.click(screen.getByTestId('kolequant-splash'))

      await waitForMenuReady()

      const bgLayer = document.querySelector<HTMLElement>('.homehub-intro-bg')
      expect(bgLayer?.style.backgroundImage).toContain('/assets/background.jpg')
      expect(bgLayer?.style.backgroundImage).not.toContain('remote-bg.webp')
    } finally {
      warnSpy.mockRestore()
      window.Image = OriginalImage
    }
  })

  it('crossfades a decoded background while keeping the menu mounted', async () => {
    const view = renderHomeHub()
    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitForMenuReady()
    const playButton = screen.getByRole('button', { name: 'Play' })

    mockBackgroundUrl = '/assets/next-background.jpg'
    view.rerender(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>
    )

    await waitFor(() => {
      const activeLayer = document.querySelector<HTMLElement>('.homehub-intro-bg--active')
      expect(activeLayer?.style.backgroundImage).toContain('/assets/next-background.jpg')
    })

    expect(screen.getByRole('button', { name: 'Play' })).toBe(playButton)
    expect(document.querySelector('.homehub-intro-bg--previous')).toBeInTheDocument()
  })

  it('keeps the last displayed scene when a replacement background times out', async () => {
    const failedUrl = '/assets/slow-background.jpg'
    preloadImageMock.mockImplementation(async (url: string) => ({
      url,
      status: url === failedUrl ? ('timeout' as const) : ('loaded' as const),
    }))

    const view = renderHomeHub()
    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitFor(() => {
      expect(
        document.querySelector<HTMLElement>('.homehub-intro-bg--active')?.style.backgroundImage
      ).toContain('/assets/background.jpg')
    })

    mockBackgroundUrl = failedUrl
    view.rerender(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(preloadImageMock).toHaveBeenCalledWith(failedUrl)
    })

    const activeLayer = document.querySelector<HTMLElement>('.homehub-intro-bg--active')
    expect(activeLayer?.style.backgroundImage).toContain('/assets/background.jpg')
    expect(activeLayer?.style.backgroundImage).not.toContain(failedUrl)
  })

  it('keeps the Kolequant splash up until the first-frame hub assets are ready', async () => {
    const pendingResolvers: Array<() => void> = []
    preloadImageMock.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          pendingResolvers.push(() => resolve({ url, status: 'loaded' }))
        })
    )

    const view = renderHomeHub()

    fireEvent.click(screen.getByTestId('kolequant-splash'))

    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()

    await act(async () => {
      while (pendingResolvers.length > 0) {
        pendingResolvers.splice(0).forEach((resolve) => resolve())
        await Promise.resolve()
      }
    })
    view.rerender(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('kolequant-splash')).toBeNull()
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    })
  })

  it('loads first-frame controls before deferring interaction and submenu assets', async () => {
    const requestedUrls: string[] = []
    preloadImageMock.mockImplementation(async (url: string) => {
      requestedUrls.push(url)
      return { url, status: 'loaded' as const }
    })

    renderHomeHub()
    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitForMenuReady()

    expect(requestedUrls).toContain('/assets/buttons/primary_large_normal.svg')
    expect(requestedUrls).toContain('/assets/intro_hub_icons/play.svg')
    expect(requestedUrls).toContain('/assets/intro_hub_icons/campaign.svg')
    expect(requestedUrls).toContain('/assets/side_utilities_button/hall_of_fame_v2.svg')
    expect(requestedUrls).not.toContain('/assets/buttons/primary_large_hover.svg')
    expect(requestedUrls).not.toContain('/assets/buttons/primary_large_disabled.svg')

    await waitFor(
      () => {
        expect(requestedUrls).toContain('/assets/buttons/primary_large_hover.svg')
        expect(requestedUrls).toContain('/assets/buttons/primary_large_disabled.svg')
      },
      { timeout: 3000 }
    )
  })

  it('auto-starts the game preloader when returning from Game Over with autoStartGame state', async () => {
    renderHomeHub({ pathname: '/', state: { autoStartGame: true } })

    await waitFor(() => {
      expect(screen.getByTestId('asset-preloader-overlay')).toBeInTheDocument()
    })

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('starts Classic directly from Play without a separate contestant setup page', async () => {
    renderHomeHub()
    fireEvent.click(screen.getByTestId('kolequant-splash'))
    await waitForMenuReady()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Classic' }))
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'game/resetGame' }))
    expect(screen.getByTestId('asset-preloader-overlay')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalledWith('/new-season?mode=classic')
    expect(screen.queryByRole('heading', { name: 'Choose your contestant' })).toBeNull()
  })

  it('keeps the debug launcher out of the player-facing Play menu', async () => {
    renderHomeHub()
    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitForMenuReady()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.queryByRole('button', { name: 'Debug Menu: Off' })).toBeNull()
  })

  it('opens Surveyeval directly for an entitled player', async () => {
    mockState.vip.entitlements.survivalMode = true
    const view = renderHomeHub()

    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitForMenuReady()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Surveyeval' }))

    expect(mockNavigate).not.toHaveBeenCalledWith('/store', { state: { returnTo: '/?menu=play' } })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    view.unmount()
  })

  it('opens the Hubmates cinematic below Profile on the intro hub and returns there', async () => {
    renderHomeHub()
    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitForMenuReady()
    const profile = screen.getByRole('button', { name: 'Profile' })
    const hubmates = screen.getByRole('button', { name: 'Hubmates' })
    expect(
      profile.compareDocumentPosition(hubmates) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(hubmates).toHaveAttribute('data-has-icon', 'true')

    fireEvent.click(hubmates)
    expect(screen.getByTestId('housemates-bio-cinematic')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Return to IntroHub' }))
    expect(screen.queryByTestId('housemates-bio-cinematic')).toBeNull()
    expect(screen.getByRole('button', { name: 'Hubmates' })).toBeInTheDocument()
  })

  it('promotes Market to a menu button and keeps Hall of Fame in the utility-chip slot', async () => {
    renderHomeHub()
    fireEvent.click(screen.getByTestId('kolequant-splash'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Market' })).toBeInTheDocument()
    })

    const store = screen.getByRole('button', { name: 'Market' })
    const hallOfFame = await screen.findByRole('button', { name: 'Hall of Fame' })
    expect(store).toHaveClass('game-btn--secondary_wide')
    expect(store.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/market.svg')
    )
    expect(hallOfFame).toHaveAttribute('data-hub-id', 'leaderboard')
    expect(hallOfFame.querySelector('.hub-chip__icon')).toHaveClass('hub-chip__icon--hall_of_fame')
    expect(
      hallOfFame.querySelector<HTMLElement>('.hub-chip__icon')?.style.backgroundImage
    ).toContain('/assets/side_utilities_button/hall_of_fame_v2.svg')
    expect(hallOfFame.closest('#intro-hub')).not.toBeNull()
    expect(document.querySelector('[data-hub-id="store"]')).toBeNull()

    fireEvent.click(store)
    expect(mockNavigate).toHaveBeenCalledWith('/store', { state: { returnTo: '/' } })

    mockNavigate.mockClear()
    fireEvent.click(hallOfFame)
    expect(mockNavigate).toHaveBeenCalledExactlyOnceWith('/leaderboard')
  })

  it('mirrors the current Redux game state onto window.game for the intro hub', async () => {
    mockState.game = {
      gameId: 'game-A',
      season: 4,
      week: 7,
      phase: 'nominations',
      twinShockConsumed: true,
      players: [{ id: 'user', isUser: true }],
      seasonArchives: [{ seasonId: 'season-3', bellaCast: true }],
    }
    ;(window as Window & { game?: Record<string, unknown> }).game = {
      hubNotifications: { news: true },
    }

    renderHomeHub()

    await waitFor(() => {
      expect((window as Window & { game?: Record<string, unknown> }).game).toMatchObject({
        hubNotifications: { news: true },
        season: 4,
        day: 7,
        week: 7,
        phase: 'nominations',
        twinShockConsumed: true,
        players: [{ id: 'user', isUser: true }],
        seasonArchives: [{ seasonId: 'season-3', bellaCast: true }],
        bellaUnlocked: true,
        achievementSummary: {
          playerName: 'You',
          totals: {
            seasonsPlayed: 1,
          },
        },
      })
      expect(
        (window as Window & { game?: { mysteryWildcards?: unknown[] } }).game?.mysteryWildcards
      ).toHaveLength(6)
    })
  })
})
