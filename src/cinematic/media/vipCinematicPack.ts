import { Capacitor } from '@capacitor/core'
import generatedManifest from './vipCinematicPackManifest.json'
import { resolveCinematicMediaUrl } from './cinematicMedia'

export interface VipCinematicPackManifest {
  schemaVersion: number
  packId: string
  rendererVersion: number
  revision: string
  catalogSha256: string
  totalBytes: number
  files: readonly { path: string; bytes: number; sha256: string }[]
}

export interface InstalledVipCinematicPack {
  revision: string
  /** The native download/storage adapter reads persistent local files, without a network fetch. */
  readFile: (assetPath: string) => Promise<Uint8Array>
  getUri: (assetPath: string) => Promise<string>
}

export interface VerifiedCinematicFile {
  path: string
  bytes: number
  sha256: string
  uri: string
}

export type CinematicMediaResolver = (assetPath: string) => string

export const VIP_CINEMATIC_PACK: VipCinematicPackManifest = generatedManifest

async function digest(data: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(data).buffer)
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A verified installation replaces bundled URLs only after the entire compatible pack is ready. */
export function createVipCinematicMediaLibrary(
  manifest: VipCinematicPackManifest,
  options: {
    bundledUrl?: CinematicMediaResolver
    convertFileSrc?: (uri: string) => string
    sha256?: (data: Uint8Array) => Promise<string>
  } = {}
) {
  const bundledUrl = options.bundledUrl ?? resolveCinematicMediaUrl
  const convertFileSrc = options.convertFileSrc ?? Capacitor.convertFileSrc
  const sha256 = options.sha256 ?? digest
  let installed = new Map<string, string>()
  let generation = 0

  return {
    /** Native storage verifies bytes on download and every cold start; accept only the pinned inventory. */
    activateVerified(revision: string, files: readonly VerifiedCinematicFile[]): void {
      if (revision !== manifest.revision || files.length !== manifest.files.length) {
        throw new Error('The cinematic installation is incomplete or incompatible.')
      }
      const proof = new Map(files.map((file) => [file.path, file]))
      const verified = new Map<string, string>()
      for (const file of manifest.files) {
        const local = proof.get(file.path)
        if (
          !local ||
          local.bytes !== file.bytes ||
          local.sha256 !== file.sha256 ||
          !['file:', 'content:'].includes(new URL(local.uri).protocol)
        ) {
          throw new Error('The cinematic installation failed verification.')
        }
        verified.set(file.path, convertFileSrc(local.uri))
      }
      generation += 1
      installed = verified
    },
    async activate(storage: InstalledVipCinematicPack, signal?: AbortSignal): Promise<void> {
      const attempt = ++generation
      const assertActive = () => {
        if (signal?.aborted || attempt !== generation) {
          throw new DOMException('Cinematic pack verification cancelled', 'AbortError')
        }
      }
      assertActive()
      if (storage.revision !== manifest.revision) {
        throw new Error('The cinematic pack does not match this app version.')
      }
      const verified = new Map<string, string>()
      // Verify one file at a time; never decode or retain every character's frames in memory.
      for (const file of manifest.files) {
        assertActive()
        const data = await storage.readFile(file.path)
        assertActive()
        if (data.length !== file.bytes || (await sha256(data)) !== file.sha256) {
          throw new Error(`Incomplete or damaged cinematic media: ${file.path}`)
        }
        const uri = await storage.getUri(file.path)
        if (!['file:', 'content:'].includes(new URL(uri).protocol)) {
          throw new Error('Offline cinematic media must be stored on the device.')
        }
        verified.set(file.path, convertFileSrc(uri))
      }
      assertActive()
      installed = verified
    },
    /** Scenes capture their source once, preventing a pack change halfway through a ceremony. */
    capture(): CinematicMediaResolver {
      const snapshot = installed
      return (assetPath) => snapshot.get(assetPath.replace(/^\/+/, '')) ?? bundledUrl(assetPath)
    },
    useBundled(): void {
      generation += 1
      installed = new Map()
    },
  }
}

// Until the download/storage UI is implemented, normal builds use their existing bundled media.
export const vipCinematicMediaLibrary = createVipCinematicMediaLibrary(VIP_CINEMATIC_PACK)
export const captureVipCinematicMediaResolver = (): CinematicMediaResolver =>
  vipCinematicMediaLibrary.capture()
