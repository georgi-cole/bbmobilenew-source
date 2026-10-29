import type { Player } from '../types'
import { coerceAppearanceSelection, type AppearanceSelection } from './catalog'
import type { ProfileBio } from '../store/profilesSlice'

/** A small identity snapshot owned by a run, independent of player settings. */
export interface SeasonContestant {
  version: 1
  name: string
  avatar: string
  appearanceSelection?: AppearanceSelection
  photoId?: string
  presetId?: string
  presetRevision?: number
  bio: ProfileBio
}

/** Invalid optional preferences fall back to the ordinary profile defaults. */
export function coerceContestantDefaults(raw: unknown): SeasonContestant | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Partial<SeasonContestant>
  if (
    value.version !== 1 ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    typeof value.avatar !== 'string' ||
    !value.avatar ||
    !value.bio ||
    typeof value.bio !== 'object'
  )
    return undefined
  const age = Number(value.bio.age)
  if (!Number.isInteger(age) || age < 18 || age > 120) return undefined
  const bio: ProfileBio = { age: String(age) }
  for (const key of [
    'sex',
    'location',
    'profession',
    'story',
    'motto',
    'funFact',
    'zodiac',
    'education',
    'familyStatus',
    'kids',
    'pets',
    'religion',
    'sexuality',
  ] as const) {
    if (typeof value.bio[key] === 'string') bio[key] = value.bio[key]
  }
  const role = value.bio.reproductiveProfile
  if (
    role &&
    typeof role.canBecomePregnant === 'boolean' &&
    typeof role.canCausePregnancy === 'boolean'
  )
    bio.reproductiveProfile = {
      canBecomePregnant: role.canBecomePregnant,
      canCausePregnancy: role.canCausePregnancy,
    }
  return {
    version: 1,
    name: value.name.trim(),
    avatar: value.avatar,
    ...(value.appearanceSelection
      ? { appearanceSelection: coerceAppearanceSelection(value.appearanceSelection) }
      : {}),
    bio,
    ...(typeof value.photoId === 'string' && value.photoId ? { photoId: value.photoId } : {}),
    ...(typeof value.presetId === 'string' &&
    Number.isInteger(value.presetRevision) &&
    (value.presetRevision ?? 0) > 0
      ? { presetId: value.presetId, presetRevision: value.presetRevision }
      : {}),
  }
}

let launchContestant: SeasonContestant | undefined

/** Synchronous launch context, restored even if a reducer throws. */
export function withSeasonContestant<T>(contestant: SeasonContestant, launch: () => T): T {
  const previous = launchContestant
  launchContestant = structuredClone(contestant)
  try {
    return launch()
  } finally {
    launchContestant = previous
  }
}

export function getLaunchContestant(): SeasonContestant | undefined {
  return launchContestant
}

export function contestantFromProfile(profile: {
  name: string
  avatar: string
  appearanceSelection?: AppearanceSelection
  photoId?: string
  bio?: ProfileBio
}): SeasonContestant {
  return {
    version: 1,
    name: profile.name,
    avatar: profile.avatar,
    appearanceSelection: profile.appearanceSelection
      ? { ...profile.appearanceSelection }
      : undefined,
    ...(profile.photoId ? { photoId: profile.photoId } : {}),
    bio: {
      ...profile.bio,
      reproductiveProfile: profile.bio?.reproductiveProfile
        ? { ...profile.bio.reproductiveProfile }
        : undefined,
    },
  }
}

/** Legacy saves inherit their own contestant, never the currently edited profile. */
export function contestantFromPlayer(player: Player): SeasonContestant {
  return {
    version: 1,
    name: player.name,
    avatar: player.avatar,
    appearanceSelection: player.appearance ? { ...player.appearance } : undefined,
    bio: {
      ...(player.age !== undefined ? { age: String(player.age) } : {}),
      ...(player.sex ? { sex: player.sex } : {}),
      ...(player.reproductiveProfile
        ? { reproductiveProfile: { ...player.reproductiveProfile } }
        : {}),
    },
  }
}
