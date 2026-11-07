import manifest from './assetManifest.json'

export interface CinematicVideoAsset {
  revision: string
  filePath: string
  sourceFile: string
  runtimePath: string
  posterPath: string
  posterWidth: number
  posterHeight: number
  posterFormat: string
  width: number
  height: number
  durationSeconds: number
  frameRate: number
  encodedBytes: number
  codec: string
  audioTrackCount: number
  fastStart: boolean
  phase: string
  fallback: string
  audioPolicy: string
}

const typedManifest = manifest as {
  schemaVersion: 1
  deliveryBudgets: {
    status: string
    perClipBytes: number | null
    totalBytes: number | null
  }
  assets: Record<string, CinematicVideoAsset>
}

export const CINEMATIC_VIDEO_ASSETS = typedManifest.assets
export const CINEMATIC_VIDEO_DELIVERY_BUDGETS = typedManifest.deliveryBudgets
export type CinematicVideoAssetId = keyof typeof CINEMATIC_VIDEO_ASSETS

export function resolveCinematicMediaUrl(
  runtimePath: string,
  basePath = import.meta.env.BASE_URL || '/',
  documentBase = typeof document === 'undefined' ? undefined : document.baseURI
): string {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  const relativeAssetPath = runtimePath.replace(/^\/+/, '')
  const candidate = `${normalizedBase}${relativeAssetPath}`
  return documentBase ? new URL(candidate, documentBase).toString() : candidate
}

export function releaseCinematicVideoElement(video: HTMLVideoElement | null): void {
  if (!video) return
  video.pause()
  video.removeAttribute('src')
  video.querySelectorAll('source').forEach((source) => source.removeAttribute('src'))
  video.load()
}
