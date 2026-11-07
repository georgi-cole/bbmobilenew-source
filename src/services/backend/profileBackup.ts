import type { StoredProfile } from '../../store/profilesSlice'

/** Explicit allowlist: photos and sensitive/free-form biography fields stay local. */
export function serializeProfileBackup(profile: StoredProfile) {
  return {
    schemaVersion: 1,
    profile: {
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      createdAt: profile.createdAt,
      lifetimeXp: profile.lifetimeXp,
      eyeoleans: profile.eyeoleans,
      eyeoleanTransactions: profile.eyeoleanTransactions,
      eyeoleanInventory: profile.eyeoleanInventory,
      eyeoleanPowerReservations: profile.eyeoleanPowerReservations,
      eyeoleanPowerSeasonProgress: profile.eyeoleanPowerSeasonProgress,
      processedEyeoleanTransactionIds: profile.processedEyeoleanTransactionIds,
      settledEyeoleanSeasonIds: profile.settledEyeoleanSeasonIds,
      achievements: profile.achievements,
      forecastRewardEventIds: profile.forecastRewardEventIds,
      bellaProgress: profile.bellaProgress,
    },
  }
}
