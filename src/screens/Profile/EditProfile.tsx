import { getProfilePhotoAvatarId } from '../../utils/avatar'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAppSelector, useAppDispatch } from '../../store/hooks'
import {
  selectCurrentProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  archiveKeyForProfile,
  type ProfileBio,
} from '../../store/profilesSlice'
import { resetGame } from '../../store/gameSlice'
import { resizeAndCompressImage } from '../../utils/imageUtils'
import { saveImage, imageIdToDataUrl } from '../../utils/imageDb'
import { pruneProfilePhotos } from '../../utils/imageDb'
import { savedProfilePhotoIds } from '../../appearance/profilePhotos'
import { clearProfileSaveStorage, flushSavePersistence } from '../../store/saveStatePersistence'
import { clearSeasonArchives } from '../../store/archivePersistence'
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate'
import { persistCurrentRunSnapshot } from '../../store/store'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import ProfileOptionalDetails from '../../components/ProfileOptionalDetails/ProfileOptionalDetails'
import ProfileEmailFields from '../../components/ProfileEmailFields/ProfileEmailFields'
import {
  createProfileDraftIdentity,
  useProfileEmailForm,
} from '../../components/ProfileEmailFields/useProfileEmailForm'
import { normalizeProfileBio } from '../../components/ProfileOptionalDetails/profileBio'
import ProfilePhotoPreview from '../../components/ProfilePhotoPreview/ProfilePhotoPreview'
import { coerceAppearanceSelection, type AppearanceSelection } from '../../appearance/catalog'
import { warmSelectedAppearance } from '../../appearance/preloadAppearance'
import './EditProfile.css'

const SAFE_PREVIEW_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const PROFILE_SEX_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const

type EditProfileRouteState = {
  from?: string
  createProfile?: boolean
  appearanceSelection?: AppearanceSelection
  adoptGuestRun?: boolean
}

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
  const currentRunPhotoId = useAppSelector(
    (state) =>
      state.game?.seasonContestant?.photoId ??
      getProfilePhotoAvatarId(state.game?.players?.find((player) => player.isUser)?.avatar ?? '')
  )
  const routeState = routeLocation.state as EditProfileRouteState | null
  const creationSelection = coerceAppearanceSelection(routeState?.appearanceSelection)
  const creatingProfile = routeState?.createProfile === true && creationSelection.kind === 'catalog'
  const requestedReturnTo = routeState?.from
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
    if (!creatingProfile && !profile)
      navigate('/profile-picker', { replace: true, state: { from: editReturnFrom } })
  }, [creatingProfile, profile, navigate, editReturnFrom])

  // --- Form state ---
  const [name, setName] = useState(creatingProfile ? '' : (profile?.name ?? ''))
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [newPhotoBlob, setNewPhotoBlob] = useState<Blob | null>(null)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)

  const [bio, setBio] = useState<ProfileBio>(() => (creatingProfile ? {} : { ...profile?.bio }))
  const [saving, setSaving] = useState(false)
  const [draftIdentity] = useState(createProfileDraftIdentity)
  const emailForm = useProfileEmailForm(creatingProfile ? null : (profile?.id ?? null))
  const mounted = useRef(false)
  const currentProfileId = useRef(profile?.id ?? null)
  useLayoutEffect(() => {
    mounted.current = true
    currentProfileId.current = profile?.id ?? null
    return () => {
      mounted.current = false
    }
  }, [profile?.id])

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
    if (saving || !emailForm.validate()) return
    const profileIdAtSave = profile?.id ?? null
    const canCommit = () => mounted.current && currentProfileId.current === profileIdAtSave

    if (creatingProfile) {
      const parsedAge = Number(bio.age)
      const canCreate =
        Boolean(name.trim()) &&
        Boolean(bio.location?.trim()) &&
        Number.isInteger(parsedAge) &&
        parsedAge >= 0 &&
        parsedAge <= 120 &&
        PROFILE_SEX_OPTIONS.includes(bio.sex as (typeof PROFILE_SEX_OPTIONS)[number])
      if (!canCreate) return

      setSaving(true)
      try {
        let photoId: string | undefined
        if (newPhotoBlob) {
          const randomPart = (() => {
            try {
              return crypto.randomUUID()
            } catch {
              return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
            }
          })()
          const nextPhotoId = `profile-photo-${randomPart}`
          try {
            await saveImage(nextPhotoId, newPhotoBlob)
            photoId = nextPhotoId
          } catch (err) {
            console.error('Failed to save new profile photo to IndexedDB', err)
          }
        }

        const normalizedBio = normalizeProfileBio(bio, { clearEmptyFields: true })
        const profileDetails = {
          id: draftIdentity.id,
          name: name.trim(),
          avatar: '👤',
          photoId,
          bio: normalizedBio,
          appearanceSelection: creationSelection,
        }
        if (
          !canCommit() ||
          !(await emailForm.save({ ...profileDetails, createdAt: draftIdentity.createdAt }))
        )
          return
        if (!canCommit()) return
        if (routeState?.adoptGuestRun) {
          withRunAutosaveSuspended(() => dispatch(createProfile(profileDetails)))
          persistCurrentRunSnapshot()
          await flushSavePersistence()
          if (!mounted.current) return
        } else {
          withRunAutosaveSuspended(() => {
            dispatch(createProfile(profileDetails))
            dispatch(resetGame([]))
          })
        }
        void warmSelectedAppearance(creationSelection)
        navigate('/profile', {
          replace: true,
          state: { from: '/', fromLookReveal: true },
        })
      } finally {
        if (mounted.current) setSaving(false)
      }
      return
    }

    if (!profile) return

    setSaving(true)
    try {
      let photoId = profile.photoId

      // Persist new photos before collecting revisions unreferenced by saved or live runs.
      // Only update photoId if the write actually succeeds — if IndexedDB is unavailable
      // (e.g. private browsing, quota exceeded) we keep the existing photoId so the
      // profile does not reference an image that can never be loaded.
      if (newPhotoBlob) {
        const id = `photo-${profile.id}-${Date.now()}`
        try {
          await saveImage(id, newPhotoBlob)
          photoId = id
        } catch (err) {
          // saveImage failed (e.g. private browsing, quota exceeded).
          // Keep the existing photoId so the profile does not reference a missing image.
          console.error('Failed to save profile photo to IndexedDB', err)
        }
      }

      const normalizedBio = normalizeProfileBio(bio, { clearEmptyFields: true })
      const profileDetails = {
        ...profile,
        name: name.trim() || profile.name,
        avatar: profile.avatar,
        photoId,
        bio: normalizedBio,
      }
      if (!canCommit() || !(await emailForm.save(profileDetails))) return
      if (!canCommit()) return

      dispatch(
        updateProfile({
          name: profileDetails.name,
          avatar: profile.avatar,
          photoId,
          bio: normalizedBio,
        })
      )
      const keepPhotoIds = savedProfilePhotoIds(profile.id)
      if (photoId) keepPhotoIds.push(photoId)
      if (currentRunPhotoId) keepPhotoIds.push(currentRunPhotoId)
      if (photoId !== profile.photoId)
        await pruneProfilePhotos(profile.id, keepPhotoIds, profile.photoId ? [profile.photoId] : [])
      if (!canCommit()) return
      navigate(editReturnPath, { replace: true, state: { from: editReturnFrom } })
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  async function handleDeleteProfile() {
    if (!profile) return

    const photoIds = [
      ...savedProfilePhotoIds(profile.id),
      ...(profile.photoId ? [profile.photoId] : []),
      ...(profile.contestantDefaults?.photoId ? [profile.contestantDefaults.photoId] : []),
    ]

    // Remove every persistence record owned by the deleted profile. Suspending
    // autosave prevents its in-memory season being saved under the next profile.
    clearProfileSaveStorage(profile.id)
    clearSeasonArchives(archiveKeyForProfile(profile.id))
    if (!(await flushSavePersistence())) return
    await pruneProfilePhotos(profile.id, [], photoIds)
    withRunAutosaveSuspended(() => {
      dispatch(deleteProfile(profile.id))
      dispatch(resetGame([]))
    })
    navigate('/profile-picker', { replace: true, state: { from: editReturnFrom } })
  }

  if (!creatingProfile && !profile) return null

  const parsedAge = Number(bio.age)
  const creationFormValid =
    Boolean(name.trim()) &&
    Boolean(bio.location?.trim()) &&
    Boolean(bio.age?.trim()) &&
    Number.isInteger(parsedAge) &&
    parsedAge >= 0 &&
    parsedAge <= 120 &&
    PROFILE_SEX_OPTIONS.includes(bio.sex as (typeof PROFILE_SEX_OPTIONS)[number])

  return (
    <div className="placeholder-screen edit-profile">
      <h1 className="edit-profile__title">
        {creatingProfile ? 'Create your profile' : '✏️ Edit Profile'}
      </h1>

      <p>
        Saving updates your defaults for future seasons. Existing seasons keep their own contestant.
      </p>
      {/* Profile photo or selected character portrait */}
      <div className="edit-profile__photo-section">
        <div className="edit-profile__photo-wrap">
          <ProfilePhotoPreview
            className="edit-profile__photo-img"
            photoUrl={photoDataUrl}
            appearance={creatingProfile ? creationSelection : profile?.appearanceSelection}
          />
          <button
            type="button"
            className="edit-profile__photo-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload photo"
            disabled={saving}
          >
            📷
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handlePhotoChange}
            disabled={saving}
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
          Display Name {creatingProfile && <span aria-hidden="true">*</span>}
        </label>
        <input
          id="ep-name"
          className="edit-profile__input"
          type="text"
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name in the house"
          required={creatingProfile}
        />
      </div>

      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-age">
          Age {creatingProfile && <span aria-hidden="true">*</span>}
        </label>
        <input
          id="ep-age"
          className="edit-profile__input"
          type={creatingProfile ? 'number' : 'text'}
          min={creatingProfile ? 0 : undefined}
          max={creatingProfile ? 120 : undefined}
          value={bio.age ?? ''}
          onChange={(event) => setBio({ ...bio, age: event.target.value })}
          placeholder="e.g. 28"
          required={creatingProfile}
        />
      </div>
      {creatingProfile && (
        <div className="edit-profile__field">
          <label className="edit-profile__label" htmlFor="ep-location">
            Location <span aria-hidden="true">*</span>
          </label>
          <input
            id="ep-location"
            className="edit-profile__input"
            type="text"
            maxLength={50}
            value={bio.location ?? ''}
            onChange={(event) => setBio({ ...bio, location: event.target.value })}
            placeholder="City, State"
            required
          />
        </div>
      )}
      <div className="edit-profile__field">
        <label className="edit-profile__label" htmlFor="ep-sex">
          Sex (Reality storylines) {creatingProfile && <span aria-hidden="true">*</span>}
        </label>
        <select
          id="ep-sex"
          className="edit-profile__input"
          value={bio.sex ?? ''}
          onChange={(event) => setBio({ ...bio, sex: event.target.value })}
        >
          <option value="" disabled={creatingProfile}>
            {creatingProfile ? 'Select your sex' : 'Not specified - ask me in-game when needed'}
          </option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
          <option value="Prefer not to say">Prefer not to say</option>
        </select>
      </div>
      <ProfileEmailFields form={emailForm} idPrefix="ep" disabled={saving} />
      <ProfileOptionalDetails
        value={bio}
        onChange={setBio}
        hiddenFields={creatingProfile ? ['location'] : undefined}
      />

      {!creatingProfile && (
        <section className="edit-profile__danger-zone" aria-labelledby="delete-profile-heading">
          <div>
            <h2 id="delete-profile-heading" className="edit-profile__danger-title">
              Delete Profile
            </h2>
            <p className="edit-profile__danger-copy">
              Permanently remove {profile?.name} and this profile&apos;s saved games from this
              device.
            </p>
          </div>
          <button
            type="button"
            className="edit-profile__delete-btn"
            onClick={() => setDeleteConfirmationOpen(true)}
            disabled={saving}
          >
            Delete Profile
          </button>
        </section>
      )}

      {/* Save / Cancel */}
      <div className="edit-profile__actions">
        <button
          type="button"
          className="edit-profile__btn edit-profile__btn--cancel"
          disabled={saving}
          onClick={() => {
            if (creatingProfile) {
              navigate('/profile/dressing-room', {
                replace: true,
                state: {
                  from: '/',
                  createProfile: true,
                  initialLookId: creationSelection.lookId,
                  adoptGuestRun: routeState?.adoptGuestRun === true,
                },
              })
            } else {
              navigate(editReturnPath, { replace: true, state: { from: editReturnFrom } })
            }
          }}
        >
          {creatingProfile ? 'Back to looks' : 'Cancel'}
        </button>
        <button
          type="button"
          className="edit-profile__btn edit-profile__btn--save"
          onClick={() => void handleSave()}
          disabled={processingPhoto || saving || (creatingProfile && !creationFormValid)}
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      <ConfirmExitModal
        open={deleteConfirmationOpen}
        title="Delete Profile?"
        description={`"${profile?.name ?? ''}" and all of its saved games will be permanently removed from this device.`}
        confirmLabel="Delete Profile"
        cancelLabel="Keep Profile"
        onConfirm={() => void handleDeleteProfile()}
        onCancel={() => setDeleteConfirmationOpen(false)}
      />
    </div>
  )
}
