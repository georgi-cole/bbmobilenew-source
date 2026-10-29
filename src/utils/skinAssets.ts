import { Capacitor } from '@capacitor/core'
import type { PermissionState } from '@capacitor/core'
import skinRegistry from '../data/skinRegistry.json'
import { AVATAR_ASSET_FILES } from '../data/avatarAssetManifest'

export type TimeOfDayKey = 'sunrise' | 'day' | 'sunset' | 'night'
export type WeatherThemeKey = 'rain' | 'drizzle' | 'snow' | 'wind' | 'fog' | 'storm' | 'rainbow'
export type HolidayThemeKey = 'christmas' | 'halloween' | 'newYear' | 'easter' | 'independenceDay'
export type ThemeKey =
  | TimeOfDayKey
  | `weather:${WeatherThemeKey}:${TimeOfDayKey | 'any'}`
  | `holiday:${HolidayThemeKey}:${TimeOfDayKey | 'any'}`
  | `holiday:${HolidayThemeKey}:${WeatherThemeKey}:${TimeOfDayKey | 'any'}`

export type PlatformLabel = 'web' | 'ios' | 'android'
export type SkinAssetSource = 'bundled' | 'public'
export type GeolocationPermissionStatus = PermissionState | 'unsupported' | 'unknown'

export interface SkinRegistryEntry {
  label: string
  canonicalFile: string
  aliases?: string[]
}

export type SkinRegistry = Partial<Record<ThemeKey, SkinRegistryEntry>>

export interface SkinAssetResolution {
  key: ThemeKey
  label: string
  file: string
  url: string
  source: SkinAssetSource
  candidates: string[]
}

export const SKIN_REGISTRY = skinRegistry as SkinRegistry

// Public assets are shipped as files. Filename metadata avoids importing every
// image module while the player is only opening the home screen.
const AVATAR_FILES = new Set<string>(AVATAR_ASSET_FILES)
const REGISTERED_SKIN_FILES = new Set(
  Object.values(SKIN_REGISTRY).flatMap((entry) => [entry.canonicalFile, ...(entry.aliases ?? [])])
)

function unique(values: string[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === 'string' && value.length > 0)
    ),
  ]
}

function getRegistryEntry(key: ThemeKey): SkinRegistryEntry | undefined {
  return SKIN_REGISTRY[key]
}

function buildPublicSkinUrl(filename: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}assets/skins/${filename}`
}

export function resolveSkinAssetPath(filename: string): string {
  return buildPublicSkinUrl(filename)
}

export function hasSkinAsset(filename: string): boolean {
  return AVATAR_FILES.has(filename) || REGISTERED_SKIN_FILES.has(filename)
}

export function resolveSkinAssetPathWithFallback(
  filename: string,
  fallbackFilename?: string
): string {
  if (hasSkinAsset(filename)) {
    return resolveSkinAssetPath(filename)
  }
  if (fallbackFilename) {
    return resolveSkinAssetPath(fallbackFilename)
  }
  return resolveSkinAssetPath(filename)
}

function resolveSkinAssetWithoutFallback(key: ThemeKey): SkinAssetResolution | null {
  const entry = getRegistryEntry(key)
  if (!entry) return null
  const candidates = unique([entry.canonicalFile, ...(entry.aliases ?? [])])

  for (const file of candidates) {
    if (hasSkinAsset(file)) {
      return {
        key,
        label: entry.label,
        file,
        url: buildPublicSkinUrl(file),
        source: 'public',
        candidates,
      }
    }
  }

  return null
}

export function getSkinCandidates(key: ThemeKey): string[] {
  const entry = getRegistryEntry(key)
  if (!entry) return []
  return unique([entry.canonicalFile, ...(entry.aliases ?? [])])
}

export function resolveSkinAsset(key: ThemeKey, fallbackKey?: ThemeKey): SkinAssetResolution {
  const primary = resolveSkinAssetWithoutFallback(key)
  if (primary) {
    return primary
  }

  if (fallbackKey && fallbackKey !== key) {
    const fallback = resolveSkinAssetWithoutFallback(fallbackKey)
    if (fallback) {
      return fallback
    }
  }

  const entry = getRegistryEntry(fallbackKey ?? key) ?? getRegistryEntry('day')
  if (!entry) {
    throw new Error('The background manifest must include a day fallback.')
  }
  const candidates = unique([entry.canonicalFile, ...(entry.aliases ?? [])])
  const file = candidates[0] ?? `${fallbackKey ?? key}.png`

  return {
    key: fallbackKey ?? key,
    label: entry.label,
    file,
    url: resolveSkinAssetPath(file),
    source: 'public',
    candidates,
  }
}

export function getPlatformLabel(): PlatformLabel {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()
    return platform === 'ios' || platform === 'android' ? platform : 'web'
  }

  return 'web'
}

export function getBinaryFallbackKey(date: Date): Extract<ThemeKey, 'day' | 'night'> {
  const hour = date.getHours()
  return hour >= 6 && hour < 18 ? 'day' : 'night'
}
