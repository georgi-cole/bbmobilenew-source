// src/store/profilesSlice.ts
//
// Multi-profile system.
//
// Key behaviours:
//  - Up to MAX_PROFILES (5) saved profiles per device.
//  - "Login" = selecting an active profile (no password/auth).
//  - Guest mode: no stats/archives saved, warning displayed.
//  - Switching profiles always prompts a season-reset confirmation (handled in UI).
//  - Stand-alone helpers (loadProfilesState, loadActiveProfile,
//    archiveKeyForActiveProfile) are safe to call from gameSlice without
//    creating circular Redux dependencies.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { PUBLIC_FAVORITE_FORECAST_EYEOLEANS, type EyeoleanRewardLine } from '../economy/eyeoleans'
import type { RootState } from './store'

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_PROFILES = 5
const PROFILES_STORAGE_KEY = 'bbmobilenew:profiles:v1'
/** Prefix for per-profile season-archive localStorage keys. */
export const DEFAULT_ARCHIVE_KEY_PREFIX = 'bbmobilenew:seasonArchives:'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileBio {
  /** Short personal story / bio paragraph. */
  story?: string
  location?: string
  profession?: string
  /** Age or age range (stored as string so user can write "25" or "mid-20s"). */
  age?: string
  /** Personal motto. */
  motto?: string
  funFact?: string
  zodiac?: string
  education?: string
  familyStatus?: string
  kids?: string
  pets?: string
  /** Religion (optional/sensitive). */
  religion?: string
  /** Sexuality (optional/sensitive). */
  sexuality?: string
}

export interface BellaProgress {
  /** Permanent marker used to unlock Bella's post-Twin casting cadence. */
  twinShockConsumedEver: boolean
  /** Permanent Hubmates unlock; never inferred solely from the capped season archive. */
  unlocked: boolean
  /** True once Bella has actually appeared in a non-debug cast. */
  hasAppeared: boolean
  /** True once the one required compatible Classic season after her first appearance is completed. */
  mandatorySkipConsumed: boolean
}

const DEFAULT_BELLA_PROGRESS: BellaProgress = {
  twinShockConsumedEver: false,
  unlocked: false,
  hasAppeared: false,
  mandatorySkipConsumed: false,
}

function coerceBellaProgress(raw: unknown): BellaProgress | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Partial<BellaProgress>
  return {
    twinShockConsumedEver: value.twinShockConsumedEver === true,
    unlocked: value.unlocked === true,
    hasAppeared: value.hasAppeared === true,
    mandatorySkipConsumed: value.mandatorySkipConsumed === true,
  }
}

export type EyeoleanTransactionSource =
  | 'season_reward'
  | 'forecast_reward'
  | 'store_purchase'
  | 'purchase_credit'
  | 'adjustment'

export interface EyeoleanTransaction {
  /** Stable idempotency key. Duplicate IDs are never applied twice. */
  id: string
  /** Positive = credit, negative = spend. */
  amount: number
  source: EyeoleanTransactionSource
  label: string
  createdAt: string
  seasonId?: string
}

export interface StoredProfile {
  /** Stable unique identifier (timestamp+random). */
  id: string
  /** In-game display name. */
  name: string
  /** Emoji fallback avatar. */
  avatar: string
  /** IndexedDB key for the uploaded photo blob; undefined when no photo set. */
  photoId?: string
  /** Extended biography fields. */
  bio?: ProfileBio
  /** ISO timestamp when the profile was created. */
  createdAt: string
  /**
   * @deprecated Legacy XP is retained only so old profiles can be read safely.
   * New progression uses the Eyeolean wallet.
   */
  lifetimeXp?: number
  /** Persistent soft-currency balance carried across seasons. */
  eyeoleans?: number
  /** Recent wallet ledger entries for auditability and future Store UI. */
  eyeoleanTransactions?: EyeoleanTransaction[]
  /**
   * Long-lived idempotency keys. Kept separately from the trimmed display ledger so
   * an old purchase callback cannot become payable again after enough transactions.
   */
  processedEyeoleanTransactionIds?: string[]
  /** Season settlement IDs already paid; prevents finale reload/replay duplication. */
  settledEyeoleanSeasonIds?: string[]
  /** Permanent achievement identifiers unlocked by this profile. */
  achievements?: string[]
  /** Reward-event keys already paid, preventing a reload from duplicating Eyeoleans. */
  forecastRewardEventIds?: string[]
  /** Permanent Bella discovery/casting cadence state. */
  bellaProgress?: BellaProgress
}

export const PUBLIC_FAVORITE_FORECAST_ACHIEVEMENT = 'public_favorite_oracle'

const MAX_EYEOLEAN_TRANSACTIONS = 500
const MAX_PROCESSED_EYEOLEAN_TRANSACTION_IDS = 5000
const MAX_SETTLED_EYEOLEAN_SEASONS = 1000

export interface ProfilesState {
  profiles: StoredProfile[]
  /** ID of the currently active profile, or null (guest / no selection). */
  activeProfileId: string | null
  /** When true the user is playing as guest — no stats/archives are saved. */
  isGuest: boolean
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_PROFILES_STATE: ProfilesState = {
  profiles: [],
  activeProfileId: null,
  isGuest: false,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collision-resistant profile ID using the Web Crypto API (falls back to timestamp+random). */
function generateId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // Fallback for environments where crypto.randomUUID is unavailable.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  }
}

// ─── Standalone persistence helpers ──────────────────────────────────────────
// These functions do NOT import the Redux store, so they are safe to call from
// gameSlice.ts (or any module that runs before the store is created).

/**
 * Coerce a raw parsed value into a valid StoredProfile, normalizing any
 * missing/invalid fields to safe defaults so corrupted localStorage entries
 * do not cause runtime errors downstream (e.g. new Date(createdAt) crashes,
 * rendering undefined name, etc.).
 */
function coerceEyeoleanTransaction(raw: unknown): EyeoleanTransaction | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<EyeoleanTransaction>
  const allowedSources: EyeoleanTransactionSource[] = [
    'season_reward',
    'forecast_reward',
    'store_purchase',
    'purchase_credit',
    'adjustment',
  ]
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.amount !== 'number' ||
    !Number.isFinite(value.amount) ||
    value.amount === 0 ||
    typeof value.source !== 'string' ||
    !allowedSources.includes(value.source as EyeoleanTransactionSource) ||
    typeof value.label !== 'string' ||
    !value.label ||
    typeof value.createdAt !== 'string' ||
    !value.createdAt
  ) {
    return null
  }

  return {
    id: value.id,
    amount: Math.trunc(value.amount),
    source: value.source as EyeoleanTransactionSource,
    label: value.label,
    createdAt: value.createdAt,
    seasonId: typeof value.seasonId === 'string' && value.seasonId ? value.seasonId : undefined,
  }
}

function appendEyeoleanTransaction(
  profile: StoredProfile,
  transaction: EyeoleanTransaction
): boolean {
  const transactions = profile.eyeoleanTransactions ?? []
  const processedIds = profile.processedEyeoleanTransactionIds ?? transactions.map((entry) => entry.id)
  if (processedIds.includes(transaction.id)) return false

  profile.eyeoleanTransactions = [...transactions, transaction].slice(-MAX_EYEOLEAN_TRANSACTIONS)
  profile.processedEyeoleanTransactionIds = [...processedIds, transaction.id].slice(
    -MAX_PROCESSED_EYEOLEAN_TRANSACTION_IDS
  )
  return true
}

function creditEyeoleans(
  profile: StoredProfile,
  transaction: Omit<EyeoleanTransaction, 'amount'> & { amount: number }
): number {
  if (!Number.isFinite(transaction.amount)) return 0
  const requested = Math.max(0, Math.floor(transaction.amount))
  if (requested <= 0) return 0

  const current = Math.max(0, Math.floor(profile.eyeoleans ?? 0))
  const next = Math.min(Number.MAX_SAFE_INTEGER, current + requested)
  const credited = next - current
  if (credited <= 0) return 0

  if (!appendEyeoleanTransaction(profile, { ...transaction, amount: credited })) return 0
  profile.eyeoleans = next
  return credited
}

function coerceStoredProfile(raw: unknown): StoredProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  // id and createdAt are required; discard the entry if either is missing.
  if (typeof r.id !== 'string' || !r.id) return null
  if (typeof r.createdAt !== 'string' || !r.createdAt) return null

  const forecastRewardEventIds = Array.isArray(r.forecastRewardEventIds)
    ? r.forecastRewardEventIds.filter(
        (eventId): eventId is string => typeof eventId === 'string' && eventId.length > 0
      )
    : []
  const storedEyeoleanBalance =
    typeof r.eyeoleans === 'number' && Number.isFinite(r.eyeoleans)
      ? Math.max(0, Math.floor(r.eyeoleans))
      : null
  // The only shipped XP award was the Public Favorite forecast. Preserve those
  // earned rewards when an old profile first enters the Eyeolean economy.
  const migratedForecastBalance =
    storedEyeoleanBalance == null
      ? forecastRewardEventIds.length * PUBLIC_FAVORITE_FORECAST_EYEOLEANS
      : storedEyeoleanBalance

  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'You',
    avatar: typeof r.avatar === 'string' && r.avatar ? r.avatar : '👤',
    photoId: typeof r.photoId === 'string' && r.photoId ? r.photoId : undefined,
    bio: r.bio && typeof r.bio === 'object' ? (r.bio as ProfileBio) : undefined,
    createdAt: r.createdAt,
    lifetimeXp:
      typeof r.lifetimeXp === 'number' && Number.isFinite(r.lifetimeXp)
        ? Math.max(0, Math.floor(r.lifetimeXp))
        : 0,
    eyeoleans: migratedForecastBalance,
    eyeoleanTransactions: Array.isArray(r.eyeoleanTransactions)
      ? r.eyeoleanTransactions
          .map(coerceEyeoleanTransaction)
          .filter((entry): entry is EyeoleanTransaction => entry !== null)
          .slice(-MAX_EYEOLEAN_TRANSACTIONS)
      : [],
    processedEyeoleanTransactionIds: Array.isArray(r.processedEyeoleanTransactionIds)
      ? r.processedEyeoleanTransactionIds
          .filter(
            (transactionId): transactionId is string =>
              typeof transactionId === 'string' && transactionId.length > 0
          )
          .slice(-MAX_PROCESSED_EYEOLEAN_TRANSACTION_IDS)
      : Array.isArray(r.eyeoleanTransactions)
        ? r.eyeoleanTransactions
            .map(coerceEyeoleanTransaction)
            .filter((entry): entry is EyeoleanTransaction => entry !== null)
            .map((entry) => entry.id)
            .slice(-MAX_PROCESSED_EYEOLEAN_TRANSACTION_IDS)
        : [],
    settledEyeoleanSeasonIds: Array.isArray(r.settledEyeoleanSeasonIds)
      ? r.settledEyeoleanSeasonIds
          .filter(
            (seasonId): seasonId is string => typeof seasonId === 'string' && seasonId.length > 0
          )
          .slice(-MAX_SETTLED_EYEOLEAN_SEASONS)
      : [],
    achievements: Array.isArray(r.achievements)
      ? r.achievements.filter(
          (achievement): achievement is string => typeof achievement === 'string'
        )
      : [],
    forecastRewardEventIds,
    bellaProgress: coerceBellaProgress(r.bellaProgress),
  }
}

/** Load profiles state from localStorage. Returns DEFAULT_PROFILES_STATE on error/miss. */
export function loadProfilesState(): ProfilesState {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY)
    if (!raw) return DEFAULT_PROFILES_STATE
    const parsed = JSON.parse(raw) as Partial<ProfilesState>
    const profiles: StoredProfile[] = Array.isArray(parsed.profiles)
      ? (parsed.profiles as unknown[]).reduce<StoredProfile[]>((acc, p) => {
          const coerced = coerceStoredProfile(p)
          if (coerced) acc.push(coerced)
          return acc
        }, [])
      : []
    return {
      profiles,
      activeProfileId: typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null,
      isGuest: typeof parsed.isGuest === 'boolean' ? parsed.isGuest : false,
    }
  } catch {
    return DEFAULT_PROFILES_STATE
  }
}

/** Persist profiles state to localStorage. Silently ignores errors. */
export function saveProfilesState(state: ProfilesState): void {
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota / private-browsing errors.
  }
}

/**
 * Return the active profile's name and avatar (for use in gameSlice.buildUserPlayer).
 * Falls back through the legacy userProfile storage, then to the hardcoded default.
 */
export function loadActiveProfile(): { name: string; avatar: string; photoId?: string } {
  const state = loadProfilesState()
  if (!state.isGuest && state.activeProfileId) {
    const profile = state.profiles.find((p) => p.id === state.activeProfileId)
    if (profile) return { name: profile.name, avatar: profile.avatar, photoId: profile.photoId }
  }
  // Legacy fallback: read from old userProfile storage key.
  try {
    const raw = localStorage.getItem('bbmobilenew_user_profile_v1')
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; avatar?: string }
      return {
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'You',
        avatar: typeof parsed.avatar === 'string' && parsed.avatar ? parsed.avatar : '👤',
      }
    }
  } catch {
    // ignore
  }
  return { name: 'You', avatar: '👤' }
}

/**
 * Build the localStorage key for a specific profile's season archives.
 * The profile ID is encoded with encodeURIComponent to prevent storage-key
 * injection in the unlikely event that an ID contains special characters.
 */
export function archiveKeyForProfile(profileId: string): string {
  return `${DEFAULT_ARCHIVE_KEY_PREFIX}${encodeURIComponent(profileId)}`
}

/**
 * Build the localStorage key under which season archives are stored for the
 * currently active profile.  Guest mode → returns the global fallback key.
 */
export function archiveKeyForActiveProfile(): string {
  const state = loadProfilesState()
  if (!state.isGuest && state.activeProfileId) {
    return archiveKeyForProfile(state.activeProfileId)
  }
  return 'bbmobilenew:seasonArchives'
}

// ─── Slice ───────────────────────────────────────────────────────────────────

const profilesSlice = createSlice({
  name: 'profiles',
  initialState: DEFAULT_PROFILES_STATE as ProfilesState,
  reducers: {
    /** Replace the full profiles state (used to hydrate from localStorage on boot). */
    initProfiles(_state, action: PayloadAction<ProfilesState>) {
      return action.payload
    },

    /**
     * Create a new profile and make it active.
     * No-op (slice unchanged) if the profile limit is already reached.
     */
    createProfile(
      state,
      action: PayloadAction<{ name: string; avatar: string; photoId?: string }>
    ) {
      if (state.profiles.length >= MAX_PROFILES) return
      const profile: StoredProfile = {
        id: generateId(),
        name: action.payload.name.trim() || 'You',
        avatar: action.payload.avatar || '👤',
        photoId: action.payload.photoId,
        createdAt: new Date().toISOString(),
        eyeoleans: 0,
        eyeoleanTransactions: [],
        processedEyeoleanTransactionIds: [],
        settledEyeoleanSeasonIds: [],
      }
      state.profiles.push(profile)
      state.activeProfileId = profile.id
      state.isGuest = false
    },

    /** Switch the active profile.  No-op if the ID does not exist. */
    selectActiveProfile(state, action: PayloadAction<string>) {
      if (!state.profiles.some((p) => p.id === action.payload)) return
      state.activeProfileId = action.payload
      state.isGuest = false
    },

    /**
     * Update mutable fields on the currently-active profile.
     * `id` and `createdAt` are immutable.
     */
    updateProfile(state, action: PayloadAction<Partial<Omit<StoredProfile, 'id' | 'createdAt'>>>) {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId)
      if (!profile) return
      const { name, avatar, photoId, bio } = action.payload
      if (name !== undefined) profile.name = name.trim() || profile.name
      if (avatar !== undefined) profile.avatar = avatar
      if (photoId !== undefined) profile.photoId = photoId
      if (bio !== undefined) profile.bio = { ...profile.bio, ...bio }
    },

    /** Persist the fact that this profile has consumed the Lia/Ali Twin Shock. */
    recordBellaTwinShockConsumed(state) {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId)
      if (!profile) return
      profile.bellaProgress = {
        ...DEFAULT_BELLA_PROGRESS,
        ...profile.bellaProgress,
        twinShockConsumedEver: true,
      }
    },

    /** Unlock Bella immediately when she enters a real cast. */
    recordBellaEncountered(state) {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId)
      if (!profile) return
      profile.bellaProgress = {
        ...DEFAULT_BELLA_PROGRESS,
        ...profile.bellaProgress,
        unlocked: true,
        hasAppeared: true,
      }
    },

    /**
     * Consume Bella's one mandatory post-debut skip only when a compatible
     * Classic season actually completes without Bella.
     */
    recordBellaCompatibleClassicCompleted(state, action: PayloadAction<{ bellaCast: boolean }>) {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId)
      if (!profile) return
      const progress = {
        ...DEFAULT_BELLA_PROGRESS,
        ...profile.bellaProgress,
      }
      if (action.payload.bellaCast) {
        progress.unlocked = true
        progress.hasAppeared = true
      } else if (progress.hasAppeared && !progress.mandatorySkipConsumed) {
        progress.mandatorySkipConsumed = true
      }
      profile.bellaProgress = progress
    },

    /**
     * Settle a completed season into the active profile wallet exactly once.
     * Guest mode has no active profile, so nothing is banked.
     */
    settleSeasonEyeoleans(
      state,
      action: PayloadAction<{ seasonId: string; rewards: EyeoleanRewardLine[] }>
    ) {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId)
      const seasonId = action.payload.seasonId.trim()
      if (!profile || !seasonId) return

      const settled = profile.settledEyeoleanSeasonIds ?? []
      if (settled.includes(seasonId)) return

      const createdAt = new Date().toISOString()
      action.payload.rewards.forEach((reward) => {
        const amount = Math.max(0, Math.floor(reward.amount))
        if (amount <= 0) return
        creditEyeoleans(profile, {
          id: `${seasonId}:${reward.code}`,
          amount,
          source: 'season_reward',
          label: reward.quantity > 1 ? `${reward.label} ×${reward.quantity}` : reward.label,
          createdAt,
          seasonId,
        })
      })

      profile.settledEyeoleanSeasonIds = [...settled, seasonId].slice(-MAX_SETTLED_EYEOLEAN_SEASONS)
    },

    /**
     * Store-ready debit. A duplicate transaction or insufficient balance is a no-op,
     * preventing double purchases and negative balances.
     */
    spendEyeoleans(
      state,
      action: PayloadAction<{ transactionId: string; amount: number; label: string }>
    ) {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId)
      const transactionId = action.payload.transactionId.trim()
      const label = action.payload.label.trim()
      if (
        !profile ||
        !transactionId ||
        !label ||
        !Number.isFinite(action.payload.amount)
      )
        return
      const amount = Math.max(0, Math.floor(action.payload.amount))
      if (amount <= 0) return

      const processedIds =
        profile.processedEyeoleanTransactionIds ??
        (profile.eyeoleanTransactions ?? []).map((entry) => entry.id)
      if (processedIds.includes(transactionId)) return

      const balance = Math.max(0, Math.floor(profile.eyeoleans ?? 0))
      if (balance < amount) return

      if (
        appendEyeoleanTransaction(profile, {
          id: transactionId,
          amount: -amount,
          source: 'store_purchase',
          label,
          createdAt: new Date().toISOString(),
        })
      ) {
        profile.eyeoleans = balance - amount
      }
    },

    /** Award a correct Public Favorite forecast once per season event. */
    awardPublicFavoriteForecast(state, action: PayloadAction<{ eventId: string }>) {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId)
      if (!profile || !action.payload.eventId) return

      const rewardedEvents = profile.forecastRewardEventIds ?? []
      if (rewardedEvents.includes(action.payload.eventId)) return

      profile.forecastRewardEventIds = [...rewardedEvents, action.payload.eventId].slice(-100)
      creditEyeoleans(profile, {
        id: `forecast:${action.payload.eventId}`,
        amount: PUBLIC_FAVORITE_FORECAST_EYEOLEANS,
        source: 'forecast_reward',
        label: 'Public Favorite forecast',
        createdAt: new Date().toISOString(),
      })
      if (!profile.achievements?.includes(PUBLIC_FAVORITE_FORECAST_ACHIEVEMENT)) {
        profile.achievements = [
          ...(profile.achievements ?? []),
          PUBLIC_FAVORITE_FORECAST_ACHIEVEMENT,
        ]
      }
    },

    /**
     * Delete a profile by ID.
     * If the deleted profile was active, the first remaining profile becomes
     * active (or null if the list is now empty).
     */
    deleteProfile(state, action: PayloadAction<string>) {
      state.profiles = state.profiles.filter((p) => p.id !== action.payload)
      if (state.activeProfileId === action.payload) {
        state.activeProfileId = state.profiles[0]?.id ?? null
      }
    },

    /** Enter guest mode — clears active profile selection. */
    enterGuestMode(state) {
      state.isGuest = true
      state.activeProfileId = null
    },

    /** Exit guest mode — caller must then select or create a profile. */
    exitGuestMode(state) {
      state.isGuest = false
    },
  },
})

// ─── Actions ─────────────────────────────────────────────────────────────────

export const {
  initProfiles,
  createProfile,
  selectActiveProfile,
  updateProfile,
  recordBellaTwinShockConsumed,
  recordBellaEncountered,
  recordBellaCompatibleClassicCompleted,
  settleSeasonEyeoleans,
  spendEyeoleans,
  awardPublicFavoriteForecast,
  deleteProfile,
  enterGuestMode,
  exitGuestMode,
} = profilesSlice.actions

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectAllProfiles = (state: RootState) => state.profiles.profiles
export const selectActiveProfileId = (state: RootState) => state.profiles.activeProfileId
export const selectIsGuest = (state: RootState) => state.profiles.isGuest

/** Returns the active StoredProfile or null (guest / no profile selected). */
export const selectCurrentProfile = (state: RootState): StoredProfile | null => {
  const { profiles, activeProfileId, isGuest } = state.profiles
  if (isGuest || !activeProfileId) return null
  return profiles.find((p) => p.id === activeProfileId) ?? null
}

export const selectEyeoleanBalance = (state: RootState) =>
  selectCurrentProfile(state)?.eyeoleans ?? 0

export default profilesSlice.reducer
