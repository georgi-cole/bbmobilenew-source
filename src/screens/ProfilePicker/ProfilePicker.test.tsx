import { persistCurrentRunSnapshot } from '../../store/store'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePicker from './ProfilePicker'
import Profile from '../Profile/Profile'

const mockNavigate = vi.fn()
const mockDispatch = vi.fn()
const mockLoadSavedRunProfile = vi.fn()
let mockLocationState: { from?: string } | null = null

const mockState: {
  profiles: {
    profiles: Array<{
      id: string
      name: string
      avatar: string
      createdAt: string
      photoId?: string
    }>
    activeProfileId: string | null
    isGuest: boolean
  }
  game: {
    status?: string
    season?: number
    week: number
    phase: string
    mode?: string
    runId?: string
    pendingEviction?: unknown
    seasonFinale?: unknown
    players?: Array<{ id: string; name: string; isUser?: boolean; status: string }>
    nomineeIds?: string[]
    lohId?: string
    posWinnerId?: string
  }
} = {
  profiles: {
    profiles: [],
    activeProfileId: null,
    isGuest: false,
  },
  game: {
    week: 1,
    phase: 'week_start',
  },
}

function emptySavedProfile(profileId: string) {
  return {
    version: 2 as const,
    profileId,
    savedAt: new Date(0).toISOString(),
    activeRunId: null,
    lastPlayedRunId: null,
    runs: {},
    stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },
  }
}

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}))

vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}))

vi.mock('../../store/archivePersistence', () => ({
  loadSeasonArchives: vi.fn(() => []),
}))

vi.mock('../../store/saveStatePersistence', () => ({
  loadSavedRunProfile: (...args: unknown[]) => mockLoadSavedRunProfile(...args),
  clearSavedRun: vi.fn(),
  flushSavePersistence: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../../store/store', () => ({
  persistCurrentRunSnapshot: vi.fn(),
}))

vi.mock('../../utils/imageDb', () => ({
  imageIdToDataUrl: vi.fn(() => Promise.resolve(null)),
  saveImage: vi.fn(() => Promise.resolve()),
  deleteImage: vi.fn(() => Promise.resolve()),
  pruneProfilePhotos: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../utils/imageUtils', () => ({
  resizeAndCompressImage: vi.fn(),
}))

vi.mock('../../components/ConfirmExitModal/ConfirmExitModal', () => ({
  default: () => null,
}))

describe('ProfilePicker', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockDispatch.mockReset()
    mockLoadSavedRunProfile.mockReset()
    mockLoadSavedRunProfile.mockImplementation((id: string) => emptySavedProfile(id))
    mockLocationState = null
    mockState.profiles = {
      profiles: [],
      activeProfileId: null,
      isGuest: false,
    }
    mockState.game = {
      week: 1,
      phase: 'week_start',
    }
  })

  it.each([true, false])(
    'opens optional email settings without changing guest=%s or the season',
    (isGuest) => {
      mockLocationState = { from: '/' }
      mockState.profiles = {
        profiles: isGuest
          ? []
          : [{ id: 'local-player', name: 'Maya', avatar: '👤', createdAt: '2026-10-27' }],
        activeProfileId: isGuest ? null : 'local-player',
        isGuest,
      }
      render(<ProfilePicker />)
      fireEvent.click(screen.getByRole('button', { name: /Account & email/ }))
      expect(mockNavigate).toHaveBeenCalledWith('/account', {
        state: { from: '/profile-picker', profileReturnTo: '/' },
      })
      expect(mockDispatch).not.toHaveBeenCalled()
    }
  )

  it('replaces the picker history entry after creating a profile', async () => {
    render(<ProfilePicker />)

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/profile/dressing-room', {
      state: { from: '/', createProfile: true, adoptGuestRun: false },
    })
    expect(screen.queryByRole('button', { name: /continue as guest/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), {
      target: { value: 'Jordan' },
    })
    fireEvent.change(screen.getByLabelText(/age/i), { target: { value: '28' } })
    fireEvent.change(screen.getByLabelText(/sex/i), { target: { value: 'Female' } })
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile', {
        replace: true,
        state: { from: '/game' },
      })
    })
  })

  it('saves the swiped-to look and resets a cancelled creation draft', async () => {
    render(<ProfilePicker />)

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /next look/i }))
    expect(screen.getByText('Look 2')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    expect(screen.getByText('Look 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /next look/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), {
      target: { value: 'Casey' },
    })
    fireEvent.change(screen.getByLabelText(/age/i), { target: { value: '23' } })
    fireEvent.change(screen.getByLabelText(/sex/i), { target: { value: 'Other' } })
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'profiles/createProfile',
          payload: expect.objectContaining({
            appearanceSelection: { kind: 'catalog', lookId: 'pc-002', revision: 1 },
          }),
        })
      )
    })
  })

  it('uses the chosen portrait and keeps optional creation categories folded', () => {
    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /next look/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))

    expect(
      screen.getByRole('img', { name: 'Selected profile portrait' }).getAttribute('src')
    ).toContain('character%202/main.webp')
    expect(screen.queryByText(/emoji avatar/i)).toBeNull()
    for (const name of [
      'About you',
      'Flavor / Personality',
      'Background / Family',
      'Optional / Personal',
    ]) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('false')
    }
    expect(screen.queryByLabelText('Location')).toBeNull()
    expect(screen.queryByLabelText('Religion')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Display name' }).hasAttribute('required')).toBe(
      true
    )
    expect(screen.getByRole('spinbutton', { name: 'Age' }).hasAttribute('required')).toBe(true)
    expect(
      screen.getByRole('combobox', { name: 'Sex (Reality storylines)' }).hasAttribute('required')
    ).toBe(true)
  })

  it('saves every optional category and retains drafts across folding and look changes', async () => {
    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), {
      target: { value: '  Jordan  ' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Age' }), { target: { value: '28' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sex (Reality storylines)' }), {
      target: { value: 'Other' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'About you' }))
    for (const [label, value] of [
      ['About You', '  I like music.  '],
      ['Location', '  Melrose Place  '],
      ['Profession', ' Nurse '],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'About you' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flavor / Personality' }))
    for (const [label, value] of [
      ['Personal Motto', ' Live. '],
      ['Fun Fact', ' Has 12 cats. '],
      ['Zodiac Sign', ' Libra '],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Background / Family' }))
    for (const [label, value] of [
      ['Education', ' College '],
      ['Family Status', ' Single '],
      ['Kids', ' None '],
      ['Pets', ' Cats '],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Optional / Personal' }))
    fireEvent.change(screen.getByLabelText('Pregnancy role (optional)'), {
      target: { value: 'both' },
    })
    fireEvent.change(screen.getByLabelText('Religion'), { target: { value: ' Agnostic ' } })
    fireEvent.change(screen.getByLabelText('Sexuality'), { target: { value: ' Queer ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back to looks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next look' }))
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
    fireEvent.click(screen.getByRole('button', { name: 'About you' }))
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('  Melrose Place  ')
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'profiles/createProfile',
          payload: expect.objectContaining({
            name: 'Jordan',
            appearanceSelection: { kind: 'catalog', lookId: 'pc-002', revision: 1 },
            bio: {
              age: '28',
              sex: 'Other',
              story: 'I like music.',
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
              reproductiveProfile: { canBecomePregnant: true, canCausePregnancy: true },
            },
          }),
        })
      )
    )
  })

  it('clears cancelled optional details before a new creation attempt', () => {
    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
    fireEvent.click(screen.getByRole('button', { name: 'About you' }))
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Old draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back to looks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
    fireEvent.click(screen.getByRole('button', { name: 'About you' }))
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('')
  })

  it.each(['Other', 'Prefer not to say'])(
    'accepts %s as a required profile sex option',
    async (sex) => {
      render(<ProfilePicker />)

      fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
      fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
      fireEvent.change(screen.getByPlaceholderText(/enter display name/i), {
        target: { value: 'Jordan' },
      })
      fireEvent.change(screen.getByLabelText(/age/i), { target: { value: '28' } })
      fireEvent.change(screen.getByLabelText(/sex/i), { target: { value: sex } })
      fireEvent.click(screen.getByRole('button', { name: /create profile/i }))

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'profiles/createProfile',
            payload: expect.objectContaining({ bio: { age: '28', sex } }),
          })
        )
      })
    }
  )

  it('spotlights profile creation for a guest', () => {
    mockState.profiles.isGuest = true
    const { container } = render(<ProfilePicker />)

    expect(screen.getByText('Keep your season')).toBeDefined()
    expect(container.querySelector('.profile-picker__btn--save-spotlight')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))

    expect(screen.getByText('Save this season to your profile')).toBeDefined()
    expect(container.querySelector('.profile-picker__create--save-spotlight')).not.toBeNull()
    expect(screen.getByText('Choose your look')).toBeDefined()
  })

  it('adopts an in-progress guest game into the new profile without resetting it', async () => {
    mockState.profiles.isGuest = true
    mockState.game = {
      week: 2,
      phase: 'nomination',
      runId: 'guest-run-1',
    }
    render(<ProfilePicker />)

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), {
      target: { value: 'Jordan' },
    })
    fireEvent.change(screen.getByLabelText(/age/i), { target: { value: '28' } })
    fireEvent.change(screen.getByLabelText(/sex/i), { target: { value: 'Female' } })
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/game', {
        replace: true,
        state: { from: '/game' },
      })
    })
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'profiles/createProfile',
        payload: expect.objectContaining({
          bio: { age: '28', sex: 'Female' },
          appearanceSelection: { kind: 'catalog', lookId: 'pc-001', revision: 1 },
        }),
      })
    )
    expect(persistCurrentRunSnapshot).toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'game/updateUserPlayerIdentity' })
    )
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'game/resetGame',
      })
    )
  })

  it('shows a direct way back home from the picker', () => {
    mockLocationState = { from: '/' }
    render(<ProfilePicker />)

    fireEvent.click(screen.getByRole('button', { name: /back to home/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('stores optional roles as profile defaults without rewriting the adopted contestant', async () => {
    mockState.profiles.isGuest = true
    mockState.game = { week: 2, phase: 'social_1', runId: 'guest-run-optional-details' }
    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose this look/i }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), {
      target: { value: 'Jordan' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Age' }), { target: { value: '28' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sex (Reality storylines)' }), {
      target: { value: 'Other' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Optional / Personal' }))
    fireEvent.change(screen.getByLabelText('Pregnancy role (optional)'), {
      target: { value: 'cause' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }))
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'profiles/createProfile',
          payload: expect.objectContaining({
            bio: expect.objectContaining({
              age: '28',
              sex: 'Other',
              reproductiveProfile: { canBecomePregnant: false, canCausePregnancy: true },
            }),
          }),
        })
      )
    )
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'game/resetGame' })
    )
  })

  it('checks the modern split-save profile before switching profiles', () => {
    mockState.profiles = {
      profiles: [
        { id: 'profile-a', name: 'A', avatar: '🧑', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'profile-b', name: 'B', avatar: '👩', createdAt: '2026-08-02T00:00:00.000Z' },
      ],
      activeProfileId: 'profile-a',
      isGuest: false,
    }

    render(<ProfilePicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    expect(mockLoadSavedRunProfile).toHaveBeenCalledWith('profile-b')
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/game' },
    })
  })

  function setupActiveSeason() {
    mockState.profiles = {
      profiles: [
        { id: 'profile-a', name: 'Larisa', avatar: '🧑', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'profile-b', name: 'Alex', avatar: '👩', createdAt: '2026-08-02T00:00:00.000Z' },
      ],
      activeProfileId: 'profile-a',
      isGuest: false,
    }
    mockState.game = {
      status: 'active',
      season: 3,
      week: 7,
      phase: 'nominations',
      players: [{ id: 'human', name: 'Larisa', isUser: true, status: 'active' }],
      nomineeIds: ['human'],
      lohId: 'human',
      posWinnerId: 'human',
    }
  }

  it('places the live season chips only inside the active profile card', () => {
    setupActiveSeason()
    render(<ProfilePicker />)

    const activeCard = screen.getByText('Larisa').closest('.profile-picker__card') as HTMLElement
    const otherCard = screen.getByText('Alex').closest('.profile-picker__card') as HTMLElement
    const status = within(activeCard).getByRole('region', { name: 'Current season status' })

    expect(within(otherCard).queryByRole('region', { name: 'Current season status' })).toBeNull()
    expect(within(status).getByRole('button', { name: /^Season: Season 3\./ })).toBeDefined()
    expect(within(status).getByRole('button', { name: /^Day: Day 7\./ })).toBeDefined()
    expect(
      within(status).getByRole('button', { name: /^Nomination status: On the block\./ })
    ).toBeDefined()
    expect(within(status).getByRole('button', { name: /^Viewer's rating:/ })).toBeDefined()
    expect(
      within(status).getByRole('button', { name: /^Hub power: Leader of the House\./ })
    ).toBeDefined()
    expect(
      within(status).getByRole('button', { name: /^Safety power: Power of Safety holder\./ })
    ).toBeDefined()

    const dayChip = within(status).getByRole('button', { name: /^Day: Day 7\./ })
    fireEvent.keyDown(dayChip, { key: 'Enter' })
    expect(within(dayChip).getByText('Day 7')).toBeDefined()
    fireEvent.keyUp(dayChip, { key: 'Enter' })
    expect(within(dayChip).queryByText('Day 7')).toBeNull()
    expect(within(dayChip).getByText('7')).toBeDefined()
  })

  it.each(['season_start', 'week_start'])(
    'does not invent a current season for a fresh profile at %s',
    (phase) => {
      setupActiveSeason()
      mockState.game = { status: 'inactive', week: 1, phase }
      render(<ProfilePicker />)

      expect(screen.queryByRole('region', { name: 'Current season status' })).toBeNull()
    }
  )

  it('does not attribute a guest run to the previously selected profile', () => {
    setupActiveSeason()
    mockState.profiles.isGuest = true
    render(<ProfilePicker />)

    expect(screen.queryByRole('region', { name: 'Current season status' })).toBeNull()
  })

  it('keeps season chips off My profile even while a season is active', () => {
    setupActiveSeason()
    render(<Profile />)

    expect(screen.getByRole('heading', { name: 'My profile' })).toBeDefined()
    expect(screen.queryByText('Current season')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Season: Season 3\./ })).toBeNull()
  })
})
