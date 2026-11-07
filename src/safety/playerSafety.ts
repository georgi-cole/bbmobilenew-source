/** Local admission decisions are self-declarations, never verified age or parental consent. */
export const PLAYER_SAFETY_KEY = 'bbmobilenew:player-safety:v1'
export const PLAYER_SAFETY_POLICY_VERSION = 1
export type PlayerAgeBand = 'under13' | '13to15' | '16to17' | 'adult'
export type OptionalPlayerFeature = 'location' | 'analytics' | 'onlineServices' | 'ads'

export interface PlayerSafetyRecord {
  version: typeof PLAYER_SAFETY_POLICY_VERSION
  ageBand: PlayerAgeBand
  guardianPlayPermission: boolean
  optionalFeatures: Record<OptionalPlayerFeature, boolean>
}

const AGE_BANDS: PlayerAgeBand[] = ['under13', '13to15', '16to17', 'adult']
const EMPTY_FEATURES = { location: false, analytics: false, onlineServices: false, ads: false }

/** Build-time product policy. Only lower this after reviewing content ratings and territories. */
export function getMinimumPlayAge(): 13 | 16 | 18 {
  const configured = import.meta.env.VITE_GAME_MINIMUM_AGE
  return configured === '13' ? 13 : configured === '16' ? 16 : 18
}

export function meetsMinimumPlayAge(record: PlayerSafetyRecord): boolean {
  const youngest =
    record.ageBand === 'adult'
      ? 18
      : record.ageBand === '16to17'
        ? 16
        : record.ageBand === '13to15'
          ? 13
          : 0
  return youngest >= getMinimumPlayAge()
}
const listeners = new Set<() => void>()
let lastStorage: Storage | undefined
let lastRaw: string | null | undefined
let snapshot: PlayerSafetyRecord | null = null

function parseRecord(raw: string | null): PlayerSafetyRecord | null {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<PlayerSafetyRecord> | null
    if (
      !value ||
      value.version !== PLAYER_SAFETY_POLICY_VERSION ||
      !AGE_BANDS.includes(value.ageBand!)
    )
      return null
    return {
      version: PLAYER_SAFETY_POLICY_VERSION,
      ageBand: value.ageBand!,
      guardianPlayPermission: value.guardianPlayPermission === true,
      optionalFeatures: Object.fromEntries(
        Object.keys(EMPTY_FEATURES).map((key) => [
          key,
          value.ageBand === 'adult' &&
            value.optionalFeatures?.[key as OptionalPlayerFeature] === true,
        ])
      ) as Record<OptionalPlayerFeature, boolean>,
    }
  } catch {
    return null
  }
}

export function getPlayerSafety(): PlayerSafetyRecord | null {
  try {
    const storage = localStorage
    const raw = storage.getItem(PLAYER_SAFETY_KEY)
    if (storage !== lastStorage || raw !== lastRaw) {
      // A second tab can tighten admission, but removing/replacing a record must
      // not lift a known child restriction in this running tab.
      const next = parseRecord(raw)
      const sameStorage = storage === lastStorage
      const previous = snapshot
      lastStorage = storage
      lastRaw = raw
      snapshot =
        sameStorage &&
        previous &&
        previous.ageBand !== 'adult' &&
        (!next || AGE_BANDS.indexOf(next.ageBand) > AGE_BANDS.indexOf(previous.ageBand))
          ? { ...previous, optionalFeatures: { ...EMPTY_FEATURES } }
          : next
    }
  } catch {
    if (snapshot?.ageBand === 'adult') snapshot = null
  }
  return snapshot
}

function saveRecord(next: PlayerSafetyRecord): void {
  // Retain a restrictive in-memory decision even when storage is unavailable.
  snapshot = next
  try {
    lastStorage = localStorage
    lastStorage.setItem(PLAYER_SAFETY_KEY, JSON.stringify(next))
    lastRaw = lastStorage.getItem(PLAYER_SAFETY_KEY)
  } catch {
    try {
      // Never leave an older persisted adult grant behind a failed downgrade.
      localStorage.removeItem(PLAYER_SAFETY_KEY)
      lastRaw = null
    } catch {
      // The in-memory restriction still applies when storage is entirely unavailable.
    }
    if (next.ageBand === 'adult') snapshot = null
  }
  listeners.forEach((listener) => listener())
}

export function ageBandForAge(value: unknown): PlayerAgeBand | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '')
    return null
  const age = Number(value)
  if (!Number.isInteger(age) || age < 0 || age > 120) return null
  return age < 13 ? 'under13' : age < 16 ? '13to15' : age < 18 ? '16to17' : 'adult'
}

export function declarePlayerAge(age: unknown): boolean {
  const requested = ageBandForAge(age)
  if (!requested) return false
  const previous = getPlayerSafety()
  const band =
    previous && AGE_BANDS.indexOf(previous.ageBand) < AGE_BANDS.indexOf(requested)
      ? previous.ageBand
      : requested
  saveRecord({
    version: PLAYER_SAFETY_POLICY_VERSION,
    ageBand: band,
    guardianPlayPermission: Boolean(previous?.ageBand === band && previous.guardianPlayPermission),
    optionalFeatures:
      band === 'adult' && previous?.ageBand === 'adult'
        ? previous.optionalFeatures
        : { ...EMPTY_FEATURES },
  })
  return getPlayerSafety() !== null
}

/** Household permission for teen local play; explicitly not verifiable privacy consent. */
export function acknowledgeGuardianPlayPermission(): void {
  const current = getPlayerSafety()
  if (!current || current.ageBand === 'under13' || current.ageBand === 'adult') return
  saveRecord({ ...current, guardianPlayPermission: true, optionalFeatures: { ...EMPTY_FEATURES } })
}

export function withdrawGuardianPlayPermission(): void {
  const current = getPlayerSafety()
  if (!current || current.ageBand === 'adult') return
  saveRecord({ ...current, guardianPlayPermission: false, optionalFeatures: { ...EMPTY_FEATURES } })
}

export function canPlayWithSafety(record = getPlayerSafety()): boolean {
  return Boolean(
    record &&
    record.ageBand !== 'under13' &&
    meetsMinimumPlayAge(record) &&
    (record.ageBand === 'adult' || record.guardianPlayPermission)
  )
}

export function canUseAdultServices(): boolean {
  return getPlayerSafety()?.ageBand === 'adult'
}

export function canUseOptionalFeature(feature: OptionalPlayerFeature): boolean {
  const current = getPlayerSafety()
  return current?.ageBand === 'adult' && current.optionalFeatures[feature] === true
}

export function setOptionalPlayerFeature(feature: OptionalPlayerFeature, enabled: boolean): void {
  const current = getPlayerSafety()
  if (!current || current.ageBand !== 'adult') return
  saveRecord({ ...current, optionalFeatures: { ...current.optionalFeatures, [feature]: enabled } })
}

export function assertAdultServicesAllowed(): void {
  if (!canUseAdultServices())
    throw new Error(
      'An adult must manage store purchases and restoration. Open Player privacy & family for details.'
    )
}

export function assertOnlineServicesAllowed(): void {
  if (!canUseOptionalFeature('onlineServices'))
    throw new Error('Online services are off. An adult can manage them in Player privacy & family.')
}

/** Legacy ranges use the youngest plausible age; absent data never grants admission. */
export function reconcileProfileAge(age: unknown): void {
  if (typeof age !== 'string' && typeof age !== 'number') return
  const values = String(age)
    .match(/\d{1,3}/g)
    ?.map(Number)
    .filter((value) => value >= 0 && value <= 120)
  if (!values?.length) return
  const youngest = Math.min(...values)
  const band = ageBandForAge(youngest)!
  const current = getPlayerSafety()
  if (
    band !== 'adult' &&
    (!current || AGE_BANDS.indexOf(band) < AGE_BANDS.indexOf(current.ageBand))
  )
    declarePlayerAge(youngest)
}

export function subscribePlayerSafety(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === PLAYER_SAFETY_KEY || event.key === null) {
      getPlayerSafety()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
