import {
  findArt,
  type CeremonyCharacterArt,
  type CeremonyCrownAnchor,
} from '../../cinematic/ceremonies/runtime.mjs'
import type { Player } from '../../types'
import { captureVipCinematicMediaResolver } from '../../cinematic/media/vipCinematicPack'
import { FINAL_THREE_SET_PUBLIC_ASSETS } from '../FinalThreeStage/finalThreeSetAssets'

interface FinalDecisionArtwork {
  assets: Record<string, string>
  holderCrownAnchor?: CeremonyCrownAnchor
}

export function resolveFinalDecisionArtwork(
  holder: Player,
  nominees: readonly Player[],
  catalog: CeremonyCharacterArt[],
  presentation: 'classic' | 'vox' = 'classic'
): FinalDecisionArtwork | null {
  if (
    nominees.length !== 2 ||
    nominees[0].id === nominees[1].id ||
    nominees.some((player) => player.id === holder.id)
  ) {
    return null
  }

  const holderPose = findArt(holder, catalog)?.poses[
    presentation === 'vox' ? 'front' : 'royal-standing'
  ]
  const firstPose = findArt(nominees[0], catalog)?.poses.front
  const secondPose = findArt(nominees[1], catalog)?.poses.front
  if (!holderPose || !firstPose || !secondPose) return null
  const resolveMedia = captureVipCinematicMediaResolver()

  return {
    assets: Object.fromEntries(
      Object.entries({
        background: 'assets/ceremonies/final-decision/background.webp',
        foreground: 'assets/ceremonies/final-decision/foreground.webp',
        token: FINAL_THREE_SET_PUBLIC_ASSETS.eye,
        monitor: FINAL_THREE_SET_PUBLIC_ASSETS.monitor,
        holder: holderPose.src,
        'nominee-a': firstPose.src,
        'nominee-b': secondPose.src,
        ...(presentation === 'classic' ? { crown: 'assets/ceremonies/shared/crown.webp' } : {}),
        mist: FINAL_THREE_SET_PUBLIC_ASSETS.mist,
      }).map(([key, path]) => [key, resolveMedia(path)])
    ),
    ...(presentation === 'classic' ? { holderCrownAnchor: holderPose.crown } : {}),
  }
}

function loadArtwork(src: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', abort)
      if (error) {
        image.removeAttribute('src')
        reject(error)
      } else resolve()
    }
    const abort = () => finish(new Error('Final decision preparation cancelled'))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image.decode().then(
          () => finish(),
          () => finish(new Error('Final decision artwork could not be decoded'))
        )
      } else finish()
    }
    image.onerror = () => finish(new Error('Final decision artwork could not be loaded'))
    image.src = src
  })
}

/** Import the catalog and decode only this scene's actual cast after presentation is granted. */
export async function prepareFinalDecisionArtwork(
  holder: Player,
  nominees: readonly Player[],
  signal: AbortSignal,
  presentation: 'classic' | 'vox' = 'classic'
): Promise<FinalDecisionArtwork> {
  const catalog = await import('../../cinematic/ceremonies/cast.json')
  if (signal.aborted) throw new Error('Final decision preparation cancelled')
  const artwork = resolveFinalDecisionArtwork(
    holder,
    nominees,
    catalog.default.characters,
    presentation
  )
  if (!artwork) throw new Error('Final decision cast has no complete ceremony artwork')
  await Promise.all(Object.values(artwork.assets).map((src) => loadArtwork(src, signal)))
  return artwork
}
