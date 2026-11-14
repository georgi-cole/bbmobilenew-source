import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import vipReducer, { initializeVip } from '../../src/store/vipSlice'
import settingsReducer from '../../src/store/settingsSlice'
import gameReducer from '../../src/store/gameSlice'
import profilesReducer from '../../src/store/profilesSlice'
import { createEmptyStoreEntitlements } from '../../src/vip/vipStorage'
import CinematicPackController from '../../src/components/CinematicPackController/CinematicPackController'
import Settings from '../../src/screens/Settings/Settings'
import { I18nProvider } from '../../src/i18n'
import * as downloads from '../../src/cinematic/media/cinematicPackDownloads'
import { VIP_CINEMATIC_PACK } from '../../src/cinematic/media/vipCinematicPack'

vi.mock('../../src/vip/effectiveEntitlements', () => ({
  isEffectiveVipActive: (vip: { isActive: boolean }) => vip.isActive,
  hasEffectiveStoreEntitlement: (vip: { isActive: boolean }) => vip.isActive,
}))
const proofs = VIP_CINEMATIC_PACK.files.map((file) => ({
  ...file,
  uri: `file:///private/vip/${file.path}`,
}))
let testBackend: downloads.CinematicPackBackend
function mount(settings = false, vip = true) {
  const store = configureStore({
    reducer: {
      vip: vipReducer,
      settings: settingsReducer,
      game: gameReducer,
      profiles: profilesReducer,
    },
  })
  if (vip)
    store.dispatch(
      initializeVip.fulfilled(
        {
          isActive: true,
          billingAvailable: false,
          entitlements: createEmptyStoreEntitlements(),
          products: {},
          verifiedAt: null,
        },
        'offline-vip'
      )
    )
  const result = render(
    <Provider store={store}>
      <I18nProvider>
        <MemoryRouter>
          {settings && <Settings />}
          <CinematicPackController hash="#/settings" />
        </MemoryRouter>
      </I18nProvider>
    </Provider>
  )
  return { store, ...result }
}
beforeEach(() => {
  localStorage.clear()
  const backend: downloads.CinematicPackBackend = {
    inspect: vi.fn(async () => ({ installed: false })),
    download: vi.fn(async () => ({ installed: true, files: proofs })),
    cancel: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
  }
  testBackend = backend
  const manager = downloads.createCinematicPackDownloads(backend, undefined, undefined, null)
  vi.spyOn(downloads, 'supportsCinematicDownloads').mockReturnValue(true)
  vi.spyOn(downloads, 'requestCinematicPack').mockImplementation(manager.request)
  vi.spyOn(downloads.cinematicPackDownloads, 'subscribe').mockImplementation(manager.subscribe)
  vi.spyOn(downloads.cinematicPackDownloads, 'getSnapshot').mockImplementation(manager.getSnapshot)
  for (const name of [
    'initialize',
    'download',
    'cancel',
    'remove',
    'request',
    'dismiss',
    'choose',
  ] as const) {
    vi.spyOn(downloads.cinematicPackDownloads, name).mockImplementation(manager[name] as never)
  }
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('VIP cinematic download prompts', () => {
  it('lets VIP users decline, stays Standard and offers the same download later from Settings', async () => {
    const { store } = mount(true)
    await screen.findByRole('button', { name: 'Keep Standard' })
    expect(screen.getByText(/Download 21.5 MB/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep Standard' }))
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Download cinematic animations' }))
    await screen.findByRole('button', { name: 'Download and enable' })
    fireEvent.click(screen.getByRole('button', { name: 'Download and enable' }))
    await waitFor(() => expect(store.getState().settings.gameUX.animationMode).toBe('cinematic'))
    expect(screen.getByText('Installed · Available offline')).toBeInTheDocument()
  })
  it('shows an error and retry without enabling cinematics when a transfer fails', async () => {
    vi.mocked(testBackend.download).mockRejectedValueOnce(new Error('Connection interrupted'))
    const { store } = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Download and enable' }))
    await waitFor(() => expect(downloads.cinematicPackDownloads.download).toHaveBeenCalled())
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    expect(screen.getByRole('button', { name: 'Keep Standard' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry download' }))
    await waitFor(() => expect(store.getState().settings.gameUX.animationMode).toBe('cinematic'))
  })
  it('does not show a download offer to a non-VIP player', async () => {
    mount(false, false)
    await waitFor(() => expect(downloads.cinematicPackDownloads.initialize).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
