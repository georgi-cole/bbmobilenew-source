import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAppSelector, useAppDispatch } from '../../store/hooks'
import {
  selectCurrentProfile,
  updateProfile,
  deleteProfile,
  archiveKeyForProfile,
  type ProfileBio,
} from '../../store/profilesSlice'
import { resetGame } from '../../store/gameSlice'
import { resizeAndCompressImage } from '../../utils/imageUtils'
import { saveImage, imageIdToDataUrl, deleteImage } from '../../utils/imageDb'
import { clearProfileSaveStorage, flushSavePersistence } from '../../store/saveStatePersistence'
import { clearSeasonArchives } from '../../store/archivePersistence'
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import ProfileOptionalDetails from '../../components/ProfileOptionalDetails/ProfileOptionalDetails'
import { normalizeProfileBio } from '../../components/ProfileOptionalDetails/profileBio'
import ProfilePhotoPreview from '../../components/ProfilePhotoPreview/ProfilePhotoPreview'
import './EditProfile.css'

const SAFE_PREVIEW_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function isSafePreviewFile(file: File | Blob): boolean {
  return SAFE_PREVIEW_MIME_TYPES.has(file.type)
}

/**
 * EditProfile — lets the user edit their active profile's name, photo,
 * and biography fields.  Photo uploads are processed (resize + compress) and
 * stored in IndexedDB; a `photoId` reference is kept in the Redux profile.
 */
export default function EditProfile() {
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const dispatch = useAppDispatch()
  const profile = useAppSelector(selectCurrentProfile)
  const requestedReturnTo = (routeLocation.state as { from?: string } | null)?.from
  const returnTo =
    requestedReturnTo === '/' ||
    requestedReturnTo === '/profile' ||
    requestedReturnTo === '/profile-picker'
      ? requestedReturnTo
      : '/game'
  const editReturnPath = returnTo === '/profile-picker' ? '/profile-picker' : '/profile'
  const editReturnFrom = returnTo === '/profile-picker' ? '/profile' : returnTo

  // Redirect if no profile is active
  useEffect(() => {
    if (!profile) navigate('/profile-picker', { replace: true, state: { from: editReturnFrom } })
  }, [profile, navigate, editReturnFrom])

  // --- Form state ---
  const [name, setName] = useState(profile?.name ?? '')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [newPhotoBlob, setNewPhotoBlob] = useState<Blob | null>(null)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)

  const [bio, setBio] = useState<ProfileBio>(() => ({ ...profile?.bio }))

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Track the current preview object URL so we can revoke it to avoid memory leaks.
  const previewUrlRef = useRef<string | null>(null)

  // Revoke any outstanding preview URL on unmount.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  // Load existing photo from IndexedDB on mount
  useEffect(() => {
    if (profile?.photoId) {
      imageIdToDataUrl(profile.photoId).then((url) => {
        if (url) setPhotoDataUrl(url)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset the input so the same file can be re-selected later.
    e.target.value = ''

    // Do not allow active formats such as SVG to become a DOM-backed preview.
    if (!isSafePreviewFile(file)) return

    setProcessingPhoto(true)
    try {
      const blob = await resizeAndCompressImage(file)
      // Revoke the previous preview URL before creating a new one.
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setNewPhotoBlob(blob)
      setPhotoDataUrl(url)
    } catch {
      // Never preview the unprocessed upload directly. If processing fails, keep
      // the previous safe preview/photo instead of exposing attacker-controlled
      // image contents through a blob URL.
    } finally {
      setProcessingPhoto(false)
    }
  }

  async function handleSave() {
    if (!profile) return

    let photoId = profile.photoId

    // Persist new photo to IndexedDB; delete the old one to avoid storage growth.
    // Only update photoId if the write actually succeeds — if IndexedDB is unavailable
    // (e.g. private browsing, quota exceeded) we keep the existing photoId so the
    // profile does not reference an image that can never be loaded.
    if (newPhotoBlob) {
      const id = `photo-${profile.id}-${Date.now()}`
      try {
        await saveImage(id, newPhotoBlob)
        // Clean up the previous photo blob now that the new one is persisted.
        if (profile.photoId && profile.photoId !== id) {
          await deleteImage(profile.photoId)
        }
        photoId = id
      } catch (err) {
        // saveImage failed (e.g. private browsing, quota exceeded).
        // Keep the existing photoId so the profile does not reference a missing image.
        console.error('Failed to save profile photo to IndexedDB', err)
      }
    }

    const normalizedBio = normalizeProfileBio(bio, { clearEmptyFields: true })

    dispatch(
      updateProfile({
        name: name.trim() || profile.name,
        avatar: profile.avatar,
        photoId,
        bio: normalizedBio,
      })
    )
    navigate(editReturnPath, { replace: true, state: { from: editReturnFrom } })
  }

  async function handleDeleteProfile() {
    if (!profile) return

    if (profile.photoId) {
      await deleteImage(profile.photoId)
    }

    // Remove every persistence record owned by the deleted profile. Suspending
    // autosave prevents its in-memory season being saved under the next profile.
    clearProfileSaveStorage(profile.id)
    clearSeasonArchives(archiveKeyForProfile(profile.id))
    if (!(await flushSavePersistence())) return
    withRunAutosaveSuspended(() => {
      dispatch(deleteProfile(profile.id))
      dispatch(resetGame([]))
    })
    navigate('/profile-picker', { replace: true, state: { from: editReturnFrom } })
  }

  if (!profile) return null

  return (
    <div className="placeholder-screen edit-profile">
      <h1 className="edit-profile__title">✏️ Edit Profile</h1>

      {/* Profile photo or selected character portrait */}
      <div className="edit-profile__photo-section">
        <div className="edit-profile__photo-wrap">
          <ProfilePhotoPreview
            className="edit-profile__photo-img"
            photoUrl={photoDataUrl}
            appearance={profile.appearanceSelection}
          />
          <button
            type="button"
            className="edit-profile__photo-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload photo"
          >
            📷
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handlePhotoChange}
          />
        </div>
        <div>
          <div className="edit-profile__photo-label">Profile Photo</div>
          <div className="edit-profile__photo-hint">Tap the camera to upload from your gallery</div>
          {processingPhoto && <div className="edit-profile__processing">Processing image…</div>}
        </div>
      </div>

      {/* Name */}
      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-name">
          Display Name
        </label>
        <input
          id="ep-name"
          className="edit-profile__input"
          type="text"
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name in the house"
        />
      </div>

      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-age">
          Age
        </label>
        <input
          id="ep-age"
          className="edit-profile__input"
          type="text"
          maxLength={20}
          value={bio.age ?? ''}
          onChange={(event) => setBio({ ...bio, age: event.target.value })}
          placeholder="e.g. 28"
        />
      </div>
      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-sex">
          Sex (Reality storylines)
        </label>
        <select
          id="ep-sex"
          className="edit-profile__input"
          value={bio.sex ?? ''}
          onChange={(event) => setBio({ ...bio, sex: event.target.value })}
        >
          <option value="">Not specified - ask me in-game when needed</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
          <option value="Prefer not to say">Prefer not to say</option>
        </select>
      </div>
      <ProfileOptionalDetails value={bio} onChange={setBio} />

      <section className="edit-profile__danger-zone" aria-labelledby="delete-profile-heading">
        <div>
          <h2 id="delete-profile-heading" className="edit-profile__danger-title">
            Delete Profile
          </h2>
          <p className="edit-profile__danger-copy">
            Permanently remove {profile.name} and this profile&apos;s saved games from this device.
          </p>
        </div>
        <button
          type="button"
          className="edit-profile__delete-btn"
          onClick={() => setDeleteConfirmationOpen(true)}
        >
          Delete Profile
        </button>
      </section>

      {/* Save / Cancel */}
      <div className="edit-profile__actions">
        <button
          type="button"
          className="edit-profile__btn edit-profile__btn--cancel"
          onClick={() =>
            navigate(editReturnPath, { replace: true, state: { from: editReturnFrom } })
          }
        >
          Cancel
        </button>
        <button
          type="button"
          className="edit-profile__btn edit-profile__btn--save"
          onClick={() => void handleSave()}
          disabled={processingPhoto}
        >
          Save Profile
        </button>
      </div>

      <ConfirmExitModal
        open={deleteConfirmationOpen}
        title="Delete Profile?"
        description={`"${profile.name}" and all of its saved games will be permanently removed from this device.`}
        confirmLabel="Delete Profile"
        cancelLabel="Keep Profile"
        onConfirm={() => void handleDeleteProfile()}
        onCancel={() => setDeleteConfirmationOpen(false)}
      />
    </div>
  )
}
