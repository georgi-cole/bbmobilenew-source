import type { ProfileBio } from '../../store/profilesSlice'

const TEXT_FIELDS = [
  'age',
  'sex',
  'story',
  'location',
  'profession',
  'motto',
  'funFact',
  'zodiac',
  'education',
  'familyStatus',
  'kids',
  'pets',
  'religion',
  'sexuality',
] as const satisfies readonly (keyof ProfileBio)[]

export function normalizeProfileBio(
  bio: ProfileBio,
  { clearEmptyFields = false }: { clearEmptyFields?: boolean } = {}
): ProfileBio {
  const normalized: ProfileBio = {}
  for (const key of TEXT_FIELDS) {
    const value = bio[key]?.trim()
    if (value) normalized[key] = value
    else if (clearEmptyFields && Object.hasOwn(bio, key)) normalized[key] = undefined
  }
  if (bio.reproductiveProfile) {
    normalized.reproductiveProfile = { ...bio.reproductiveProfile }
  } else if (clearEmptyFields && Object.hasOwn(bio, 'reproductiveProfile')) {
    normalized.reproductiveProfile = undefined
  }
  return normalized
}
