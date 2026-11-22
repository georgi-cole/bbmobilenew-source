import { captureVipCinematicMediaResolver } from '../../cinematic/media/vipCinematicPack'
import { isCinematicMediaAvailable } from '../../cinematic/media/cinematicPackAvailability.mjs'

export function getSocialChallengeArtwork<T extends Record<string, string>>(
  enabled: boolean | undefined,
  files: T
): { [Key in keyof T]: string } | undefined {
  if (!enabled || !isCinematicMediaAvailable()) return
  const resolve = captureVipCinematicMediaResolver()
  try {
    return Object.fromEntries(
      Object.entries(files).map(([name, file]) => [
        name,
        resolve('assets/ceremonies/minigames/' + file),
      ])
    ) as { [Key in keyof T]: string }
  } catch {
    // A pack can become unavailable between the host choosing the mode and mounting the game.
    return undefined
  }
}
