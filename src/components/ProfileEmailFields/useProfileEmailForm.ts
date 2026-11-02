import { useEffect, useRef, useState } from 'react'
import type { StoredProfile } from '../../store/profilesSlice'
import {
  isProfileContactConfigured,
  isValidContactEmail,
  normalizeContactEmail,
  readProfileContact,
  saveProfileContact,
  type ProfileContact,
} from '../../services/backend/profileContact'

type EmailDraft = {
  email: string
  updatesOptIn: boolean
  saved: ProfileContact | null
  profileId: string | null
  status: 'loading' | 'ready' | 'error'
  error: string
  touched: boolean
}

function emptyDraft(profileId: string | null, loading = false): EmailDraft {
  return {
    email: '',
    updatesOptIn: false,
    saved: null,
    profileId,
    status: loading ? 'loading' : 'ready',
    error: '',
    touched: false,
  }
}

function contactError(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : 'Email could not be saved. Please try again.'
}

export function createProfileDraftIdentity(): { id: string; createdAt: string } {
  let id: string
  try {
    id = crypto.randomUUID()
  } catch {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  }
  return { id, createdAt: new Date().toISOString() }
}

/** Contact data belongs to this form and its private backend row, never to the game store. */
export function useProfileEmailForm(profileId: string | null) {
  const configured = isProfileContactConfigured()
  const [draft, setDraft] = useState(() => emptyDraft(profileId, configured && profileId !== null))
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [recoveryProfileId, setRecoveryProfileId] = useState<string | null>(null)
  const loadRevision = useRef(0)
  const uncertainSave = useRef(false)
  const lastSaveProfileId = useRef<string | null>(null)
  const readProfileId = profileId ?? recoveryProfileId

  useEffect(() => {
    if (!configured || readProfileId === null) return
    let active = true
    const revision = ++loadRevision.current
    uncertainSave.current = false
    void readProfileContact(readProfileId).then(
      (contact) => {
        if (!active || revision !== loadRevision.current) return
        setDraft({
          ...emptyDraft(profileId),
          email: contact?.email ?? '',
          updatesOptIn: Boolean(contact?.email && contact.updatesOptIn),
          saved: contact,
        })
      },
      (cause) => {
        if (!active || revision !== loadRevision.current) return
        setDraft({ ...emptyDraft(profileId), status: 'error', error: contactError(cause) })
      }
    )
    return () => {
      active = false
      loadRevision.current += 1
    }
  }, [configured, profileId, readProfileId, loadAttempt])

  const current = draft.profileId === profileId
  const ready = configured && current && draft.status === 'ready'
  const email = current ? draft.email : ''
  const updatesOptIn = current && draft.updatesOptIn
  const valid = isValidContactEmail(email)
  const dirty =
    ready &&
    (normalizeContactEmail(email) !== (draft.saved?.email ?? '') ||
      updatesOptIn !== (draft.saved?.updatesOptIn ?? false))
  const error = current
    ? draft.touched && !valid
      ? 'Enter a valid email address or leave it blank.'
      : draft.error
    : ''

  function changeEmail(value: string) {
    if (!ready) return
    setDraft((previous) => ({
      ...previous,
      email: value,
      updatesOptIn: false,
      error: '',
    }))
  }

  function changeUpdatesOptIn(value: boolean) {
    if (!ready || !normalizeContactEmail(email) || !valid) return
    setDraft((previous) => ({ ...previous, updatesOptIn: value, error: '' }))
  }

  function validate(): boolean {
    if (!dirty || valid) return true
    setDraft((previous) => ({ ...previous, touched: true }))
    return false
  }

  async function save(profile: StoredProfile): Promise<boolean> {
    // A delayed/failed contact read must never prevent unrelated local profile edits.
    if (!ready) return true
    if (!validate()) return false
    if (profileId !== null && profile.id !== profileId) return false
    const revisionAtSave = loadRevision.current
    const desiredEmail = normalizeContactEmail(email)
    const desiredOptIn = Boolean(desiredEmail && updatesOptIn)
    let savedContact = draft.saved
    if (uncertainSave.current) {
      // A failed response does not prove the server rejected the write. Reconcile
      // against the stable draft ID before treating a cleared address as unchanged.
      try {
        savedContact = await readProfileContact(profile.id)
        if (revisionAtSave !== loadRevision.current) return false
        uncertainSave.current = false
        setDraft((previous) => ({ ...previous, saved: savedContact }))
        if (
          desiredOptIn &&
          savedContact &&
          (savedContact.email !== desiredEmail || !savedContact.updatesOptIn)
        ) {
          setDraft({
            ...emptyDraft(profileId),
            email: savedContact.email,
            updatesOptIn: Boolean(savedContact.email && savedContact.updatesOptIn),
            saved: savedContact,
            error: 'Email preferences changed. Review the current choice before saving again.',
          })
          return false
        }
      } catch {
        if (revisionAtSave !== loadRevision.current) return false
        setDraft((previous) => ({
          ...previous,
          error:
            'Your last email change could not be confirmed. Check your connection and try saving again.',
        }))
        return false
      }
    }
    if (
      desiredEmail === (savedContact?.email ?? '') &&
      desiredOptIn === (savedContact?.updatesOptIn ?? false)
    )
      return true
    try {
      lastSaveProfileId.current = profile.id
      const contact = await saveProfileContact(profile, {
        email: desiredEmail,
        updatesOptIn: desiredOptIn,
        expectedRevision: savedContact?.revision ?? null,
      })
      if (revisionAtSave !== loadRevision.current) return false
      uncertainSave.current = false
      setDraft({
        ...emptyDraft(profileId),
        email: contact.email,
        updatesOptIn: Boolean(contact.email && contact.updatesOptIn),
        saved: contact,
      })
      return true
    } catch (cause) {
      if (revisionAtSave !== loadRevision.current) return false
      const failure = cause as { code?: string; uncertainSave?: boolean } | null
      const conflict = failure?.code === 'contact_conflict'
      uncertainSave.current = !conflict && failure?.uncertainSave !== false
      setDraft((previous) => ({
        ...previous,
        status: conflict ? 'error' : previous.status,
        error: contactError(cause),
      }))
      return false
    }
  }

  function retry() {
    setDraft(emptyDraft(profileId, true))
    if (profileId === null) setRecoveryProfileId(lastSaveProfileId.current)
    setLoadAttempt((attempt) => attempt + 1)
  }

  function reset() {
    uncertainSave.current = false
    lastSaveProfileId.current = null
    setRecoveryProfileId(null)
    setDraft(emptyDraft(profileId))
  }

  return {
    configured,
    email,
    updatesOptIn,
    status: current ? draft.status : ('loading' as const),
    error,
    valid,
    changeEmail,
    changeUpdatesOptIn,
    blurEmail: () => setDraft((previous) => ({ ...previous, touched: true })),
    retry,
    reset,
    validate,
    save,
  }
}

export type ProfileEmailForm = ReturnType<typeof useProfileEmailForm>
