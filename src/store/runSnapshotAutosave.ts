import { getDurableItem } from './durablePersistence'
import {
  getSavedRunSlot,
  savedRunsKeyForProfile,
  type SavedRunSlot,
  type SavedSeasonSnapshot,
} from './saveStatePersistence'

/** Trailing save window for autonomous simulation churn. Lifecycle boundaries flush immediately. */
export const RUN_SNAPSHOT_AUTOSAVE_DELAY_MS = 4000

type SaveRunSnapshot = (profileId: string, snapshot: SavedSeasonSnapshot) => boolean

type PendingSave = {
  profileId: string
  slot: SavedRunSlot
  runId: string | null
  createSnapshot: () => SavedSeasonSnapshot
  persistenceRevision: string | null | undefined
}

export interface RunSnapshotAutosaveController {
  schedule(profileId: string, snapshot: SavedSeasonSnapshot): void
  scheduleLazy(
    profileId: string,
    slot: SavedRunSlot,
    runId: string | null,
    createSnapshot: () => SavedSeasonSnapshot
  ): void
  flush(): void
  discard(profileId: string, slot: SavedRunSlot): void
  pendingCount(): number
}

function pendingKey(profileId: string, slot: SavedRunSlot): string {
  return `${profileId}:${slot}`
}

function snapshotRunId(snapshot: SavedSeasonSnapshot): string | null {
  return snapshot.game.runId ?? snapshot.game.gameId ?? null
}

/**
 * Read only the two run-identity fields from the small split-profile metadata.
 * This avoids reading/copying a potentially large campaign slot on the Play
 * path while still detecting explicit clears/replacements of the active run.
 */
function readPersistenceRevision(profileId: string): string | null | undefined {
  try {
    const raw = getDurableItem(savedRunsKeyForProfile(profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      activeRunId?: unknown
      lastPlayedRunId?: unknown
    }
    const activeRunId = typeof parsed.activeRunId === 'string' ? parsed.activeRunId : ''
    const lastPlayedRunId = typeof parsed.lastPlayedRunId === 'string' ? parsed.lastPlayedRunId : ''
    return `${activeRunId}\u0000${lastPlayedRunId}`
  } catch {
    // Storage-unavailable or malformed legacy metadata should keep the existing
    // best-effort save behavior. The persistence layer owns recovery/reporting.
    return undefined
  }
}

/**
 * Coalesces a synchronous burst of Redux updates into one durable save per
 * profile/run slot while avoiding repeated multi-hundred-kilobyte writes during
 * autonomous social churn. The latest snapshot wins inside that window and
 * `flush()` drains the Redux-side queue immediately; the durable backend is flushed separately.
 *
 * The small profile metadata's active/last run identity acts as a persistence
 * revision. If another flow clears or replaces the active run after a snapshot
 * was queued, stale work is ignored instead of resurrecting that run. Unrelated
 * metadata-only changes, such as achievement bookkeeping, do not invalidate it.
 */
export function createRunSnapshotAutosaveController(
  saveRunSnapshot: SaveRunSnapshot,
  delayMs = RUN_SNAPSHOT_AUTOSAVE_DELAY_MS,
  prepareSnapshot?: (snapshot: SavedSeasonSnapshot) => Promise<void>
): RunSnapshotAutosaveController {
  const pending = new Map<string, PendingSave>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const preparing = new Map<string, PendingSave>()

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (pending.size === 0) return

    const saves = [...pending.values()]
    pending.clear()

    // Freeze the persisted revision once per profile before writing anything.
    // This lets multiple legitimate slots flush together without the first save
    // making the second look stale merely because it updated shared metadata.
    const persistedRevisions = new Map<string, string | null | undefined>()
    for (const save of saves) {
      if (!persistedRevisions.has(save.profileId)) {
        persistedRevisions.set(save.profileId, readPersistenceRevision(save.profileId))
      }
    }

    for (const save of saves) {
      const currentRevision = persistedRevisions.get(save.profileId)
      if (
        save.persistenceRevision !== undefined &&
        currentRevision !== undefined &&
        currentRevision !== save.persistenceRevision
      ) {
        continue
      }
      // Materialize the large campaign projection only after the debounce and
      // stale-run checks have passed. During normal Redux churn the controller
      // retains only the latest factory for this run slot.
      saveRunSnapshot(save.profileId, save.createSnapshot())
    }
  }

  const armTimer = () => {
    if (timer !== null) return
    timer = setTimeout(
      () => {
        timer = null
        if (!prepareSnapshot) {
          flush()
          return
        }
        for (const [key, save] of pending) {
          if (preparing.get(key) === save) continue
          const revision = readPersistenceRevision(save.profileId)
          if (
            save.persistenceRevision !== undefined &&
            revision !== undefined &&
            revision !== save.persistenceRevision
          ) {
            pending.delete(key)
            continue
          }
          const factory = save.createSnapshot
          const snapshot = factory()
          preparing.set(key, save)
          void Promise.resolve()
            .then(() => prepareSnapshot(snapshot))
            .catch(() => undefined)
            .then(() => {
              if (preparing.get(key) === save) preparing.delete(key)
              // Lifecycle flushes, clears and new runs always beat an old worker.
              if (pending.get(key) !== save) return
              const currentRevision = readPersistenceRevision(save.profileId)
              if (
                save.persistenceRevision !== undefined &&
                currentRevision !== undefined &&
                currentRevision !== save.persistenceRevision
              ) {
                pending.delete(key)
                return
              }
              // Commit bounded progress even during continuous churn. If updates
              // arrived during preparation, keep their latest factory queued.
              if (save.createSnapshot === factory) pending.delete(key)
              if (saveRunSnapshot(save.profileId, snapshot)) {
                const writtenRevision = readPersistenceRevision(save.profileId)
                for (const queued of pending.values()) {
                  if (
                    queued.profileId === save.profileId &&
                    queued.persistenceRevision === currentRevision
                  )
                    queued.persistenceRevision = writtenRevision
                }
              }
              if (pending.size) armTimer()
            })
        }
      },
      Math.max(0, delayMs)
    )
  }

  const schedulePending = (
    profileId: string,
    slot: SavedRunSlot,
    runId: string | null,
    createSnapshot: () => SavedSeasonSnapshot
  ) => {
    const key = pendingKey(profileId, slot)
    const existing = pending.get(key)
    if (existing && existing.runId === runId) existing.createSnapshot = createSnapshot
    else
      pending.set(key, {
        profileId,
        slot,
        runId,
        createSnapshot,
        persistenceRevision: readPersistenceRevision(profileId),
      })
    armTimer()
  }

  const schedule = (profileId: string, snapshot: SavedSeasonSnapshot) => {
    schedulePending(
      profileId,
      getSavedRunSlot(snapshot.game),
      snapshotRunId(snapshot),
      () => snapshot
    )
  }

  const scheduleLazy = (
    profileId: string,
    slot: SavedRunSlot,
    runId: string | null,
    createSnapshot: () => SavedSeasonSnapshot
  ) => {
    schedulePending(profileId, slot, runId, createSnapshot)
  }

  const discard = (profileId: string, slot: SavedRunSlot) => {
    pending.delete(pendingKey(profileId, slot))
    if (pending.size === 0 && timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule,
    scheduleLazy,
    flush,
    discard,
    pendingCount: () => pending.size,
  }
}
