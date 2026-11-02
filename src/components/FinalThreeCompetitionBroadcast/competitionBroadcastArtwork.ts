import { findArt, type CeremonyCharacterArt } from '../../cinematic/ceremonies/runtime.mjs'
import type { Player } from '../../types'
import { joinPublicAssetPath } from '../../utils/avatar'
import backyard from '../../assets/finale/final-power-battle-backyard.webp'

export interface CompetitionBroadcastArtwork {
  background: string
  eye: string
  monitor: string
  mist: string
  contestants: Record<string, string>
}

export function resolveCompetitionBroadcastArtwork(
  players: readonly Player[],
  catalog: CeremonyCharacterArt[]
): CompetitionBroadcastArtwork | null {
  if (players.length < 2 || players.length > 3) return null
  const contestants: Record<string, string> = {}
  for (const player of players) {
    const pose = findArt(player, catalog)?.poses.front
    if (!pose || contestants[player.id]) return null
    contestants[player.id] = joinPublicAssetPath(pose.src)
  }
  return {
    background: backyard,
    eye: joinPublicAssetPath('assets/ceremonies/final-decision/token.webp'),
    monitor: joinPublicAssetPath('assets/ceremonies/final-decision/monitor.webp'),
    mist: joinPublicAssetPath('assets/ceremonies/vfx/natural-mist-v2.webp'),
    contestants,
  }
}

function decodeImage(src: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', cancel)
      if (error) {
        image.removeAttribute('src')
        reject(error)
      } else resolve()
    }
    const cancel = () => finish(new Error('Competition artwork preparation cancelled'))
    if (signal.aborted) {
      cancel()
      return
    }
    signal.addEventListener('abort', cancel, { once: true })
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image.decode().then(
          () => finish(),
          () => finish(new Error('Competition artwork could not be decoded'))
        )
      } else finish()
    }
    image.onerror = () => finish(new Error('Competition artwork could not be loaded'))
    image.src = src
  })
}

export async function prepareCompetitionBroadcastArtwork(
  players: readonly Player[],
  signal: AbortSignal
): Promise<CompetitionBroadcastArtwork> {
  const catalog = await import('../../cinematic/ceremonies/cast.json')
  if (signal.aborted) throw new Error('Competition artwork preparation cancelled')
  const artwork = resolveCompetitionBroadcastArtwork(players, catalog.default.characters)
  if (!artwork) throw new Error('Competition cast has no complete ceremony artwork')
  await Promise.all(
    [
      artwork.background,
      artwork.eye,
      artwork.monitor,
      artwork.mist,
      ...Object.values(artwork.contestants),
    ].map((src) => decodeImage(src, signal))
  )
  return artwork
}
