import { useState, useSyncExternalStore } from 'react'
import { useAppSelector } from '../../store/hooks'
import { usePlayerSafety } from '../../safety/usePlayerSafety'
import { getBackendConfig } from './config'
import {
  getBackupStatus,
  getLastBackupTime,
  hasPendingCloudDeletion,
  isProfileBackupEnabled,
  removeCloudProfile,
  setProfileBackupEnabled,
  subscribeCloudBackend,
} from './backendService'

const STATUS_LABELS = {
  disabled: 'Cloud backup is off.',
  pending: 'Waiting to back up…',
  syncing: 'Backing up…',
  synced: 'Profile backed up.',
  error: 'Backup could not connect. Your profile is saved on this device; we will retry.',
}

export default function CloudBackupControls() {
  const profile = useAppSelector((state) =>
    state.profiles.isGuest
      ? undefined
      : state.profiles.profiles.find((entry) => entry.id === state.profiles.activeProfileId)
  )
  const safety = usePlayerSafety()
  const status = useSyncExternalStore(subscribeCloudBackend, getBackupStatus)
  const enabled = useSyncExternalStore(subscribeCloudBackend, () =>
    Boolean(profile && isProfileBackupEnabled(profile.id))
  )
  const deleting = useSyncExternalStore(subscribeCloudBackend, () =>
    Boolean(profile && hasPendingCloudDeletion(profile.id))
  )
  const [notice, setNotice] = useState('')
  if (!getBackendConfig() || safety?.ageBand !== 'adult') return null
  function perform(action: () => void) {
    try {
      action()
      setNotice('')
    } catch {
      setNotice(
        'The cloud preference could not be saved. Check device storage and try again. Pending removals must finish before backup can be enabled again.'
      )
    }
  }
  return (
    <section aria-label="Cloud profile backup">
      <h2>Cloud profile backup</h2>
      <p>
        Save this profile’s display name, avatar, achievements, and progress to our cloud service.
        Photos, biography, season archives, and the current game stay on this device.
      </p>
      <p>
        This backup is linked to this installation. Signing in to recover it on another device is
        not available yet.
      </p>
      {!profile ? (
        <p>Select a saved profile to manage its backup.</p>
      ) : (
        <>
          <label className="player-safety__check">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!safety.optionalFeatures.onlineServices || deleting}
              onChange={(event) =>
                perform(() => setProfileBackupEnabled(profile.id, event.target.checked))
              }
            />
            <span>Back up this profile automatically</span>
          </label>
          {!safety.optionalFeatures.onlineServices && (
            <p>Enable optional online services above to connect.</p>
          )}
          <p role="status">
            {deleting
              ? 'Cloud removal is pending. It will retry when online services are available.'
              : STATUS_LABELS[status]}
          </p>
          {enabled && getLastBackupTime() && (
            <p>Last backup: {new Date(getLastBackupTime()!).toLocaleString()}</p>
          )}
          <p>
            Turning backup off stops uploads. Use the button below to remove the existing cloud
            copy.
          </p>
          <button
            type="button"
            disabled={deleting}
            onClick={() => perform(() => removeCloudProfile(profile.id))}
          >
            Remove cloud copy
          </button>
        </>
      )}
      {notice && <p role="alert">{notice}</p>}
    </section>
  )
}
