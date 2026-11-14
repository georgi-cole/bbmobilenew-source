import { describe, expect, it, vi } from 'vitest'
import {
  createCinematicPackDownloads,
  type CinematicPackBackend,
} from '../../src/cinematic/media/cinematicPackDownloads'
import {
  createVipCinematicMediaLibrary,
  type VipCinematicPackManifest,
} from '../../src/cinematic/media/vipCinematicPack'

const manifest: VipCinematicPackManifest = {
  schemaVersion: 1,
  packId: 'vip-cinematics',
  rendererVersion: 1,
  revision: 'test-revision',
  catalogSha256: 'test-catalog',
  totalBytes: 24,
  files: Array.from({ length: 8 }, (_, i) => ({
    path: `assets/ceremonies/characters/aria/walk-${i}.webp`,
    bytes: 3,
    sha256: `hash-${i}`,
  })),
}
const installed = {
  installed: true,
  files: manifest.files.map((file) => ({ ...file, uri: `file:///private/offline/${file.path}` })),
}
function fixture() {
  let progress = (_value: { bytes: number; verifying?: boolean }) => {}
  const removeListener = vi.fn(async () => {})
  const backend: CinematicPackBackend = {
    inspect: vi.fn(async () => ({ installed: false })),
    download: vi.fn(async () => installed),
    cancel: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    addListener: vi.fn(async (_event, listener) => {
      progress = listener
      return { remove: removeListener }
    }),
  }
  const library = createVipCinematicMediaLibrary(manifest, {
    bundledUrl: (path) => `bundled:${path}`,
    convertFileSrc: (uri) => uri,
  })
  const manager = createCinematicPackDownloads(backend, library, manifest, null)
  return {
    backend,
    library,
    manager,
    removeListener,
    progress: (value: { bytes: number; verifying?: boolean }) => progress(value),
  }
}

describe('persistent cinematic downloads', () => {
  it('restores verified media offline on a cold start without contacting the download server', async () => {
    const { backend, manager, library } = fixture()
    vi.mocked(backend.inspect).mockResolvedValue(installed)
    await manager.initialize()
    expect(manager.getSnapshot().status).toBe('ready')
    for (const file of manifest.files)
      expect(library.capture()(file.path)).toBe(`file:///private/offline/${file.path}`)
    expect(backend.download).not.toHaveBeenCalled()
    expect(backend.addListener).not.toHaveBeenCalled()
  })
  it('keeps all eight frames inactive until the whole download has completed and tracks progress', async () => {
    const { backend, manager, library, progress, removeListener } = fixture()
    let complete!: (value: typeof installed) => void
    vi.mocked(backend.download).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const downloading = manager.download()
    await vi.waitFor(() => expect(backend.download).toHaveBeenCalledTimes(1))
    progress({ bytes: 12 })
    expect(manager.getSnapshot()).toMatchObject({ status: 'downloading', bytes: 12 })
    expect(library.capture()(manifest.files[0].path)).toMatch(/^bundled:/)
    progress({ bytes: 24, verifying: true })
    expect(manager.getSnapshot().status).toBe('verifying')
    complete(installed)
    expect(await downloading).toBe(true)
    expect(manager.getSnapshot()).toMatchObject({ status: 'ready', choice: 'cinematic' })
    expect(removeListener).toHaveBeenCalledOnce()
  })
  it('rejects missing-frame native receipts without activating a partial walk and allows retry', async () => {
    const { backend, manager, library } = fixture()
    vi.mocked(backend.download).mockResolvedValueOnce({
      ...installed,
      files: installed.files.slice(0, 7),
    })
    expect(await manager.download()).toBe(false)
    expect(manager.getSnapshot().status).toBe('error')
    expect(library.capture()(manifest.files[0].path)).toMatch(/^bundled:/)
    expect(await manager.download()).toBe(true)
  })
  it('handles cancellation and clears its progress listener without losing playable bundled assets', async () => {
    const { backend, manager, library, removeListener } = fixture()
    let interrupt!: (error: Error) => void
    vi.mocked(backend.download).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          interrupt = reject
        })
    )
    vi.mocked(backend.cancel).mockImplementation(async () => {
      interrupt(new Error('Cancelled'))
    })
    const download = manager.download()
    await vi.waitFor(() => expect(backend.download).toHaveBeenCalledOnce())
    await manager.cancel()
    expect(await download).toBe(false)
    expect(manager.getSnapshot()).toMatchObject({ status: 'available', error: null })
    expect(library.capture()(manifest.files[0].path)).toMatch(/^bundled:/)
    expect(removeListener).toHaveBeenCalledOnce()
  })
  it('remembers a decline but accepts an explicit Settings request later', () => {
    const { manager, backend } = fixture()
    manager.request()
    manager.choose('standard')
    manager.dismiss()
    expect(manager.getSnapshot()).toMatchObject({ choice: 'standard', prompt: 0 })
    manager.request()
    expect(manager.getSnapshot().prompt).toBe(1)
    expect(backend.download).not.toHaveBeenCalled()
  })
  it('removes local media independently of purchases and keeps the last source if removal fails', async () => {
    const { backend, manager, library } = fixture()
    await manager.download()
    vi.mocked(backend.remove).mockRejectedValueOnce(new Error('Storage busy'))
    await expect(manager.remove()).rejects.toThrow('Storage busy')
    expect(manager.getSnapshot().status).toBe('ready')
    await manager.remove()
    expect(manager.getSnapshot()).toMatchObject({ status: 'available', choice: 'standard' })
    expect(library.capture()(manifest.files[0].path)).toMatch(/^bundled:/)
  })
  it('does not start duplicate downloads or overlap the cold-start inspection with activation', async () => {
    const { backend, manager } = fixture()
    let finish!: (value: { installed: boolean }) => void
    vi.mocked(backend.inspect).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const initializing = manager.initialize()
    const download = manager.download()
    expect(manager.download()).toBe(download)
    expect(backend.download).not.toHaveBeenCalled()
    finish({ installed: false })
    await initializing
    expect(await download).toBe(true)
    expect(backend.download).toHaveBeenCalledOnce()
  })
})
