import type { SupabaseClient } from '@supabase/supabase-js'
import type { store as appStore } from '../../store/store'
import {
  coerceStoredProfile,
  MAX_PROFILES,
  mergePlayerAccountProfiles,
  unlinkProfileFromPlayerAccount,
  type StoredProfile,
} from '../../store/profilesSlice'
import { getBackendConfig } from './config'
import { getBackendClient, subscribeBackendAuth } from './supabaseTransport'

const PURPOSE = 'player_account'
const DELETED_PROFILES_KEY = 'bbmobilenew:player-account-profile-deletions:v1'
const SYNC_DELAY_MS = 400

type AccountProfileSnapshot = {
  schemaVersion: '1'
  profile: Pick<
    StoredProfile,
    | 'id'
    | 'name'
    | 'avatar'
    | 'appearanceSelection'
    | 'initialAppearanceSelection'
    | 'bio'
    | 'createdAt'
    | 'accountProfileUpdatedAt'
  >
}

type AccountProfileRow = {
  profile_id: string
  snapshot: unknown
  deleted_at: string | null
}

export type AccountProfileSyncStatus = 'disabled' | 'syncing' | 'synced' | 'error'
let syncStatus: AccountProfileSyncStatus = 'disabled'
const listeners = new Set<() => void>()

export function getAccountProfileSyncStatus() {
  return syncStatus
}

export function subscribeAccountProfileSync(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setSyncStatus(next: AccountProfileSyncStatus) {
  syncStatus = next
  listeners.forEach((listener) => listener())
}

function snapshotFor(profile: StoredProfile): AccountProfileSnapshot {
  return {
    schemaVersion: '1',
    profile: {
      id: profile.id,
      name: profile.name,
      avatar: profile.avatar,
      ...(profile.appearanceSelection ? { appearanceSelection: profile.appearanceSelection } : {}),
      ...(profile.initialAppearanceSelection
        ? { initialAppearanceSelection: profile.initialAppearanceSelection }
        : {}),
      ...(profile.bio ? { bio: profile.bio } : {}),
      createdAt: profile.createdAt,
      accountProfileUpdatedAt: profile.accountProfileUpdatedAt ?? profile.createdAt,
    },
  }
}

function parseSnapshot(value: unknown, expectedId: string): StoredProfile | null {
  if (!value || typeof value !== 'object') return null
  const snapshot = value as { schemaVersion?: unknown; profile?: unknown }
  if (snapshot.schemaVersion !== '1' || !snapshot.profile || typeof snapshot.profile !== 'object')
    return null
  const profile = coerceStoredProfile(snapshot.profile)
  if (!profile || profile.id !== expectedId || !Number.isFinite(Date.parse(profile.createdAt)))
    return null

  const rawBio = (snapshot.profile as { bio?: unknown }).bio
  const bio = coerceSyncedBio(rawBio)
  return {
    id: profile.id,
    name: profile.name.slice(0, 24),
    avatar: profile.avatar.slice(0, 64),
    appearanceSelection: profile.appearanceSelection,
    ...(profile.initialAppearanceSelection
      ? { initialAppearanceSelection: profile.initialAppearanceSelection }
      : {}),
    ...(bio ? { bio } : {}),
    createdAt: profile.createdAt,
    accountProfileUpdatedAt: profile.accountProfileUpdatedAt ?? profile.createdAt,
  }
}

function coerceSyncedBio(value: unknown): StoredProfile['bio'] {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const keys = [
    'story',
    'location',
    'profession',
    'age',
    'sex',
    'motto',
    'funFact',
    'zodiac',
    'education',
    'familyStatus',
    'kids',
    'pets',
    'religion',
    'sexuality',
  ] as const
  const bio: NonNullable<StoredProfile['bio']> = {}
  for (const key of keys) {
    if (typeof source[key] === 'string') bio[key] = source[key].slice(0, 500)
  }
  if (source.reproductiveProfile && typeof source.reproductiveProfile === 'object') {
    const reproductiveProfile = source.reproductiveProfile as Record<string, unknown>
    const safeReproductiveProfile = {
      ...(typeof reproductiveProfile.canBecomePregnant === 'boolean'
        ? { canBecomePregnant: reproductiveProfile.canBecomePregnant }
        : {}),
      ...(typeof reproductiveProfile.canCausePregnancy === 'boolean'
        ? { canCausePregnancy: reproductiveProfile.canCausePregnancy }
        : {}),
    }
    if (Object.keys(safeReproductiveProfile).length)
      bio.reproductiveProfile = safeReproductiveProfile
  }
  return Object.keys(bio).length ? bio : undefined
}

function readPendingDeletes(): Array<{ accountId: string; profileId: string }> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DELETED_PROFILES_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is { accountId: string; profileId: string } =>
      Boolean(
        item &&
        typeof item === 'object' &&
        typeof item.accountId === 'string' &&
        typeof item.profileId === 'string'
      )
    )
  } catch {
    return []
  }
}

function writePendingDeletes(items: Array<{ accountId: string; profileId: string }>) {
  try {
    localStorage.setItem(DELETED_PROFILES_KEY, JSON.stringify(items))
  } catch {
    setSyncStatus('error')
  }
}

function queueDelete(accountId: string, profileId: string) {
  const pending = readPendingDeletes()
  if (!pending.some((item) => item.accountId === accountId && item.profileId === profileId)) {
    pending.push({ accountId, profileId })
    writePendingDeletes(pending)
  }
}

async function verifiedAccountId(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  const user = data.session?.user
  if (!user || user.is_anonymous || !user.email || !user.email_confirmed_at) return null
  return user.id
}

async function listAccountProfiles(client: SupabaseClient): Promise<AccountProfileRow[]> {
  const { data, error } = await client
    .from('player_account_profiles')
    .select('profile_id,snapshot,deleted_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as AccountProfileRow[]
}

async function saveAccountProfile(
  client: SupabaseClient,
  profile: StoredProfile,
  accountId: string
): Promise<void> {
  const snapshot = snapshotFor(profile)
  const encoded = JSON.stringify(snapshot)
  if (encoded.length > 262144) throw new Error('This profile is too large to sync.')
  const { error } = await client.rpc('save_player_account_profile', {
    p_profile_id: profile.id,
    p_snapshot: snapshot,
    p_profile_updated_at: profile.accountProfileUpdatedAt ?? profile.createdAt,
  })
  if (error) throw error
  uploaded.set(`${accountId}:${profile.id}`, encoded)
}

const uploaded = new Map<string, string>()

/** Keep account-owned profile details private and synchronized across devices. */
export function initializePlayerAccountProfiles(store: typeof appStore): () => void {
  if (!getBackendConfig()) return () => undefined

  let activeAccountId: string | null = null
  let previousProfiles = store.getState().profiles.profiles
  let busy = false
  let rerun = false
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const explicitlyRelinked = new Set<string>()

  const schedule = () => {
    if (stopped || timer) return
    timer = setTimeout(() => {
      timer = undefined
      void synchronize()
    }, SYNC_DELAY_MS)
  }

  async function synchronize() {
    if (stopped || busy) {
      rerun = true
      return
    }
    busy = true
    try {
      const client = await getBackendClient(PURPOSE)
      const accountId = await verifiedAccountId(client)
      if (!accountId) {
        activeAccountId = null
        setSyncStatus('disabled')
        return
      }
      activeAccountId = accountId
      setSyncStatus('syncing')

      let pendingDeletes = readPendingDeletes()
      const currentlyLinkedIds = new Set(
        store
          .getState()
          .profiles.profiles.filter((profile) => profile.playerAccountId === accountId)
          .map((profile) => profile.id)
      )
      const ownedDeletes = pendingDeletes.filter(
        (item) => item.accountId === accountId && !currentlyLinkedIds.has(item.profileId)
      )
      for (const item of ownedDeletes) {
        const { error } = await client.rpc('delete_player_account_profile', {
          p_profile_id: item.profileId,
        })
        if (error) throw error
      }
      pendingDeletes = pendingDeletes.filter((item) => item.accountId !== accountId)
      writePendingDeletes(pendingDeletes)

      const rows = await listAccountProfiles(client)
      const deletedIds = new Set(
        rows.filter((row) => row.deleted_at !== null).map((row) => row.profile_id)
      )
      for (const profile of store.getState().profiles.profiles) {
        const relinkKey = `${accountId}:${profile.id}`
        const relinkedAfterDelete = explicitlyRelinked.has(relinkKey)
        if (
          profile.playerAccountId === accountId &&
          deletedIds.has(profile.id) &&
          !relinkedAfterDelete
        )
          store.dispatch(unlinkProfileFromPlayerAccount({ profileId: profile.id, accountId }))
      }
      const remoteProfiles = rows
        .filter((row) => row.deleted_at === null)
        .map((row) => parseSnapshot(row.snapshot, row.profile_id))
        .filter((profile): profile is StoredProfile => profile !== null)
      const localById = new Map(
        store.getState().profiles.profiles.map((profile) => [profile.id, profile])
      )
      const profilesToMerge = remoteProfiles.filter((profile) => {
        const local = localById.get(profile.id)
        if (!local || local.playerAccountId !== accountId) return true
        const localTime = Date.parse(local.accountProfileUpdatedAt ?? local.createdAt)
        const remoteTime = Date.parse(profile.accountProfileUpdatedAt ?? profile.createdAt)
        return !Number.isFinite(localTime) || localTime <= remoteTime
      })
      for (const profile of remoteProfiles)
        uploaded.set(`${accountId}:${profile.id}`, JSON.stringify(snapshotFor(profile)))

      const localBeforeMerge = store.getState().profiles.profiles
      const accountLocal = localBeforeMerge.filter(
        (profile) => profile.playerAccountId === accountId
      )
      const knownIds = new Set(accountLocal.map((profile) => profile.id))
      const missingCount = profilesToMerge.filter((profile) => !knownIds.has(profile.id)).length
      if (accountLocal.length + missingCount > MAX_PROFILES) {
        setSyncStatus('error')
        return
      }
      store.dispatch(mergePlayerAccountProfiles({ accountId, profiles: profilesToMerge }))

      const currentProfiles = store.getState().profiles.profiles
      const localOwned = currentProfiles.filter((profile) => profile.playerAccountId === accountId)
      if (localOwned.length > MAX_PROFILES) throw new Error('This account already has 3 profiles.')
      for (const profile of localOwned) {
        const encoded = JSON.stringify(snapshotFor(profile))
        if (uploaded.get(`${accountId}:${profile.id}`) !== encoded) {
          await saveAccountProfile(client, profile, accountId)
          explicitlyRelinked.delete(`${accountId}:${profile.id}`)
        }
      }
      setSyncStatus('synced')
    } catch {
      setSyncStatus('error')
    } finally {
      busy = false
      if (rerun) {
        rerun = false
        schedule()
      }
    }
  }

  const unsubscribeStore = store.subscribe(() => {
    const profiles = store.getState().profiles.profiles
    if (profiles === previousProfiles) return
    const currentById = new Map(profiles.map((profile) => [profile.id, profile]))
    for (const before of previousProfiles) {
      if (!before.playerAccountId) continue
      const after = currentById.get(before.id)
      if (!after || after.playerAccountId !== before.playerAccountId)
        queueDelete(before.playerAccountId, before.id)
    }
    for (const after of profiles) {
      if (!after.playerAccountId) continue
      const before = previousProfiles.find((profile) => profile.id === after.id)
      if (!before?.playerAccountId) explicitlyRelinked.add(`${after.playerAccountId}:${after.id}`)
    }
    previousProfiles = profiles
    if (activeAccountId) {
      setSyncStatus('syncing')
      schedule()
    }
  })
  const unsubscribeAccount = subscribeBackendAuth(PURPOSE, (accountId) => {
    if (activeAccountId === accountId) return
    activeAccountId = accountId
    uploaded.clear()
    setSyncStatus(accountId ? 'syncing' : 'disabled')
    schedule()
  })
  const online = () => schedule()
  const visible = () => {
    if (document.visibilityState === 'visible') schedule()
  }
  window.addEventListener('online', online)
  document.addEventListener('visibilitychange', visible)

  void getBackendClient(PURPOSE)
    .then(async (client) => {
      activeAccountId = await verifiedAccountId(client)
      schedule()
    })
    .catch(() => setSyncStatus('error'))

  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribeStore()
    unsubscribeAccount()
    window.removeEventListener('online', online)
    document.removeEventListener('visibilitychange', visible)
  }
}
