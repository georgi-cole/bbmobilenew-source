import { pruneProfilePhotos } from '../../utils/imageDb'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isProfileContactConfigured,
  readProfileContact,
  saveProfileContact,
  type ProfileContact,
} from '../../services/backend/profileContact'
import profilesReducer, {
  createProfile,
  updateProfile,
  type ProfileBio,
  type ProfilesState,
} from '../../store/profilesSlice'
import EditProfile from './EditProfile'

const mockNavigate = vi.fn()
const mockDispatch = vi.fn()
const mockPhoto = vi.fn<() => Promise<string | null>>()
const CONTACT_REVISION = '732ce7bc-24b4-4057-b99e-ff0a5787590b'
let mockLivePhotoId: string | undefined
let mockProfiles: ProfilesState
let mockLocationState: Record<string, unknown> = { from: '/profile-picker' }
const bio: ProfileBio = {
  age: '25',
  sex: 'Female',
  story: 'I like fun.',
  location: 'Melrose Place',
  profession: 'Nurse',
  motto: 'Live.',
  funFact: 'Has 12 cats.',
  zodiac: 'Libra',
  education: 'College',
  familyStatus: 'Single',
  kids: 'None',
  pets: 'Cats',
  religion: 'Agnostic',
  sexuality: 'Queer',
  reproductiveProfile: { canBecomePregnant: true, canCausePregnancy: false },
}

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}))
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      profiles: mockProfiles,
      game: { players: [], seasonContestant: { photoId: mockLivePhotoId } },
    }),
}))
vi.mock('../../utils/imageDb', () => ({
  imageIdToDataUrl: () => mockPhoto(),
  saveImage: vi.fn(),
  deleteImage: vi.fn(),
  pruneProfilePhotos: vi.fn(async () => {}),
}))
vi.mock('../../appearance/profilePhotos', () => ({
  savedProfilePhotoIds: () => ['saved-season-photo'],
}))
vi.mock('../../utils/imageUtils', () => ({
  resizeAndCompressImage: vi.fn(async (file: File) => file),
}))
vi.mock('../../components/ConfirmExitModal/ConfirmExitModal', () => ({ default: () => null }))
vi.mock('../../services/backend/profileContact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/backend/profileContact')>()),
  isProfileContactConfigured: vi.fn(),
  readProfileContact: vi.fn(),
  saveProfileContact: vi.fn(),
}))

function showCreateForm() {
  vi.mocked(isProfileContactConfigured).mockReturnValue(true)
  mockProfiles = profilesReducer(undefined, { type: 'test/reset' })
  mockLocationState = {
    from: '/',
    createProfile: true,
    appearanceSelection: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
  }
  render(<EditProfile />)
  fireEvent.change(screen.getByLabelText(/Display Name/), { target: { value: 'Mara' } })
  fireEvent.change(screen.getByLabelText(/Age/), { target: { value: '24' } })
  fireEvent.change(screen.getByLabelText(/Location/), { target: { value: 'Sofia' } })
  fireEvent.change(screen.getByLabelText(/Sex \(Reality storylines\)/), {
    target: { value: 'Female' },
  })
  return screen.getByRole('button', { name: 'Save Profile' })
}

function mockSavedContact(updatesOptIn = true) {
  vi.mocked(isProfileContactConfigured).mockReturnValue(true)
  vi.mocked(readProfileContact).mockResolvedValue({
    email: 'mara@example.com',
    updatesOptIn,
    revision: CONTACT_REVISION,
  })
}

describe('EditProfile details', () => {
  beforeEach(() => {
    mockLivePhotoId = undefined
    vi.mocked(pruneProfilePhotos).mockClear()
    mockNavigate.mockReset()
    mockDispatch.mockReset()
    mockPhoto.mockReset()
    mockPhoto.mockResolvedValue(null)
    mockLocationState = { from: '/profile-picker' }
    vi.mocked(isProfileContactConfigured).mockReturnValue(false)
    vi.mocked(readProfileContact).mockReset().mockResolvedValue(null)
    vi.mocked(saveProfileContact)
      .mockReset()
      .mockImplementation(async (_profile, input) => ({
        email: input.email,
        updatesOptIn: input.updatesOptIn,
        revision: CONTACT_REVISION,
      }))
    mockProfiles = profilesReducer(
      undefined,
      createProfile({
        name: 'Larisa',
        avatar: 'legacy-emoji',
        appearanceSelection: { kind: 'catalog', lookId: 'pc-002', revision: 1 },
        bio,
      })
    )
  })

  it('shows the selected character instead of offering emoji avatar choices', () => {
    render(<EditProfile />)
    expect(screen.getByRole('img', { name: 'Profile portrait' }).getAttribute('src')).toContain(
      'character%202/main.webp'
    )
    expect(screen.queryByText(/emoji avatar/i)).toBeNull()
    expect(screen.queryByLabelText('Location')).toBeNull()
    expect(screen.getByRole('button', { name: 'About you' }).getAttribute('aria-expanded')).toBe(
      'false'
    )
  })

  it('preserves all unopened biography fields and the existing avatar when saving', async () => {
    render(<EditProfile />)
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'profiles/updateProfile',
          payload: expect.objectContaining({ bio, avatar: 'legacy-emoji' }),
        })
      )
    )
    expect(mockNavigate).toHaveBeenCalledWith('/profile-picker', {
      replace: true,
      state: { from: '/profile' },
    })
  })

  it('clears edited optional fields while retaining details in the other folded categories', async () => {
    render(<EditProfile />)
    fireEvent.click(screen.getByRole('button', { name: 'About you' }))
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'About you' }))
    fireEvent.click(screen.getByRole('button', { name: 'Optional / Personal' }))
    fireEvent.change(screen.getByLabelText('Pregnancy role (optional)'), {
      target: { value: 'none' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Optional / Personal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalled())
    const action = mockDispatch.mock.calls.find(
      ([value]) => value.type === 'profiles/updateProfile'
    )![0]
    const next = profilesReducer(mockProfiles, action).profiles[0]
    expect(next.bio?.location).toBeUndefined()
    expect(next.bio?.reproductiveProfile).toBeUndefined()
    expect(next.bio?.profession).toBe('Nurse')
    expect(next.bio?.religion).toBe('Agnostic')
    expect(next.bio?.pets).toBe('Cats')
  })

  it('keeps uploaded photos first, then falls back to the chosen portrait and standard avatar', async () => {
    mockProfiles = profilesReducer(mockProfiles, updateProfile({ photoId: 'existing-photo' }))
    mockPhoto.mockResolvedValue('data:image/png;base64,cGhvdG8=')
    render(<EditProfile />)
    const portrait = screen.getByRole('img', { name: 'Profile portrait' })
    await waitFor(() => expect(portrait.getAttribute('src')).toBe('data:image/png;base64,cGhvdG8='))
    fireEvent.error(portrait)
    expect(portrait.getAttribute('src')).toContain('character%202/main.webp')
    fireEvent.error(portrait)
    expect(portrait.getAttribute('src')).toContain('assets/skins/You.png')
  })

  it('retains live and saved season photos when replacing the profile photo', async () => {
    mockLivePhotoId = 'live-season-photo'
    mockProfiles = profilesReducer(mockProfiles, updateProfile({ photoId: 'old-profile-photo' }))
    const preview = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new-profile-photo')
    try {
      const { container } = render(<EditProfile />)
      fireEvent.change(container.querySelector('input[type="file"]')!, {
        target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] },
      })
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save Profile' })).toBeEnabled()
      )
      fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
      await waitFor(() =>
        expect(pruneProfilePhotos).toHaveBeenCalledWith(
          mockProfiles.activeProfileId,
          expect.arrayContaining(['live-season-photo', 'saved-season-photo']),
          ['old-profile-photo']
        )
      )
      expect(pruneProfilePhotos).toHaveBeenCalledWith(
        mockProfiles.activeProfileId,
        expect.arrayContaining([expect.stringMatching(/^photo-/)]),
        ['old-profile-photo']
      )
    } finally {
      preview.mockRestore()
    }
  })

  it('uses the existing standard avatar for a legacy profile without a selected look', () => {
    mockProfiles = profilesReducer(
      mockProfiles,
      updateProfile({ appearanceSelection: { kind: 'legacy' } })
    )
    render(<EditProfile />)
    expect(screen.getByRole('img', { name: 'Profile portrait' }).getAttribute('src')).toContain(
      'assets/skins/You.png'
    )
    expect(screen.queryByText('legacy-emoji')).toBeNull()
  })

  it('creates a profile only after the four required details are complete', async () => {
    mockProfiles = profilesReducer(undefined, { type: 'test/reset' })
    mockLocationState = {
      from: '/',
      createProfile: true,
      appearanceSelection: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
    }
    render(<EditProfile />)

    const save = screen.getByRole('button', { name: 'Save Profile' })
    expect(screen.getByRole('heading', { name: 'Create your profile' })).toBeDefined()
    expect(screen.getByRole('img', { name: 'Profile portrait' }).getAttribute('src')).toContain(
      'character%203/main.webp'
    )
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Display Name/), { target: { value: 'Mara' } })
    fireEvent.change(screen.getByLabelText(/Age/), { target: { value: '24' } })
    fireEvent.change(screen.getByLabelText(/Location/), { target: { value: 'Sofia' } })
    fireEvent.change(screen.getByLabelText(/Sex \(Reality storylines\)/), {
      target: { value: 'Female' },
    })
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'profiles/createProfile',
          payload: expect.objectContaining({
            name: 'Mara',
            appearanceSelection: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
            bio: { age: '24', location: 'Sofia', sex: 'Female' },
          }),
        })
      )
    )
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/', fromLookReveal: true },
    })
  })

  it('starts with optional email and consent empty and creates locally without a contact request', async () => {
    const save = showCreateForm()
    expect(screen.getByLabelText('Email (optional)')).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Privacy policy.' })).toHaveAttribute(
      'href',
      `${import.meta.env.BASE_URL}#/legal`
    )
    expect(readProfileContact).not.toHaveBeenCalled()
    fireEvent.click(save)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/profile', expect.anything()))
    expect(saveProfileContact).not.toHaveBeenCalled()
  })

  it('uses the same draft ID for the contact and local profile and waits for the contact save', async () => {
    let finishSave: (contact: ProfileContact) => void = () => undefined
    const pendingSave = new Promise<ProfileContact>((resolve) => {
      finishSave = resolve
    })
    vi.mocked(saveProfileContact).mockReturnValueOnce(pendingSave)
    const save = showCreateForm()
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: ' Mara@Example.com ' },
    })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(save)
    expect(saveProfileContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String), name: 'Mara' }),
      { email: 'mara@example.com', updatesOptIn: true, expectedRevision: null }
    )
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await act(async () => {
      finishSave({ email: 'mara@example.com', updatesOptIn: true, revision: CONTACT_REVISION })
      await pendingSave
    })
    const created = mockDispatch.mock.calls.find(
      ([action]) => action.type === 'profiles/createProfile'
    )![0]
    expect(created.payload.id).toBe(vi.mocked(saveProfileContact).mock.calls[0][0].id)
    expect(JSON.stringify(created)).not.toContain('mara@example.com')
    expect(created.payload).not.toHaveProperty('updatesOptIn')
  })

  it('validates email inline and lets the player clear a failed optional email to create offline', async () => {
    const save = showCreateForm()
    const email = screen.getByLabelText('Email (optional)')
    fireEvent.change(email, { target: { value: 'not-an-email' } })
    fireEvent.click(save)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid email address or leave it blank.'
    )
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(saveProfileContact).not.toHaveBeenCalled()
    fireEvent.change(email, { target: { value: 'mara@example.com' } })
    fireEvent.click(screen.getByRole('checkbox'))
    vi.mocked(saveProfileContact).mockRejectedValueOnce(
      new Error('Check your connection and try again.')
    )
    fireEvent.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection')
    expect(email).toHaveValue('mara@example.com')
    expect(mockDispatch).not.toHaveBeenCalled()
    fireEvent.change(email, { target: { value: '' } })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/profile', expect.anything()))
    expect(saveProfileContact).toHaveBeenCalledTimes(1)
  })

  it('retains the draft identity when retrying an email save', async () => {
    vi.mocked(saveProfileContact).mockRejectedValueOnce(new Error('Please try again.'))
    showCreateForm()
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'mara@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/profile', expect.anything()))
    const calls = vi.mocked(saveProfileContact).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][0].id).toBe(calls[1][0].id)
    expect(calls[1][1].updatesOptIn).toBe(false)
  })

  it('reconciles a lost save response before clearing a remotely committed opt-in', async () => {
    vi.mocked(saveProfileContact).mockRejectedValueOnce(new Error('The save response was lost.'))
    vi.mocked(readProfileContact).mockResolvedValueOnce({
      email: 'mara@example.com',
      updatesOptIn: true,
      revision: CONTACT_REVISION,
    })
    showCreateForm()
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'mara@example.com' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await screen.findByRole('alert')
    const draftId = vi.mocked(saveProfileContact).mock.calls[0][0].id
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/profile', expect.anything()))
    expect(readProfileContact).toHaveBeenCalledExactlyOnceWith(draftId)
    expect(saveProfileContact).toHaveBeenLastCalledWith(expect.objectContaining({ id: draftId }), {
      email: '',
      updatesOptIn: false,
      expectedRevision: CONTACT_REVISION,
    })
    expect(saveProfileContact).toHaveBeenCalledTimes(2)
  })

  it('does not claim an uncertain email was removed when reconciliation is also unavailable', async () => {
    vi.mocked(saveProfileContact).mockRejectedValueOnce(new Error('The save response was lost.'))
    vi.mocked(readProfileContact).mockRejectedValueOnce(new Error('Offline'))
    showCreateForm()
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'mara@example.com' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your last email change could not be confirmed.'
    )
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(saveProfileContact).toHaveBeenCalledTimes(1)
  })

  it('loads saved contact choices on edit and does not rewrite an unchanged contact', async () => {
    mockSavedContact()
    render(<EditProfile />)
    expect(screen.getByLabelText('Email (optional)')).toBeDisabled()
    await waitFor(() =>
      expect(screen.getByLabelText('Email (optional)')).toHaveValue('mara@example.com')
    )
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(readProfileContact).toHaveBeenCalledExactlyOnceWith(mockProfiles.activeProfileId)
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'New name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalled())
    expect(saveProfileContact).not.toHaveBeenCalled()
  })

  it('withdraws the saved choice using the loaded revision without putting contact data in Redux', async () => {
    mockSavedContact()
    render(<EditProfile />)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalled())
    expect(saveProfileContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: mockProfiles.activeProfileId }),
      { email: 'mara@example.com', updatesOptIn: false, expectedRevision: CONTACT_REVISION }
    )
    expect(JSON.stringify(mockDispatch.mock.calls)).not.toContain('mara@example.com')
  })

  it('clears consent when an existing address is replaced or removed', async () => {
    mockSavedContact()
    render(<EditProfile />)
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'other@example.com' },
    })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: '' } })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('checkbox')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockDispatch).toHaveBeenCalled())
    expect(saveProfileContact).toHaveBeenCalledWith(expect.anything(), {
      email: '',
      updatesOptIn: false,
      expectedRevision: CONTACT_REVISION,
    })
  })

  it('saves local profile changes while the email read is pending', async () => {
    vi.mocked(isProfileContactConfigured).mockReturnValue(true)
    vi.mocked(readProfileContact).mockReturnValue(new Promise(() => undefined))
    render(<EditProfile />)
    expect(screen.getByLabelText('Email (optional)')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Offline name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
    expect(saveProfileContact).not.toHaveBeenCalled()
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'profiles/updateProfile',
        payload: expect.objectContaining({ name: 'Offline name' }),
      })
    )
  })

  it('keeps unrelated profile edits available after a failed contact read', async () => {
    vi.mocked(isProfileContactConfigured).mockReturnValue(true)
    vi.mocked(readProfileContact).mockRejectedValueOnce(new Error('Email could not be loaded.'))
    render(<EditProfile />)
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Email (optional)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save Profile' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
    expect(saveProfileContact).not.toHaveBeenCalled()
  })

  it('keeps a conflicting email edit in the form with no local commit or success navigation', async () => {
    mockSavedContact(false)
    vi.mocked(saveProfileContact).mockRejectedValueOnce(
      Object.assign(
        new Error('Email preferences changed. Reopen this profile before saving them again.'),
        {
          code: 'contact_conflict',
          uncertainSave: false,
        }
      )
    )
    render(<EditProfile />)
    await waitFor(() => expect(screen.getByLabelText('Email (optional)')).toBeEnabled())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Reopen this profile')
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('reloads a current opt-out after a conflict without automatically reapplying the old checked choice', async () => {
    mockSavedContact(false)
    vi.mocked(saveProfileContact).mockRejectedValueOnce(
      Object.assign(new Error('Email preferences changed.'), {
        code: 'contact_conflict',
        uncertainSave: false,
      })
    )
    render(<EditProfile />)
    await waitFor(() => expect(screen.getByLabelText('Email (optional)')).toBeEnabled())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('checkbox')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled())
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(saveProfileContact).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
    expect(saveProfileContact).toHaveBeenCalledTimes(1)
  })

  it('requires a fresh checkbox choice if uncertain-save reconciliation discovers an opt-out', async () => {
    vi.mocked(saveProfileContact).mockRejectedValueOnce(new Error('The save response was lost.'))
    vi.mocked(readProfileContact).mockResolvedValueOnce({
      email: 'mara@example.com',
      updatesOptIn: false,
      revision: CONTACT_REVISION,
    })
    showCreateForm()
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'mara@example.com' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Review the current choice')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(saveProfileContact).toHaveBeenCalledTimes(1)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it.each(['unmount', 'profile switch'] as const)(
    'does not commit or navigate after a pending contact save outlives a %s',
    async (transition) => {
      mockSavedContact(false)
      let finishSave: (contact: ProfileContact) => void = () => undefined
      const pendingSave = new Promise<ProfileContact>((resolve) => {
        finishSave = resolve
      })
      vi.mocked(saveProfileContact).mockReturnValueOnce(pendingSave)
      const view = render(<EditProfile />)
      await waitFor(() => expect(screen.getByLabelText('Email (optional)')).toBeEnabled())
      fireEvent.click(screen.getByRole('checkbox'))
      fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }))
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled()
      if (transition === 'unmount') view.unmount()
      else {
        mockProfiles = profilesReducer(
          mockProfiles,
          createProfile({ name: 'Other player', avatar: '👤' })
        )
        view.rerender(<EditProfile />)
      }
      await act(async () => {
        finishSave({ email: 'mara@example.com', updatesOptIn: true, revision: CONTACT_REVISION })
        await pendingSave
      })
      expect(mockDispatch).not.toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()
    }
  )
})
