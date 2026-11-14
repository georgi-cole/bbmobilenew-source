import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import vipReducer, { initializeVip } from '../../src/store/vipSlice'
import settingsReducer, { setGameUX } from '../../src/store/settingsSlice'
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
let manager: ReturnType<typeof downloads.createCinematicPackDownloads>
function mount(settings = false, vip = true, mode?: 'standard' | 'cinematic') {
  const store = configureStore({
    reducer: {
      vip: vipReducer,
      settings: settingsReducer,
      game: gameReducer,
      profiles: profilesReducer,
    },
  })
  if (mode) store.dispatch(setGameUX({ animationMode: mode }))
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
  manager = downloads.createCinematicPackDownloads(backend, undefined, undefined, null)
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
  it('lets VIP users decline, then download and activate through Animation style without a separate download row', async () => {
    const { store } = mount(true)
    await screen.findByRole('button', { name: 'Stay with Standard' })
    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Download ${(VIP_CINEMATIC_PACK.totalBytes / 1_000_000).toFixed(1)} MB to turn on cinematic animations`
    )
    expect(screen.queryByText('Cinematic download')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stay with Standard' }))
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(testBackend.download).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'cinematic' } })
    await screen.findByRole('button', { name: 'Download & turn on' })
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    fireEvent.click(screen.getByRole('button', { name: 'Download & turn on' }))
    await waitFor(() => expect(store.getState().settings.gameUX.animationMode).toBe('cinematic'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Remove cinematic download/ })
    ).not.toBeInTheDocument()
    expect(testBackend.download).toHaveBeenCalledOnce()
  })
  it('switches to Standard immediately and can keep the scenes for an instant return without another download', async () => {
    await manager.download()
    const { store } = mount(true)
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'standard' } })
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    expect(screen.getByRole('dialog', { name: 'Keep the cameras ready?' })).toBeInTheDocument()
    expect(testBackend.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep for later' }))
    expect(manager.getSnapshot()).toMatchObject({ status: 'ready', choice: 'standard' })
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'cinematic' } })
    expect(store.getState().settings.gameUX.animationMode).toBe('cinematic')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(testBackend.download).toHaveBeenCalledOnce()
    expect(testBackend.remove).not.toHaveBeenCalled()
  })
  it('removes scenes after switching to Standard and offers to download them again on the next Cinematic choice', async () => {
    await manager.download()
    const { store } = mount(true)
    const { game, profiles } = store.getState()
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'standard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove animations' }))
    await waitFor(() => expect(manager.getSnapshot().status).toBe('available'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    expect(store.getState().vip.isActive).toBe(true)
    expect(store.getState().game).toEqual(game)
    expect(store.getState().profiles).toEqual(profiles)
    expect(testBackend.remove).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'cinematic' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Download & turn on' }))
    await waitFor(() => expect(store.getState().settings.gameUX.animationMode).toBe('cinematic'))
    expect(testBackend.download).toHaveBeenCalledTimes(2)
  })
  it('keeps the scenes and Standard selected after a removal failure and allows retry in the same prompt', async () => {
    await manager.download()
    vi.mocked(testBackend.remove).mockRejectedValueOnce(new Error('Storage busy'))
    const { store } = mount(true)
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'standard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove animations' }))
    await screen.findByText(/Couldn’t remove the animations/)
    expect(manager.getSnapshot().status).toBe('ready')
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    fireEvent.click(screen.getByRole('button', { name: 'Remove animations' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(testBackend.remove).toHaveBeenCalledTimes(2)
  })
  it('prevents repeat removal and dismissal while the local scenes are being removed', async () => {
    await manager.download()
    let finish!: () => void
    vi.mocked(testBackend.remove).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    mount(true)
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'standard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove animations' }))
    expect(screen.getByRole('button', { name: 'Remove animations' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep for later' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => finish())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(testBackend.remove).toHaveBeenCalledOnce()
  })
  it('protects the current cinematic from removal and lets the player keep its scenes', async () => {
    await manager.download()
    const { container } = mount(true)
    const activeScene = document.createElement('div')
    activeScene.dataset.cinematicActive = 'true'
    container.append(activeScene)
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'standard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove animations' }))
    expect(screen.getByText(/The cameras are still rolling/)).toBeInTheDocument()
    expect(testBackend.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep for later' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('restores kept scenes without a network request and leaves the saved Standard preference alone', async () => {
    vi.mocked(testBackend.inspect).mockResolvedValueOnce({ installed: true, files: proofs })
    manager.choose('standard')
    const { store } = mount(true, true, 'standard')
    await waitFor(() => expect(manager.getSnapshot().status).toBe('ready'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Animation style')).toHaveValue('standard')
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'cinematic' } })
    expect(store.getState().settings.gameUX.animationMode).toBe('cinematic')
    expect(testBackend.download).not.toHaveBeenCalled()
  })
  it('offers a download when a previously selected Cinematic pack is no longer installed', async () => {
    manager.choose('cinematic')
    const { store } = mount(true, true, 'cinematic')
    await waitFor(() => expect(manager.getSnapshot().status).toBe('available'))
    expect(screen.getByLabelText('Animation style')).toHaveValue('standard')
    fireEvent.change(screen.getByLabelText('Animation style'), { target: { value: 'cinematic' } })
    await screen.findByRole('button', { name: 'Download & turn on' })
    fireEvent.click(screen.getByRole('button', { name: 'Stay with Standard' }))
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
  })
  it('shows an error and retry without enabling cinematics when a transfer fails', async () => {
    vi.mocked(testBackend.download).mockRejectedValueOnce(new Error('Connection interrupted'))
    const { store } = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Download & turn on' }))
    await waitFor(() => expect(downloads.cinematicPackDownloads.download).toHaveBeenCalled())
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    expect(screen.getByRole('button', { name: 'Stay with Standard' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Try download again' }))
    await waitFor(() => expect(store.getState().settings.gameUX.animationMode).toBe('cinematic'))
  })
  it('does not show a download offer to a non-VIP player', async () => {
    mount(false, false)
    await waitFor(() => expect(downloads.cinematicPackDownloads.initialize).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('can cancel the stage setup and continue in Standard without activating an incomplete pack', async () => {
    let interrupt!: (error: Error) => void
    vi.mocked(testBackend.download).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          interrupt = reject
        })
    )
    vi.mocked(testBackend.cancel).mockImplementation(async () => {
      interrupt(new Error('Cancelled'))
    })
    const { store } = mount(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Download & turn on' }))
    await screen.findByRole('heading', { name: 'Your close-up is coming…' })
    await waitFor(() => expect(testBackend.download).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel download' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(store.getState().settings.gameUX.animationMode).toBe('standard')
    expect(manager.getSnapshot()).toMatchObject({ status: 'available', choice: 'standard' })
  })
})
