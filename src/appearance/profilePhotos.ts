import { loadSavedRunProfile } from '../store/saveStatePersistence'
import { getProfilePhotoAvatarId } from '../utils/avatar'

export function savedProfilePhotoIds(profileId: string): string[] {
  const ids = new Set<string>()
  for (const snapshot of Object.values(loadSavedRunProfile(profileId)?.runs ?? {})) {
    if (!snapshot) continue
    if (snapshot.game.seasonContestant?.photoId) ids.add(snapshot.game.seasonContestant.photoId)
    for (const player of snapshot.game.players) {
      const photoId = getProfilePhotoAvatarId(player.avatar)
      if (photoId) ids.add(photoId)
    }
  }
  return [...ids]
}
