import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAppSelector, useAppDispatch } from '../../store/hooks'
import {
  selectAllProfiles,
  selectActiveProfileId,
  selectIsGuest,
  createProfile,
  selectActiveProfile,
  deleteProfile,
  enterGuestMode,
  MAX_PROFILES,
  archiveKeyForProfile,
  type StoredProfile,
  type ProfileBio,
} from '../../store/profilesSlice'
import { resetGame, hydrateGame } from '../../store/gameSlice'
import { hydrateFinale } from '../../store/finaleSlice'
import { hydrateSocial } from '../../social/socialSlice'
import { hydratePublicOpinion } from '../../publicOpinion/publicOpinionSlice'
import { hydrateChallenge } from '../../store/challengeSlice'
import { clearSeasonArchives, loadSeasonArchives } from '../../store/archivePersistence'
import {
  clearProfileSaveStorage,
  flushSavePersistence,
  loadSavedRunProfile,
} from '../../store/saveStatePersistence'
import { getPlayableLastRun } from '../../modes/seasonRulesets'
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate'
import { persistCurrentRunSnapshot } from '../../store/store'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import { resizeAndCompressImage } from '../../utils/imageUtils'
import { imageIdToDataUrl, saveImage } from '../../utils/imageDb'
import { pruneProfilePhotos } from '../../utils/imageDb'
import { savedProfilePhotoIds } from '../../appearance/profilePhotos'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import ProfileSeasonStatus from '../../components/ProfileSeasonStatus/ProfileSeasonStatus'
import ProfileOptionalDetails from '../../components/ProfileOptionalDetails/ProfileOptionalDetails'
import { normalizeProfileBio } from '../../components/ProfileOptionalDetails/profileBio'
import ProfilePhotoPreview from '../../components/ProfilePhotoPreview/ProfilePhotoPreview'
import AppearanceCarousel from '../../appearance/AppearanceCarousel'
import { warmSelectedAppearance } from '../../appearance/preloadAppearance'
import { getAppearanceLook, SELECTABLE_LOOKS } from '../../appearance/catalog'
import { gameWithInitialProfileAppearance } from '../../appearance/initialSeasonAppearance'
import './ProfilePicker.css'

const PROFILE_SEX_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const

const SAFE_PREVIEW_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function isSafePreviewFile(file: File | Blob) {
  return SAFE_PREVIEW_MIME_TYPES.has(file.type)
}

/**
 * ProfilePicker — allows the user to select, create, delete profiles or enter
 * guest mode. Profile changes are committed together with reset/hydration while
 * run autosave is suspended so state from one profile cannot be persisted into
 * another profile during the transition.
 */
export default function ProfilePicker() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const requestedReturnTo = (location.state as { from?: string } | null)?.from
  const returnTo =
    requestedReturnTo === '/' || requestedReturnTo === '/profile' ? requestedReturnTo : '/game'

  const profiles = useAppSelector(selectAllProfiles)
  const activeProfileId = useAppSelector(selectActiveProfileId)
  const isGuest = useAppSelector(selectIsGuest)

  const isGameActive = useAppSelector(
    (s) => s.game.status === 'active' || s.game.week > 1 || s.game.phase !== 'week_start'
  )
  const hasGuestRunProgress = useAppSelector(
    (s) =>
      s.game.mode === 'survival' ||
      s.game.week > 1 ||
      (s.game.phase !== 'season_start' && s.game.phase !== 'week_start') ||
      Boolean(s.game.runId) ||
      Boolean(s.game.pendingEviction) ||
      Boolean(s.game.seasonFinale)
  )

  const [photoCache, setPhotoCache] = useState<Record<string, string>>({})

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [createStep, setCreateStep] = useState<'look' | 'details'>('look')
  const [newLookId, setNewLookId] = useState(SELECTABLE_LOOKS[0]?.id ?? '')
  const creatingRef = useRef(false)
  const [newAge, setNewAge] = useState('')
  const [newSex, setNewSex] = useState('')
  const [newBio, setNewBio] = useState<ProfileBio>({})
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null)
  const [newPhotoBlob, setNewPhotoBlob] = useState<Blob | null>(null)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null)
  const [pendingGuest, setPendingGuest] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingHome, setPendingHome] = useState(false)
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null)

  const atLimit = profiles.length >= MAX_PROFILES
  const parsedNewAge = Number(newAge)
  const canCreateProfile =
    Boolean(newName.trim()) &&
    Boolean(newAge.trim()) &&
    Number.isInteger(parsedNewAge) &&
    parsedNewAge >= 0 &&
    parsedNewAge <= 120 &&
    PROFILE_SEX_OPTIONS.includes(newSex as (typeof PROFILE_SEX_OPTIONS)[number])

  useEffect(() => {
    const openCreate = (location.state as { openCreate?: boolean } | null)?.openCreate === true
    if (!openCreate || atLimit) return
    navigate('/profile/dressing-room', {
      replace: true,
      state: {
        from: '/',
        createProfile: true,
        adoptGuestRun: isGuest && hasGuestRunProgress,
      },
    })
  }, [atLimit, hasGuestRunProgress, isGuest, location.state, navigate])

  useEffect(() => {
    async function loadPhotos() {
      const entries: Record<string, string> = {}
      for (const p of profiles) {
        if (p.photoId && !photoCache[p.id]) {
          const url = await imageIdToDataUrl(p.photoId)
          if (url) entries[p.id] = url
        }
      }
      if (Object.keys(entries).length > 0) {
        setPhotoCache((prev) => ({ ...prev, ...entries }))
      }
    }
    loadPhotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  function handleSelectProfile(id: string) {
    if (id === activeProfileId && !isGuest) {
      navigate('/profile', { replace: true, state: { from: returnTo } })
      return
    }
    if (isGameActive) {
      setPendingSwitchId(id)
    } else {
      commitSwitch(id)
    }
  }

  function commitSwitch(id: string) {
    // Inspect the target profile before changing activeProfileId. This closes a
    // window where visibility autosave could otherwise write the old profile's
    // in-memory game under the newly selected profile ID.
    const snapshot = getPlayableLastRun(loadSavedRunProfile(id))
    if (snapshot?.profileId === id) {
      setPendingResumeId(id)
      return
    }

    const archives = loadSeasonArchives(archiveKeyForProfile(id)) ?? []
    withRunAutosaveSuspended(() => {
      dispatch(selectActiveProfile(id))
      dispatch(resetGame(archives))
    })
    navigate('/profile', { replace: true, state: { from: returnTo } })
  }

  function commitResume(id: string) {
    const snapshot = getPlayableLastRun(loadSavedRunProfile(id))
    if (!snapshot || snapshot.profileId !== id) {
      commitWithoutResume(id)
      return
    }

    try {
      const resumedGame = gameWithInitialProfileAppearance(
        snapshot,
        profiles.find((profile) => profile.id === id)
      )
      withRunAutosaveSuspended(() => {
        dispatch(selectActiveProfile(id))
        dispatch(hydrateGame(resumedGame))
        dispatch(hydrateFinale(snapshot.finale))
        dispatch(hydrateSocial(snapshot.social))
        if (snapshot.publicOpinion) dispatch(hydratePublicOpinion(snapshot.publicOpinion))
        if (snapshot.challenge) dispatch(hydrateChallenge(snapshot.challenge))
      })
      if (resumedGame !== snapshot.game) persistCurrentRunSnapshot()
      navigate('/game', { replace: true })
    } catch {
      // Preserve the durable save if hydration fails. The player can still
      // recover it later instead of a transient UI failure deleting progress.
      commitWithoutResume(id)
    }
  }

  function commitWithoutResume(id: string) {
    const archives = loadSeasonArchives(archiveKeyForProfile(id)) ?? []
    withRunAutosaveSuspended(() => {
      dispatch(selectActiveProfile(id))
      dispatch(resetGame(archives))
    })
    navigate('/profile', { replace: true, state: { from: returnTo } })
  }

  function handleGuestMode() {
    if (isGameActive) {
      setPendingGuest(true)
    } else {
      commitGuest()
    }
  }

  function handleHome() {
    if (returnTo === '/profile') {
      navigate('/profile', { replace: true })
      return
    }
    if (returnTo === '/game') {
      navigate('/game', { replace: true })
      return
    }
    if (isGameActive) {
      setPendingHome(true)
      return
    }
    navigate(returnTo, { replace: true })
  }

  function commitHome() {
    dispatch(resetGame())
    setPendingHome(false)
    navigate(returnTo, { replace: true })
  }

  function commitGuest() {
    withRunAutosaveSuspended(() => {
      dispatch(enterGuestMode())
      dispatch(resetGame([]))
    })
    navigate('/game', { replace: true })
  }

  async function handleCreate() {
    if (!canCreateProfile || atLimit || creatingRef.current) return
    const selectedLook = getAppearanceLook(newLookId, 1)
    if (!selectedLook?.selectable) return
    creatingRef.current = true
    try {
      const parsedAge = parsedNewAge
      let photoId: string | undefined
      if (newPhotoBlob) {
        const randomPart = (() => {
          try {
            return crypto.randomUUID()
          } catch {
            return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
          }
        })()
        photoId = `profile-photo-${randomPart}`
        try {
          await saveImage(photoId, newPhotoBlob)
        } catch (err) {
          console.error('Failed to save new profile photo to IndexedDB', err)
          photoId = undefined
        }
      }
      const adoptGuestRun = isGuest && hasGuestRunProgress
      const profileDetails = {
        name: newName.trim(),
        avatar: '👤',
        photoId,
        bio: normalizeProfileBio({ ...newBio, age: String(parsedAge), sex: newSex }),
        appearanceSelection: {
          kind: 'catalog' as const,
          lookId: selectedLook.id,
          revision: selectedLook.revision,
        },
      }
      if (adoptGuestRun) {
        withRunAutosaveSuspended(() => dispatch(createProfile(profileDetails)))
        // Capture the guest run after its first selected look has been applied.
        persistCurrentRunSnapshot()
        await flushSavePersistence()
      } else {
        withRunAutosaveSuspended(() => {
          dispatch(createProfile(profileDetails))
          dispatch(resetGame([]))
        })
      }
      void warmSelectedAppearance(profileDetails.appearanceSelection)
      setShowCreateForm(false)
      setCreateStep('look')
      setNewName('')
      setNewAge('')
      setNewSex('')
      setNewBio({})
      clearNewPhoto()
      navigate(adoptGuestRun ? '/game' : '/profile', { replace: true, state: { from: returnTo } })
    } finally {
      creatingRef.current = false
    }
  }

  function clearNewPhoto() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setNewPhotoPreview(null)
    setNewPhotoBlob(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function cancelCreate() {
    setShowCreateForm(false)
    setCreateStep('look')
    setNewLookId(SELECTABLE_LOOKS[0]?.id ?? '')
    setNewName('')
    setNewAge('')
    setNewSex('')
    setNewBio({})
    clearNewPhoto()
  }

  async function handleNewPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!isSafePreviewFile(file)) {
      clearNewPhoto()
      return
    }

    setProcessingPhoto(true)
    try {
      const blob = await resizeAndCompressImage(file)
      if (!isSafePreviewFile(blob)) {
        clearNewPhoto()
        return
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setNewPhotoBlob(blob)
      setNewPhotoPreview(url)
    } catch {
      clearNewPhoto()
      return
    } finally {
      setProcessingPhoto(false)
    }
  }

  function handleDeleteRequest(id: string) {
    setPendingDeleteId(id)
  }

  async function commitDelete(id: string) {
    const profile = profiles.find((p) => p.id === id)
    const photoIds = [
      ...savedProfilePhotoIds(id),
      ...(profile?.photoId ? [profile.photoId] : []),
      ...(profile?.contestantDefaults?.photoId ? [profile.contestantDefaults.photoId] : []),
    ]

    clearProfileSaveStorage(id)
    clearSeasonArchives(archiveKeyForProfile(id))
    if (!(await flushSavePersistence())) return
    await pruneProfilePhotos(id, [], photoIds)
    withRunAutosaveSuspended(() => {
      dispatch(deleteProfile(id))
      if (id === activeProfileId) {
        const next = profiles.find((entry) => entry.id !== id)
        dispatch(resetGame(next ? (loadSeasonArchives(archiveKeyForProfile(next.id)) ?? []) : []))
      }
    })
    setPendingDeleteId(null)
  }

  const deleteTarget = profiles.find((p) => p.id === pendingDeleteId)
  const switchTarget = profiles.find((p) => p.id === pendingSwitchId)

  function renderAvatar(p: StoredProfile) {
    return (
      <ProfilePhotoPreview
        className="profile-picker__avatar-img"
        photoUrl={photoCache[p.id]}
        appearance={p.appearanceSelection}
        alt={p.name}
      />
    )
  }

  return (
    <div className="placeholder-screen profile-picker">
      <div className="profile-picker__topbar">
        <GameBackButton
          onClick={handleHome}
          label={
            returnTo === '/profile'
              ? 'Back to profile'
              : returnTo === '/game'
                ? 'Back to game'
                : 'Back to home'
          }
        />
      </div>
      <h1 className="profile-picker__title">👤 Profiles</h1>
      <p className="profile-picker__subtitle">Select a profile to play as</p>

      {profiles.length > 0 && (
        <div className="profile-picker__list">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId && !isGuest
            return (
              <div
                key={p.id}
                className={`profile-picker__card${isActive ? ' profile-picker__card--active' : ''}`}
              >
                <div className="profile-picker__card-header">
                  {renderAvatar(p)}
                  <div className="profile-picker__info">
                    <div className="profile-picker__name">{p.name}</div>
                    <div className="profile-picker__meta">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {isActive && <span className="profile-picker__badge">Active</span>}
                  <div className="profile-picker__actions">
                    {!isActive && (
                      <button
                        type="button"
                        className="profile-picker__btn profile-picker__btn--select"
                        onClick={() => handleSelectProfile(p.id)}
                      >
                        Select
                      </button>
                    )}
                    {isActive && (
                      <button
                        type="button"
                        className="profile-picker__btn profile-picker__btn--edit"
                        onClick={() =>
                          navigate('/profile-edit', { state: { from: '/profile-picker' } })
                        }
                        aria-label={`Edit profile ${p.name}`}
                        title={`Edit profile ${p.name}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Z" />
                          <path d="m13.8 6.7 3.5 3.5M4 20l4.2-1" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      className="profile-picker__btn profile-picker__btn--delete"
                      onClick={() => handleDeleteRequest(p.id)}
                      aria-label={`Delete profile ${p.name}`}
                    >
                      🗑
                    </button>
                  </div>
                </div>
                {isActive && <ProfileSeasonStatus />}
              </div>
            )
          })}
        </div>
      )}

      {atLimit && !showCreateForm && (
        <div className="profile-picker__limit-notice">
          <span>⚠️</span>
          <div>
            Up to {MAX_PROFILES} player profiles. Existing extra profiles and their saves remain
            available.
          </div>
        </div>
      )}

      {!atLimit && (
        <>
          {profiles.length > 0 && (
            <div className="profile-picker__divider">
              <span className="profile-picker__divider-line" />
              <span className="profile-picker__divider-label">or</span>
              <span className="profile-picker__divider-line" />
            </div>
          )}

          {!showCreateForm ? (
            <>
              {isGuest && (
                <div className="profile-picker__save-invite" role="note">
                  <span className="profile-picker__save-invite-icon" aria-hidden="true">
                    ✦
                  </span>
                  <span>
                    <strong>Keep your season</strong>
                    <small>Create a profile to save your progress.</small>
                  </span>
                </div>
              )}
              <button
                type="button"
                className={`profile-picker__btn profile-picker__btn--create${isGuest ? ' profile-picker__btn--save-spotlight' : ''}`}
                style={{ width: '100%', marginBottom: 12 }}
                onClick={() => {
                  // Keep the legacy in-place draft mounted until the router commits the
                  // transition. In production the Changing room route replaces it in the
                  // same interaction; this also gives a safe fallback if navigation fails.
                  setShowCreateForm(true)
                  navigate('/profile/dressing-room', {
                    state: {
                      from: '/',
                      createProfile: true,
                      adoptGuestRun: isGuest && hasGuestRunProgress,
                    },
                  })
                }}
              >
                ➕ Create New Profile
              </button>
            </>
          ) : (
            <div
              className={`profile-picker__create${isGuest ? ' profile-picker__create--save-spotlight' : ''}`}
            >
              <p className="profile-picker__create-title">New Profile</p>
              {isGuest && (
                <div className="profile-picker__save-invite" role="note">
                  <span className="profile-picker__save-invite-icon" aria-hidden="true">
                    ✦
                  </span>
                  <span>
                    <strong>Save this season to your profile</strong>
                    <small>Your current progress will stay right where it is.</small>
                  </span>
                </div>
              )}
              {createStep === 'look' ? (
                <div className="profile-picker__look-step">
                  <h2>Choose your look</h2>
                  <p>Your name. Your story. Your style.</p>
                  <AppearanceCarousel
                    selectedId={newLookId}
                    onSelect={setNewLookId}
                    onConfirm={() => setCreateStep('details')}
                  />
                  <button
                    type="button"
                    className="profile-picker__btn--cancel"
                    onClick={cancelCreate}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <p className="profile-picker__look-note">
                    Your chosen look represents you in the game. A photo here appears on your local
                    profile card.
                  </p>
                  <div className="profile-picker__create-photo-section">
                    <div className="profile-picker__create-photo-wrap">
                      <ProfilePhotoPreview
                        className="profile-picker__create-photo-img"
                        photoUrl={newPhotoPreview}
                        appearance={{ kind: 'catalog', lookId: newLookId, revision: 1 }}
                        alt="Selected profile portrait"
                      />
                      <button
                        type="button"
                        className="profile-picker__create-photo-btn"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Upload profile photo"
                      >
                        📷
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        style={{ display: 'none' }}
                        onChange={handleNewPhotoChange}
                      />
                    </div>
                    <div className="profile-picker__create-photo-copy">
                      <span className="profile-picker__create-photo-label">Profile Photo</span>
                      <span className="profile-picker__create-photo-hint">
                        Upload from your gallery
                      </span>
                      {processingPhoto && (
                        <span className="profile-picker__create-photo-processing">
                          Processing image...
                        </span>
                      )}
                    </div>
                  </div>
                  <label className="profile-picker__create-label" htmlFor="profile-create-name">
                    Display name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="profile-create-name"
                    className="profile-picker__input"
                    type="text"
                    placeholder="Enter display name"
                    maxLength={24}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    required
                  />
                  <label className="profile-picker__create-label" htmlFor="profile-create-age">
                    Age <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="profile-create-age"
                    className="profile-picker__input"
                    type="number"
                    min="0"
                    max="120"
                    step="1"
                    placeholder="Enter your age"
                    value={newAge}
                    onChange={(e) => setNewAge(e.target.value)}
                    required
                  />
                  <label className="profile-picker__create-label" htmlFor="profile-create-sex">
                    Sex (Reality storylines) <span aria-hidden="true">*</span>
                  </label>
                  <select
                    id="profile-create-sex"
                    className="profile-picker__input"
                    value={newSex}
                    onChange={(e) => setNewSex(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select your sex
                    </option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                  <ProfileOptionalDetails value={newBio} onChange={setNewBio} />
                  <div className="profile-picker__create-actions">
                    <button
                      type="button"
                      className="profile-picker__btn--cancel"
                      onClick={() => {
                        setCreateStep('look')
                      }}
                    >
                      Back to looks
                    </button>
                    <button
                      type="button"
                      className="profile-picker__btn profile-picker__btn--create"
                      disabled={!canCreateProfile || processingPhoto}
                      onClick={() => void handleCreate()}
                    >
                      Create Profile
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {!showCreateForm && (
        <>
          <div className="profile-picker__divider">
            <span className="profile-picker__divider-line" />
            <span className="profile-picker__divider-label">play without saving</span>
            <span className="profile-picker__divider-line" />
          </div>
          <div className="profile-picker__guest">
            <button type="button" className="profile-picker__btn--guest" onClick={handleGuestMode}>
              Continue as Guest
            </button>
            <p className="profile-picker__guest-warning">
              ⚠️ Guest mode — stats and season archives will not be saved.
            </p>
          </div>
        </>
      )}

      <ConfirmExitModal
        open={Boolean(pendingSwitchId)}
        title="Switch Profile?"
        description={`Switching to "${switchTarget?.name ?? ''}" will leave the current screen. Your saved season and Surveyeval progress stay attached to this profile.`}
        confirmLabel="Switch"
        cancelLabel="Keep Playing"
        onConfirm={() => {
          if (pendingSwitchId) commitSwitch(pendingSwitchId)
          setPendingSwitchId(null)
        }}
        onCancel={() => setPendingSwitchId(null)}
      />

      <ConfirmExitModal
        open={Boolean(pendingResumeId)}
        title="Resume saved game?"
        description="This profile already has saved progress. Resume it now, or switch profiles without loading the saved game yet."
        confirmLabel="Resume"
        cancelLabel="Not Now"
        onConfirm={() => {
          if (pendingResumeId) commitResume(pendingResumeId)
          setPendingResumeId(null)
        }}
        onCancel={() => {
          if (pendingResumeId) commitWithoutResume(pendingResumeId)
          setPendingResumeId(null)
        }}
      />

      <ConfirmExitModal
        open={pendingGuest}
        title="Enter Guest Mode?"
        description="Switching to guest mode will leave the current season. Stats and archives will not be saved."
        confirmLabel="Guest Mode"
        cancelLabel="Keep Playing"
        onConfirm={() => {
          setPendingGuest(false)
          commitGuest()
        }}
        onCancel={() => setPendingGuest(false)}
      />

      <ConfirmExitModal
        open={pendingHome}
        title="Leave for Home?"
        description="Returning home now will leave the current game in memory. Your latest autosave remains available from Play."
        confirmLabel="Go Home"
        cancelLabel="Stay Here"
        onConfirm={commitHome}
        onCancel={() => setPendingHome(false)}
      />

      <ConfirmExitModal
        open={Boolean(pendingDeleteId)}
        title="Delete Profile?"
        description={`"${deleteTarget?.name ?? ''}" and all associated data will be permanently removed.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingDeleteId) void commitDelete(pendingDeleteId)
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  )
}
