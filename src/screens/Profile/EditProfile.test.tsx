import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ profiles: mockProfiles }),
}))
vi.mock('../../utils/imageDb', () => ({
  imageIdToDataUrl: () => mockPhoto(),
  saveImage: vi.fn(),
  deleteImage: vi.fn(),
}))
vi.mock('../../components/ConfirmExitModal/ConfirmExitModal', () => ({ default: () => null }))

describe('EditProfile details', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockDispatch.mockReset()
    mockPhoto.mockReset()
    mockPhoto.mockResolvedValue(null)
    mockLocationState = { from: '/profile-picker' }
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
})
