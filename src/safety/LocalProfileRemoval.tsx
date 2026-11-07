import { useState, useSyncExternalStore } from 'react'
import { store } from '../store/store'
import { archiveKeyForProfile, deleteProfile } from '../store/profilesSlice'
import { resetGame } from '../store/gameSlice'
import { clearProfileSaveStorage, flushSavePersistence } from '../store/saveStatePersistence'
import { clearSeasonArchives } from '../store/archivePersistence'
import { withRunAutosaveSuspended } from '../store/runAutosaveGate'
import { pruneProfilePhotos } from '../utils/imageDb'
import { savedProfilePhotoIds } from '../appearance/profilePhotos'

/** Deletion stays reachable even while gameplay and the router are locked. */
export default function LocalProfileRemoval() {
  const profiles = useSyncExternalStore(store.subscribe, () => store.getState().profiles)
  const [selected, setSelected] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function remove() {
    const profile = profiles.profiles.find((entry) => entry.id === selected)
    if (!profile || !confirmed || busy) return
    setBusy(true)
    try {
      const photoIds = [
        ...savedProfilePhotoIds(profile.id),
        ...(profile.photoId ? [profile.photoId] : []),
      ]
      clearProfileSaveStorage(profile.id)
      clearSeasonArchives(archiveKeyForProfile(profile.id))
      if (!(await flushSavePersistence()))
        throw new Error('Saved data could not be removed. Please try again.')
      await pruneProfilePhotos(profile.id, [], photoIds)
      withRunAutosaveSuspended(() => {
        const active = store.getState().profiles.activeProfileId === profile.id
        store.dispatch(deleteProfile(profile.id))
        if (active) store.dispatch(resetGame([]))
      })
      setSelected('')
      setConfirmed(false)
      setNotice(
        'The selected profile and its saved games were removed. Age restrictions remain in place.'
      )
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'The profile could not be removed. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Remove local profile data">
      {profiles.profiles.length > 0 && (
        <>
          <label htmlFor="remove-local-profile">Remove a saved profile and its games</label>
          <select
            id="remove-local-profile"
            value={selected}
            disabled={busy}
            onChange={(event) => {
              setSelected(event.target.value)
              setConfirmed(false)
            }}
          >
            <option value="">Choose a profile</option>
            {profiles.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <label className="player-safety__check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!selected || busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I understand this permanently removes the selected profile, its photo, and saved games
              from this device.
            </span>
          </label>
          <button
            type="button"
            disabled={!selected || !confirmed || busy}
            onClick={() => void remove()}
          >
            {busy ? 'Removing…' : 'Remove selected profile'}
          </button>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
