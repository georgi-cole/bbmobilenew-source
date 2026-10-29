import type { StoredProfile } from '../../store/profilesSlice'

/** Keep photos, biographies, wallet data, and purchase-like state on this device. */
export function serializeProfileBackup(profile: StoredProfile) {
  return {
    schemaVersion: 1,
    profile: {
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      appearanceSelection: profile.appearanceSelection,
      createdAt: profile.createdAt,
      achievements: profile.achievements ?? [],
      bellaProgress: profile.bellaProgress,
    },
  }
}
