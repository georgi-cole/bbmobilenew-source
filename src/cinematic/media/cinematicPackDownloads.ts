import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { useSyncExternalStore } from 'react'
import {
  VIP_CINEMATIC_PACK,
  vipCinematicMediaLibrary,
  type VerifiedCinematicFile,
  type VipCinematicPackManifest,
} from './vipCinematicPack'

export interface PackInspection {
  installed: boolean
  files?: VerifiedCinematicFile[]
}
interface PackProgress {
  bytes: number
  verifying?: boolean
}
export interface CinematicPackBackend {
  inspect(options: { manifest: VipCinematicPackManifest }): Promise<PackInspection>
  download(options: { manifest: VipCinematicPackManifest; url: string }): Promise<PackInspection>
  cancel(): Promise<void>
  remove(options: { manifest: VipCinematicPackManifest }): Promise<void>
  addListener(
    event: 'progress',
    listener: (progress: PackProgress) => void
  ): Promise<PluginListenerHandle>
}
const nativePack = registerPlugin<CinematicPackBackend>('CinematicPack')
export const supportsCinematicDownloads = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('CinematicPack')
export type PackStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'error'
export interface PackDownloadState {
  status: PackStatus
  bytes: number
  error: string | null
  prompt: number
  choice: 'standard' | 'cinematic' | null
}
const CHOICE_KEY = 'big-eye.cinematic-download-choice.v1'
const readChoice = (): PackDownloadState['choice'] => {
  try {
    const value = localStorage.getItem(CHOICE_KEY)
    return value === 'standard' || value === 'cinematic' ? value : null
  } catch {
    return null
  }
}

export function createCinematicPackDownloads(
  backend: CinematicPackBackend,
  library = vipCinematicMediaLibrary,
  manifest = VIP_CINEMATIC_PACK,
  initialChoice: PackDownloadState['choice'] = readChoice()
) {
  let state: PackDownloadState = {
    status: 'idle',
    bytes: 0,
    error: null,
    prompt: 0,
    choice: initialChoice,
  }
  const listeners = new Set<() => void>()
  const update = (changes: Partial<PackDownloadState>) => {
    state = { ...state, ...changes }
    listeners.forEach((listener) => listener())
  }
  let initialization: Promise<void> | null = null
  let operation: Promise<boolean> | null = null
  let cancelled = false
  const activate = (result: PackInspection) => {
    if (!result.installed || !result.files) throw new Error('The cinematic download is incomplete.')
    library.activateVerified(manifest.revision, result.files)
    update({ status: 'ready', bytes: manifest.totalBytes, error: null })
  }
  const choose = (choice: 'standard' | 'cinematic') => {
    try {
      localStorage.setItem(CHOICE_KEY, choice)
    } catch {
      /* Storage preferences cannot block play. */
    }
    update({ choice })
  }
  const initialize = (): Promise<void> => {
    initialization ??= (async () => {
      update({ status: 'checking' })
      try {
        const result = await backend.inspect({ manifest })
        if (result.installed) activate(result)
        else update({ status: 'available' })
      } catch {
        update({ status: 'available', error: null })
      }
    })()
    return initialization
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    choose,
    request() {
      update({ prompt: state.prompt + 1 })
    },
    dismiss() {
      update({ prompt: 0 })
    },
    initialize,
    download(): Promise<boolean> {
      if (operation) return operation
      cancelled = false
      operation = (async () => {
        let listener: PluginListenerHandle | undefined
        try {
          await initialize()
          if (cancelled) return false
          if (state.status === 'ready') {
            choose('cinematic')
            return true
          }
          update({ status: 'downloading', bytes: 0, error: null })
          listener = await backend.addListener('progress', ({ bytes, verifying }) => {
            update({
              bytes: Math.min(manifest.totalBytes, Math.max(0, bytes)),
              status: verifying ? 'verifying' : 'downloading',
            })
          })
          if (cancelled) return false
          const result = await backend.download({
            manifest,
            url: `https://github.com/georgi-cole/bbmobilenew-source/releases/download/vip-cinematics-${manifest.revision}/vip-cinematics.pack`,
          })
          if (cancelled) return false
          activate(result)
          choose('cinematic')
          return true
        } catch {
          if (!cancelled)
            update({
              status: 'error',
              error:
                'The download could not be completed. Check your connection and available storage, then try again. Standard play is available offline.',
            })
          return false
        } finally {
          await listener?.remove().catch(() => undefined)
          if (cancelled) update({ status: 'available', bytes: 0, error: null })
          operation = null
        }
      })()
      return operation
    },
    async cancel() {
      cancelled = true
      await backend.cancel().catch(() => undefined)
      await operation
    },
    async remove() {
      if (operation) throw new Error('Finish or cancel the download first.')
      await backend.remove({ manifest })
      library.useBundled()
      choose('standard')
      update({ status: 'available', bytes: 0, error: null })
    },
  }
}
export const cinematicPackDownloads = createCinematicPackDownloads(nativePack)
export const useCinematicPackDownload = () =>
  useSyncExternalStore(cinematicPackDownloads.subscribe, cinematicPackDownloads.getSnapshot)
export const requestCinematicPack = () => {
  if (supportsCinematicDownloads()) cinematicPackDownloads.request()
}
