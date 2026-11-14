import { createHash, webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createVipCinematicMediaLibrary,
  VIP_CINEMATIC_PACK,
  type InstalledVipCinematicPack,
  type VipCinematicPackManifest,
} from '../../src/cinematic/media/vipCinematicPack'
import policy from '../../src/cinematic/media/vipCinematicPackPolicy.json'

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const walkingFrames = Array.from({ length: 8 }, (_, index) => ({
  path: `assets/ceremonies/characters/aria/exit-walk-${index + 1}.webp`,
  data: new Uint8Array([index, 2, 3]),
}))
const manifest: VipCinematicPackManifest = {
  schemaVersion: 1,
  packId: 'vip-cinematics',
  rendererVersion: 1,
  revision: 'compatible-revision',
  catalogSha256: 'catalog-digest',
  totalBytes: walkingFrames.reduce((total, frame) => total + frame.data.length, 0),
  files: walkingFrames.map(({ path, data }) => ({
    path,
    bytes: data.length,
    sha256: sha256(data),
  })),
}

function fixture() {
  const bundledUrl = (path: string) => `capacitor://localhost/${path}`
  const library = createVipCinematicMediaLibrary(manifest, {
    bundledUrl,
    convertFileSrc: (uri) => uri.replace('file://', 'http://localhost/_capacitor_file_'),
  })
  const storage: InstalledVipCinematicPack = {
    revision: manifest.revision,
    readFile: vi.fn(async (path) => {
      const frame = walkingFrames.find((frame) => frame.path === path)
      if (!frame) throw new Error('Missing file')
      return frame.data
    }),
    getUri: vi.fn(async (path) => `file:///persistent/vip/${path}`),
  }
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('The device is offline')
    })
  )
  return { library, storage, bundledUrl }
}

afterEach(() => vi.unstubAllGlobals())

describe('optional VIP cinematic media', () => {
  it('keeps shared finale artwork, music, credits and all other non-ceremony media bundled', () => {
    expect(VIP_CINEMATIC_PACK.files.length).toBeGreaterThan(0)
    const paths = VIP_CINEMATIC_PACK.files.map((file) => file.path)
    for (const path of paths) {
      expect(path.startsWith(policy.assetRoot)).toBe(true)
      expect(policy.bundledAssets).not.toContain(path)
      expect(path).toMatch(/\.(webp|png|jpe?g|avif)$/)
    }
    expect(VIP_CINEMATIC_PACK.totalBytes).toBe(
      VIP_CINEMATIC_PACK.files.reduce((total, file) => total + file.bytes, 0)
    )
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('uses bundled media offline until a complete installation is verified', () => {
    const { library, bundledUrl } = fixture()
    const resolve = library.capture()
    for (const frame of walkingFrames) expect(resolve(frame.path)).toBe(bundledUrl(frame.path))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('resolves all eight installed walking frames locally with no network access', async () => {
    const { library, storage, bundledUrl } = fixture()
    await library.activate(storage)
    const resolve = library.capture()
    for (const frame of walkingFrames) {
      expect(resolve(frame.path)).toBe(
        `http://localhost/_capacitor_file_/persistent/vip/${frame.path}`
      )
    }
    for (const path of [
      ...policy.bundledAssets,
      'assets/music/final_three_week.mp3',
      'assets/credits/big-eye-cinematic-background.mp4',
    ]) {
      expect(resolve(path)).toBe(bundledUrl(path))
    }
    expect(storage.readFile).toHaveBeenCalledTimes(8)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a partial eight-frame walk without activating any of its frames', async () => {
    const { library, storage, bundledUrl } = fixture()
    storage.readFile = vi.fn(async (path) => {
      const frame = walkingFrames.find((frame) => frame.path === path)
      if (!frame || frame === walkingFrames[7]) throw new Error('Download interrupted')
      return frame.data
    })
    await expect(library.activate(storage)).rejects.toThrow('Download interrupted')
    expect(library.capture()(walkingFrames[0].path)).toBe(bundledUrl(walkingFrames[0].path))
  })

  it('detects same-size corruption and retains the previously verified installation', async () => {
    const { library, storage } = fixture()
    await library.activate(storage)
    const original = library.capture()(walkingFrames[0].path)
    await expect(
      library.activate({
        ...storage,
        readFile: async () => new Uint8Array([255, 255, 255]),
      })
    ).rejects.toThrow('Incomplete or damaged')
    expect(library.capture()(walkingFrames[0].path)).toBe(original)
  })

  it('rejects incompatible choreography revisions and remote URLs', async () => {
    const { library, storage } = fixture()
    await expect(library.activate({ ...storage, revision: 'older-walk' })).rejects.toThrow(
      'does not match'
    )
    expect(storage.readFile).not.toHaveBeenCalled()
    await expect(
      library.activate({ ...storage, getUri: async () => 'https://cdn.example/walk.webp' })
    ).rejects.toThrow('must be stored on the device')
  })

  it('keeps a running scene on one source when another pack is activated or removed', async () => {
    const { library, storage, bundledUrl } = fixture()
    const beforeInstall = library.capture()
    await library.activate(storage)
    const duringScene = library.capture()
    library.useBundled()
    expect(beforeInstall(walkingFrames[0].path)).toBe(bundledUrl(walkingFrames[0].path))
    expect(duringScene(walkingFrames[0].path)).toContain('/persistent/vip/')
    expect(library.capture()(walkingFrames[0].path)).toBe(bundledUrl(walkingFrames[0].path))
  })

  it('does not activate a download cancelled while a file was being read', async () => {
    const { library, storage, bundledUrl } = fixture()
    const abort = new AbortController()
    const readFile = storage.readFile
    storage.readFile = async (path) => {
      const data = await readFile(path)
      abort.abort()
      return data
    }
    await expect(library.activate(storage, abort.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(library.capture()(walkingFrames[0].path)).toBe(bundledUrl(walkingFrames[0].path))
  })
})
